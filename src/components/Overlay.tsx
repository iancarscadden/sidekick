import React, { ReactNode, useState } from 'react';
import TextArea from './TextArea';

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
  
  return (
    <div className="overlay-container">
      <div className="overlay-header">
        <img src="Rinnegan.svg" alt="Sidekick Logo" className="header-logo" />
        <span>Sidekick</span>
      </div>
      
      {/* Keybinds container to group all hints on the right side */}
      <div className="overlay-keybinds-container">
        <div className="keybind-hint overlay-keybind-left">Hide ⌘\</div>
        <div className="keybind-hint overlay-keybind-center">Capture ⌘<span className="return-key">⏎</span></div>
        <div className="keybind-hint overlay-keybind-right">Move ⌘↑↓←→</div>
        
        {/* Close button integrated with keybind hints */}
        <div 
          className={`keybind-hint close-hint no-drag ${isCloseHovered ? 'close-hint-hovered' : ''}`}
          onMouseEnter={handleCloseMouseEnter}
          onMouseLeave={handleCloseMouseLeave}
          onClick={handleCloseClick}
        >
          ✕
        </div>
      </div>
      
      <div className="overlay-content">
        <TextArea content={responseText} isLoading={isLoading} error={error} />
        {children}
      </div>
    </div>
  );
};

export default Overlay; 