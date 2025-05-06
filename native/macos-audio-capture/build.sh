#!/usr/bin/env bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# This build script creates and signs an application bundle for the AudioCaptureCLI tool,
# which enables capturing system audio for the Sidekick app

echo "⏳ Building AudioCaptureCLI..."

# Build the Swift package
swift build -c release

# App bundle layout
APP_BUNDLE_DIR="$SCRIPT_DIR/AudioCaptureCLI.app"
CONTENTS="$APP_BUNDLE_DIR/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES_DIR="$CONTENTS/Resources"

# Clean old bundle
rm -rf "$APP_BUNDLE_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

# Copy binary
cp .build/release/AudioCaptureCLI "$MACOS_DIR/AudioCaptureCLI"
chmod 755 "$MACOS_DIR/AudioCaptureCLI"

# Copy entitlements for signing
cp "$SCRIPT_DIR/AudioCaptureCLI.entitlements" "$RESOURCES_DIR/AudioCaptureCLI.entitlements"

# Generate Info.plist
cat > "$CONTENTS/Info.plist" << EOL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
   "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.sidekick.AudioCaptureCLI</string>
    <key>CFBundleName</key>
    <string>AudioCaptureCLI</string>
    <key>CFBundleExecutable</key>
    <string>AudioCaptureCLI</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>NSAudioCaptureUsageDescription</key>
    <string>Please allow access in order to capture audio from other apps.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>Please allow access to the microphone for audio capture.</string>
</dict>
</plist>
EOL

# PkgInfo
echo "APPL????" > "$CONTENTS/PkgInfo"

# Packaging for Electron: copy into Helpers if asked
if [ -n "$APP_BUNDLE_PATH" ]; then
  HELPERS_DIR="$APP_BUNDLE_PATH/Contents/Helpers"
  mkdir -p "$HELPERS_DIR"
  cp -R "$APP_BUNDLE_DIR" "$HELPERS_DIR/"
fi

# Find code-signing identity
if security find-identity -v -p codesigning | grep -q "Developer ID Application:"; then
  SIGN_IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application:" | head -n1 | awk -F\" '{print $2}')
elif security find-identity -v -p codesigning | grep -q "Apple Development:"; then
  SIGN_IDENTITY=$(security find-identity -v -p codesigning | grep "Apple Development:" | head -n1 | awk -F\" '{print $2}')
else
  SIGN_IDENTITY=""
  echo "⚠️  No signing identity found; skipping codesign"
fi

# Sign if possible
if [ -n "$SIGN_IDENTITY" ]; then
  echo "🔐 Signing with: $SIGN_IDENTITY"
  codesign --force --timestamp --options runtime \
      --entitlements "$SCRIPT_DIR/AudioCaptureCLI.entitlements" \
      --sign "$SIGN_IDENTITY" \
      "$MACOS_DIR/AudioCaptureCLI"

  codesign --force --deep --timestamp --options runtime \
      --entitlements "$SCRIPT_DIR/AudioCaptureCLI.entitlements" \
      --sign "$SIGN_IDENTITY" \
      "$APP_BUNDLE_DIR"

  echo "✅ Signed successfully"
fi

echo "🎉 Build complete: $APP_BUNDLE_DIR"
