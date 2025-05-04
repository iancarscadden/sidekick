// swift-tools-version:5.7
import PackageDescription

let package = Package(
  name: "ScreenFilter",
  platforms: [
    .macOS(.v13)  // Minimum macOS 13.0 for full ScreenCaptureKit support
  ],
  products: [
    .executable(name: "ScreenFilter", targets: ["ScreenFilter"])
  ],
  targets: [
    .executableTarget(
      name: "ScreenFilter",
      path: "Sources/ScreenFilter"
    )
  ]
) 