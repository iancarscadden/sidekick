# Preload Scripts

This directory contains preload scripts that run in a special context with access to both Node.js and browser APIs. These scripts create a secure bridge between the main and renderer processes.

## Files

### preload.ts

The main preload script for the application:

- Creates type definitions for the Electron APIs exposed to the renderer
- Extends the global Window interface for TypeScript type safety
- Uses contextBridge to safely expose specific main process functionality
- Sets up IPC communication channels for operations like:
  - Controlling mouse event ignoring for click-through behavior
  - Closing the application window
  - Other main process integrations

This file is crucial for security as it prevents the renderer process from having direct access to Node.js APIs while still allowing controlled communication with the main process. 