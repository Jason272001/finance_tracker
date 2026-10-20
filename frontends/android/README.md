# KeeperBMA Android App

This folder contains the Android companion app for KeeperBMA.

## What this app is

The Android app is a companion sign-in app for existing KeeperBMA users.

- Sign in and use your account from Android
- Billing and new subscriptions stay on the website
- This architecture alone does not establish compliance with Google Play payment policy.

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

- Verify the applicable Google Play Payments policy for each distribution region and any enrolled billing/link programs before changing purchase flows.
- A consumption-only app may allow existing subscribers to sign in. Do not assume links to external subscription checkout are permitted everywhere.
- Review the actual hosted Settings and billing routes as part of release testing: the companion loads the website, including its navigation.
- Official reference: https://support.google.com/googleplay/android-developer/answer/10281818

## Creator report update

The remote website now includes a monthly income/expense report, income by category/source, monthly CSV export, creator category shortcuts, and workspace navigation. A separate public demo uses fictional data without API calls. Deploy the web changes to make them available to this remote-web companion; validate on an Android device before announcing availability. The separate Expo app under `frontends/mobile` also has a matching report, category shortcuts, report-text sharing and bank disconnection controls. Verify which implementation is currently published before building a release.

## Notes for developers

- Do not commit `node_modules`
- Do not commit Android local build outputs
- Launcher icons and splash screens are already generated from KeeperBMA brand assets

## Runtime security and CSV export

Capacitor Android/core/CLI are pinned to 7.6.9 to fix GHSA-rvm3-566m-v7fv. Rebuild and redistribute the app to apply the native runtime patch. The website alone cannot patch installed Android runtime code.

The local ReportExport plugin uses Android's document picker to save a CSV to a location the user chooses, without broad storage permissions. A new signed Android bundle is needed to add that plugin to existing installs. Older companions receive an explicit browser/update fallback. See TESTING.md and RELEASE_CHECKLIST.md at the repository root.
