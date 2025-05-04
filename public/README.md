# Public Assets

This directory contains static assets that are copied directly to the build output without processing. These files are available to the application at runtime.

## Files

### index.html

The HTML entry point for the Electron renderer process:

- Provides the basic HTML structure for the application
- Contains the root element (`<div id="app">`) where React mounts
- Sets up Content Security Policy meta tags for security
- Links to the compiled JavaScript bundle
- Defines the document title and metadata

This file is loaded by Electron's BrowserWindow and serves as the container for the React application. 