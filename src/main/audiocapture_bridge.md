# Audio Capture Bridge Architecture

This document details how our Electron app interfaces with the Swift-based AudioCaptureCLI helper to enable real-time audio capture and transcription.

## Overview

The AudioCaptureCLI integration consists of three main components:

1. **Swift Helper** (`native/macos-audio-capture/AudioCaptureCLI`): Captures system audio and performs speech recognition
2. **TypeScript Bridge** (`src/main/utils/audio-capture.ts`): Manages the helper process and handles communication
3. **Main Process Integration** (`src/main/main.ts`): Exposes audio capture functionality to the UI and manages app lifecycle

## Communication Flow

```
┌───────────────────┐         ┌───────────────────┐         ┌───────────────────┐
│                   │         │                   │         │                   │
│   Electron UI     │◄────────│   Main Process    │◄────────│   AudioCaptureCLI │
│   (Renderer)      │         │   (audio-capture) │         │   (Swift Helper)  │
│                   │         │                   │         │                   │
└───────────────────┘         └───────────────────┘         └───────────────────┘
       ▲                               │                             │
       │                               │                             │
       └───────────────────────────────┼─────────────────────────────┘
                                       │
                                Keyboard Shortcuts
                                - Cmd+Shift+' (Toggle)
                                - Cmd+' (Process)
```

## Swift Helper (AudioCaptureCLI)

The Swift helper performs these key functions:

1. **Audio Capture**: Captures system audio output using either:
   - Core Audio Tap API (macOS 14.4+)
   - HAL Output Audio Unit (pre-macOS 14.4)

2. **Speech Recognition**: Processes audio through Apple's native SFSpeechRecognizer

3. **JSON Output**: Streams results as JSON lines to stdout:
   ```json
   {"text": "transcribed text here"}
   ```

## TypeScript Bridge (audio-capture.ts)

The `audio-capture.ts` module serves as the bridge between the Swift helper and our Electron app:

### Key Components

1. **Process Management**:
   - Spawns and monitors the AudioCaptureCLI process
   - Handles process lifecycle (start, stop, error handling)
   - Ensures cleanup on app exit via multiple exit handlers

2. **Data Processing**:
   - Parses JSON output from AudioCaptureCLI
   - Maintains a transcription buffer
   - Forwards updates to the Electron renderer process

3. **Helper Location**:
   - Implements path resolution logic to find the helper executable in both development and production builds

### Core Functions

```typescript
// Start the audio capture process
export function startAudioCapture(window: BrowserWindow): Promise<boolean> { ... }

// Stop the audio capture process
export function stopAudioCapture(): Promise<boolean> { ... }

// Get the current transcription
export function getTranscription(): string { ... }

// Clear the transcription buffer
export function clearTranscription(): void { ... }

// Check if audio capture is active
export function isAudioCaptureActive(): boolean { ... }
```

### Exit Handling

The module implements comprehensive cleanup to prevent orphaned helper processes:

```typescript
function registerExitHandlers(): void {
  // Normal app quit
  app.on('will-quit', () => { ... });

  // Abrupt termination
  app.on('quit', () => { ... });
  
  // Uncaught exceptions
  process.on('uncaughtException', (error) => { ... });
  
  // Unhandled rejections
  process.on('unhandledRejection', (reason) => { ... });
  
  // SIGINT and SIGTERM
  process.on('SIGINT', () => { ... });
  process.on('SIGTERM', () => { ... });
}
```

## Main Process Integration (main.ts)

The `main.ts` file integrates the audio capture functionality into the app:

### Keyboard Shortcuts

```typescript
// Register audio capture toggle (Cmd+Shift+' or Ctrl+Shift+')
const audioCaptureKey = `${modKey}+Shift+'`;
globalShortcut.register(audioCaptureKey, toggleAudioCapture);

// Register process transcription (Cmd+' or Ctrl+')
const processTranscriptionKey = `${modKey}+'`;
globalShortcut.register(processTranscriptionKey, processTranscription);
```

### Core Functions

```typescript
// Toggle audio capture on/off
const toggleAudioCapture = async () => {
  if (isAudioCaptureEnabled) {
    await stopAudioCapture();
    isAudioCaptureEnabled = false;
  } else {
    try {
      await startAudioCapture(mainWindow);
      isAudioCaptureEnabled = true;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
    }
  }
  // Notify renderer
  mainWindow.webContents.send('audio-capture-status', isAudioCaptureEnabled);
};

// Process the current transcription with AI
const processTranscription = () => {
  const transcription = getTranscription();
  if (transcription.trim() === '') return;
  
  // Send to renderer for AI processing
  mainWindow.webContents.send('process-transcription', transcription);
};
```

### IPC Handlers

```typescript
// Toggle audio capture
ipcMain.handle('toggle-audio-capture', async () => {
  await toggleAudioCapture();
  return isAudioCaptureEnabled;
});

// Get current transcription
ipcMain.handle('get-current-transcription', () => {
  return getTranscription();
});

// Clear transcription
ipcMain.handle('clear-transcription', () => {
  clearCurrentTranscription();
  return true;
});

// Process current transcription
ipcMain.handle('process-current-transcription', () => {
  processTranscription();
  return true;
});
```

### Cleanup Integration

The main process includes cleanup for the audio capture in its shutdown sequence:

```typescript
function performCleanShutdown() {
  // Stop audio capture if running
  if (isAudioCaptureEnabled) {
    console.log('Stopping audio capture before quitting');
    stopAudioCapture();
  }
  
  // Rest of shutdown sequence
  // ...
}
```

## Preload Script Integration

The preload script exposes audio capture functionality to the renderer process:

```typescript
// Define API
interface ElectronAPI {
  // Audio capture methods
  toggleAudioCapture: () => Promise<boolean>;
  getAudioCaptureStatus: () => Promise<boolean>;
  getCurrentTranscription: () => Promise<string>;
  clearTranscription: () => Promise<boolean>;
  processCurrentTranscription: () => Promise<boolean>;
  
  // Audio capture events
  onTranscriptionUpdate: (callback: (text: string) => void) => () => void;
  onAudioCaptureStatusChange: (callback: (isActive: boolean) => void) => () => void;
  onProcessTranscription: (callback: (text: string) => void) => () => void;
  
  // Other app methods
  // ...
}

// Expose methods
contextBridge.exposeInMainWorld('electron', {
  // Audio capture methods
  toggleAudioCapture: async () => {
    return await ipcRenderer.invoke('toggle-audio-capture');
  },
  getAudioCaptureStatus: async () => {
    return await ipcRenderer.invoke('get-audio-capture-status');
  },
  // ... other methods
  
  // Event listeners
  onTranscriptionUpdate: (callback) => {
    const subscription = (_event, text) => callback(text);
    ipcRenderer.on('transcription-update', subscription);
    return () => {
      ipcRenderer.removeListener('transcription-update', subscription);
    };
  },
  // ... other event listeners
});
```

## Build Process Integration

The audio capture system is integrated into the build process through:

1. **Package.json Build Script**:
   ```json
   "build:macos-audio-capture": "bash native/macos-audio-capture/build.sh",
   ```

2. **Electron Builder Configuration**:
   ```json
   "extraResources": [
     {
       "from": "native/macos-audio-capture/AudioCaptureCLI.app",
       "to": "AudioCaptureCLI.app"
     }
   ]
   ```

3. **Permission Declarations**:
   ```json
   "extendInfo": {
     "NSAudioCaptureUsageDescription": "Allow Sidekick to transcribe meeting audio from your system output",
     "NSSpeechRecognitionUsageDescription": "Allow Sidekick to convert captured audio into text for AI assistance"
   }
   ```

## Usage Flow

1. **Activation**: User presses `Cmd+Shift+'` to toggle audio capture
2. **Capture**: System starts capturing audio and transcribing in real-time
3. **Processing**: User presses `Cmd+'` to process the current transcription with AI
4. **Response**: AI-generated response is displayed in the UI
5. **Deactivation**: User presses `Cmd+Shift+'` again to stop audio capture

## Error Handling

The integration includes robust error handling:

1. **Process Failure**: Graceful handling of helper process failures
2. **Permission Errors**: Proper messaging for permission-related issues
3. **Transcription Errors**: Handling of empty or corrupt transcriptions
4. **Cleanup**: Multiple exit handlers to ensure the helper process is terminated

## Conclusion

This audio capture bridge provides a seamless integration between native macOS audio capabilities and our Electron app, enabling real-time transcription while maintaining proper process lifecycle management and cleanup. 