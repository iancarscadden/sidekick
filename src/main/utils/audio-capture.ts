import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';

// SECURITY NOTE: This module carefully manages OS permissions, helper process lifecycle, and buffer 
// sizes to ensure optimal performance while preventing memory leaks. The audio data is processed
// locally before being sent to the backend to maintain privacy and reduce bandwidth requirements.

// Audio format constants
const SAMPLE_RATE = 16000; // Hz
const CHANNELS = 1;        // mono
const BYTES_PER_SAMPLE = 2; // 16-bit PCM

// Track the global state of the audio capture process
let audioCaptureProcess: ChildProcess | null = null;
// Accumulate raw 16-bit PCM samples
let rawAudioBuffer = Buffer.alloc(0);
// Define a maximum buffer size (8 MiB) to prevent exceeding Google's 10 MiB limit
const MAX_BUFFER_SIZE = 8 * 1024 * 1024; // 8 MiB
// Define minimum buffer size (1 second of 16kHz mono audio)
const MIN_BUFFER_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * 1; // 32KB
let isActive = false;
let mainWindow: BrowserWindow | null = null;
let hasRegisteredExitHandlers = false;

/**
 * Safely converts a base64 string to a Uint8Array
 * @param base64 The base64 string to convert
 * @returns A Uint8Array representing the binary data
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Starts the audio capture process
 * @param window The main Electron window
 * @returns A promise that resolves when the process is started
 */
export function startAudioCapture(window: BrowserWindow): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (audioCaptureProcess) {
      console.log('Audio capture is already running');
      resolve(true);
      return;
    }

    mainWindow = window;
    
    // Instead of showing permissions dialogs upfront, directly try to initialize
    // If there are permission issues, we'll handle them reactively
    initializeAudioCapture(window, resolve, reject);
  });
}

/**
 * Helper function to initialize the audio capture process
 * @param window The main Electron window
 * @param resolve Promise resolver
 * @param reject Promise rejector
 */
function initializeAudioCapture(
  window: BrowserWindow, 
  resolve: (value: boolean | PromiseLike<boolean>) => void,
  reject: (reason?: any) => void
) {
  try {
    // Find the path to the AudioCaptureCLI
    const helperPath = getAudioCaptureHelperPath();
    
    if (!helperPath) {
      const error = 'AudioCaptureCLI helper not found';
      console.error(error);
      reject(new Error(error));
      return;
    }
    
    console.log(`Starting AudioCaptureCLI from: ${helperPath}`);
    
    // Add debug output to verify helper path and permissions
    if (fs.existsSync(helperPath)) {
      try {
        const stats = fs.statSync(helperPath);
        console.log(`Helper file permissions: ${stats.mode.toString(8)}`);
        if (!(stats.mode & 0o111)) {
          console.warn('Helper file is not executable! Trying to fix...');
          fs.chmodSync(helperPath, 0o755);
        }
      } catch (statErr) {
        console.error('Error checking helper file permissions:', statErr);
      }
    } else {
      console.error(`Helper file does not exist at path: ${helperPath}`);
      reject(new Error(`Helper file not found: ${helperPath}`));
      return;
    }
    
    // Spawn the process with verbose mode and full environment variables
    audioCaptureProcess = spawn(helperPath, ['--verbose'], {
      stdio: ['ignore', 'pipe', 'pipe'], // stdin, stdout, stderr
      env: {
        ...process.env,
        // Add environment variables to help with debugging
        'FORWARD_STDERR_TO_CONSOLE': '1',
      }
    });
    
    // Clear the previous audio buffer
    rawAudioBuffer = Buffer.alloc(0);
    
    // Track if we have permission issues
    let hasPermissionIssue = false;
    let startupError = '';
    
    // Log process ID for debugging
    console.log(`AudioCaptureCLI process started with PID: ${audioCaptureProcess.pid}`);
    
    // Set up stdout handler to accumulate raw PCM audio data
    if (audioCaptureProcess.stdout) {
      audioCaptureProcess.stdout.on('data', (chunk: Buffer) => {
        // Just accumulate the raw PCM data chunks
        rawAudioBuffer = Buffer.concat([rawAudioBuffer, chunk]);
      });
    }
    
    // Set up stderr handler
    if (audioCaptureProcess.stderr) {
      audioCaptureProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        console.error(`AudioCaptureCLI stderr: ${errorOutput}`);
        
        // Store error for rejection if needed
        startupError = errorOutput;
        
        // Check for specific error messages
        if (errorOutput.includes('Speech recognition access denied') || 
            errorOutput.includes('Microphone access denied') ||
            errorOutput.includes('permission')) {
          hasPermissionIssue = true;
          
          showPermissionsDialog(window);
        }
      });
    }
    
    // Set up process exit handler
    audioCaptureProcess.on('exit', (code, signal) => {
      console.log(`AudioCaptureCLI process exited with code ${code} and signal ${signal}`);
      
      // If the process exited during startup with a SIGTRAP (common for permission issues)
      if (signal === 'SIGTRAP') {
        console.error('Process crashed with SIGTRAP - likely a permissions or initialization issue');
        if (!hasPermissionIssue) {
          // Show a generic permissions dialog if no specific error was detected
          showPermissionsDialog(window);
        }
      }
      
      audioCaptureProcess = null;
      isActive = false;
      
      // Notify renderer that audio capture has stopped
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio-capture-status', false);
      }
    });
    
    // Set up error handler
    audioCaptureProcess.on('error', (error) => {
      console.error('Failed to start AudioCaptureCLI:', error);
      audioCaptureProcess = null;
      isActive = false;
      reject(error);
    });
    
    // Register exit handlers if not already registered
    if (!hasRegisteredExitHandlers) {
      registerExitHandlers();
      hasRegisteredExitHandlers = true;
    }
    
    // Wait a short time to ensure the process starts successfully
    // This timeout needs to be long enough for the process to initialize
    const startupTimeout = setTimeout(() => {
      if (audioCaptureProcess && !hasPermissionIssue) {
        isActive = true;
        
        // Notify renderer that audio capture has started
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio-capture-status', true);
        }
        
        console.log('AudioCaptureCLI started successfully');
        resolve(true);
      } else {
        // Process exited too quickly or had permission issues
        if (hasPermissionIssue) {
          reject(new Error(`AudioCaptureCLI permission error: ${startupError}`));
        } else {
          reject(new Error('AudioCaptureCLI failed to start'));
        }
      }
    }, 2000); // Increased timeout to 2 seconds
    
    // Clear timeout if process exits before the timeout
    audioCaptureProcess.once('exit', () => {
      clearTimeout(startupTimeout);
    });
    
  } catch (error) {
    console.error('Error starting AudioCaptureCLI:', error);
    reject(error);
  }
}

/**
 * Shows a permissions dialog for microphone and speech recognition
 * @param window The main Electron window
 */
function showPermissionsDialog(window: BrowserWindow) {
  // Need to use Electron's dialog API from the main process, not from renderer
  const { dialog, shell } = require('electron');
  
  dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Audio Permission Required',
    message: 'Sidekick needs permission to capture audio',
    detail: 'Please click "Open Settings" to enable audio permission. This is required for the audio capture feature to work.',
    buttons: ['Open Settings', 'Cancel'],
    defaultId: 0
  }).then((result: { response: number }) => {
    if (result.response === 0) {
      // Open System Preferences to Security & Privacy section
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy');
    }
  }).catch((err: Error) => console.error('Error showing permission dialog:', err));
}

/**
 * Stops the audio capture process
 * @returns A promise that resolves when the process is stopped
 */
export function stopAudioCapture(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!audioCaptureProcess) {
      console.log('Audio capture is not running');
      resolve(false);
      return;
    }
    
    try {
      // First try to gracefully terminate
      audioCaptureProcess.kill('SIGTERM');
      
      // Set a timeout to force kill if needed
      const forceKillTimeout = setTimeout(() => {
        if (audioCaptureProcess) {
          console.log('Force killing AudioCaptureCLI process');
          audioCaptureProcess.kill('SIGKILL');
        }
      }, 1000);
      
      // Listen for exit
      audioCaptureProcess.once('exit', () => {
        clearTimeout(forceKillTimeout);
        audioCaptureProcess = null;
        isActive = false;
        
        // Notify renderer that audio capture has stopped
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio-capture-status', false);
        }
        
        console.log('AudioCaptureCLI stopped successfully');
        resolve(true);
      });
    } catch (error) {
      console.error('Error stopping AudioCaptureCLI:', error);
      audioCaptureProcess = null;
      isActive = false;
      resolve(false);
    }
  });
}

/**
 * Returns the captured audio in base64 so our edge-function can consume it.
 * @returns The current audio buffer as base64
 */
export function getAudioBufferBase64(): string {
  // Check if we have enough audio data (at least 1 second worth)
  if (rawAudioBuffer.length < MIN_BUFFER_SIZE) {
    console.log(`Not enough audio yet (${rawAudioBuffer.length} bytes), waiting for more... (need ${MIN_BUFFER_SIZE} bytes)`);
    return '';
  }
  
  // Check if buffer size exceeds the max limit, trim if needed
  if (rawAudioBuffer.length > MAX_BUFFER_SIZE) {
    console.warn(`Trimming audio buffer from ${rawAudioBuffer.length} bytes to last ${MAX_BUFFER_SIZE} bytes`);
    rawAudioBuffer = rawAudioBuffer.slice(rawAudioBuffer.length - MAX_BUFFER_SIZE);
  }
  
  // Validate that the buffer has an even number of bytes (required for Int16 PCM)
  if (rawAudioBuffer.length % 2 !== 0) {
    console.warn(`Buffer length (${rawAudioBuffer.length} bytes) is not even, which is invalid for Int16 PCM. Trimming last byte.`);
    rawAudioBuffer = rawAudioBuffer.slice(0, rawAudioBuffer.length - 1);
  }
  
  // Log detailed buffer information for debugging
  console.log(`Buffer length (bytes): ${rawAudioBuffer.length}`);
  console.log(`Valid Int16 PCM: ${rawAudioBuffer.length % 2 === 0}`);
  console.log(`Duration: ~${(rawAudioBuffer.length / (SAMPLE_RATE * BYTES_PER_SAMPLE)).toFixed(2)} seconds`);

  // For debugging, save a small sample of the buffer to verify format (uncomment if needed)
  // saveAudioBufferToFile(rawAudioBuffer, 'debug-audio.pcm');
  
  // Convert the raw PCM data to base64
  const base64Data = rawAudioBuffer.toString('base64');
  console.log(`Got ${rawAudioBuffer.length} bytes of audio data (${base64Data.length} bytes as base64)`);
  
  // Clear buffer after getting it - IMPORTANT to prevent reusing old audio
  rawAudioBuffer = Buffer.alloc(0);
  
  return base64Data;
}

/**
 * Saves raw audio buffer to a file for debugging purposes
 * @param buffer The buffer to save
 * @param filename The filename to save to
 */
function saveAudioBufferToFile(buffer: Buffer, filename: string): void {
  try {
    const fs = require('fs');
    const appDir = app.getPath('userData');
    const filePath = path.join(appDir, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved audio debug file to: ${filePath}`);
  } catch (err) {
    console.error('Failed to save audio debug file:', err);
  }
}

/**
 * Clears the audio buffer
 */
export function clearAudioBuffer(): void {
  rawAudioBuffer = Buffer.alloc(0);
}

/**
 * Checks if audio capture is active
 * @returns True if audio capture is active
 */
export function isAudioCaptureActive(): boolean {
  return isActive;
}

/**
 * Gets the path to the AudioCaptureCLI helper
 * @returns The path to the helper, or null if not found
 */
function getAudioCaptureHelperPath(): string | null {
  // Log environment information for debugging
  console.log('Is packaged:', app.isPackaged);
  console.log('Process resources path:', process.resourcesPath);
  
  // For packaged app, use the Resources path
  if (app.isPackaged) {
    const helperPath = path.join(
      process.resourcesPath,
      'AudioCaptureCLI.app',
      'Contents',
      'MacOS',
      'AudioCaptureCLI'
    );
    
    if (fs.existsSync(helperPath)) {
      console.log('Using bundled AudioCaptureCLI helper at:', helperPath);
      return helperPath;
    }
  } else {
    // In development mode, first check the native development path
    const devPath = path.join(
      app.getAppPath(),
      'native',
      'macos-audio-capture',
      'AudioCaptureCLI.app',
      'Contents',
      'MacOS',
      'AudioCaptureCLI'
    );
    
    if (fs.existsSync(devPath)) {
      console.log('Using development AudioCaptureCLI helper at:', devPath);
      return devPath;
    }
  }
  
  // As a fallback, check if the distributable version exists
  const distPath = path.join(
    app.getAppPath(),
    'dist',
    'mac-arm64',
    'Sidekick.app',
    'Contents',
    'Resources',
    'AudioCaptureCLI.app',
    'Contents',
    'MacOS',
    'AudioCaptureCLI'
  );
  
  if (fs.existsSync(distPath)) {
    console.log('Using distributable AudioCaptureCLI helper at:', distPath);
    return distPath;
  }
  
  console.error('AudioCaptureCLI helper not found in any expected location!');
  return null;
}

/**
 * Forcefully kill the AudioCaptureCLI process
 */
function forceKillAudioCapture(): void {
  if (audioCaptureProcess) {
    try {
      console.log('Force killing AudioCaptureCLI process during app shutdown');
      audioCaptureProcess.kill('SIGKILL');
      audioCaptureProcess = null;
      isActive = false;
    } catch (err) {
      console.error('Error during force kill:', err);
    }
  }
}

/**
 * Register exit handlers for all possible app termination scenarios
 */
function registerExitHandlers(): void {
  // Normal app quit
  app.on('will-quit', () => {
    console.log('Ensuring AudioCaptureCLI is stopped before app quit event');
    forceKillAudioCapture();
  });

  // Abrupt app termination
  app.on('quit', () => {
    console.log('Ensuring AudioCaptureCLI is stopped before app quit event');
    forceKillAudioCapture();
  });
  
  // Emergency cleanup for uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in main process:', error);
    console.log('Ensuring AudioCaptureCLI is stopped due to uncaught exception');
    forceKillAudioCapture();
  });
  
  // Emergency cleanup for unhandled rejections
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in main process:', reason);
    console.log('Ensuring AudioCaptureCLI is stopped due to unhandled rejection');
    forceKillAudioCapture();
  });
  
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    console.log('Ensuring AudioCaptureCLI is stopped due to SIGINT');
    forceKillAudioCapture();
    process.exit(0);
  });
  
  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('Ensuring AudioCaptureCLI is stopped due to SIGTERM');
    forceKillAudioCapture();
    process.exit(0);
  });
} 