# AudioCaptureCLI

A Swift-based command-line tool for capturing system audio and transcribing it to text using macOS's native speech recognition capabilities.

## Overview

AudioCaptureCLI is a helper application for the Sidekick electron app that:

1. Captures system audio output (what you hear from your speakers/headphones)
2. Processes the audio through Apple's native speech recognition
3. Streams the transcribed text as JSON back to the electron app

## Technical Implementation

### Audio Capture Methods

The CLI uses two different approaches to capture system audio, depending on the macOS version:

1. **Core Audio Tap API** (macOS 14.4+)
   - Uses `AudioHardwareCreateProcessTap` and `AudioHardwareCreateAggregateDevice`
   - Creates a system-wide audio tap that captures all audio except from our own process
   - Provides cleaner, more reliable audio capture with less latency

2. **HAL Output Audio Unit** (pre-macOS 14.4)
   - Falls back to the older Audio Unit approach
   - Captures audio from the default output device
   - Uses `kAudioUnitSubType_HALOutput` to tap into system audio

### Speech Recognition Pipeline

1. **SFSpeechRecognizer Setup**
   - Requests speech recognition permission
   - Creates a recognition request with partial results enabled
   - Connects the audio buffer to the speech recognizer

2. **Audio Buffer Processing**
   - Receives raw PCM audio data from the system
   - Converts it to `AVAudioPCMBuffer` format 
   - Feeds the buffer into the speech recognition request

3. **Real-time Transcription**
   - As words are recognized, they're immediately streamed out
   - Results are formatted as JSON lines: `{"text":"transcribed text here"}`
   - Each update sends the complete transcription so far, not just new words

### Data Flow

```
System Audio → Audio Capture API → AudioBuffer → SFSpeechRecognizer → JSON Output → Electron App
```

## Usage

The CLI is designed to be spawned by the electron app as a child process:

```typescript
// In electron app
const audioCaptureProcess = spawn('path/to/AudioCaptureCLI', [], {
  stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
});

// Process JSON line output
audioCaptureProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const { text } = JSON.parse(line);
      // Handle transcribed text
    } catch (e) {
      // Handle parse error
    }
  }
});
```

## Required Permissions

The CLI requires the following permissions:

1. **Speech Recognition** - For converting audio to text
2. **Audio Capture** - For accessing system audio

These are requested via:
- `NSAudioCaptureUsageDescription` in Info.plist
- `NSSpeechRecognitionUsageDescription` in Info.plist
- `com.apple.security.device.audio-input` in entitlements (if sandboxed)

## Building and Code Signing

The build process includes several important steps:

1. **Compilation**: Swift Package Manager builds the executable
   ```bash
   swift build -c release
   ```

2. **App Bundle Creation**: A minimal .app bundle is created to ensure macOS properly reads the Info.plist
   ```
   AudioCaptureCLI.app/
   └── Contents/
       ├── Info.plist
       └── MacOS/
           └── AudioCaptureCLI
   ```

3. **Code Signing**: Both the app bundle and a standalone binary are code-signed with entitlements
   ```bash
   codesign --timestamp --options runtime --entitlements AudioCaptureCLI.entitlements --sign "..." AudioCaptureCLI.app
   ```

4. **Framework Linking**: The executable links against required Apple frameworks:
   - CoreAudio
   - AudioToolbox
   - AVFoundation
   - Speech

To build the CLI:
```bash
# From the macos-audio-capture directory
./build.sh
```

## Technical Notes

- The CLI uses a `RunLoop` to keep running until explicitly terminated
- Audio is captured at the system's native sample rate and format
- Speech recognition is performed using the current locale
- When an error occurs or recognition finishes, the CLI continues streaming
- The CLI handles both channels of stereo audio
- Memory management is handled carefully to prevent buffer overflows and leaks

## Troubleshooting

If audio capture fails, check:
1. System permissions (Privacy & Security settings)
2. macOS version compatibility
3. Whether other audio capture software is running
4. Code signing status and entitlements (via `codesign -d -v AudioCaptureCLI`)

If speech recognition fails, check:
1. Speech recognition permissions
2. Network connectivity (some speech features require internet)
3. System language settings 