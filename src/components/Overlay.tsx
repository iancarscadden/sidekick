import React, { ReactNode, useState } from 'react';
import TextArea from './TextArea';
import { IoCloseOutline } from 'react-icons/io5';

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
  
  const handleCloseMouseEnter = () => {
    window.electron.setIgnoreMouseEvents(false);
    setIsCloseHovered(true);
  };
  
  const handleCloseMouseLeave = () => {
    window.electron.setIgnoreMouseEvents(true, { forward: true });
    setIsCloseHovered(false);
  };
  
  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClose) {
      onClose();
    }
  };
  
  // Determine if content area should be collapsed
  const isEmptyContent = !responseText && !isLoading && !error;
  
  return (
    <div className="overlay-container">
      <div className="overlay-header">
        <span>Sidekick</span>
      </div>
      
      {/* Keybinds container to group all hints on the right side */}
      <div className="overlay-keybinds-container">
        {/* Clear command */}
        <div className="keybind-hint">
          <span className="keybind-text">Clear</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key">;</span>
        </div>
        
        {/* Capture command */}
        <div className="keybind-hint">
          <span className="keybind-text">Capture</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key return-key">⏎</span>
        </div>
        
        {/* Hide command */}
        <div className="keybind-hint">
          <span className="keybind-text">Hide</span>
          <span className="keybind-key cmd-key">⌘</span>
          <span className="keybind-key">\</span>
        </div>
        
        {/* Close button with icon */}
        <div 
          className={`keybind-hint quit-button no-drag ${isCloseHovered ? 'quit-button-hovered' : ''}`}
          onMouseEnter={handleCloseMouseEnter}
          onMouseLeave={handleCloseMouseLeave}
          onClick={handleCloseClick}
        >
          <IoCloseOutline className="close-icon" />
        </div>
      </div>
      
      <div className={`overlay-content ${isEmptyContent ? 'empty-content' : ''}`}>
        <TextArea content={responseText} isLoading={isLoading} error={error} />
        {children}
      </div>
    </div>
  );
};

export default Overlay; 