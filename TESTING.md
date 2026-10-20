# Verification

## Backend

Install test dependencies in a virtual environment:

```text
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
```

SQLite integration tests run automatically. PostgreSQL cases are skipped unless KEEPERBMA_TEST_POSTGRES_URL points to a disposable test server. They create and remove randomly named keeperbma_test_* schemas, never use DATABASE_URL from production, and exercise concurrent writes and rollback.

Coverage includes ownership, monetary precision, failed postings, transfer history, backup coverage, administrator bootstrap, durable login/recovery state, coupon races, canonical billing events, checkout retries, cancellation/refund retries, provider response formats, bank snapshot imports, disconnection, pagination and cursor retries.

## Website and native TypeScript

```text
npm ci
npm test
npm run check:web
npx playwright install chromium webkit
npm run test:e2e
npm ci --prefix frontends/mobile --ignore-scripts
node frontends/mobile/node_modules/typescript/bin/tsc --noEmit -p frontends/mobile
```

On Windows, the Chromium project uses installed Edge. On other hosts it uses Playwright Chromium. Tests start a local HTTP server on port 8766. WebKit checks exercise browser compatibility; they are not a substitute for testing an actual iPhone or Android device.

Browser checks block external providers/CDNs by default and use explicit account API mocks. This avoids live customer/API access and makes the suite independent of CDN availability.

Browser coverage: demo arithmetic and reset, CSV download, simulated Android export bridge, older Android fallback, real-data-unavailable state, both authenticated web entry pages using mocked API responses, category creation, navigation/Menu keyboard behavior, bank disconnection, and calculator responsiveness at 320/390/1280px. Public tools are checked for absence of account API calls.

## Static release files

```text
python scripts/sync_web_entries.py --write
python scripts/sync_web_entries.py
python scripts/build_static.py
```

Root index.html, demo.html and profit-calculator.html are canonical. The sync script generates their alternate frontend entry pages. The build publishes only public HTML, JS, CSS and branding assets under _site. It includes legal pages, robots.txt and sitemap.xml.

## Android companion

```text
npm ci --prefix frontends/android --ignore-scripts
npm run cap:sync --prefix frontends/android
```

The Android CI job compiles a debug build using Java 21 and the hosted runner's Android SDK. A signed Play release still requires the owner's signing configuration and a version code greater than the currently published version. Do not assume either checked-in Android implementation is the one currently installed from Play; both use com.keeperbma.mobile.

Before release, verify the CSV Save As picker on an Android device: success, cancellation, permission-free file creation and a readable CSV. Old companion versions should show the browser/update fallback. Test native report-text sharing on a device as well.

## Dependency review

The API audit command used was `pip-audit -r requirements-api.txt`. The Android runtime audit used `npm audit --prefix frontends/android --omit=dev`. Re-run audits near release; results change over time. Remaining native SDK tooling advisories are recorded in CODE_REVIEW.md.

## Verified development pass (2026-10-20)

Local checks passed: 77 backend tests including PostgreSQL, 6 report/calculator tests, 18 Chromium/WebKit checks, native TypeScript, Expo dependency compatibility, synchronized static build, undefined-name checks and public-file link validation. The GitHub Android compile job passed for the implementation commit; actual device/signing tests remain pending.

Portable Java 21 and Android SDK tools were downloaded to the system temporary directory for a local compile attempt. Gradle was blocked by a Windows Java loopback/socket error before project compilation. The separate GitHub Linux build successfully compiled the Android companion and CSV plugin. No APK was installed or published.
