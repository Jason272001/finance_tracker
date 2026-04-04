# KeeperBMA Android Play Store Release

This mobile app is configured to build an Android App Bundle with Expo EAS.

## Project settings

- Android package name: `com.keeperbma.mobile`
- App version: `1.0.0`
- Android version code: `1`
- Production build output: Android App Bundle (`.aab`)

## Before the first upload

1. Install dependencies:
   - `cd D:\finance_tracker\frontends\mobile`
   - `npm install`
2. Sign in to Expo:
   - `npx eas-cli login`
3. Build the Play Store bundle:
   - `npm run build:android`
4. Create the app in Google Play Console.
5. Upload the generated `.aab` file to the `Internal testing` track first.

## Submission checklist

- App name
- Short description
- Full description
- App icon
- Phone screenshots
- Public privacy policy URL
- Data safety answers
- Support email
- Review login credentials for Google Play if the app requires sign-in

## Repo-specific notes

- The mobile app now has a public privacy policy page at:
  - `https://keeperbma.com/privacy-policy.html`
- The mobile app now has a public account deletion help page at:
  - `https://keeperbma.com/delete-account.html`
- Android sign-in screen avoids direct signup and payment CTA buttons to reduce Play review risk around external billing flows.

## Important policy risk

KeeperBMA is a subscription-based digital service. Google Play has strict rules for apps that direct Android users to pay outside the app. The current Android build should stay focused on sign-in and account access unless you add Google Play Billing for Android purchases.

## Useful commands

- Preview release config:
  - `npx expo config --type public`
- Start the dev server:
  - `npm run start -c`
- Build Android App Bundle:
  - `npm run build:android`
- Submit with EAS after the app exists in Play Console:
  - `npm run submit:android`

## Play Console review prep

- If Google reviewers cannot use the app without logging in, provide test credentials in Play Console.
- If your Play developer account is a new personal account, Play Console may require testing before production rollout.
