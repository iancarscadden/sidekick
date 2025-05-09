//  AudioCaptureCLI – emits 100 ms chunks of mixed system+mic 16 kHz mono Int16 PCM.

import Foundation
import ScreenCaptureKit
import AVFoundation
import os

// Tell the compiler that Data is safe to send across actors
extension Data: @unchecked Sendable {}

@main
struct Main {
    static func main() {
        guard #available(macOS 15, *) else { fatalError("macOS 15 required") }

        Task { @MainActor in
            // Keep a strong reference to AudioTap in a global var
            let tap = AudioTap()
            do {
                try await tap.start()
            } catch {
                print("❌ Failed to start capture:", error)
                exit(EXIT_FAILURE)
            }
            
            // Store in a main actor-isolated global to keep it alive
            AudioTapHolder.shared = tap
        }

        RunLoop.main.run()
    }
}

// Global holder to keep our AudioTap instance alive
@MainActor
final class AudioTapHolder {
    static var shared: AudioTap?
}

@available(macOS 15, *)
final class AudioTap: NSObject, SCStreamOutput, AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    // Audio capture implementation that mixes system audio with microphone input
    // Key features:
    // - Captures system audio via ScreenCaptureKit and mic via AVCaptureSession
    // - Converts both sources to 16 kHz mono Int16 PCM format
    // - Buffers partial chunks until complete 100ms frames are available
    // - Mixes system and mic audio using simple averaging with clipping protection
    // - Uses a dedicated audio queue for processing
    
    private var scStream: SCStream!
    private var sysConverter: AVAudioConverter!

    private var captureSession: AVCaptureSession!
    private var audioOutput: AVCaptureAudioDataOutput!
    private var micConverter: AVAudioConverter!

    private let out = FileHandle.standardOutput
    
    // Dedicated audio queue for processing
    private let audioQueue = DispatchQueue(label: "AudioCaptureCLI.audioMixQueue")
    
    // Ring buffer implementation
    private let bufferCapacity = 16_000 // 10x capacity for 1600 frames (1 second at 16kHz)
    private var sysBuf = [Int16](repeating: 0, count: 16_000)
    private var micBuf = [Int16](repeating: 0, count: 16_000)
    private var sysHead = 0, sysCount = 0 // sysHead is read pointer, sysCount is number of valid samples
    private var micHead = 0, micCount = 0 // micHead is read pointer, micCount is number of valid samples
    
    private let framesPerChunk = 1_600 // 100 ms at 16 kHz (16000 samples/sec * 0.1 sec)
    private let bytesPerChunk  = 1_600 * 2 // Each Int16 sample is 2 bytes
    // VAD thresholds tuned for typical speech/audio levels in 16-bit PCM
    private let vadOpenThresholdRMS: Float = 150.0 // RMS threshold to consider audio active
    private let vadCloseThresholdRMS: Float = 100.0 // RMS threshold to consider audio silent (lower for hysteresis)
    private var vadIsCurrentlyActive = false // State for VAD hysteresis

    func start() async throws {
        try await setupScreenCapture()
        try setupMicCapture()
        print("✅ AudioTap fully started — mixing system + mic…")
    }

    private func setupScreenCapture() async throws {
        guard let display = try await SCShareableContent
                .excludingDesktopWindows(false, onScreenWindowsOnly: true)
                .displays.first
        else { throw CaptureErr.noDisplay }

        let cfg = SCStreamConfiguration()
        cfg.capturesAudio               = true
        cfg.excludesCurrentProcessAudio = true // Exclude audio from this helper itself
        cfg.sampleRate   = 16_000        // Request 16 kHz
        cfg.channelCount = 1             // Request mono
        // Get audio samples every 100ms if possible. This is a target, actual delivery may vary.
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 10) // 1/10th of a second
        cfg.queueDepth           = 5 // A small queue depth

        scStream = SCStream(
            filter: .init(display: display,
                          excludingApplications: [], // Capture all apps
                          exceptingWindows: []),     // Capture all windows
            configuration: cfg,
            delegate: nil) // Delegate is self, set in addStreamOutput

        // Deliver samples to self on the dedicated audioQueue
        try scStream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        try await scStream.startCapture()
        print("✅ System audio capture started via ScreenCaptureKit")
    }

    private func setupMicCapture() throws {
        captureSession = AVCaptureSession()

        guard let micDevice = AVCaptureDevice.default(for: .audio) else {
            throw CaptureErr.micUnavailable
        }
        let micInput = try AVCaptureDeviceInput(device: micDevice)
        guard captureSession.canAddInput(micInput) else {
            throw CaptureErr.micInputAddFailed
        }
        captureSession.addInput(micInput)

        audioOutput = AVCaptureAudioDataOutput()
        // Deliver mic samples on the same dedicated audioQueue
        audioOutput.setSampleBufferDelegate(self, queue: audioQueue)
        guard captureSession.canAddOutput(audioOutput) else {
            throw CaptureErr.micOutputAddFailed
        }
        captureSession.addOutput(audioOutput)
        captureSession.startRunning()
        print("✅ Microphone capture started via AVCaptureSession")
    }

    // SCStreamOutput delegate method for system audio
    func stream(_ stream: SCStream,
                didOutputSampleBuffer sb: CMSampleBuffer,
                of type: SCStreamOutputType)
    {
        guard type == .audio,
              let block = sb.dataBuffer,
              // Get the audio stream basic description from the format description
              let asbd = sb.formatDescription?.audioStreamBasicDescription
        else { return }

        // Initialize system audio converter if it's nil
        // This happens on the first audio sample buffer received
        if sysConverter == nil {
            var streamDescription = asbd 
            guard let inFormat = AVAudioFormat(streamDescription: &streamDescription) else {
                print("❌ System audio: Failed to create AVAudioFormat from stream description.")
                return
            }
            // Define the output format: 16kHz, mono, Int16 PCM
            guard let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                                sampleRate: 16_000,
                                                channels: 1,
                                                interleaved: true) else {
                print("❌ System audio: Failed to create output AVAudioFormat.")
                return
            }
            sysConverter = AVAudioConverter(from: inFormat, to: outFormat)
            if sysConverter == nil {
                 print("❌ System audio: Failed to create AVAudioConverter. From: \(inFormat) To: \(outFormat)")
                 print("❌ ASBD SampleRate: \(asbd.mSampleRate), Channels: \(asbd.mChannelsPerFrame)")
                 return
            }
            print("✅ System audio converter initialized. Input: \(inFormat), Output: \(outFormat)")
        }
        
        // Get data pointer and length from the block buffer
        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
        guard let validDataPointer = dataPointer else { return }

        // Calculate frame count based on input format
        // For float audio, each frame is typically 4 bytes (Float32) per channel.
        // ASBD mBytesPerFrame might be more reliable if available and non-zero.
        let bytesPerFrame = sysConverter.inputFormat.streamDescription.pointee.mBytesPerFrame
        let frameCapacity = AVAudioFrameCount(bytesPerFrame > 0 ? totalLength / Int(bytesPerFrame) : totalLength / (4 * Int(asbd.mChannelsPerFrame)) )

        guard frameCapacity > 0 else { return }

        // Create input and output PCM buffers for conversion
        guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: sysConverter.inputFormat, frameCapacity: frameCapacity),
              let outputBuffer = AVAudioPCMBuffer(pcmFormat: sysConverter.outputFormat, frameCapacity: frameCapacity)
        else { return }

        // Copy data into the input buffer
        inputBuffer.frameLength = frameCapacity
        memcpy(inputBuffer.floatChannelData![0], validDataPointer, totalLength)

        // Perform the conversion using the block-based API
        var error: NSError? = nil
        let status = sysConverter.convert(to: outputBuffer, error: &error) { inNumPackets, outStatus in
            outStatus.pointee = .haveData
            return inputBuffer
        }

        if status == .error || status == .endOfStream {
            print("❌ System audio conversion failed. Status: \(status.rawValue). Error: \(error?.localizedDescription ?? "Unknown error")")
            return
        }
        
        let convertedFrames = Int(outputBuffer.frameLength)
        guard convertedFrames > 0, let int16ChannelData = outputBuffer.int16ChannelData?[0] else { return }

        appendToRingBuffer(int16ChannelData, frameCount: convertedFrames, bufferType: .system)
        flushIfReady()
    }

    // AVCaptureAudioDataOutputSampleBufferDelegate method for microphone audio
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection)
    {
        guard let block = sampleBuffer.dataBuffer,
              let asbd = sampleBuffer.formatDescription?.audioStreamBasicDescription
        else { return }

        if micConverter == nil {
            var streamDescription = asbd
            guard let inFormat = AVAudioFormat(streamDescription: &streamDescription) else {
                print("❌ Mic audio: Failed to create AVAudioFormat from stream description.")
                return
            }
            guard let outFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                                sampleRate: 16_000,
                                                channels: 1,
                                                interleaved: true) else {
                print("❌ Mic audio: Failed to create output AVAudioFormat.")
                return
            }
            micConverter = AVAudioConverter(from: inFormat, to: outFormat)
             if micConverter == nil {
                 print("❌ Mic audio: Failed to create AVAudioConverter. From: \(inFormat) To: \(outFormat)")
                 print("❌ ASBD SampleRate: \(asbd.mSampleRate), Channels: \(asbd.mChannelsPerFrame)")
                 return
            }
            print("✅ Mic audio converter initialized. Input: \(inFormat), Output: \(outFormat)")
        }

        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
        guard let validDataPointer = dataPointer else { return }

        // Calculate frame count based on input format
        let bytesPerFrame = micConverter.inputFormat.streamDescription.pointee.mBytesPerFrame
        let frameCapacity = AVAudioFrameCount(bytesPerFrame > 0 ? totalLength / Int(bytesPerFrame) : totalLength / (Int(asbd.mBytesPerPacket) * Int(asbd.mChannelsPerFrame)) )
        
        guard frameCapacity > 0 else { return }

        guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: micConverter.inputFormat, frameCapacity: frameCapacity),
              let outputBuffer = AVAudioPCMBuffer(pcmFormat: micConverter.outputFormat, frameCapacity: frameCapacity)
        else { return }

        inputBuffer.frameLength = frameCapacity
        // Assuming input is float if not interleaved Int16. This needs to be robust.
        // If mic input is already Int16, this memcpy target might be wrong.
        // However, typical mic input that needs conversion is float.
        memcpy(inputBuffer.audioBufferList.pointee.mBuffers.mData, validDataPointer, totalLength)


        var error: NSError? = nil
        let status = micConverter.convert(to: outputBuffer, error: &error) { inNumPackets, outStatus in
            outStatus.pointee = .haveData
            return inputBuffer
        }

        if status == .error || status == .endOfStream {
            print("❌ Mic audio conversion failed. Status: \(status.rawValue). Error: \(error?.localizedDescription ?? "Unknown error")")
            return
        }

        let convertedFrames = Int(outputBuffer.frameLength)
        guard convertedFrames > 0, let int16ChannelData = outputBuffer.int16ChannelData?[0] else { return }
        
        appendToRingBuffer(int16ChannelData, frameCount: convertedFrames, bufferType: .microphone)
        flushIfReady()
    }
    
    private enum BufferType { case system, microphone }

    private func appendToRingBuffer(_ source: UnsafePointer<Int16>, frameCount: Int, bufferType: BufferType) {
        let name: String
        var framesActuallyCopied = 0

        switch bufferType {
        case .system:
            name = "System"
            sysBuf.withUnsafeMutableBufferPointer { targetBufferPtr in
                guard let baseAddress = targetBufferPtr.baseAddress else { return }
                let availableSpace = bufferCapacity - sysCount
                var framesToCopy = frameCount
                if frameCount > availableSpace {
                    print("⚠️ \(name) audio buffer overflow: dropping \(frameCount - availableSpace) frames. BufferCount: \(sysCount), Capacity: \(bufferCapacity)")
                    framesToCopy = availableSpace
                }
                guard framesToCopy > 0 else { return }

                let tail = (sysHead + sysCount) % bufferCapacity
                if tail + framesToCopy <= bufferCapacity {
                    memcpy(baseAddress + tail, source, framesToCopy * MemoryLayout<Int16>.size)
                } else {
                    let firstPartCount = bufferCapacity - tail
                    memcpy(baseAddress + tail, source, firstPartCount * MemoryLayout<Int16>.size)
                    let secondPartCount = framesToCopy - firstPartCount
                    memcpy(baseAddress, source + firstPartCount, secondPartCount * MemoryLayout<Int16>.size)
                }
                framesActuallyCopied = framesToCopy
            }
            sysCount += framesActuallyCopied

        case .microphone:
            name = "Mic"
            micBuf.withUnsafeMutableBufferPointer { targetBufferPtr in
                guard let baseAddress = targetBufferPtr.baseAddress else { return }
                let availableSpace = bufferCapacity - micCount
                var framesToCopy = frameCount
                if frameCount > availableSpace {
                    print("⚠️ \(name) audio buffer overflow: dropping \(frameCount - availableSpace) frames. BufferCount: \(micCount), Capacity: \(bufferCapacity)")
                    framesToCopy = availableSpace
                }
                guard framesToCopy > 0 else { return }

                let tail = (micHead + micCount) % bufferCapacity
                if tail + framesToCopy <= bufferCapacity {
                    memcpy(baseAddress + tail, source, framesToCopy * MemoryLayout<Int16>.size)
                } else {
                    let firstPartCount = bufferCapacity - tail
                    memcpy(baseAddress + tail, source, firstPartCount * MemoryLayout<Int16>.size)
                    let secondPartCount = framesToCopy - firstPartCount
                    memcpy(baseAddress, source + firstPartCount, secondPartCount * MemoryLayout<Int16>.size)
                }
                framesActuallyCopied = framesToCopy
            }
            micCount += framesActuallyCopied
        }
    }

    private func flushIfReady() {
        // Prioritize processing as long as the microphone has enough data for a chunk
        while micCount >= framesPerChunk {
            var outData = Data(capacity: bytesPerChunk)
            var mixedSamplesForRMS = [Float]()
            mixedSamplesForRMS.reserveCapacity(framesPerChunk)
            
            let systemAudioIsEffectivelyPresent = sysCount >= framesPerChunk

            for i in 0..<framesPerChunk {
                let micReadIndex = (micHead + i) % bufferCapacity
                let micSampleFloat = Float(micBuf[micReadIndex])
                var sysSampleFloat: Float = 0.0 // Assume system silence by default

                if systemAudioIsEffectivelyPresent {
                    let sysReadIndex = (sysHead + i) % bufferCapacity
                    sysSampleFloat = Float(sysBuf[sysReadIndex])
                }
                
                let mixedFloat = (sysSampleFloat * 0.707) + (micSampleFloat * 0.707)
                mixedSamplesForRMS.append(mixedFloat)
                
                var mixedInt = Int(mixedFloat)
                mixedInt = min(max(mixedInt, Int(Int16.min)), Int(Int16.max))
                var valueToWrite = Int16(mixedInt)
                
                withUnsafeBytes(of: &valueToWrite) { outData.append(contentsOf: $0) }
            }
            
            var sumOfSquares: Float = 0.0
            for sample in mixedSamplesForRMS {
                sumOfSquares += sample * sample
            }
            let meanSquare = sumOfSquares / Float(framesPerChunk)
            let rms = sqrt(meanSquare)

            micHead = (micHead + framesPerChunk) % bufferCapacity
            micCount -= framesPerChunk

            if systemAudioIsEffectivelyPresent {
                sysHead = (sysHead + framesPerChunk) % bufferCapacity
                sysCount -= framesPerChunk
            }
            
            // VAD Hysteresis Logic
            if vadIsCurrentlyActive {
                // If currently active, stay active unless RMS drops below close threshold
                if rms < vadCloseThresholdRMS {
                    vadIsCurrentlyActive = false
                    // print("🔇 VAD Closed (RMS: \(String(format: "%.2f", rms)))")
                }
            } else {
                // If currently inactive, become active if RMS rises above open threshold
                if rms >= vadOpenThresholdRMS {
                    vadIsCurrentlyActive = true
                    // print("🔊 VAD Opened (RMS: \(String(format: "%.2f", rms)))")
                }
            }

            if vadIsCurrentlyActive {
                out.write(outData)
                print("🎤🔊 Audio chunk written (RMS: \(String(format: "%.2f", rms))) MicBuf: \(micCount) SysBuf: \(sysCount)")
            } else {
                print("🎤🔇 Audio chunk silent (RMS: \(String(format: "%.2f", rms))), discarding. MicBuf: \(micCount) SysBuf: \(sysCount)")
            }
        }
        
        // Optional: Handle system-only audio if mic buffer is empty but system has data
        // This part is less critical for the reported "mic audio sucks" issue but makes it more symmetrical.
        // If you enable this, be mindful of potential recursion or overly complex loop conditions if not careful.
        /*
        while sysCount >= framesPerChunk && micCount < framesPerChunk { // System has data, mic doesn't
            // print("🎤 Mic buffer empty, processing system-only chunk if not silent.")
            var outData = Data(capacity: bytesPerChunk)
            var sysSamplesForRMS = [Float]()
            sysSamplesForRMS.reserveCapacity(framesPerChunk)

            for i in 0..<framesPerChunk {
                let sysReadIndex = (sysHead + i) % bufferCapacity
                let sysSampleFloat = Float(sysBuf[sysReadIndex])
                sysSamplesForRMS.append(sysSampleFloat)

                var mixedInt = Int(sysSampleFloat * 0.707) // System only, but apply some scaling consistent with mixing
                mixedInt = min(max(mixedInt, Int(Int16.min)), Int(Int16.max))
                var valueToWrite = Int16(mixedInt)
                withUnsafeBytes(of: &valueToWrite) { outData.append(contentsOf: $0) }
            }

            var sumOfSquares: Float = 0.0
            for sample in sysSamplesForRMS {
                sumOfSquares += sample * sample
            }
            let meanSquare = sumOfSquares / Float(framesPerChunk)
            let rms = sqrt(meanSquare)

            sysHead = (sysHead + framesPerChunk) % bufferCapacity
            sysCount -= framesPerChunk

            if rms >= silenceThresholdRMS {
                out.write(outData)
                // print("🔊 System-only audio chunk written (RMS: \(String(format: "%.2f", rms)))")
            } else {
                // print("🔇 System-only audio chunk silent (RMS: \(String(format: "%.2f", rms))), discarding.")
            }
        }
        */
    }

    enum CaptureErr: Error {
        case noDisplay
        case micUnavailable
        case micInputAddFailed
        case micOutputAddFailed
    }
}
