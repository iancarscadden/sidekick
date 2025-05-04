import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles/global.css';

// Simple console message to confirm the script is running
console.log('Renderer script starting...');

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content loaded');
  
  // Render main app
  const appContainer = document.getElementById('app');
  if (!appContainer) {
    console.error('App root element not found');
    return;
  }
  
  try {
    // Create and render the main app
    const appRoot = createRoot(appContainer);
    appRoot.render(<App />);
    console.log('App rendered successfully');
    
    // Helper function to check if element is part of the close button
    const isInteractiveElement = (element: EventTarget | null): boolean => {
      if (!element || !(element instanceof HTMLElement)) {
        return false;
      }
      
      // Check for the close button or any other interactive elements
      if (element.classList?.contains('close-hint') || 
          element.closest('.close-hint')) {
        console.log('Interactive element detected');
        return true;
      }
      
      return false;
    };
    
    // Handle window interactions
    document.addEventListener('mouseenter', (e) => {
      console.log('Mouse enter event');
      // Skip if we're hovering over an interactive element
      if (isInteractiveElement(e.target)) {
        console.log('Mouse entered interactive area - keeping mouse events enabled');
        return;
      }
      
      if (window.electron) {
        window.electron.setIgnoreMouseEvents(false);
      }
    });
    
    document.addEventListener('mouseleave', (e) => {
      console.log('Mouse leave event');
      // Skip if we're leaving from an interactive element
      if (isInteractiveElement(e.target)) {
        console.log('Mouse left interactive area - not changing mouse events');
        return;
      }
      
      if (window.electron) {
        window.electron.setIgnoreMouseEvents(true, { forward: true });
      }
    });
  } catch (error) {
    console.error('Error rendering React app:', error);
  }
}); 