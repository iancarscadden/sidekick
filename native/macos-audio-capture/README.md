# AudioCaptureCLI

A Swift-based command-line tool for capturing system audio in macOS 15+ using ScreenCaptureKit. This tool emits raw 16-bit PCM audio data at 16 kHz mono for further processing by the Sidekick Electron app.

## Overview

AudioCaptureCLI is a helper application for the Sidekick Electron app that:

1. Captures system audio output (what you hear from your speakers/headphones)
2. Converts it to 16-bit PCM at 16 kHz mono format
3. Streams the raw audio data in 100ms chunks to stdout
4. Allows the Electron app to process this audio for speech recognition via external services

## Technical Implementation

### Audio Capture Architecture

The CLI uses ScreenCaptureKit, a modern Apple framework introduced in macOS 12.3 and enhanced in macOS 15:

1. **ScreenCaptureKit Configuration**
   - Creates a minimal stream configured for audio-only capture
   - Excludes audio from our own process to prevent feedback loops
   - Explicitly requests 16 kHz mono audio for optimal speech recognition performance

2. **Audio Format Conversion**
   - Converts system audio from 32-bit float to 16-bit integer PCM
   - Ensures consistent 16 kHz mono output regardless of system audio configuration
   - Handles efficient buffer management to prevent memory leaks

3. **Real-time Streaming**
   - Collects audio in 100ms chunks (1,600 frames at 16 kHz)
   - Outputs raw PCM data to stdout for the parent Electron process to consume
   - Maintains a clean buffer management system to ensure continuous audio flow

### Data Flow

```
System Audio → ScreenCaptureKit → Format Conversion → 16-bit PCM @ 16kHz Mono → Electron App → Speech Recognition Service
```

## Usage

The CLI is designed to be spawned by the Electron app as a child process:

```typescript
// In electron app
const audioCaptureProcess = spawn('path/to/AudioCaptureCLI', [], {
  stdio: ['ignore', 'pipe', 'pipe'] // stdin, stdout, stderr
});

// Process raw PCM audio data
audioCaptureProcess.stdout.on('data', (chunk) => {
  // Accumulate PCM data and process as needed
  rawAudioBuffer = Buffer.concat([rawAudioBuffer, chunk]);
  
  // When ready, convert to base64 for sending to speech recognition API
  const base64Data = rawAudioBuffer.toString('base64');
});
```

## Required Permissions

The CLI requires the following permissions:

1. **Screen Recording Permission** - Required for ScreenCaptureKit to access system audio
2. **Audio Input Permission** - For accessing system audio devices

These are requested via:
- System dialogs when the app first runs
- `NSScreenCaptureUsageDescription` in Info.plist
- `NSMicrophoneUsageDescription` in Info.plist
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
   - ScreenCaptureKit
   - AVFoundation
   - Foundation

To build the CLI:
```bash
# From the macos-audio-capture directory
./build.sh
```

## Technical Notes

- **macOS Version Requirement**: macOS 15+ required for the latest ScreenCaptureKit APIs
- **Audio Format**: 16-bit PCM, 16 kHz, mono (ideal for most speech recognition services)
- **Chunk Size**: 100ms chunks (1,600 frames at 16 kHz)
- **Memory Management**: Careful buffer handling to prevent overflow and ensure real-time performance
- **MainActor Isolation**: All audio processing runs on the main actor for thread safety
- **@preconcurrency Annotations**: Used to silence Sendable warnings with Apple frameworks

## Integration with Speech Recognition

While the CLI itself doesn't perform speech recognition, it outputs audio in the optimal format for cloud-based speech recognition services:

- The 16 kHz mono format is the standard expected input for most speech recognition APIs
- 16-bit PCM provides sufficient dynamic range while keeping data size reasonable
- 100ms chunks allow for near-realtime transcription with minimal latency

The Electron app can:
1. Buffer the raw PCM data
2. Base64-encode it for transmission
3. Send to services like Deepgram, Google Speech-to-Text, or other cloud APIs

## Troubleshooting

If audio capture fails, check:
1. macOS version (must be macOS 15+)
2. Screen Recording permission in System Settings > Privacy & Security
3. Whether other screen recording software is running
4. Code signing status and entitlements (via `codesign -d -v AudioCaptureCLI.app`)

To debug audio output format:
1. Pipe the output to a file: `./AudioCaptureCLI > debug.pcm`
2. Analyze with `ffprobe -f s16le -ar 16000 -ac 1 -i debug.pcm`
3. Convert to WAV for listening: `ffmpeg -f s16le -ar 16000 -ac 1 -i debug.pcm debug.wav` 