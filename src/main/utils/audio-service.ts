import { ipcMain } from 'electron';

// Audio processing API endpoint
const AUDIO_API_ENDPOINT = 'https://wnwvguldjsqmynxdrfij.supabase.co/functions/v1/audio-response';

/**
 * Initialize the audio service
 * This sets up the IPC handlers for audio processing
 * 
 * ARCHITECTURE NOTE: This service acts as the bridge between the audio capture module 
 * and the renderer process, handling the communication with the external API.
 * It maintains separation of concerns by isolating network requests from capture logic.
 */
export function initAudioService() {
  /** 
   * Processes base64 encoded LINEAR16 audio data and returns the API endpoint
   * for the renderer to connect to the SSE stream.
   */
  ipcMain.handle('process-audio-transcription', async (_evt, audioBase64: string) => {
    try {
      // Guard against empty audio data
      if (!audioBase64 || audioBase64.length === 0) {
        console.warn('No audio captured yet or not enough audio—aborting STT call');
        throw new Error('Not enough audio available for transcription (need at least 1 second)');
      }
      
      const requestId = `audio-${Date.now()}-${Math.random().toString(36).slice(-5)}`;
      console.log(`🆔 [${requestId}] sending ${audioBase64.length}‐byte base64 chunk…`);
      
      // Send the audio content to the API for processing
      const response = await fetch(AUDIO_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audioContent: audioBase64,
          requestId
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}: ${errorText}`);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
      
      // Return the API URL and request ID for SSE connection
      return {
        requestId,
        apiUrl: AUDIO_API_ENDPOINT,
        audioContent: audioBase64
      };
    } catch (error) {
      console.error('Error processing audio data:', error);
      throw error;
    }
  });
  
  console.log('Audio processing service initialized');
} 