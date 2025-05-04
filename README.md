# Sidekick Overlay App

An invisible overlay application for desktop that can remain invisible even to screen capture applications like Zoom.

## Features

- Creates a transparent overlay window
- Remains invisible to screen capture tools using platform-specific techniques
- Provides click-through interface with interactive elements
- Cross-platform design (macOS and Windows support)

## Technical Details

### macOS Implementation

This application uses a two-layer approach to remain invisible to screen capture:

1. **Content Protection**: Uses Electron's built-in `setContentProtection(true)` which marks the window as secure content that shouldn't be captured.

2. **ScreenCaptureKit Native Integration**: Uses a native Node.js add-on that integrates with macOS ScreenCaptureKit to create a filter that excludes our windows from capture. This approach embeds the native ScreenCaptureKit integration directly into the Electron app bundle, requiring only a single permission grant for the whole application.

Key advantages:
- Single-bundle approach with proper code signing and entitlements
- No separate helper processes requiring their own permissions
- Fully compatible with macOS security model
- Reliable defense against screen capture, even in tools like Zoom

### Windows Implementation

On Windows, the application uses the `SetWindowDisplayAffinity` API with `WDA_EXCLUDEFROMCAPTURE` flag to exclude the window from screen captures.

## Development Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Build the app:
   ```
   npm run build
   ```

3. Start the app:
   ```
   npm start
   ```

## Building for Production

1. Build the application:
   ```
   npm run build
   ```

2. Create a distributable package:
   ```
   npm run dist
   ```

   For macOS specifically:
   ```
   npm run dist:mac
   ```

## macOS Screen Recording Permission

The app will request Screen Recording permission the first time it's run. This is necessary for the ScreenCaptureKit integration to work properly.

1. When prompted, allow Sidekick to record your screen in System Settings → Privacy & Security → Screen Recording.
2. Restart the app after granting permission.

## Project Structure

- `src/main/`: Electron main process code (Node.js)
- `src/renderer/`: Renderer process code (React)
- `src/preload/`: Preload scripts
- `src/components/`: React components
- `src/styles/`: CSS styles
- `native/node-addon/`: Native Node.js add-on for ScreenCaptureKit integration

## Requirements

- Node.js 14+
- For macOS: macOS 12.0+ (Monterey or newer)
- For Windows: Windows 10 or newer

## Enhanced Zoom Compatibility (macOS)

Sidekick uses Apple's ScreenCaptureKit framework to achieve complete invisibility on Zoom's modern screen capture pipeline:

- Standalone Swift helper process that sets up a SCStream filter to exclude our window
- Automatic process management from the Electron main process
- Status indicator and restart button in case of filter failures
- Works with Zoom's newer versions that use ScreenCaptureKit on macOS

## Development Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Build the application:
   ```
   npm run build
   ```
   This command:
   - Builds Tailwind CSS
   - Compiles TypeScript
   - Bundles renderer process code with webpack
   - Builds the macOS ScreenFilter helper (Swift)

3. Start the app:
   ```
   npm start
   ```

4. For development with auto-rebuild:
   ```
   npm run dev
   ```
   This starts several watch processes:
   - TypeScript compiler watch
   - Tailwind CSS watch
   - Webpack watch
   - Electron with auto-reload

## Technical Implementation

- Main process: Creates a transparent, always-on-top window that's excluded from capture
- Renderer process: React UI bundled with webpack for modern component-based architecture
- Preload script: Secure bridge between main and renderer processes
- Styling: Tailwind CSS with custom components
- ScreenCaptureKit helper: Swift executable that manages OS-level screen capture filtering on macOS

## Build System

- TypeScript compilation for type safety
- Webpack for bundling the renderer process code
- PostCSS with Tailwind for styling
- Swift Package Manager for the ScreenCaptureKit helper

## Current Limitations

- Windows implementation requires a native addon for full `SetWindowDisplayAffinity` support
- Click-through behavior may need refinement
- No global hotkeys (coming in Phase 2)

## Next Steps

Phase 2 will implement global hotkey support to toggle the overlay window without stealing focus. 