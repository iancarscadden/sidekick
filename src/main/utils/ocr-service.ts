import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron';
import { writeFileSync } from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Cloud function endpoint
const OCR_API_ENDPOINT = 'https://wnwvguldjsqmynxdrfij.supabase.co/functions/v1/ocr-and-response';

// Initialize event response handlers
export function initOcrService() {
  // Handle screenshot capture request
  ipcMain.handle('capture-screenshot', async () => {
    try {
      const screenshot = await captureFullScreenshot();
      return screenshot;
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      throw error;
    }
  });

  // Handle sending screenshot to OCR service
  ipcMain.handle('process-screenshot', async (_, screenshotBase64: string) => {
    try {
      // Create a unique ID for this OCR request
      const requestId = `ocr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      console.log(`Created request ID: ${requestId} for OCR processing`);
      
      // Return the endpoint URL and request ID - the renderer will handle the actual fetch and SSE connection
      return { requestId, apiUrl: OCR_API_ENDPOINT };
    } catch (error) {
      console.error('Error processing screenshot:', error);
      throw error;
    }
  });
  
  console.log('OCR service initialized');
}

// Capture a full-screen screenshot as a base64 encoded PNG
async function captureFullScreenshot(): Promise<string> {
  try {
    // Get primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    // Get all screens
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    });
    
    if (sources.length === 0) {
      throw new Error('No screen sources found');
    }
    
    // Use the primary screen (first in the list)
    const primarySource = sources[0];
    
    // Get the thumbnail as a NativeImage
    const thumbnail = primarySource.thumbnail;
    
    // Convert the thumbnail to a base64 string
    const screenshotBase64 = thumbnail.toDataURL();
    
    // Optionally save the screenshot to disk for debugging
    if (process.env.NODE_ENV === 'development') {
      saveScreenshotToDisk(screenshotBase64);
    }
    
    return screenshotBase64;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
  }
}

// Save screenshot to disk for debugging
function saveScreenshotToDisk(dataUrl: string) {
  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const filePath = path.join(app.getPath('temp'), `screenshot-${Date.now()}.png`);
    writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    console.log(`Saved screenshot to ${filePath}`);
  } catch (error) {
    console.error('Error saving screenshot to disk:', error);
  }
} 