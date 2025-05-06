// This script is used by electron-builder for notarizing the macOS app
// To use it, set environment variables:
// APPLE_ID - your Apple ID
// APPLE_ID_PASSWORD - your app-specific password (not your Apple ID password)
// TEAM_ID - your Apple Developer Team ID (from developer.apple.com)

const { notarize } = require('electron-notarize');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Don't notarize if not set up with Apple credentials
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('Skipping notarization: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appName}...`);

  // Sign the helper apps with proper entitlements
  const helperApps = [
    {
      path: path.join(appPath, 'Contents/Resources/AudioCaptureCLI.app'),
      entitlementsPath: path.join(appPath, 'Contents/Resources/AudioCaptureCLI.entitlements')
    }
  ];

  // Make sure we have a valid signing identity
  const signingIdentity = process.env.SIGNING_IDENTITY || 
    "Developer ID Application: Ian Carscadden (J9J45TZ65N)";

  console.log('Re-signing helper apps with correct entitlements...');
  
  // Re-sign helper apps with proper entitlements
  helperApps.forEach(helper => {
    if (fs.existsSync(helper.path)) {
      try {
        console.log(`Signing ${helper.path} with entitlements ${helper.entitlementsPath}`);
        
        // Check if entitlements file exists
        if (!fs.existsSync(helper.entitlementsPath)) {
          console.error(`Entitlements file not found: ${helper.entitlementsPath}`);
          return;
        }
        
        // Sign the binary inside the .app first
        const binPath = path.join(helper.path, 'Contents/MacOS', path.basename(helper.path, '.app'));
        execSync(`codesign --force --options runtime --entitlements "${helper.entitlementsPath}" --sign "${signingIdentity}" "${binPath}"`, 
          { stdio: 'inherit' });
          
        // Then sign the entire .app bundle
        execSync(`codesign --force --deep --options runtime --entitlements "${helper.entitlementsPath}" --sign "${signingIdentity}" "${helper.path}"`, 
          { stdio: 'inherit' });
          
        console.log(`Successfully signed ${helper.path}`);
        
        // Verify signing and entitlements
        console.log('Verifying signature and entitlements:');
        execSync(`codesign -d -vv --entitlements :- "${helper.path}"`, { stdio: 'inherit' });
      } catch (error) {
        console.error(`Error signing helper app ${helper.path}:`, error);
      }
    } else {
      console.warn(`Helper app not found: ${helper.path}`);
    }
  });

  // Now notarize the main app
  await notarize({
    appBundleId: packager.config.appId,
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
  });
}; 