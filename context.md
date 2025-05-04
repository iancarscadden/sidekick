# Sidekick Overlay: Creating a Zoom-Proof Transparent Window

## Project Mission

We're building a macOS desktop application called "Sidekick" that creates a transparent overlay window which remains invisible to screen recording applications like Zoom. This overlay can display information on top of other applications without being captured during screen sharing.

## Key Requirements

1. **Transparency**: The window must be visually transparent with selectively clickable UI elements
2. **Invisibility to Screen Recording**: The window must not appear in Zoom, Teams, or other screen recording software
3. **macOS Compatibility**: Full support for macOS 12.3+ (Monterey and newer)
4. **User Experience**: Smooth interaction with both the overlay and underlying applications

## Technical Approach

### Architecture

- **Electron Framework**: Used for desktop app development
- **React & TypeScript**: For UI components and type safety
- **Tailwind CSS**: For styling
- **macOS-Specific APIs**: For screen capture exclusion

### macOS Implementation (Two-Layer Approach)

1. **Content Protection Layer**:
   - Uses Electron's native `setContentProtection(true)` API
   - Marks window content as secure/protected from capture
   - Works for most basic screen recording but not sufficient for Zoom

2. **ScreenCaptureKit Integration**:
   - Uses Apple's ScreenCaptureKit framework (macOS 12.3+)
   - Implemented as a Swift helper process spawned by the Electron app
   - Creates a filter that excludes our specific windows from capture
   - Requires Screen Recording permission from the user

## Current Challenges

### ScreenCaptureKit Integration Issues

1. **Permission Problems**:
   - Zoom uses Apple's ScreenCaptureKit for capture on newer macOS versions
   - The Swift helper process needs Screen Recording permission
   - Current error: `startCapture() failed – Start stream failed (code 1003, domain CoreGraphicsErrorDomain)`
   - This error indicates permission issues with the helper binary

2. **Binary Authorization**:
   - Standalone binaries have restrictions in macOS security model
   - Even when manually added to Screen Recording permissions, the binary may be rejected
   - This is due to code signing and bundle structure requirements

3. **Native Node.js Add-on Approach**:
   - We attempted to build a native Node.js add-on to embed the ScreenCaptureKit integration
   - Encountered compilation errors and API compatibility issues
   - Reverted to using the Swift helper approach

### Current Solution Path

We've improved our Swift helper implementation to:
1. Better handle permission requests with proper user feedback
2. Bundle the helper with the main app through Electron-builder
3. Configure entitlements for proper code signing
4. Provide more robust error handling and status reporting

The app now:
1. Launches the Swift helper when started
2. Handles permission requests properly
3. Provides feedback if something fails
4. Terminates the helper cleanly on exit

## Next Steps

1. **Testing and Validation**:
   - Build and run the app with the improved Swift helper
   - Test with Zoom to verify window invisibility
   - Verify permission handling works correctly

2. **Packaging and Distribution**:
   - Ensure the Swift helper is properly bundled and signed with the app
   - Configure notarization for macOS distribution

## File Structure

- `src/main/`: Electron main process code
  - `main.ts`: Main entry point and window management
  - `utils/screen-filter.ts`: macOS ScreenCaptureKit integration

- `src/renderer/`: UI code (React)
  - `renderer.tsx`: Main renderer entry point

- `native/macos-screen-filter/`: Swift helper for ScreenCaptureKit
  - `Sources/ScreenFilter/main.swift`: Implementation of the filter

- `public/`: Static assets and HTML
  - `index.html`: Main HTML entry point

## Permission & Security Model

On macOS, to hide content from screen recording, we need:

1. A properly code-signed application bundle
2. Proper entitlements in the app's `entitlements.plist`
3. Screen Recording permission granted by the user
4. Either:
   - Content protection via `setContentProtection` (basic)
   - ScreenCaptureKit integration for comprehensive protection

The current challenge is ensuring that our Swift helper receives the necessary permissions and authorizations to function properly with ScreenCaptureKit. 