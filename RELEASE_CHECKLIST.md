# Release checklist

The source changes are prepared for review. Production deployment and store publication are separate from passing local tests.

## Before taking customer payments

- Confirm the actual production database plan does not expire. The checked-in Render development blueprint uses free Postgres; Render documents a 30-day expiration and subsequent deletion after its grace period. No paid plan or billing setting was changed. Reference: https://render.com/docs/free
- Export a confidential backup, copy it to encrypted off-host storage, verify checksums and restore into a separate database. The backup now includes business/bank tables and Stripe ledgers. Never commit it. Render free Postgres does not include managed logical backups: https://render.com/docs/postgresql-backups
- Deploy the API to staging with the SQL backend, existing API_TOKEN_SECRET preserved, direct plan updates disabled and legacy anonymous precheckout disabled. Do not run offline replacement migrations while app writers are active.
- Verify Stripe test prices match displayed amounts and intervals. Test signup → checkout → activation → account creation → first transaction → monthly report → cancellation and refund. Test failed payment, recovery, duplicate delivery and retry after a simulated failure. No real payment was made during development.
- Enable and configure Billing Portal for existing customers' plan/payment changes. Complex or multiple-payment invoices are cancellable but flagged for manual refund review.
- Keep existing pricing and trial promises accurate. The code still defaults to a 60-day trial; no existing customer's price or trial was shortened. Review the offer for future signups before promoting a near-term revenue target.
- Do not promote POS, inventory, AI business tools or website publishing as available. Those workflows remain planned even when a legacy plan flag exists.

## Email and bank connections

- Configure and test recovery email with a verified sender. Standard SMTP ports are blocked on Render's free web service; an optional Resend HTTPS path is implemented using RESEND_API_KEY and RECOVERY_EMAIL_FROM. Provider setup and actual delivery were not performed. References: https://render.com/docs/free and https://resend.com/docs/api-reference/emails/send-email
- Confirm support@keeperbma.com receives mail and that deletion requests can be verified and fulfilled. Settings now links to the existing deletion instructions; no destructive account deletion was performed.
- Test Plaid Sandbox with added, pending, modified, removed and multi-page history. The dashboard currently supports USD bank imports only; unsupported currencies are rejected rather than combined incorrectly.
- Verify bank disconnection stops provider access and removes the local credentials while retaining imported history. Check a legacy linked account's balance against its bank snapshot before announcing accurate balances to existing users.

## Android and mobile web

- Identify whether the published app is the Expo native client or the Capacitor companion. Both projects use the same package name. No connected Play Console session was available to inspect the published artifact.
- Capacitor is patched to 7.6.9 for GHSA-rvm3-566m-v7fv. Rebuild and redistribute the companion if it is used; a website deployment cannot update the installed native runtime. Advisory: https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv
- Check CI's Android compilation result, then test the intended release on a real Android device. The local host has no Android SDK or signing setup.
- Set the Android version code from the actual Play Console release history before building a signed bundle. No version code or signing key was guessed.
- Review Google Play payment/link rules for the actual regions and enrolled programs. The existing web/Android purchase architecture is not automatically compliant: https://support.google.com/googleplay/android-developer/answer/10281818
- Review remaining Expo tooling advisories before a native release. Compatible fixes were applied and Expo/TypeScript checks pass; a major SDK migration was not forced.
- Verify mobile web in actual Safari/Chrome. Browser-engine tests are helpful evidence, not a physical-device certification. iPhone users can use the website without an App Store listing.

## Deployment

1. Review the branch/PR and CI results. Keep a recoverable copy of the old application revision and database backup.
2. Deploy the API and verify /ready, authentication, billing configuration and a disposable user's complete flow. Existing tables are preserved; additive columns and small coordination tables are created as needed, requiring schema-write permissions.
3. Deploy the static frontend to the intended production host. Public /demo.html and /profit-calculator.html should work without login or API access. Verify legal pages and Settings as well.
4. Test the actual Android release against that deployed API. Publish the signed update only after device and policy checks.
5. Use the drafts in CONTENT_PACK.md and GROWTH_PLAN.md to recruit five testers. Track first transactions, repeat use and paying customers before spending on acquisition.

No advertisements, social posts, outreach messages, store edits, paid services or production data changes were performed in this development pass. Authenticated hosting/provider/store credentials are still needed for the remaining release steps.
