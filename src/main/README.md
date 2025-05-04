# Main Process

This directory contains all code that runs in Electron's main process, which is responsible for native OS interactions, window management, and application lifecycle.

## Files

### main.ts

The entry point for Electron's main process. This file:

- Creates and configures the transparent, capture-proof overlay window
- Sets platform-specific properties to exclude the window from screen capture
- Manages IPC communication with the renderer process
- Handles application lifecycle events (startup, activation, quit)

### utils/windows-utils.ts

Utility functions specific to Windows platform integration:

- Defines constants for Windows API calls
- Provides functionality to exclude windows from screen capture using Windows-specific APIs
- Implements the `SetWindowDisplayAffinity` API call to prevent the window from being captured

## Module System

- The main process uses CommonJS modules as specified in the tsconfig.json
- This is different from the renderer process, which uses ES modules bundled with webpack
- All paths are resolved relative to the compiled output in the dist directory

## Path Resolution

- HTML files are loaded from the public directory
- Preload scripts are loaded from the dist/preload directory
- During development, the app watches for changes and rebuilds as needed 