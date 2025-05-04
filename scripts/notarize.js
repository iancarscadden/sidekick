// This script is used by electron-builder for notarizing the macOS app
// To use it, set environment variables:
// APPLE_ID - your Apple ID
// APPLE_ID_PASSWORD - your app-specific password (not your Apple ID password)
// TEAM_ID - your Apple Developer Team ID (from developer.apple.com)

const { notarize } = require('electron-notarize');
const path = require('path');
const fs = require('fs');

module.exports = async function (params) {
  // Only notarize on macOS
  if (process.platform !== 'darwin') {
    console.log('Skipping notarization (not macOS)');
    return;
  }

  // Check if we have the necessary credentials
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD || !process.env.TEAM_ID) {
    console.log('Skipping notarization (missing credentials)');
    return;
  }

  // Get the path to the built app
  const appBundleId = params.packager.appInfo.info._configuration.appId;
  const appName = params.packager.appInfo.info._configuration.productName;
  const appPath = path.join(params.appOutDir, `${appName}.app`);
  
  if (!fs.existsSync(appPath)) {
    console.error(`App path does not exist: ${appPath}`);
    return;
  }

  console.log(`Notarizing ${appBundleId} at ${appPath}`);

  try {
    await notarize({
      appBundleId,
      appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.TEAM_ID,
    });
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
}; 