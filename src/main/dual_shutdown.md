# Dual Shutdown Implementation

## Overview

Sidekick implements a carefully orchestrated shutdown process to ensure both the main Electron app and the macOS native Swift helper (`ScreenFilterCLI`) are terminated properly. This is critical because:

1. The Swift helper runs as a separate process with its own PID
2. Improper termination can leave orphaned processes
3. Permission and security dialogs must be suppressed during shutdown

## Current Implementation

### Main Components

- **Main Process** (`main.ts`): Handles app lifecycle and initiates shutdown
- **Screen Filter** (`screen-filter.ts`): Manages the Swift helper process

### Shutdown Flow

1. **Initiation Points**:
   - Window close button clicked (`close-window` IPC event)
   - OS close event intercepted (window `close` event)
   - All windows closed (`window-all-closed` event)

2. **Clean Shutdown Process** (`performCleanShutdown()`):
   - Sets `isQuitting = true` flag to prevent recursive calls
   - Calls `stopScreenFilter()` synchronously
   - Adds `will-quit` handler for final confirmation
   - Uses short timeout (250ms) to allow filter process to terminate
   - Explicitly destroys window and calls `app.quit()`
   - Implements failsafe with `process.exit(0)` after 500ms

3. **Swift Helper Termination** (`forceKillFilterProcess()`):
   - Sets `isShuttingDown = true` flag to suppress error dialogs
   - Uses `execSync` with `kill -15` (SIGTERM) for clean shutdown
   - Verifies process termination with `ps -p`
   - Falls back to `kill -9` (SIGKILL) if process persists
   - Resets all state variables

## Key Safeguards

1. **Shutdown Flags**:
   - `isQuitting` in main process prevents multiple quit attempts
   - `isShuttingDown` in screen filter prevents error dialogs during exit

2. **Event Intercepts**:
   - Window `close` event is intercepted to route through clean shutdown
   - App `will-quit` provides verification of proper shutdown sequence

3. **Force Kill Mechanism**:
   - Uses native shell commands (`kill`) instead of Node's `process.kill`
   - Implements escalating kill signals (SIGTERM → SIGKILL)
   - Verifies termination with process existence check

4. **Timeouts**:
   - Short delay (250ms) allows helper process to terminate
   - Failsafe timeout (500ms) forces exit if normal quit stalls

## Error Handling

- Error dialogs are suppressed during controlled shutdown
- All errors are logged to console even during shutdown
- Multiple termination verification points ensure processes don't remain

## Platform Specifics

This implementation is primarily for macOS where the Swift helper is used. On Windows, the shutdown process is simpler as there's no equivalent helper process.

## Future Improvements

Potential improvements to consider:

1. Add telemetry to track shutdown success rates
2. Implement watchdog to detect and clean orphaned processes on next startup
3. Consider using IPC between Electron and Swift for more coordinated shutdown 