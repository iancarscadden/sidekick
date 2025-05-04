import { BrowserWindow } from 'electron';

/**
 * Constants for Windows API
 * WDA_EXCLUDEFROMCAPTURE = 0x00000011
 * See: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity
 */
const WDA_EXCLUDEFROMCAPTURE = 0x00000011;

/**
 * Sets the window to be excluded from screen capture on Windows
 * Uses the SetWindowDisplayAffinity API to prevent the window from being captured
 * in screenshots, screen recordings, or screen sharing
 */
export function setWindowExcludeFromCapture(window: BrowserWindow): void {
  if (process.platform !== 'win32') return;

  try {
    // Get the native window handle
    const hwnd = window.getNativeWindowHandle();
    
    // Using the Node.js FFI to call the Windows API
    // This is a simplified version - in a real app, you would use ffi-napi
    // or a native Node.js addon to call the SetWindowDisplayAffinity function
    console.log('Would set window display affinity to exclude from capture', hwnd);
    console.log('In a complete implementation, this would call SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)');
    
    // NOTE: This is a placeholder. In a real implementation, you would:
    // 1. Create a native Node.js addon that exposes the SetWindowDisplayAffinity function
    // 2. Call that function with the window handle and WDA_EXCLUDEFROMCAPTURE
    // Example pseudocode:
    // const user32 = require('./native-addons/user32');
    // user32.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
  } catch (error) {
    console.error('Failed to exclude window from capture:', error);
  }
} 