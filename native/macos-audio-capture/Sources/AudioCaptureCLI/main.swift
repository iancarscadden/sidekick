// Sources/AudioCaptureCLI/main.swift
// This Swift CLI captures system + mic audio, mixes them, gates out silence,
// and streams 16-bit PCM 100 ms chunks to stdout.
// It uses AudioToolbox to create a process tap on system audio, combines it with microphone input
// via an aggregate device, and optimizes audio for speech recognition by filtering silence.

import Foundation
import AudioToolbox
import AVFoundation
import os

// MARK: –– Configuration

/// How many seconds per output chunk
let chunkDurationSeconds: Double = 0.5

/// RMS threshold below which we consider audio "silent"
let silenceThreshold: Float = 0.0001

/// Simple logger
let log = Logger(subsystem: "com.sidekick.AudioCaptureCLI", category: "Main")

// MARK: –– AudioObjectID Helpers

extension AudioObjectID {
    static var systemObject: AudioObjectID { AudioObjectID(kAudioObjectSystemObject) }
    static var unknown:      AudioObjectID { AudioObjectID(kAudioObjectUnknown) }
}

func readDefaultDevice(isInput: Bool) throws -> AudioDeviceID {
    var selector = kAudioHardwarePropertyDefaultOutputDevice
    if isInput { selector = kAudioHardwarePropertyDefaultInputDevice }
    var addr = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope:    kAudioObjectPropertyScopeGlobal,
        mElement:  kAudioObjectPropertyElementMain
    )
    var devID = AudioDeviceID()
    var size  = UInt32(MemoryLayout<AudioDeviceID>.size)
    let err = AudioObjectGetPropertyData(.systemObject, &addr, 0, nil, &size, &devID)
    guard err == noErr else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(err)) }
    return devID
}

func readUID(of deviceID: AudioDeviceID) throws -> String {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope:    kAudioObjectPropertyScopeGlobal,
        mElement:  kAudioObjectPropertyElementMain
    )
    var cfStr = "" as CFString
    var size  = UInt32(MemoryLayout<CFString>.size)
    let err = AudioObjectGetPropertyData(deviceID, &addr, 0, nil, &size, &cfStr)
    guard err == noErr else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(err)) }
    return cfStr as String
}

// MARK: –– Main

do {
    guard #available(macOS 14.2, *) else {
        fatalError("Requires macOS 14.2+")
    }

    // 1) Get the UIDs for system output and mic
    let sysUID = try readUID(of: try readDefaultDevice(isInput: false))
    let micUID = try readUID(of: try readDefaultDevice(isInput: true))

    // 2) Create and install a process tap on the system output
    var tapDesc = CATapDescription(
        excludingProcesses: [],      // capture everything
        deviceUID:           sysUID,
        stream:              0
    )
    tapDesc.uuid         = UUID()
    tapDesc.muteBehavior = .unmuted

    var tapID = AudioObjectID.unknown
    var err = AudioHardwareCreateProcessTap(tapDesc, &tapID)
    guard err == noErr else {
        fatalError("Failed to create process tap: \(err)")
    }
    log.info("Process tap created: \(tapID)")

    // 3) Read the tap's stream format
    var asbd = AudioStreamBasicDescription()
    do {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyFormat,
            mScope:    kAudioObjectPropertyScopeGlobal,
            mElement:  kAudioObjectPropertyElementMain
        )
        var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        err = AudioObjectGetPropertyData(tapID, &addr, 0, nil, &size, &asbd)
        guard err == noErr else {
            fatalError("Failed to read tap format: \(err)")
        }
        
        // Force the sample rate to 16hz
        asbd.mSampleRate = 16_000
    }

    // 4) Build an aggregate device (system-tap + mic)
    let aggUID = UUID().uuidString
    let aggDesc: [String: Any] = [
        kAudioAggregateDeviceNameKey:          "Sidekick-Audio-Aggregate",
        kAudioAggregateDeviceUIDKey:           aggUID,

        // 1) Clock the aggregate on the mic (always active)
        kAudioAggregateDeviceMainSubDeviceKey: micUID,

        kAudioAggregateDeviceIsPrivateKey:     true,
        kAudioAggregateDeviceIsStackedKey:     false,

        // 2) Only list the mic as a true sub-device
        kAudioAggregateDeviceSubDeviceListKey: [
            [ kAudioSubDeviceUIDKey: micUID ]
        ],

        // 3) Attach the system process tap as a secondary input
        kAudioAggregateDeviceTapListKey: [
            [
                kAudioSubTapUIDKey:              tapDesc.uuid.uuidString,
                kAudioSubTapDriftCompensationKey:true
            ]
        ]
    ]

    var aggDevID = AudioObjectID.unknown
    err = AudioHardwareCreateAggregateDevice(aggDesc as CFDictionary, &aggDevID)
    guard err == noErr else {
        fatalError("Failed to create aggregate device: \(err)")
    }
    log.info("Aggregate device created: \(aggDevID)")

    // 5) Precompute chunk sizes
    let sampleRate      = asbd.mSampleRate
    let channels        = Int(asbd.mChannelsPerFrame)
    let chunkFrames     = Int(sampleRate * chunkDurationSeconds)
    let samplesPerChunk = chunkFrames * channels

    // A tiny buffer for accumulating one chunk's worth of Int16 samples
    var chunkData       = Data(capacity: samplesPerChunk * MemoryLayout<Int16>.size)
    var samplesBuffered = 0

    let pipeQueue    = DispatchQueue(label: "com.sidekick.AudioCaptureCLI.pipeQueue")
    let stdoutHandle = FileHandle.standardOutput

    // 6) Install an IOProc that mixes, gates, and flushes
    var ioProcID: AudioDeviceIOProcID?
    err = AudioDeviceCreateIOProcIDWithBlock(
        &ioProcID,
        aggDevID,
        pipeQueue
    ) { _, inInputData, _, _, _ in
        let abl = UnsafeMutableAudioBufferListPointer(
            UnsafeMutablePointer<AudioBufferList>(mutating: inInputData)
        )
        guard abl.count >= 2 else { return }

        let sysBuf = abl[0]
        let micBuf = abl[1]
        let frameCount = Int(sysBuf.mDataByteSize) / MemoryLayout<Float>.size
        let sysPtr     = sysBuf.mData!.assumingMemoryBound(to: Float.self)
        let micPtr     = micBuf.mData!.assumingMemoryBound(to: Float.self)

        // Mix + compute RMS for silence gating
        var rmsAcc: Float = 0
        
        // Convert to mono (instead of interleaved stereo)
        var monoBuf = [Int16](repeating: 0, count: frameCount / channels)
        
        for i in 0..<(frameCount / channels) {
            // sysPtr and micPtr are interleaved [L,R,L,R...] if stereo
            var mix: Float = 0
            
            if channels == 2 {
                // Stereo - average both channels
                let left  = sysPtr[2*i]   + micPtr[2*i]
                let right = sysPtr[2*i+1] + micPtr[2*i+1]
                mix = 0.25 * (left + right) // average both channels & both devices
            } else {
                // Mono - use as-is
                mix = 0.5 * (sysPtr[i] + micPtr[i])
            }
            
            rmsAcc += mix * mix
            
            // Clamp values to Int16 range
            var s = mix * 32767.0
            if s >  32767.0 { s =  32767.0 }
            if s < -32768.0 { s = -32768.0 }
            monoBuf[i] = Int16(s)
        }
        
        // Calculate RMS based on mono mix
        let rms = sqrt(rmsAcc / Float(monoBuf.count))

        // If below threshold, drop the entire chunk
        guard rms >= silenceThreshold else {
            return
        }

        // Buffer + flush exactly 100 ms of active audio using mono buffer
        monoBuf.withUnsafeBytes { raw in
            chunkData.append(contentsOf: raw)
        }
        samplesBuffered += monoBuf.count

        if samplesBuffered >= samplesPerChunk {
            let bytesToSend = samplesPerChunk * MemoryLayout<Int16>.size
            let toSend = chunkData.prefix(bytesToSend)
            stdoutHandle.write(toSend)
            chunkData.removeFirst(bytesToSend)
            samplesBuffered -= samplesPerChunk
        }
    }
    guard err == noErr, let procID = ioProcID else {
        fatalError("Failed to install IOProc: \(err)")
    }

    // 7) Start streaming
    err = AudioDeviceStart(aggDevID, procID)
    guard err == noErr else {
        // Fatal error if we can't start the audio device - this is a critical component
        fatalError("Failed to start audio device: \(err)")
    }
    log.info("Streaming 100 ms LINEAR16 of *active* audio to stdout…")

    // — PRIME: emit one silent chunk so downstream sees data immediately —
    let primeFrames = Int(asbd.mSampleRate * chunkDurationSeconds)
    let primeBytes  = primeFrames * Int(asbd.mChannelsPerFrame) * MemoryLayout<Int16>.size
    let silentPrime = Data(count: primeBytes)
    FileHandle.standardOutput.write(silentPrime)

    RunLoop.main.run()

} catch {
    fatalError("Setup error: \(error)")
}
