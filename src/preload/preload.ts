import { contextBridge, ipcRenderer } from 'electron';

// Define the shape of our APIs
interface ElectronAPI {
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  close: () => void;
  resizeWindow: (width: number, height: number) => void;
  getScreenFilterStatus: () => Promise<boolean>;
  restartScreenFilter: () => Promise<boolean>;
  toggleWindowVisibility: () => Promise<boolean>;
  moveWindow: (direction: 'up' | 'down' | 'left' | 'right') => Promise<[number, number]>;
  captureScreenshot: () => Promise<string>;
  processScreenshot: (base64Image: string) => Promise<{requestId: string, apiUrl: string}>;
  toggleAudioCapture: () => Promise<boolean>;
  getAudioCaptureStatus: () => Promise<boolean>;
  /* raw audio flow ⇒ base64 ⇒ edge fn ⇒ SSE events via `onTranscriptionUpdate` */
  processCurrentTranscription: () => Promise<{ requestId: string, apiUrl: string, audioContent: string }>;
  onScreenshotTrigger: (callback: () => void) => () => void;
  onClearTextAreaTrigger: (callback: () => void) => () => void;
  onTranscriptionUpdate: (callback: (text: string) => void) => () => void;
  onAudioCaptureStatusChange: (callback: (isActive: boolean) => void) => () => void;
  onProcessTranscription: (callback: (text: string) => void) => () => void;
}

// Declare global window interface
declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
  close: () => {
    ipcRenderer.send('close-window');
  },
  resizeWindow: (width: number, height: number) => {
    ipcRenderer.send('resize-window', width, height);
  },
  getScreenFilterStatus: async () => {
    return await ipcRenderer.invoke('get-screen-filter-status');
  },
  restartScreenFilter: async () => {
    return await ipcRenderer.invoke('restart-screen-filter');
  },
  toggleWindowVisibility: async () => {
    return await ipcRenderer.invoke('toggle-window-visibility');
  },
  moveWindow: async (direction: 'up' | 'down' | 'left' | 'right') => {
    return await ipcRenderer.invoke('move-window', direction);
  },
  captureScreenshot: async () => {
    return await ipcRenderer.invoke('capture-screenshot');
  },
  processScreenshot: async (base64Image: string) => {
    return await ipcRenderer.invoke('process-screenshot', base64Image);
  },
  toggleAudioCapture: async () => {
    return await ipcRenderer.invoke('toggle-audio-capture');
  },
  getAudioCaptureStatus: async () => {
    return await ipcRenderer.invoke('get-audio-capture-status');
  },
  processCurrentTranscription: async () => {
    return await ipcRenderer.invoke('process-current-transcription');
  },
  onScreenshotTrigger: (callback: () => void) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on('trigger-screenshot', subscription);
    return () => {
      ipcRenderer.removeListener('trigger-screenshot', subscription);
    };
  },
  onClearTextAreaTrigger: (callback: () => void) => {
    const subscription = (_event: any) => callback();
    ipcRenderer.on('clear-text-area', subscription);
    return () => {
      ipcRenderer.removeListener('clear-text-area', subscription);
    };
  },
  onTranscriptionUpdate: (callback: (text: string) => void) => {
    const subscription = (_event: any, text: string) => callback(text);
    ipcRenderer.on('transcription-update', subscription);
    return () => {
      ipcRenderer.removeListener('transcription-update', subscription);
    };
  },
  onAudioCaptureStatusChange: (callback: (isActive: boolean) => void) => {
    const subscription = (_event: any, isActive: boolean) => callback(isActive);
    ipcRenderer.on('audio-capture-status', subscription);
    return () => {
      ipcRenderer.removeListener('audio-capture-status', subscription);
    };
  },
  onProcessTranscription: (callback: (text: string) => void) => {
    const subscription = (_event: any, text: string) => callback(text);
    ipcRenderer.on('process-transcription', subscription);
    return () => {
      ipcRenderer.removeListener('process-transcription', subscription);
    };
  }
}); 