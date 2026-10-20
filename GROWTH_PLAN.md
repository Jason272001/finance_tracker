# First customers without paid ads

Draft for review — no store edits, outreach, or publishing have been performed.

## Offer

Start with creators and side hustlers who need to see monthly income and expenses. Validate this audience with five conversations before spending on acquisition. Pricing is an experiment, not a revenue guarantee. Existing prices remain $2/month for Basic and $7/month for Regular. At $2/month, 50–100 subscribers yield $100–$200 gross; at $7/month, 15 subscribers yield $105 gross and 29 yield $203 gross, before all fees, operating costs, refunds and taxes. The manual creator report is available in Basic; supported bank connections are an additional Regular feature.

## Play Store listing draft

Title: KeeperBMA: Income Tracker

Short description: Track side hustle income, expenses, and monthly net income in one place.

Opening description:
See what your side hustle actually keeps. Record income and expenses, organize transactions by category, and review your monthly net income. Creator categories help you organize YouTube, TikTok, sponsorship, freelance and digital product earnings. Download a monthly CSV for your own records.

The category labels are for manual organization; this update does not connect to creator platforms or import their earnings automatically. The report uses all recorded income and expenses and excludes transfers. It is not a tax or accounting statement.

Before publishing: confirm the store package matches the Capacitor companion in this repository; confirm which features require an existing subscription; disclose account/access requirements accurately; check screenshots on a real Android device. The native Expo app is a separate implementation and now includes its own report, category shortcuts, report-text sharing and bank disconnection controls. Identify the actual published implementation before choosing screenshots.

Suggested screenshots, using fictional data: monthly income/expenses/net income; income by source; transaction entry; monthly export. Show the actual shipped UI. Do not advertise unfinished POS/inventory or fabricated testimonials.

## Four-week organic experiment

1. Week one: recruit five voluntary testers from your existing audience. Ask how they track side hustle money now and watch them complete a first transaction. Fix recurring problems.
2. Week two: post three short demonstrations on the channel you already use: gross income versus money kept; recurring software expenses; organizing multiple income sources. Use the public /demo.html page as the destination for website audiences. Use a verified Play Store listing link for install-focused posts.
3. Week three: share one useful tutorial in a relevant community where promotion is allowed. Explain that you built the tool and invite specific feedback. Do not send bulk unsolicited messages or ask for positive ratings.
4. Week four: follow up with willing testers, ask which workflow they actually used, and test a single paid offer with clear cancellation terms. Improve the workflow before expanding features.

Example post: “I made $370 from sample side hustle work, but spent $70 on software and equipment. Here's how I check the $300 left over. I built KeeperBMA to make this easier. Try the sample report and tell me what is confusing.” Clearly label the numbers as sample data.

## Measure

Use Play Console acquisition and retention reports, along with voluntary tester feedback. Track weekly: relevant visits, demo usage if measured, installs, first recorded transaction, return usage, paid subscribers and cancellations. No new analytics SDK or personal-data collection was added in this update. Small traffic may not support a statistically useful listing experiment yet.

Official Google references:
- Listing assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Listing experiments: https://support.google.com/googleplay/android-developer/answer/12053285
- Payments policy: https://support.google.com/googleplay/android-developer/answer/10281818

## Release and verification

- Deploy the root website to the intended Vercel host, or verify the GitHub Pages build publishes the matching frontends/web files.
- Test the hosted report in the Capacitor Android companion, including CSV download behavior in its WebView. Browser CSV verification does not establish Android WebView download support.
- Keep the public demo separate from authenticated customer data. It performs no API calls and resets sample changes on reload.
- Category shortcuts use the existing authenticated category API; existing subscription gates remain in effect.
- Reports are English in this first version and use existing dashboard currency formatting. Category names are editable organizational labels; there is no new persistent source field or scheduled recurring-entry engine.
- Database, access and billing safeguards have now been implemented and tested. Production rollout and provider/device verification remain release gates; see RELEASE_CHECKLIST.md.

See TESTING.md and CODE_REVIEW.md for the expanded verification suite and remaining limitations. CONTENT_PACK.md contains ready-to-adapt drafts. The new free profit calculator at /profit-calculator.html is another entry point for useful content without a signup barrier.
