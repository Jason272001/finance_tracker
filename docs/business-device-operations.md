# One business, separate authorized devices

The business account owns the subscription and authorizes devices. Staff do not receive its account password or bearer token. Each staff member has a business-specific ID and credential. No default owner or staff credentials are created. Owner PIN attempts are limited per business ID across devices as well as per device.

## Owner setup

1. Sign in on the owner's private browser and choose the business.
2. Open **Devices & staff access**. A six-digit owner ID is suggested automatically. Choose a numeric PIN of 4–6 digits and confirm it. All staff roles use an ID and PIN, without separate user accounts. The business time zone is detected; expand the time-zone option if needed. Your saved owner ID remains visible in the owner controls after signing in again.
3. Existing staff records import as inactive. Edit each record, assign its operational role and branch, set a credential, and explicitly activate access.
4. Add branch-specific products, prices in USD, stock and the business's configured tax rate.
5. Under Devices, create a one-time code for each cashier, kitchen, clock or office station. Codes expire in five minutes and work once. Open `business-device.html` on the intended device and enter its code.

Shared stations must be signed out of the business account. The application checks both account cookies and the presence of the legacy account-token key before allowing restricted use. Pairing uses separate HttpOnly, Secure, SameSite=Strict cookies, scoped to `/operations`. Use the custom KeeperBMA domain; cross-site GitHub Pages hosting is not supported for station cookies.

## Roles and permissions

The owner creates named roles under **Roles & permissions** and enables only the required work tools. Permissions cover checkout, kitchen tickets, office access, management approval, products, reports, schedules, team management, timesheets, cash voids, activity and access across branches. Account ownership, branch and tax settings and permission-role editing remain owner-only. The owner can delegate device management through its own permission.

Existing staff keep their IDs, credentials and effective access. Legacy roles appear as editable starter roles: Manager, Sales team, Kitchen team and Team member. Cashier and time clock are device functions, not mandatory job roles. Every active staff member can clock in/out on an authorized clock device for their branch; roles may allow work across branches. A punch clears credentials and creates no persistent staff session.

New staff IDs are generated on the server, unique within the business across all branches, and never editable or reused for another person. A business database constraint and serialized allocation prevent simultaneous requests or generated collisions from duplicating IDs. Existing five-digit IDs continue to work; new staff IDs have six digits. Paired devices scope authentication to the correct business, so IDs are not a global identity across unrelated businesses.

Only the owner creates or edits permission roles and privileged staff credentials. A delegated team manager cannot grant permissions they lack, modify owner/privileged staff, or change staff outside their allowed branches. Restricted data is removed from API responses, not merely hidden in the interface. Role edits invalidate affected sessions; permissions are checked again on requests. Every role uses a 4–6 digit numeric PIN, including manager, supervisor and owner. Role changes never introduce a longer password requirement. Existing staff passwords must be replaced with numeric PINs by the owner before those staff sign in. The business account login remains unchanged.

Cashier stations require an individual operator before checkout. Leaving a restricted station requires a role with management-approval permission. The approval opens only that person's permitted sections. Locking management returns to checkout or the public clock form. Office stations require office permission. All staff stations use a five-minute inactivity limit with a visible countdown. Active interaction extends staff access within the device authorization period; polling does not. Management approvals last at most five minutes and expire after two idle minutes. Polling does not extend activity.

The full-screen button does not lock the operating system. Use the device's managed kiosk controls if staff must also be prevented from opening other apps or browser pages.

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

## Saved device codes and reconnection

The Devices table shows device name, branch, mode, status and its saved connection code. Owners and staff with **Manage business devices** permission can see codes, copy an unused unexpired code, generate a new code on the same device record, and delete a device. Branch restrictions apply. New codes expire in five minutes and work once; expired and used codes stay visible with their status. Existing devices created before saved-code support need **Generate new code** once to populate the code column.

Generating a code invalidates previous unused codes without creating another device. A currently connected station keeps working until a replacement uses the new code; that connection replaces its authorization and clears operator/approval sessions. Deleting a device revokes its access and removes it from the device list while retaining historical sales, attendance and audit references. Codes are stored in a separate private database table for authorized retrieval; include this table in confidential backups. Ordinary staff and roles without device permission do not receive codes in API responses. The unchanged full-access starter Manager role gains device management; customized roles keep their existing restrictions.
