# KeeperBMA Android App

This folder contains the Android companion app for KeeperBMA.

## What this app is

The Android app is a companion sign-in app for existing KeeperBMA users.

- Sign in and use your account from Android
- Billing and new subscriptions stay on the website
- This helps us stay aligned with Google Play policy for digital subscriptions

## Current setup

- Package name: `com.keeperbma.mobile`
- Capacitor Android project: `frontends/android/android`
- Remote app URL: `https://keeperbma.com/auth?mode=signin&mobile=android`

## Prerequisites

- Android Studio
- JDK 17
- Node.js and npm

## Open the Android project

1. From this folder, install dependencies if needed:

   ```powershell
   npm install
   ```

2. Sync Capacitor if web configuration changes:

   ```powershell
   npm run cap:sync
   ```

3. Open the Android project in Android Studio:

   ```powershell
   npm run cap:open
   ```

   Or open this folder directly in Android Studio:

   `frontends/android/android`

## Build a signed Android App Bundle (.aab)

In Android Studio:

1. `Build`
2. `Generate Signed Bundle / APK`
3. Choose `Android App Bundle`
4. Create or choose your upload key
5. Build the release bundle

The `.aab` file is what you upload to Google Play Console.

## Google Play guidance

- Keep signup, billing, and subscription purchase on `keeperbma.com`
- Use the Android app for sign-in and product usage
- If billing is needed, direct users to the website rather than selling subscriptions inside the app

## Notes for developers

- Do not commit `node_modules`
- Do not commit Android local build outputs
- Launcher icons and splash screens are already generated from KeeperBMA brand assets
