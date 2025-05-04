import { app, BrowserWindow, dialog } from 'electron';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Module to manage ScreenFilter for Zoom compatibility
let filterProcess: ChildProcess | null = null;
let isActive = false;
let filterProcessPid: number | null = null;
// Flag to track controlled shutdowns
let isShuttingDown = false;

// Ensure helper process is terminated when app quits
app.on('will-quit', () => {
  isShuttingDown = true;
  forceKillFilterProcess();
});

/**
 * Get the path to the ScreenFilter helper executable
 * In production, this will be inside the app bundle at Contents/Resources/
 */
function getScreenFilterPath(): string {
  console.log('Is packaged:', app.isPackaged);
  console.log('Process resources path:', process.resourcesPath);
  
  if (app.isPackaged) {
    // 1) Try Resources (where Electron actually put your helper)
    const resourcesPath = path.join(
      process.resourcesPath,
      'ScreenFilterCLI.app',
      'Contents','MacOS','ScreenFilterCLI'
    );
    if (fs.existsSync(resourcesPath)) {
      console.log('Using packaged helper (Resources):', resourcesPath);
      return resourcesPath;
    }

    // 2) Fallback to Helpers (in case you move there later)
    const helpersDir = process.resourcesPath.replace(
      '/Resources','/Helpers'
    );
    const helpersPath = path.join(
      helpersDir,
      'ScreenFilterCLI.app',
      'Contents','MacOS','ScreenFilterCLI'
    );
    console.log('Resources missing—trying Helpers:', helpersPath);
    return helpersPath;
  } else {
    // In development, use the local build
    const devPath = path.join(app.getAppPath(), 'native', 'macos-screen-filter', 'ScreenFilterCLI.app', 'Contents', 'MacOS', 'ScreenFilterCLI');
    
    // Check if the file exists
    if (!fs.existsSync(devPath)) {
      console.error(`ScreenFilter helper not found at ${devPath}`);
      // Try the standalone binary instead
      const standalonePath = path.join(app.getAppPath(), 'native', 'macos-screen-filter', 'ScreenFilter');
      console.log('Trying standalone path as fallback:', standalonePath);
      return standalonePath;
    }
    
    console.log('Using dev path:', devPath);
    return devPath;
  }
}

/**
 * Start the ScreenFilter for the given window
 */
export function startScreenFilter(window: BrowserWindow): void {
  // Only supported on macOS
  if (process.platform !== 'darwin') {
    console.log('ScreenFilter: Only supported on macOS');
    return;
  }
  
  if (isActive) {
    console.log('ScreenFilter: Already active');
    return;
  }
  
  try {
    // Get our process ID
    const pid = process.pid;
    console.log(`ScreenFilter: Using process ID: ${pid}`);
    
    // Get the window title
    const windowTitle = window.getTitle() || 'Sidekick Overlay';
    console.log(`ScreenFilter: Using window title: "${windowTitle}"`);
    
    // Path to the ScreenFilter executable
    const filterPath = getScreenFilterPath();
    
    // Check if file exists
    if (!fs.existsSync(filterPath)) {
      console.error(`ScreenFilter: Executable not found at ${filterPath}`);
      dialog.showErrorBox(
        'Screen Filter Error',
        `Could not find the ScreenFilter helper at ${filterPath}. Screen capture hiding may not work properly.`
      );
      return;
    }
    
    console.log(`ScreenFilter: Launching helper at ${filterPath}`);
    console.log(`ScreenFilter: Command args: [${pid.toString()}, "${windowTitle}"]`);
    
    // Reset shutdown flag
    isShuttingDown = false;
    
    // Spawn the process with our PID and window title
    filterProcess = spawn(filterPath, [pid.toString(), windowTitle], {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
    });
    
    if (filterProcess.pid) {
      filterProcessPid = filterProcess.pid;
      console.log(`ScreenFilter: Process spawned with PID: ${filterProcessPid}`);
    } else {
      console.error('ScreenFilter: Failed to get PID for spawned process');
      return;
    }
    
    // Handle process events
    filterProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`ScreenFilter stdout: ${output}`);
      
      // Check for ready signal
      if (output.includes('READY')) {
        isActive = true;
        console.log('ScreenFilter: Content filter active');
      }
    });
    
    filterProcess.stderr?.on('data', (data) => {
      const errorOutput = data.toString().trim();
      console.error(`ScreenFilter stderr: ${errorOutput}`);
      
      // Check for permission errors
      if (!isShuttingDown && (errorOutput.includes('permission denied') || errorOutput.includes('not granted'))) {
        console.error('ScreenFilter: Permission issue detected in stderr');
        showScreenRecordingPermissionDialog();
      } else {
        console.error(`ScreenFilter: Unexpected stderr output: ${errorOutput}`);
      }
    });
    
    filterProcess.on('close', (code) => {
      console.log(`ScreenFilter: Process exited with code ${code}`);
      filterProcess = null;
      
      // Only handle errors if we're not in the shutdown process
      if (!isShuttingDown) {
        isActive = false;
        
        // Check exit code
        if (code === 0) {
          // Success
          console.log('ScreenFilter: Helper exited normally');
        } else if (code === 1) {
          // Permission issue
          console.error('ScreenFilter: Screen recording permission denied with exit code 1');
          showScreenRecordingPermissionDialog();
        } else if (code === 2) {
          // Other error
          console.error('ScreenFilter: Failed to set up content filter with exit code 2');
          dialog.showErrorBox(
            'Screen Filter Error',
            'Failed to set up screen capture filter. Please check permissions and try again.'
          );
        } else {
          console.error(`ScreenFilter: Process exited with unexpected code ${code}`);
          dialog.showErrorBox(
            'Screen Filter Error',
            `Helper process exited with unexpected code ${code}. Please check logs for details.`
          );
        }
      } else {
        console.log('ScreenFilter: Process exited during controlled shutdown - no error handling needed');
        isActive = false;
      }
    });
    
    filterProcess.on('error', (err) => {
      console.error('ScreenFilter: Failed to start:', err);
      console.error(`ScreenFilter: Error details: ${JSON.stringify(err)}`);
      
      // Only show error dialog if not in shutdown
      if (!isShuttingDown) {
        isActive = false;
        dialog.showErrorBox(
          'Screen Filter Error',
          `Failed to start the ScreenFilter helper: ${err.message}`
        );
      } else {
        console.log('ScreenFilter: Error event during controlled shutdown - ignoring');
        isActive = false;
      }
    });
    
  } catch (error: any) {
    console.error('ScreenFilter: Error starting filter:', error);
    console.error(`ScreenFilter: Error stack: ${error.stack}`);
    
    if (!isShuttingDown) {
      dialog.showErrorBox(
        'Screen Filter Error',
        `Could not start the screen filter: ${error.message}`
      );
    }
  }
}

/**
 * Show a dialog about screen recording permission
 */
function showScreenRecordingPermissionDialog() {
  // Don't show dialog if we're in shutdown process
  if (isShuttingDown) return;
  
  dialog.showMessageBox({
    type: 'info',
    title: 'Screen Recording Permission Required',
    message: 'Sidekick needs Screen Recording permission to hide itself from Zoom.',
    detail: 'Please go to System Settings → Privacy & Security → Screen Recording and enable Sidekick, then restart the app.',
    buttons: ['OK'],
    defaultId: 0
  });
}

/**
 * Force kill the filter process using macOS kill command
 * This is more reliable than Node's process.kill
 */
function forceKillFilterProcess() {
  // Set shutdown flag to prevent error dialogs
  isShuttingDown = true;
  
  if (filterProcessPid) {
    console.log(`ScreenFilter: Force killing process with PID: ${filterProcessPid}`);
    
    try {
      // First try SIGTERM
      execSync(`kill -15 ${filterProcessPid}`);
      console.log(`ScreenFilter: Sent SIGTERM to process ${filterProcessPid} using shell command`);
      
      // Check if process is still running
      try {
        // This will throw if process doesn't exist
        execSync(`ps -p ${filterProcessPid} -o pid=`);
        
        // If we get here, process is still running, use SIGKILL
        console.log(`ScreenFilter: Process ${filterProcessPid} still running after SIGTERM, using SIGKILL`);
        execSync(`kill -9 ${filterProcessPid}`);
        console.log(`ScreenFilter: Sent SIGKILL to process ${filterProcessPid} using shell command`);
        
        // Double-check
        try {
          execSync(`ps -p ${filterProcessPid} -o pid=`);
          console.error(`ScreenFilter: ERROR: Process ${filterProcessPid} still running after SIGKILL!`);
        } catch (e) {
          console.log(`ScreenFilter: Process ${filterProcessPid} successfully terminated`);
        }
      } catch (e) {
        // Process already terminated by SIGTERM
        console.log(`ScreenFilter: Process ${filterProcessPid} already terminated by SIGTERM`);
      }
    } catch (error) {
      console.error('ScreenFilter: Error force killing process:', error);
    }
    
    // Always reset state
    filterProcessPid = null;
    filterProcess = null;
    isActive = false;
  } else {
    console.log('ScreenFilter: No process PID to kill');
  }
}

/**
 * Stop the ScreenFilter
 */
export function stopScreenFilter(): void {
  // Set shutdown flag to prevent error dialogs
  isShuttingDown = true;
  
  if (filterProcess || filterProcessPid) {
    console.log(`ScreenFilter: Stopping filter process with PID: ${filterProcessPid}`);
    
    // Use synchronous force kill which is more reliable during shutdown
    forceKillFilterProcess();
  } else {
    console.log('ScreenFilter: No process to stop');
  }
  
  isActive = false;
}

/**
 * Check if the ScreenFilter is currently active
 */
export function isScreenFilterActive(): boolean {
  return isActive;
} 