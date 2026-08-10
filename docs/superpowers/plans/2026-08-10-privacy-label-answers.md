# Privacy Nutrition Label (Apple) & Data Safety Form (Google) — Draft Answers

Answered against what this app and its backend actually collect, verified
against the real schema (`profiles`, `orders`, `customer_addresses`,
`push_tokens`, `rewards_ledger`, `referrals`) and `CLAUDE.md`'s security
rules — not a generic template. Both stores' forms change their exact
wording periodically; use this as the factual source of truth to
re-answer against whatever the live form says at submission time, don't
paste blindly.

---

## What the app actually collects (ground truth)

| Data | Where it lives | Collected how |
|---|---|---|
| Email | `profiles`, Supabase Auth | Account sign-up |
| Name, shipping address | `customer_addresses`, `orders.shipping_address` | Checkout / address form |
| Order history | `orders`, `order_items` | Automatic on purchase |
| Rewards balance/history | `rewards_ledger` | Automatic on purchase |
| Referral code, who referred whom | `referrals`, `profiles.referred_by` | Sign-up via referral link |
| Push notification token | `push_tokens` | Only if the customer opts in (Milestone 14, Product Decision #2) |
| Payment card details | **Never stored by us** | Entered directly into Stripe's native Payment Sheet / Stripe Checkout — card data goes straight to Stripe, PCI scope stays off our servers entirely (`CLAUDE.md` Payments Architecture) |

Nothing here is used for advertising, and there are no third-party ad SDKs
or analytics/tracking SDKs in the mobile app as of this milestone — so
every category below should be marked "used for App Functionality only,"
never "used for tracking" or "third-party advertising."

Data leaves our systems only to the vendors needed to run the app:
**Stripe** (payments), **Resend** (transactional order emails, web-side
only), **Supabase** (hosting/auth/db), **Expo** (push delivery relay —
receives the device token and notification content only, nothing else).

---

## Apple: App Privacy (Nutrition Label)

Answer per Apple's categories, App Store Connect → App Privacy:

- **Contact Info** → Name, Email Address, Physical Address: **Collected**,
  linked to identity, used for App Functionality (order fulfillment,
  account).
- **Financial Info** → Payment Info: **Not Collected** (Stripe handles
  this outside the app's own data path).
- **Purchase History**: **Collected**, linked to identity, used for App
  Functionality (order history, rewards).
- **Identifiers** → Device ID (the Expo push token): **Collected**, linked
  to identity, used for App Functionality (order-shipped / drop-live
  alerts only) — only if the customer opted into notifications.
- **User Content, Browsing History, Search History, Location, Contacts,
  Diagnostics, Usage Data**: **Not Collected** (nothing in this app's
  current code path gathers any of these — no analytics SDK integrated
  yet).

## Google: Data Safety form

Answer per Google Play Console → App content → Data safety:

- **Does your app collect or share any of the required user data types?**
  Yes.
- **Personal info** → Name, Email address, Address: collected, required
  for app functionality (account, order fulfillment), not shared with
  third parties beyond the processors needed to run the app (Stripe,
  Supabase), encrypted in transit.
- **Financial info** → Purchase history: collected, required for app
  functionality. Payment info: not collected by the app itself (handled
  entirely by Stripe's SDK).
- **Device or other IDs** → the push token: collected, only if the user
  opts in, used for app functionality (notifications), not shared with
  third parties beyond Expo's push relay.
- **Data deletion**: Yes, users can request deletion — already disclosed
  on the privacy policy (`Manager@middlemanmerchants.com`).
- **Data encrypted in transit**: Yes (Supabase, Stripe, and Expo's push
  API are all HTTPS-only).
- **Independent security review**: No (not something this project has
  undergone — leave unchecked unless that changes before submission).

---

## Before actually submitting either form

- Confirm whether Expo's own push infrastructure or the Expo SDK itself
  collects anything beyond what's listed here (e.g. crash diagnostics) —
  check Expo's own privacy documentation at submission time, since SDK
  behavior can change between now and whenever the build actually ships.
- If any analytics or crash-reporting SDK gets added before launch, this
  entire doc needs a re-pass — it's accurate only for the app's code as of
  2026-08-10.
