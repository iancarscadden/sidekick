import Foundation
import ScreenCaptureKit
import CoreMedia
import CoreGraphics
import Dispatch
import CoreFoundation

// A minimal SCStreamOutput implementation
class StreamOutputDelegate: NSObject, SCStreamOutput {
  let handler: (CMSampleBuffer, SCStreamOutputType) -> Void

  init(handler: @escaping (CMSampleBuffer, SCStreamOutputType) -> Void) {
    self.handler = handler
  }

  func stream(_ stream: SCStream,
              didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
              of outputType: SCStreamOutputType) {
    handler(sampleBuffer, outputType)
  }
}

@main
actor ScreenFilterCLI {
  // Store stream and delegate as static properties to ensure they live for the duration of the capture
  static var activeStream: SCStream?
  static var outputDelegate: StreamOutputDelegate?
  
  /// Check and request Screen Recording permission
  static func checkPermission() -> Bool {
    print("INFO: Checking screen recording permission...")
    if CGPreflightScreenCaptureAccess() {
      print("INFO: Permission already granted")
      return true
    }
    print("INFO: Requesting screen-recording permission...")
    CGRequestScreenCaptureAccess()
    let granted = CGPreflightScreenCaptureAccess()
    if granted {
      print("INFO: Permission granted after request")
    } else {
      print("ERROR: Screen recording permission denied")
    }
    return granted
  }
  
  /// Find window by process ID and optional title
  static func findWindow(pid: pid_t, title: String?) async throws -> SCWindow {
    print("INFO: Finding window for process ID: \(pid), title: \(title ?? "any")")
    
    // Get all available windows
    print("INFO: Getting shareable content...")
    let available = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    
    print("INFO: Found \(available.windows.count) total windows")
    // Debug: Print all window IDs to help troubleshoot
    for (index, win) in available.windows.enumerated() {
      let winTitle = win.title ?? "Untitled"
      let appPid = win.owningApplication?.processID ?? 0
      print("DEBUG: Window[\(index)]: ID=\(win.windowID) (0x\(String(win.windowID, radix: 16))) PID=\(appPid) Title=\"\(winTitle)\" App=\(win.owningApplication?.applicationName ?? "Unknown")")
    }
    
    // Find the target window - first try with title if provided
    if let windowTitle = title, !windowTitle.isEmpty {
      if let matchingWindow = available.windows.first(where: { 
        $0.owningApplication?.processID == pid && ($0.title == windowTitle || $0.title?.contains(windowTitle) == true)
      }) {
        let winTitle = matchingWindow.title ?? "Untitled"
        print("INFO: Found matching window with title \"\(winTitle)\" and PID \(pid)")
        return matchingWindow
      }
      
      print("INFO: No exact title match, trying any window with matching PID")
    }
    
    // Fall back to just any window with matching PID
    guard let window = available.windows.first(where: { $0.owningApplication?.processID == pid }) else {
      print("ERROR: No window found for process ID \(pid)")
      throw NSError(domain: "ScreenFilterCLI", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "No window found for pid \(pid)"])
    }
    
    let winTitle = window.title ?? "Untitled"
    print("INFO: Found window with PID \(pid) – \"\(winTitle)\"")
    return window
  }
  
  /// Create a content filter for a window
  static func createContentFilter(window: SCWindow) -> SCContentFilter {
    // Create the filter
    let filter = SCContentFilter(desktopIndependentWindow: window)
    print("INFO: Successfully created content filter for window: \(window.windowID)")
    return filter
  }
  
  /// Start capture with our filter
  static func startCapture(filter: SCContentFilter) async throws {
    print("INFO: Setting up capture with filter")
    
    // Configure the stream (using let since we don't mutate it after configuration)
    let config = SCStreamConfiguration()
    config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps is enough
    config.queueDepth = 1 // Minimal queue

    // Initialize stream with the filter
    print("INFO: Creating stream with filter")
    let stream = SCStream(filter: filter,
                          configuration: config,
                          delegate: nil)
    
    // Save reference to the stream
    activeStream = stream

    // Add a lightweight stream output to receive frames 
    print("INFO: Adding stream output")
    outputDelegate = StreamOutputDelegate { frame, type in
      // No-op: we don't need to process frames
    }
    
    do {
      try stream.addStreamOutput(outputDelegate!,
                          type: .screen,
                          sampleHandlerQueue: DispatchQueue.global())
    } catch {
      print("ERROR: Failed to add stream output: \(error.localizedDescription)")
      throw error
    }

    // Start capture
    print("INFO: Starting capture")
    try await stream.startCapture()
    print("INFO: Capture started successfully with filter")
    print("READY")
    fflush(stdout)
  }
  
  /// Stop capture gracefully
  static func stopCapture() async {
    print("INFO: Stopping capture...")
    if let stream = activeStream {
      do {
        try await stream.stopCapture()
        print("INFO: Capture stopped successfully")
      } catch {
        print("ERROR: Failed to stop capture: \(error.localizedDescription)")
      }
      activeStream = nil
    }
    outputDelegate = nil
  }
  
  /// Setup signal handlers for clean shutdown
  static func setupSignalHandlers() {
    // Simple signal handling
    for sig in [SIGINT, SIGTERM] {
      signal(sig) { signal in
        print("INFO: Received signal \(signal), shutting down...")
        
        // Use Task to call the async stopCapture method
        Task {
          await ScreenFilterCLI.stopCapture()
          
          // Stop the CFRunLoop from the main thread
          print("INFO: Stopping CFRunLoop...")
          DispatchQueue.main.async {
            CFRunLoopStop(CFRunLoopGetMain())
          }
        }
        
        // Give the task a chance to complete, but don't explicitly exit
        // The run loop will stop and the process will exit naturally
        sleep(1)
      }
    }
  }
  
  /// Run a non-async run loop to keep the process alive
  private static func runMainRunLoop() {
    print("INFO: Starting run loop on main thread")
    
    // This function runs on the main thread and is not async, so it can use CFRunLoopRun
    autoreleasepool {
      CFRunLoopRun()
    }
    
    print("INFO: Run loop stopped, process exiting")
  }

  /// The program entry point
  static func main() async {
    print("INFO: ScreenFilterCLI starting...")
    print("INFO: Arguments: \(CommandLine.arguments)")
    
    // Check command line arguments
    guard CommandLine.arguments.count >= 2 else {
      fputs("ERROR: Usage: ScreenFilterCLI <process-id> [window-title]\n", stderr)
      exit(1)
      return
    }
    
    // Get PID (required)
    guard let pid = pid_t(CommandLine.arguments[1]) else {
      fputs("ERROR: Invalid process ID\n", stderr)
      exit(1)
      return
    }
    
    // Get window title (optional)
    let windowTitle = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : nil
    
    // Setup signal handlers for clean shutdown
    setupSignalHandlers()
    
    print("INFO: Setting up window exclusion for PID: \(pid), title: \(windowTitle ?? "any")")
    
    // 1) Permission
    print("INFO: Checking permissions...")
    guard checkPermission() else { 
      print("ERROR: Failed permission check, exiting")
      exit(1)
    }
    
    // Initialize CoreGraphics early to prevent CGS_REQUIRE_INIT assertion failures
    let _ = CGMainDisplayID()
    print("INFO: CoreGraphics initialized via CGMainDisplayID()")

    // 2) Find window and create filter
    do {
      // Find the window using PID and title
      let window = try await findWindow(pid: pid, title: windowTitle)
      
      // Create the filter
      let filter = createContentFilter(window: window)
      
      // Start capturing with the filter
      try await startCapture(filter: filter)
      
      print("INFO: Exclusion complete; helper now running indefinitely")
    } catch {
      print("ERROR: Exception during setup: \(error.localizedDescription)")
      fputs("ERROR: \(error.localizedDescription)\n", stderr)
      exit(2)
    }

    // 3) Call runMainRunLoop on the main thread to keep the process alive
    print("INFO: Entering main run loop")
    
    // Dispatch to the main thread to call CFRunLoopRun, which must not be called from an async context
    DispatchQueue.main.async {
      runMainRunLoop()
    }
    
    // Keep this task alive until the runloop exits
    while true {
      try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
    }
  }
} 