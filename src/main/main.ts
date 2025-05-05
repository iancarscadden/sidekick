import { app, BrowserWindow, screen, ipcMain, globalShortcut } from 'electron';
import * as path from 'path';
import { setWindowExcludeFromCapture } from './utils/windows-utils';
import { startScreenFilter, stopScreenFilter, isScreenFilterActive } from './utils/screen-filter';
import { initOcrService } from './utils/ocr-service';

// Main entry point - Updated May 2025 - DevTools disabled for production build
// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let isWindowVisible = true;
let isQuitting = false;

// Movement constants
const MOVE_STEP = 200; // pixels to move per arrow key press (4x from original 50px)

const createWindow = (): void => {
  console.log('Creating window...');
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  console.log(`Screen dimensions: ${width}x${height}`);

  // Create the browser window - using auto sizing based on content
  mainWindow = new BrowserWindow({
    width: 820,  // Updated to match new overlay width
    height: 100, // Starting height, will auto-size based on content
    x: Math.floor(width / 2 - 410), // Center horizontally (half of width)
    y: Math.floor(height / 2 - 50),  // Center vertically
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,  // Prevent manual resizing
    useContentSize: true, // Size based on the content
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    backgroundColor: '#00000000', // Transparent background
    show: false // Don't show until ready
  });

  // Calculate the HTML file path
  const htmlPath = path.join(__dirname, '../../public/index.html');
  console.log(`Loading HTML from: ${htmlPath}`);
  
  // Load the index.html file from the public folder
  mainWindow.loadFile(htmlPath);

  // Set up Content Security Policy to allow external API connections
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' https://wnwvguldjsqmynxdrfij.supabase.co/ https://wnwvguldjsqmynxdrfij.supabase.co/functions/v1/ocr-and-response; " +
          "img-src 'self' data: blob:;"
        ]
      }
    });
  });

  // For debugging - open DevTools in a separate window
  //mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Set window to be excluded from screen capture (macOS)
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setContentProtection(true);
    console.log('Applied macOS content protection settings');

    // Keep it on all Spaces & above everything
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    
    // Start the ScreenCaptureKit filter (for Zoom compatibility)
    startScreenFilter(mainWindow);

    // Clean up on close only - this is still needed but won't show errors
    mainWindow.on('closed', () => {
      // Don't call stopScreenFilter again if we're already quitting
      if (!isQuitting) {
        console.log('Overlay closed — stopping screen filter explicitly from closed event');
        stopScreenFilter();
      } else {
        console.log('Overlay closed during controlled shutdown, skipping additional stopScreenFilter call');
      }
      mainWindow = null;
    });
  }

  // Set window to be excluded from screen capture (Windows)
  if (process.platform === 'win32') {
    if (mainWindow) {
      setWindowExcludeFromCapture(mainWindow);
      console.log('Applied Windows window exclusion from capture');
    }
  }

  // Make window clickthrough except for specific UI elements
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Show the window when it's ready
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      isWindowVisible = true;
      console.log('Window is now visible');
    }
  });

  // Log errors if they occur
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading');
  });
  
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`Renderer console [${level}]: ${message}`);
  });

  // Prevent default close and handle it manually to ensure cleanup
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      console.log('Window close event intercepted, handling gracefully');
      performCleanShutdown();
    }
  });
};

// Function to toggle window visibility
const toggleWindowVisibility = () => {
  if (!mainWindow) return;
  
  if (isWindowVisible) {
    mainWindow.hide();
    isWindowVisible = false;
    console.log('Window hidden via shortcut');
  } else {
    mainWindow.show();
    isWindowVisible = true;
    console.log('Window shown via shortcut');
  }
};

// Function to move window
const moveWindow = (direction: 'up' | 'down' | 'left' | 'right') => {
  if (!mainWindow) return;
  
  const [currentX, currentY] = mainWindow.getPosition();
  
  let newX = currentX;
  let newY = currentY;
  
  switch (direction) {
    case 'up':
      newY = currentY - MOVE_STEP;
      break;
    case 'down':
      newY = currentY + MOVE_STEP;
      break;
    case 'left':
      newX = currentX - MOVE_STEP;
      break;
    case 'right':
      newX = currentX + MOVE_STEP;
      break;
  }
  
  // Ensure the window stays within screen bounds
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  
  // Get window size
  const [windowWidth, windowHeight] = mainWindow.getSize();
  
  // Apply bounds checking
  newX = Math.max(0, Math.min(width - windowWidth, newX));
  newY = Math.max(0, Math.min(height - windowHeight, newY));
  
  mainWindow.setPosition(newX, newY);
};

// Function to trigger screenshot capture
const triggerScreenshot = () => {
  console.log('Shortcut triggered: Capture screenshot');
  if (mainWindow) {
    mainWindow.webContents.send('trigger-screenshot');
  }
};

// Function to perform a clean shutdown of the app
function performCleanShutdown() {
  if (isQuitting) return; // Prevent recursive calls
  
  console.log('Performing clean shutdown');
  isQuitting = true;
  
  // First explicitly stop the screen filter synchronously
  console.log('Stopping screen filter (synchronous) before quitting');
  stopScreenFilter();
  
  // Mark app as quitting to prevent intercepting close
  app.once('will-quit', () => {
    console.log('App will-quit event - cleanup completed');
  });
  
  // Now actually quit the app (delay slightly to let the filter process terminate first)
  setTimeout(() => {
    console.log('Quitting application after cleanup');
    if (mainWindow) {
      mainWindow.destroy();
    }
    app.quit();
    
    // Force exit after a short delay as final fallback
    setTimeout(() => {
      console.log('Forcing exit as final fallback');
      process.exit(0);
    }, 500);
  }, 250); // Short delay to let the filter process terminate
}

// Register global shortcuts when app is ready
const registerShortcuts = () => {
  // Shortcut keys with modifiers
  const modKey = process.platform === 'darwin' ? 'Command' : 'Control';
  
  // Register visibility toggle
  const toggleKey = `${modKey}+\\`;
  globalShortcut.register(toggleKey, () => {
    console.log('Shortcut triggered: Toggle visibility');
    toggleWindowVisibility();
  });
  
  // Register arrow movement keys
  const moveUpKey = `${modKey}+Up`;
  const moveDownKey = `${modKey}+Down`;
  const moveLeftKey = `${modKey}+Left`;
  const moveRightKey = `${modKey}+Right`;
  
  globalShortcut.register(moveUpKey, () => {
    moveWindow('up');
  });
  
  globalShortcut.register(moveDownKey, () => {
    moveWindow('down');
  });
  
  globalShortcut.register(moveLeftKey, () => {
    moveWindow('left');
  });
  
  globalShortcut.register(moveRightKey, () => {
    moveWindow('right');
  });
  
  // Register screenshot capture (Cmd+Return or Ctrl+Return)
  const screenshotKey = `${modKey}+Return`;
  globalShortcut.register(screenshotKey, triggerScreenshot);
  
  // Register clear text area (Cmd+; or Ctrl+;)
  const clearTextKey = `${modKey}+;`;
  globalShortcut.register(clearTextKey, () => {
    console.log('Shortcut triggered: Clear text area');
    if (mainWindow) {
      mainWindow.webContents.send('clear-text-area');
    }
  });
  
  // Register DevTools toggle (Cmd+Shift+I or Ctrl+Shift+I)
  const devToolsKey = `${modKey}+Shift+I`;
  globalShortcut.register(devToolsKey, () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
      console.log('DevTools toggled via shortcut');
    }
  });
  
  console.log(`Registered global shortcuts: ${toggleKey}, ${moveUpKey}, ${moveDownKey}, ${moveLeftKey}, ${moveRightKey}, ${screenshotKey}, ${clearTextKey}, ${devToolsKey}`);
};

// IPC handlers
ipcMain.on('set-ignore-mouse-events', (_, ignore, options) => {
  console.log(`Setting ignore mouse events: ${ignore}`);
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, options);
  }
});

ipcMain.on('close-window', () => {
  console.log('Close-window IPC message received');
  performCleanShutdown();
});

ipcMain.on('resize-window', (_, width, height) => {
  console.log(`Resizing window to: ${width}x${height}`);
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    const [currentWidth, currentHeight] = mainWindow.getSize();
    
    // Use a smoother animation approach
    animateWindowResize(mainWindow, {
      x, y,
      width: currentWidth,
      height: currentHeight
    }, {
      x, y,
      width,
      height
    }, 250); // 250ms animation duration
  }
});

// Animation helper function for smooth window resizing
function animateWindowResize(
  window: BrowserWindow, 
  startBounds: { x: number, y: number, width: number, height: number },
  endBounds: { x: number, y: number, width: number, height: number },
  duration: number
) {
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Use easeOutCubic easing function for natural feel
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    // Calculate current dimensions
    const currentWidth = Math.round(startBounds.width + (endBounds.width - startBounds.width) * easeProgress);
    const currentHeight = Math.round(startBounds.height + (endBounds.height - startBounds.height) * easeProgress);
    
    // Set the new size
    window.setSize(currentWidth, currentHeight);
    
    // Continue animation if not finished
    if (progress < 1) {
      setTimeout(animate, 16); // ~60fps
    }
  };
  
  animate();
}

// Add new IPC handlers for screen filter management
ipcMain.handle('get-screen-filter-status', () => {
  return isScreenFilterActive();
});

ipcMain.handle('restart-screen-filter', () => {
  if (mainWindow) {
    stopScreenFilter();
    startScreenFilter(mainWindow);
    return true;
  }
  return false;
});

// Add handler for toggling window visibility
ipcMain.handle('toggle-window-visibility', () => {
  toggleWindowVisibility();
  return isWindowVisible;
});

// Add handlers for moving window
ipcMain.handle('move-window', (_, direction: 'up' | 'down' | 'left' | 'right') => {
  moveWindow(direction);
  return mainWindow?.getPosition() || [0, 0];
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  console.log('Electron app is ready');
  createWindow();
  registerShortcuts();
  initOcrService(); // Initialize OCR service

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    console.log('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      registerShortcuts();
    }
  });
});

// Unregister shortcuts and ensure cleanup when app is about to quit
app.on('will-quit', () => {
  console.log('Unregistering global shortcuts');
  globalShortcut.unregisterAll();
  
  // Ensure screen filter is stopped
  if (!isQuitting) {
    console.log('Ensuring screen filter is stopped before quit');
    stopScreenFilter();
  } else {
    console.log('Screen filter already stopped during clean shutdown');
  }
});

// Quit when all windows are closed, even on macOS
app.on('window-all-closed', () => {
  console.log('All windows closed - quitting application');
  
  // Force quit even on macOS (different from standard macOS behavior)
  if (!isQuitting) {
    performCleanShutdown();
  }
}); 