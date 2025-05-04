#!/usr/bin/env bash

# Exit on error
set -e

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

echo "Building ScreenFilter executable..."

# Create build directory
mkdir -p .build

# Build the Swift package
swift build -c release

# Create app bundle structure
APP_BUNDLE_DIR="$SCRIPT_DIR/ScreenFilterCLI.app"
APP_CONTENTS_DIR="$APP_BUNDLE_DIR/Contents"
APP_MACOS_DIR="$APP_CONTENTS_DIR/MacOS"

# Clean existing app bundle if exists
rm -rf "$APP_BUNDLE_DIR"

# Create bundle directories
mkdir -p "$APP_MACOS_DIR"

# Copy built binary to app bundle
cp .build/release/ScreenFilter "$APP_MACOS_DIR/ScreenFilterCLI"
chmod +x "$APP_MACOS_DIR/ScreenFilterCLI"

# Create Info.plist
cat > "$APP_CONTENTS_DIR/Info.plist" << EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.sidekick.ScreenFilterCLI</string>
    <key>CFBundleName</key>
    <string>ScreenFilterCLI</string>
    <key>CFBundleExecutable</key>
    <string>ScreenFilterCLI</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>NSScreenCaptureUsageDescription</key>
    <string>This helper filters our overlay from shared video frames.</string>
</dict>
</plist>
EOL

# Create PkgInfo
echo "APPL????" > "$APP_CONTENTS_DIR/PkgInfo"

# Create Helpers directory in app bundle if in packaging mode
# Only rely on APP_BUNDLE_PATH (set by electron-builder)
if [ -n "$APP_BUNDLE_PATH" ]; then
  echo "Packaging mode detected, copying to app bundle..."
  
  # Create Helpers directory and copy the app bundle
  HELPERS_DIR="$APP_BUNDLE_PATH/Contents/Helpers"
  mkdir -p "$HELPERS_DIR"
  
  # Copy the entire .app bundle
  cp -R "$APP_BUNDLE_DIR" "$HELPERS_DIR/"
  echo "Copied ScreenFilterCLI.app to $HELPERS_DIR"
fi

# For convenience in development, also keep a copy of the standalone binary
cp .build/release/ScreenFilter "./ScreenFilter"
echo "Also copied ScreenFilter to $SCRIPT_DIR/ScreenFilter for development"

echo "Build complete. App bundle available at: $APP_BUNDLE_DIR"

# Don't remove .build in development, but you could uncomment this line if desired
# rm -rf .build 