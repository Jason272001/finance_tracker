# One business, separate authorized devices

The business account owns the subscription and authorizes devices. Staff do not receive its account password or bearer token. Each staff member has a business-specific ID and credential. No default owner or staff credentials are created.

## Owner setup

1. Sign in on the owner's private browser and choose the business.
2. Open **Devices & staff access**. Set an owner staff ID and a separate device-management password of at least 12 characters. Choose the business time zone.
3. Existing staff records import as inactive. Edit each record, assign its operational role and branch, set a credential, and explicitly activate access.
4. Add branch-specific products, prices in USD, stock and the business's configured tax rate.
5. Under Devices, create a one-time code for each cashier, kitchen, clock or office station. Codes expire in five minutes and work once. Open `business-device.html` on the intended device and enter its code.

Shared stations must be signed out of the business account. The application checks both account cookies and the presence of the legacy account-token key before allowing restricted use. Pairing uses separate HttpOnly, Secure, SameSite=Strict cookies, scoped to `/operations`. Use the custom KeeperBMA domain; cross-site GitHub Pages hosting is not supported for station cookies.

## Roles and station modes

| Role | Allowed work |
| --- | --- |
| Original owner | Owner account controls, device authorization/revocation, branch/tax configuration, manager credentials, reports and other operations |
| Manager | Office work, schedules, ordinary staff credentials, products, sales review, cash-sale voids, timesheets and activity log |
| Cashier | Checkout on an authorized cashier station; cannot use management APIs or replace another active cashier without sign-out |
| Kitchen | Current-branch preparation tickets and sequential status updates; responses exclude prices and financial reports |
| Time-clock staff | Authenticated clock-in/out on a clock station; each punch creates no lasting staff session |

Cashier stations require an individual operator before checkout. Leaving checkout for management requires fresh manager/owner credentials and a separate short-lived approval. Locking management returns to checkout or the public clock form. Office stations require manager/owner sign-in. Owner settings remain protected even from managers.

Staff sessions expire after eight hours overall, with five-minute inactivity limits for cashier/office stations and 30 minutes for kitchen stations. Temporary management approvals last at most five minutes and expire after two idle minutes. Polling does not extend activity; actual user interaction or authorized changes do. Every privileged action is also checked on the server. The page's full-screen button does not lock the operating system: use the device's managed kiosk controls if staff must also be prevented from opening other apps/browser pages.

## Data integrity

Operations uses separate `ops_*` PostgreSQL tables. Tables are created without altering the existing personal-finance, billing or business-profile tables. Mutations serialize per business using PostgreSQL transaction locks. SQLite is for isolated development/tests.

Prices and tax are calculated on the server using integer cents. Checkout requires the displayed expected total; a price/tax change requires review. Stock updates, sale records and restaurant tickets commit atomically. Duplicate request IDs cannot record a second sale. Keep a station tab open until an unconfirmed sale is reconciled; after a browser crash, review sales before re-entering an uncertain transaction. Unconfirmed sales retain their request reference in that tab; a manager can confirm an existing sale or cancel the reference so a late retry cannot create an unexpected sale.

Kitchen displays poll shared server records. A paid restaurant order progresses queued → preparing → ready → served. Staff, branch, device and server timestamps are retained. Credential/role changes invalidate affected sessions; device revocation takes effect on the next request.

## First-release limits

- Cash records only. Card readers and external card payment confirmation are not integrated.
- Restaurant tickets are created for paid cash orders. Table service, unpaid tabs, recipe inventory, complex modifiers and automatic receipt/kitchen printers are not implemented.
- Timesheets record clock intervals and the rate at clock-in. Managers can close a missed clock-out with an actual end time and an attributed reason. Gross estimates do not process breaks, overtime, withholding or payroll payments.
- Daily reports use the configured business time zone and allow selecting a previous date. CSV exports are available; scheduled email is not configured.
- The new operational staff roster becomes the source for device access after setup. The original business-profile staff records remain as the import source; later changes should be made through device/staff controls.

## Deployment and recovery

`BUSINESS_OPERATIONS_ENABLED=0` is the kill switch. Production must use persistent PostgreSQL, HTTPS, correct credentialed CORS origins and verified database backups. The existing confidential backup command now includes every operations table, including credential hashes and revocation records. Treat backups as sensitive; do not publish them. Restoring a database requires reviewing device/session revocations and checkout references before reopening stations.

Any account-data deletion process must also cover that owner's `ops_*` data. A full SQL backup is recommended before initial rollout. Future schema changes need a reviewed migration; `create_all` only creates missing tables and does not upgrade existing columns.

Verification: isolated SQLite/PostgreSQL domain and API tests; separate-browser cashier/kitchen/kiosk/office tests; compatibility rehearsal against the production backend's FastAPI version and existing authentication helpers. No production account credentials are used in those tests.
