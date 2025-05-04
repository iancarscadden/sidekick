# Main Process Utilities

This directory contains utility functions and helpers used by the main process for platform-specific functionality.

## Files

### windows-utils.ts

Provides Windows-specific functionality for the application:

- Implements the Windows API call `SetWindowDisplayAffinity` to mark windows as excluded from screen capture
- Sets the `WDA_EXCLUDEFROMCAPTURE` flag (0x00000011) for Windows to prevent the window from appearing in screenshots and screen recordings
- Contains TypeScript declarations and error handling for Windows native API integration

**Note:** In a production application, this would typically be implemented using a native Node.js addon or FFI to make the actual Windows API calls. 