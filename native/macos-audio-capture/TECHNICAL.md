# AudioCaptureCLI Technical Documentation

This document provides in-depth technical details about the implementation and architecture of the AudioCaptureCLI tool.

## Architecture Overview

The AudioCaptureCLI is built as a standalone Swift executable that handles:

1. System audio capture using macOS native APIs
2. Speech recognition using Apple's SFSpeechRecognizer framework
3. JSON output for integration with the parent Electron application

## Core Components

### 1. Audio Capture Subsystem

Two independent implementation paths are provided depending on macOS version:

#### Core Audio Tap (macOS 14.4+)

This modern approach uses Apple's newer `AudioHardwareCreateProcessTap` API which was introduced for system-wide audio capture:

```swift
@available(macOS 14.4, *)
private mutating func startCoreAudioTapCapture() throws {
    // Create tap description
    let tapDesc = CATapDescription(
        processesObjectIDsToIncludeInTap: nil,           
        processesObjectIDsToExcludeInTap: [AudioObjectID(getpid())],
        muteBehavior: .unmuted
    )
    
    // Create process tap
    var tapID = AudioObjectID(0)
    try checkOSStatus(
        AudioHardwareCreateProcessTap(&tapDesc, &tapID),
        "AudioHardwareCreateProcessTap"
    )
    
    // Create aggregate device with tap
    let aggDict: [String: Any] = [
        kAudioAggregateDeviceTapListKey as String: [tapDesc.uuidString],
        kAudioAggregateDeviceIsPrivateKey as String: true
    ]
    try checkOSStatus(
        AudioHardwareCreateAggregateDevice(aggDict as CFDictionary, &aggDeviceID),
        "AudioHardwareCreateAggregateDevice"
    )
    
    // Read the tap's audio format
    var asbd = AudioStreamBasicDescription()
    var propSize = UInt32(MemoryLayout.size(ofValue: asbd))
    var addr = AudioObjectPropertyAddress(...)
    try checkOSStatus(
        AudioObjectGetPropertyData(tapID, &addr, 0, nil, &propSize, &asbd),
        "AudioObjectGetPropertyData(kAudioTapPropertyFormat)"
    )
    audioFormat = AVAudioFormat(streamDescription: &asbd)
    
    // Install I/O callback and start capture
    // ...
}
```

Key points:
- Creates a system-wide audio tap that excludes our own process
- Routes the tap to a virtual aggregate device
- Sets up an I/O callback to process the audio buffer

#### HAL Output Audio Unit (pre-macOS 14.4)

For older macOS versions, we use the Audio Unit framework to create an `AudioComponentInstance` that captures the system's output:

```swift
private mutating func startHALOutputCapture() throws {
    // Find HAL output component
    var desc = AudioComponentDescription(
        componentType: kAudioUnitType_Output,
        componentSubType: kAudioUnitSubType_HALOutput,
        componentManufacturer: kAudioUnitManufacturer_Apple,
        componentFlags: 0, componentFlagsMask: 0
    )
    
    // Create audio unit, enable input, disable output
    // Set default output device as input source using modern API
    var propAddr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMaster
    )
    var defaultDevID = AudioDeviceID(0)
    try checkOSStatus(
        AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propAddr,
            0, nil,
            &UInt32(MemoryLayout<AudioDeviceID>.size),
            &defaultDevID),
        "AudioObjectGetPropertyData(DefaultOutputDevice)")
    
    // Query the HAL unit's format on the input (bus 1)
    var asbd = AudioStreamBasicDescription()
    try checkOSStatus(
        AudioUnitGetProperty(audioUnit,
                            kAudioUnitProperty_StreamFormat,
                            kAudioUnitScope_Input,
                            1, // bus 1 = input
                            &asbd,
                            &size),
        "AudioUnitGetProperty(StreamFormat)"
    )
    audioFormat = AVAudioFormat(streamDescription: &asbd)
    
    // Install render callback and start
    // ...
}
```

Key points:
- Uses the HAL (Hardware Abstraction Layer) Output Audio Unit
- Uses modern API (`AudioObjectGetPropertyData`) to get the default output device
- Queries and initializes the audioFormat from the audio unit's stream format
- Configures it to receive input from the default output device
- Sets up a render callback to process audio samples

### 2. Speech Recognition Subsystem

The speech recognition is handled by Apple's `SFSpeechRecognizer` framework:

```swift
private mutating func setupSpeechRecognition() throws {
    let locale = Locale.current
    guard let recognizer = SFSpeechRecognizer(locale: locale),
          recognizer.isAvailable else {
        throw NSError(domain: "AudioCaptureCLI",
                      code: 3,
                      userInfo: [NSLocalizedDescriptionKey:
                                 "Speech recognizer unavailable"])
    }

    recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    recognitionRequest?.shouldReportPartialResults = true

    recognitionTask = recognizer.recognitionTask(
        with: recognitionRequest!,
        resultHandler: { result, error in
            if let text = result?.bestTranscription.formattedString {
                // Emit JSON
                let obj = ["text": text]
                if let data = try? JSONSerialization.data(withJSONObject: obj) {
                    FileHandle.standardOutput.write(data)
                    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
                }
            }
            // ...
        }
    )
}
```

Key points:
- Uses the user's current locale for the recognizer
- Enables partial results for continuous transcription
- Streams results as JSON lines to stdout

### 3. Audio Buffer Processing

The audio buffer processing is a critical component that converts raw PCM data into a format suitable for speech recognition:

```swift
private func handleAudioBuffer(bufferList: UnsafeMutablePointer<AudioBufferList>,
                              frameCount: UInt32) {
    guard let req = recognitionRequest else { return }
    // Create AVAudioPCMBuffer with the right format
    guard let format = audioFormat else { return }
    guard let pcm = AVAudioPCMBuffer(pcmFormat: format,
                                    frameCapacity: frameCount) else {
        return
    }
    pcm.frameLength = frameCount

    // Copy data from raw buffers to PCM buffer
    let abl = UnsafeMutableAudioBufferListPointer(bufferList)
    for i in 0..<abl.count {
        if let data = abl[i].mData {
            let dst = pcm.floatChannelData![i]
            let byteCount = Int(abl[i].mDataByteSize)
            memcpy(dst, data, byteCount)
        }
    }

    // Append to speech recognition
    req.append(pcm)
}
```

Key points:
- Converts the CoreAudio `AudioBufferList` to `AVAudioPCMBuffer`
- Handles both mono and stereo audio channels
- Uses `memcpy` for efficient buffer copying
- Appends the buffer to the ongoing speech recognition request

## Permission Management

The CLI handles permissions explicitly:

```swift
private func requestSpeechPermission() throws {
    let sem = DispatchSemaphore(value: 0)
    var authStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    SFSpeechRecognizer.requestAuthorization {
        authStatus = $0
        sem.signal()
    }
    sem.wait()
    guard authStatus == .authorized else {
        throw NSError(domain: "AudioCaptureCLI",
                     code: 1,
                     userInfo: [NSLocalizedDescriptionKey:
                               "Speech recognition access denied"])
    }
}
```

This blocking approach ensures the CLI doesn't proceed until permissions are granted.

## Error Handling

The CLI uses a custom `checkOSStatus` function to handle CoreAudio errors:

```swift
func checkOSStatus(_ status: OSStatus, _ msg: String) throws {
    guard status == noErr else {
        throw NSError(domain: NSOSStatusErrorDomain,
                     code: Int(status),
                     userInfo: [NSLocalizedDescriptionKey: "\(msg): \(status)"])
    }
}
```

This provides consistent error handling and descriptive messages for debugging.

## Integration with Electron

The CLI is designed for easy integration with Electron:

1. **Communication Protocol**: Simple JSON lines over stdout
2. **Process Management**: Can be spawned/killed by the parent Electron process
3. **Error Reporting**: Errors are written to stderr

## Performance Considerations

- **Memory Usage**: The CLI is efficient with memory, reusing buffers where possible.
- **CPU Usage**: Audio processing and speech recognition are CPU-intensive operations.
- **Battery Impact**: Continuous audio processing can have a noticeable impact on battery life.

## Security Considerations

The AudioCaptureCLI handles sensitive audio data, so security is important:

1. **Privacy**: All audio processing happens locally on the device
2. **Data Handling**: Only the transcribed text is passed to the Electron app, not the raw audio
3. **Permissions**: Explicit user authorization is required for both audio capture and speech recognition

## Future Improvements

Potential enhancements for future versions:

1. **Language Selection**: Allow specifying a language rather than using the system locale
2. **Noise Suppression**: Implement audio filtering to improve speech recognition in noisy environments
3. **Acoustic Model Adaptation**: Tune speech recognition for specific users or environments
4. **Voice Activity Detection**: Only process audio when speech is detected
5. **Power Management**: Implement power-saving modes when not in active use 