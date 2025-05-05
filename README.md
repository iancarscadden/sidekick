# Sidekick Overlay App

An intelligent desktop overlay that remains invisible to screen capture applications like Zoom while providing AI-powered assistance through screenshots.

## Features

- Creates a transparent overlay window with clean, minimalistic UI
- Remains invisible to screen capture tools using platform-specific techniques
- Provides click-through interface with interactive elements
- Captures screenshots for AI processing with simple keyboard shortcuts
- Intelligent text and code formatting with syntax highlighting
- Cross-platform design (macOS and Windows support)

## Technical Architecture

### Core Components

- **Main Process** (`src/main/main.ts`): Manages the Electron lifecycle, window creation, keyboard shortcuts, and native integration
- **Renderer Process** (`src/renderer/renderer.tsx`, `src/renderer/App.tsx`): React-based UI rendering and event handling
- **Preload Script** (`src/preload/preload.ts`): Secure bridge between main and renderer processes
- **UI Components** (`src/components/Overlay.tsx`, `src/components/TextArea.tsx`): Modular UI elements
- **Screen Filter** (`native/macos-screen-filter/Sources/ScreenFilter/main.swift`): Native Swift implementation for hiding from screen capture

### macOS Implementation

This application uses a sophisticated two-layer approach to remain invisible to screen capture:

1. **Content Protection**: Uses Electron's built-in `setContentProtection(true)` which marks the window as secure content that shouldn't be captured.

2. **ScreenCaptureKit Native Integration**: Uses a Swift-based helper (`ScreenFilterCLI`) that integrates with macOS ScreenCaptureKit to create a filter that excludes our window from capture.

#### How ScreenFilterCLI Works

The Swift-based helper application (`main.swift`) implements the following flow:

1. **Window Identification**: Accepts the parent Electron process ID and optional window title as command-line arguments
2. **Permission Handling**: Checks for and requests screen recording permission if needed
3. **Window Locating**: Uses `SCShareableContent` to enumerate all windows and find the specific Electron window:
   ```swift
   // Find window by process ID and optional title
   func findWindow(pid: pid_t, title: String?) async throws -> SCWindow {
     // Get all available windows
     let available = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
     
     // First try to find window with matching title
     if let windowTitle = title {
       if let matchingWindow = available.windows.first(where: { 
         $0.owningApplication?.processID == pid && $0.title?.contains(windowTitle) == true
       }) {
         return matchingWindow
       }
     }
     
     // Fall back to any window with matching PID
     guard let window = available.windows.first(where: { $0.owningApplication?.processID == pid }) else {
       throw NSError(domain: "ScreenFilterCLI", code: 2,
                     userInfo: [NSLocalizedDescriptionKey: "No window found for pid \(pid)"])
     }
     
     return window
   }
   ```

4. **Filter Creation**: Creates an `SCContentFilter` for the specific window:
   ```swift
   let filter = SCContentFilter(desktopIndependentWindow: window)
   ```

5. **Capture Management**: Establishes an SCStream with the filter to actively exclude the window from capture

The Electron app launches this helper via `screen-filter.ts`:

```typescript
// Spawn the process with our PID and window title
filterProcess = spawn(filterPath, [pid.toString(), windowTitle], {
  stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
});
```

### Windows Implementation

On Windows, the application uses the `SetWindowDisplayAffinity` API with `WDA_EXCLUDEFROMCAPTURE` flag to exclude the window from screen captures.

## Electron Architecture

### Main Process (`main.ts`)

- Creates transparent, always-on-top Electron window
- Applies platform-specific capture exclusion techniques
- Manages global keyboard shortcuts:
  - **⌘\** (Cmd+Backslash): Toggle overlay visibility
  - **⌘⏎** (Cmd+Return): Capture screenshot for processing
  - **⌘;** (Cmd+Semicolon): Clear current text/response
  - **⌘↑↓←→** (Cmd+Arrow Keys): Move the overlay window
  - **⌘⇧I** (Cmd+Shift+I): Toggle DevTools

### Preload Script (`preload.ts`)

Securely exposes limited main process functionality to the renderer:

```typescript
contextBridge.exposeInMainWorld('electron', {
  setIgnoreMouseEvents: (ignore, options) => { ... },
  close: () => { ... },
  resizeWindow: (width, height) => { ... },
  onScreenshotTrigger: (callback) => { ... },
  onClearTextAreaTrigger: (callback) => { ... },
  // Other APIs...
});
```

### Renderer Process

#### App Component (`App.tsx`)

- Manages application state (response text, loading state, errors)
- Handles screenshot capture and processing
- Communicates with external APIs for OCR and AI processing
- Processes streaming responses with proper formatting

#### Overlay Component (`Overlay.tsx`)

- Provides the translucent UI container with header
- Displays keyboard shortcuts and close button
- Manages click-through behavior for non-interactive areas
- Renders the TextArea component for AI responses

#### TextArea Component (`TextArea.tsx`)

- Displays AI-generated responses with proper formatting
- Provides syntax highlighting for code blocks
- Shows loading state with "Thinking..." animation
- Implements empty state handling to minimize UI footprint when inactive

## UI Features

- **Minimalist Design**: Clean, translucent interface with dark background
- **Intelligent Formatting**: Automatic detection and styling of code blocks, lists, and paragraphs
- **Syntax Highlighting**: Real-time syntax highlighting for code blocks with language detection
- **Loading States**: Clean "Thinking..." indicator with animated dots
- **Empty State Handling**: Collapses UI when inactive for minimal visual footprint
- **Responsive Layout**: Automatically resizes based on content

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
  - `main.ts`: Application entry point and window management
  - `utils/screen-filter.ts`: ScreenCaptureKit integration manager
- `src/renderer/`: Renderer process code (React)
  - `renderer.tsx`: Entry point for the renderer process
  - `App.tsx`: Main React component with application logic
- `src/preload/`: Preload scripts for secure main-renderer communication
- `src/components/`: React UI components
  - `Overlay.tsx`: Main overlay container with header and keybind hints
  - `TextArea.tsx`: AI response rendering with formatting and syntax highlighting
- `src/styles/`: CSS styles with Tailwind
  - `global.css`: Custom styling with Tailwind utilities
- `native/macos-screen-filter/`: Native Swift code for ScreenCaptureKit integration
  - `Sources/ScreenFilter/main.swift`: Core implementation of screen capture exclusion

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

## Next Steps

### Sidekick Audio Feature

Developing a native audio transcription integration to enable real-time conversation assistance:

1. **Activation**: User presses a dedicated hotkey to activate the audio transcription feature
   
2. **Audio Capture**: A Swift helper process starts listening for system audio using macOS's native audio frameworks
   
3. **Real-time Transcription**: Audio is processed through macOS's native speech-to-text engine, building up a continuous string of transcribed text
   
4. **Question Processing**:
   - When the user hears a question they need help with, they press a designated hotkey
   - The current transcription buffer is sent to the AI processing API
   - An AI-generated answer is displayed in the Sidekick overlay
   - The transcription buffer is cleared while the service continues running
   
5. **Continuous Assistance**:
   - The transcription service remains active throughout the conversation
   - User can relay the AI-generated answer
   - As the conversation continues and follow-up questions are asked, they're automatically transcribed
   - User can press the processing hotkey again to get assistance with follow-up questions
   
6. **Session Management**:
   - The audio stream and transcription service remains active until explicitly closed
   - User presses a dedicated hotkey to end the transcription session when finished
   - All transcribed data is processed locally for privacy

This feature is ideal for:
- Interviews
- Meeting participation with on-demand information
- Educational settings where quick answers are needed
- Any scenario requiring real-time conversational AI support without visible typing

Technical implementation will utilize:
- macOS Speech Recognition framework for high-quality transcription
- Swift helper process similar to our ScreenFilterCLI approach
- IPC communication between the helper and Electron for seamless integration
- Secure text processing with minimal latency 