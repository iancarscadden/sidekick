# Source Code

This directory contains all the application source code that needs to be processed (compiled, transpiled, etc.) before being used in the final application.

## Directories

### main/

Contains all code running in Electron's main process, responsible for native OS interactions, window management, and application lifecycle.

### renderer/

Contains code running in Electron's renderer process, responsible for the user interface using React. This code is bundled using webpack to handle module dependencies and resolve ES modules vs CommonJS compatibility issues.

### preload/

Contains scripts that run in a special context with access to both Node.js and browser APIs, creating a secure bridge between processes.

### components/

Contains reusable React components used throughout the application.

### styles/

Contains global styling and CSS configurations for the application. Uses Tailwind CSS processed by PostCSS.

## Architecture

The application follows Electron's two-process architecture:

1. **Main Process**: A Node.js process that has access to operating system APIs and controls the application lifecycle. Uses CommonJS modules.

2. **Renderer Process**: A Chromium-based browser process that displays the user interface using web technologies. Uses webpack for bundling to support ES modules and React components.

These processes communicate via IPC (Inter-Process Communication) channels established in the preload scripts.

## Build Process

- TypeScript is compiled to JavaScript using the TypeScript compiler
- CSS is processed using PostCSS with Tailwind plugins
- Renderer code is bundled using webpack to handle module dependencies and CSS imports
- The main process uses CommonJS modules while the renderer uses bundled ES modules 