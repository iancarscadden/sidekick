import React, { useEffect, useState, useCallback, useRef } from 'react';
import Overlay from '../components/Overlay';

/**
 * App.tsx - Primary renderer component for the Sidekick application
 * Handles state management, API communication, and coordinates UI interactions
 */

// RENDERER ARCHITECTURE: This component serves as the main entry point for the renderer process,
// managing state for audio and screenshot functionality. It uses React's useEffect and useCallback
// hooks to efficiently handle events from the main process and minimize re-renders, ensuring
// the overlay UI remains responsive even during intensive operations like audio streaming.

// Helper function to parse SSE data and extract content
const parseSSEChunk = (chunk: string): string => {
  try {
    // Split the chunk into individual SSE events
    const lines = chunk.split('\n\n');
    let extractedText = '';
    
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Extract the data part (remove "data: " prefix)
      const dataMatch = line.match(/^data: (.+)$/m);
      if (dataMatch && dataMatch[1]) {
        try {
          // Parse the JSON content
          const jsonData = JSON.parse(dataMatch[1]);
          if (jsonData && jsonData.reply) {
            extractedText += jsonData.reply;
          }
        } catch (jsonError) {
          console.warn('Failed to parse JSON in SSE data:', dataMatch[1]);
          // If JSON parsing fails, just add the raw content without the "data:" prefix
          extractedText += dataMatch[1];
        }
      }
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error parsing SSE chunk:', error);
    return chunk; // Return original on error
  }
};

const App: React.FC = () => {
  const [responseText, setResponseText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioCaptureActive, setIsAudioCaptureActive] = useState(false);
  const [currentTranscription, setCurrentTranscription] = useState('');
  
  // Function to handle screenshot capture and processing
  const handleScreenshot = useCallback(async () => {
    try {
      // Reset states
      setResponseText('');
      setIsLoading(true);
      setError(null);
      
      // Capture screenshot
      const screenshotBase64 = await window.electron.captureScreenshot();
      console.log('Screenshot captured successfully');
      
      // Get API endpoint
      const { apiUrl } = await window.electron.processScreenshot(screenshotBase64);
      console.log('Processing with API:', apiUrl);
      
      try {
        // 1) Call the function and grab the stream
        console.log('Sending image data and getting stream...');
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: screenshotBase64 }),
        });
        
        if (!res.ok) {
          const err = await res.text();
          console.error(`API error ${res.status}: ${err}`);
          setError(`API error ${res.status}: ${err}`);
          setIsLoading(false);
          return;
        }
        
        console.log('Response stream started, reading chunks...');
        
        // 2) Read chunks off the body reader
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer to hold partial chunks
        let done = false;
        
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          
          if (value) {
            // Decode the chunk and add to buffer
            const rawText = decoder.decode(value, { stream: !done });
            buffer += rawText;
            
            // Process complete SSE events in buffer
            const parsedText = parseSSEChunk(buffer);
            if (parsedText) {
              console.log('Processed chunk:', parsedText);
              setResponseText(prev => prev + parsedText);
              // Clear processed content from buffer to avoid duplication
              buffer = '';
            }
          }
        }
        
        // Process any remaining content in the buffer
        if (buffer) {
          const finalText = parseSSEChunk(buffer);
          if (finalText) {
            setResponseText(prev => prev + finalText);
          }
        }
        
        console.log('Stream complete');
        setIsLoading(false);
        
      } catch (streamError) {
        console.error('Error with API streaming:', streamError);
        setError('Failed to process the stream. Please try again.');
        setIsLoading(false);
      }
      
    } catch (error) {
      console.error('Error processing screenshot:', error);
      setIsLoading(false);
      setError('Error capturing screenshot. Please try again.');
    }
  }, []);
  
  // Function to handle audio capture toggle
  const handleToggleAudioCapture = useCallback(async () => {
    try {
      const isActive = await window.electron.toggleAudioCapture();
      console.log(`Audio capture ${isActive ? 'started' : 'stopped'}`);
      setIsAudioCaptureActive(isActive);
    } catch (error) {
      console.error('Error toggling audio capture:', error);
      setError('Failed to toggle audio capture. Please try again.');
    }
  }, []);
  
  // Function to *trigger* the whole PCM→STT→Groq pipeline
  const handleProcessTranscription = useCallback(async () => {
    try {
      setResponseText('');
      setIsLoading(true);
      setError(null);
      
      // Get the base64 audio data from the main process
      const { requestId, apiUrl, audioContent } = await window.electron.processCurrentTranscription();
      console.log('📡 Processing audio with request ID:', requestId);
      
      // Fire off a streaming fetch to the API with the audio content
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audioContent: audioContent,
          requestId,
          // Explicitly define the audio format parameters
          sampleRate: 16000,
          encoding: 'linear16',
          channels: 1
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      
      // Read the response as an SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      // Process the SSE stream
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          
          // Skip non-data chunks
          if (!chunk.startsWith('data: ')) continue;
          
          // Extract the JSON data
          const jsonText = chunk.replace(/^data: /, '');
          try {
            const data = JSON.parse(jsonText);
            if (data.reply) {
              setResponseText(prev => prev + data.reply);
            }
          } catch (e) {
            console.warn('Failed to parse SSE chunk:', jsonText);
          }
        }
      }
      
      console.log('✅ Stream complete');
      setIsLoading(false);
    } catch (err) {
      console.error('Streaming error:', err);
      setError('Failed to process audio. Please try again.');
      setIsLoading(false);
    }
  }, []);
  
  // Function to handle closing the application
  const handleClose = useCallback(() => {
    console.log("App: Close triggered");
    window.electron.close();
  }, []);
  
  // Function to clear the text area and reset to initial state
  const handleClearTextArea = useCallback(() => {
    console.log("App: Clear text area triggered");
    setResponseText('');
    setIsLoading(false);
    setError(null);
  }, []);
  
  // Setup event listener for screenshot trigger (Cmd+Return)
  useEffect(() => {
    const unsubscribe = window.electron.onScreenshotTrigger(() => {
      handleScreenshot();
    });
    
    return unsubscribe;
  }, [handleScreenshot]);
  
  // Setup event listener for clear text area trigger (Cmd+;)
  useEffect(() => {
    const unsubscribe = window.electron.onClearTextAreaTrigger(() => {
      handleClearTextArea();
    });
    
    return unsubscribe;
  }, [handleClearTextArea]);
  
  // Setup listeners for audio capture functionality
  useEffect(() => {
    // Check initial audio capture status
    window.electron.getAudioCaptureStatus().then(status => {
      setIsAudioCaptureActive(status);
    });
    
    // Listen for transcription updates
    const unsubscribeTranscription = window.electron.onTranscriptionUpdate((text) => {
      setCurrentTranscription(text);
    });
    
    // Listen for audio capture status changes
    const unsubscribeStatus = window.electron.onAudioCaptureStatusChange((isActive) => {
      setIsAudioCaptureActive(isActive);
    });
    
    // Listen for the hotkey trigger…
    const unregisterProcess = window.electron.onProcessTranscription(() => {
      handleProcessTranscription();
    });
    
    return () => {
      unsubscribeTranscription();
      unsubscribeStatus();
      unregisterProcess();
    };
  }, [handleProcessTranscription]);
  
  return (
    <div className="app-container h-screen w-screen flex flex-col items-center justify-center">
      <Overlay 
        responseText={responseText} 
        isLoading={isLoading}
        error={error}
        onClose={handleClose}
      >
        {responseText === '' && !isLoading && !error && !isAudioCaptureActive && (
          <div className="initial-message">Press ⌘↩ to capture your screen and get AI assistance</div>
        )}
        
        {isAudioCaptureActive && currentTranscription && (
          <div className="transcription-container">
            <div className="transcription-indicator">🎤 Listening...</div>
            <div className="transcription-text">{currentTranscription}</div>
          </div>
        )}
      </Overlay>
    </div>
  );
};

export default App; 