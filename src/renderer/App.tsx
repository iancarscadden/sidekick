import React, { useEffect, useState, useCallback, useRef } from 'react';
import Overlay from '../components/Overlay';

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
  
  // Function to handle closing the application
  const handleClose = useCallback(() => {
    console.log("App: Close triggered");
    window.electron.close();
  }, []);
  
  // Setup event listener for screenshot trigger (Cmd+Return)
  useEffect(() => {
    const unsubscribe = window.electron.onScreenshotTrigger(() => {
      handleScreenshot();
    });
    
    return unsubscribe;
  }, [handleScreenshot]);
  
  return (
    <div className="app-container h-screen w-screen flex flex-col items-center justify-center">
      <Overlay 
        responseText={responseText} 
        isLoading={isLoading}
        error={error}
        onClose={handleClose}
      >
        {responseText === '' && !isLoading && !error && (
          <div className="initial-message">Press ⌘↩ to capture your screen and get AI assistance</div>
        )}
      </Overlay>
    </div>
  );
};

export default App; 