import React, { ReactNode, useState, useEffect, useRef } from 'react';
import TextArea from './TextArea';
import { IoCloseOutline, IoMicOutline, IoSquareOutline } from 'react-icons/io5';

// Overlay component - Updated May 2025 - Main UI container with keybind hints
interface OverlayProps {
  children: ReactNode;
  responseText: string;
  isLoading: boolean;
  error: string | null;
  onClose?: () => void;
}

const Overlay: React.FC<OverlayProps> = ({ children, responseText, isLoading, error, onClose }) => {
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [isAudioButtonHovered, setIsAudioButtonHovered] = useState(false);
  const [isAudioCaptureActive, setIsAudioCaptureActive] = useState(false);
  const [isAudioCaptureLoading, setIsAudioCaptureLoading] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0); // Time in seconds
  const prevResponseRef = useRef(responseText);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track whether any button is currently hovered
  const [anyButtonHovered, setAnyButtonHovered] = useState(false);
  
  useEffect(() => {
    // Set up listener for audio capture status changes
    const unsubscribe = window.electron.onAudioCaptureStatusChange((isActive) => {
      setIsAudioCaptureActive(isActive);
      setIsAudioCaptureLoading(false);
      
      // Reset timer when audio capture is turned off
      if (!isActive) {
        setRecordingTime(0);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }
    });
    
    // Get initial audio capture status
    window.electron.getAudioCaptureStatus().then(setIsAudioCaptureActive);
    
    // Make sure we're not ignoring mouse events on component mount
    window.electron.setIgnoreMouseEvents(false);
    
    return () => {
      unsubscribe();
      // Clean up timer on unmount
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);
  
  // Effect to track content changes and trigger resize animation
  useEffect(() => {
    // Only trigger animation if content actually changed
    if (prevResponseRef.current !== responseText) {
      setIsResizing(true);
      
      // Clear any existing timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      
      resizeTimeoutRef.current = setTimeout(() => {
        setIsResizing(false);
      }, 300); // Match duration to CSS transitions
      
      prevResponseRef.current = responseText;
    }
    
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [responseText]);
  
  // Effect to handle mouse ignore state
  useEffect(() => {
    // Only set ignore mouse events to true if no buttons are hovered
    if (!anyButtonHovered) {
      // Small delay to avoid flickering
      const timeoutId = setTimeout(() => {
        window.electron.setIgnoreMouseEvents(true, { forward: true });
      }, 50);
      
      return () => clearTimeout(timeoutId);
    } else {
      window.electron.setIgnoreMouseEvents(false);
    }
  }, [anyButtonHovered]);
  
  // Effect to handle recording timer
  useEffect(() => {
    if (isAudioCaptureActive && !timerIntervalRef.current) {
      // Start the timer when audio capture becomes active
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prevTime => {
          // If reaching 30 seconds, reset to 0
          if (prevTime >= 30) {
            return 0;
          }
          return prevTime + 1;
        });
      }, 1000);
    } else if (!isAudioCaptureActive && timerIntervalRef.current) {
      // Clear the interval when audio capture becomes inactive
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      setRecordingTime(0);
    }
    
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isAudioCaptureActive]);
  
  // Format the time as MM:SS
  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const handleCloseMouseEnter = () => {
    console.log("Close button mouse enter");
    setIsCloseHovered(true);
    setAnyButtonHovered(true);
  };
  
  const handleCloseMouseLeave = () => {
    console.log("Close button mouse leave");
    setIsCloseHovered(false);
    setAnyButtonHovered(false);
  };
  
  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClose) {
      console.log("Close button clicked");
      onClose();
    }
  };

  const handleAudioButtonMouseEnter = () => {
    console.log("Audio button mouse enter");
    setIsAudioButtonHovered(true);
    setAnyButtonHovered(true);
  };
  
  const handleAudioButtonMouseLeave = () => {
    console.log("Audio button mouse leave");
    setIsAudioButtonHovered(false);
    setAnyButtonHovered(false);
  };
  
  const handleAudioButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Audio button clicked");
    setIsAudioCaptureLoading(true);
    window.electron.toggleAudioCapture();
  };
  
  // Determine if content area should be collapsed
  const isEmptyContent = !responseText && !isLoading && !error;
  
  return (
    <div 
      className={`overlay-container ${isResizing ? 'resizing' : ''}`}
      onMouseEnter={() => {
        // When mouse enters overlay container, make sure we're not ignoring events
        window.electron.setIgnoreMouseEvents(false);
      }}
    >
      {/* Empty header - just structural */}
      <div className="overlay-header">
        {/* Empty header space - no text */}
      </div>
      
      {/* Centered keybinds container with all controls except close button */}
      <div className="overlay-keybinds-container">
        {/* Clear command */}
        <div className="keybind-hint">
          <span className="keybind-text">Clear</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key" data-char=";">;</span>
        </div>
        
        {/* Capture command */}
        <div className="keybind-hint">
          <span className="keybind-text">Capture</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key return-key">⏎</span>
        </div>
        
        {/* Send Audio command (process transcription) */}
        <div className="keybind-hint">
          <span className="keybind-text">Send Audio</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key" data-char="'">'</span>
        </div>
        
        {/* Hide command */}
        <div className="keybind-hint">
          <span className="keybind-text">Hide</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key" data-char="\\">\</span>
        </div>
        
        {/* Recording timer */}
        <div className={`recording-timer ${isAudioCaptureActive ? 'recording-active' : ''}`}>
          {formatTime(recordingTime)}
        </div>
        
        {/* Audio button with microphone icon */}
        <div 
          className={`keybind-hint audio-button no-drag ${isAudioButtonHovered && !isAudioCaptureLoading ? 'audio-button-hovered' : ''} ${isAudioCaptureActive && !isAudioCaptureLoading ? 'audio-button-active' : ''} ${isAudioCaptureLoading ? 'audio-button-loading' : ''}`}
          onMouseEnter={handleAudioButtonMouseEnter}
          onMouseLeave={handleAudioButtonMouseLeave}
          onClick={handleAudioButtonClick}
        >
          {/* Always show microphone icon, regardless of active state */}
          <IoMicOutline className="audio-icon" />
        </div>
      </div>
      
      {/* Separate container for close button - positioned on the far right */}
      <div className="overlay-close-container">
        <div 
          className={`keybind-hint quit-button no-drag ${isCloseHovered ? 'quit-button-hovered' : ''}`}
          onMouseEnter={handleCloseMouseEnter}
          onMouseLeave={handleCloseMouseLeave}
          onClick={handleCloseClick}
        >
          <IoCloseOutline className="close-icon" />
        </div>
      </div>
      
      <div className={`overlay-content ${isEmptyContent ? 'empty-content' : ''} ${isResizing ? 'content-resizing' : ''}`}>
        <TextArea content={responseText} isLoading={isLoading} error={error} />
        {children}
      </div>
    </div>
  );
};

export default Overlay; 