# Renderer Process

This directory contains code that runs in Electron's renderer process, which is responsible for the user interface and runs in a Chromium-based browser environment.

## Files

### renderer.tsx

The entry point for the renderer process:

- Initializes React and renders the root component
- Sets up DOM event listeners 
- Manages interactions with the Electron main process via the exposed APIs
- Imports and applies global styles

### App.tsx

The root React component for the application:

- Defines the main layout structure
- Renders child components
- Serves as the starting point for the component hierarchy
- Provides context and state management for the UI

## Build Configuration

This code is bundled using webpack to resolve module compatibility issues:

- Uses webpack as the bundler to handle ES modules
- CSS is processed through style-loader, css-loader, and postcss-loader
- Tailwind CSS is applied through PostCSS
- The bundle output is placed in `dist/renderer/renderer.js`
- Webpack handles all module dependencies and imports, including CSS 