// swift-tools-version:6.0
import PackageDescription

// AudioCaptureCLI: Swift package for capturing system audio and performing real-time transcription
// This package requires macOS 14+ to use the modern audio capture APIs introduced in macOS Sonoma
// that allow for system-wide audio capture with proper permissions
let package = Package(
    name: "AudioCaptureCLI",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(
            name: "AudioCaptureCLI",
            targets: ["AudioCaptureCLI"]
        )
    ],
    dependencies: [
        // (none)
    ],
    targets: [
        .executableTarget(
            name: "AudioCaptureCLI",
            path: "Sources/AudioCaptureCLI",
            linkerSettings: [
                .linkedFramework("AudioToolbox"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("ScreenCaptureKit")
            ]
        )
    ]
)
