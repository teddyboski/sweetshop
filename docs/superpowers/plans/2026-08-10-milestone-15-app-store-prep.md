# Milestone 15 (Partial): App Store Readiness — No-Cost Prep

**Date:** 2026-08-10
**Status:** In progress — scoped deliberately narrow
**Branch:** `mobile-milestone-13-checkout` (same branch Milestones 13/14
shipped on; still unmerged, still the active line of work per Ted's
2026-08-09 decision to keep building here rather than cut a new
milestone-15 branch yet)
**Depends on:** Milestone 14 (code-complete as of this doc — all 10 tasks
built, both `tsc --noEmit` runs confirmed clean by Ted on his own machine
2026-08-10)

---

## Why this is only *part* of Milestone 15

The full Milestone 15 roadmap entry (`2026-08-06-mobile-v1-milestone-roadmap.md`)
requires two things this session cannot produce: money and Ted's own
accounts. Specifically blocked on those, **not attempted here**:

- Apple Developer Program enrollment ($99/year) and Google Play Console
  registration ($25 one-time) — Ted's own credentials, can't be created on
  his behalf.
- TestFlight / Android Internal Testing distribution — needs the above
  accounts to exist first.
- Real screenshots — needs a running build on a real or simulated device.
- Store submission and review — needs everything above plus a live-mode
  test pass (separately costed out with Ted on 2026-08-10: ~$124 total for
  both platforms' real-device testing).

What's left over — and genuinely free, blocked on nothing — is
configuration and copy that has to exist eventually regardless of when the
paid steps happen. Doing it now means Milestone 15's paid phase is pure
account setup and button-clicking, not also first-draft writing under
time pressure.

## Ground truth already in place

- `mobile/app.json` already has both platforms' bundle identifiers
  (`com.sweetshopcentral.app`), app name, icon/splash/adaptive-icon assets,
  and an EAS project id — all Milestone 11 work, confirmed by reading the
  file, not assumed.
- `mobile/eas.json` currently has exactly one build profile (`preview`:
  Android APK, internal distribution). No `development` or `production`
  profile exists yet.
- `src/app/(marketing)/privacy/page.tsx` is a real, live privacy policy at
  `sweetshopcentral.com/privacy` — reusable for both stores' privacy-policy
  URL requirement, but it currently does not disclose push notification
  token collection (`push_tokens` table, added Milestone 14) — a real
  accuracy gap against what the app actually collects today, not just a
  Milestone 15 nice-to-have.
- No store listing copy or Privacy Nutrition Label / Data Safety answers
  exist anywhere in the repo yet — this is genuinely new work, not a reuse
  of something written for web (the web app has no app-store presence).

## Tasks

### Task 1 — `eas.json`: add `development` and `production` build profiles
- `development`: dev-client build, internal distribution, for iterating
  against a local/preview backend without needing a store-distributed
  binary.
- `production`: `autoIncrement: true`, iOS `distribution: "store"`, Android
  `buildType: "app-bundle"` (Play Store requires AAB, not APK, for new
  submissions — `preview`'s APK stays APK since sideloading/internal test
  tracks still accept it).
- **Test:** none — config file, not app logic. Validated by running
  `eas build:list` / a real build once Ted has EAS credentials, deferred to
  paid phase.

### Task 2 — Privacy policy: disclose push token collection
- One sentence added to the existing data-collection paragraph:
  push notification tokens, collected only after the customer opts in,
  used solely for order-shipped and drop-live alerts.
- **Test:** none — copy change.

### Task 3 — Store listing copy draft
- App name, subtitle/short description, long description, keyword list,
  category suggestion for both App Store and Play Store — written from the
  actual brand voice already live on the marketing pages (hand-packed,
  Whatnot live-selling origin, build-your-own, drops, subscription), not
  invented positioning.
- Saved as a reference doc Ted copy-pastes into App Store Connect / Play
  Console once those accounts exist.

### Task 4 — Privacy Nutrition Label (Apple) / Data Safety form (Google) draft answers
- Answered against what the app and backend actually collect per the real
  schema (`profiles`, `orders`, `push_tokens`, `rewards_ledger`,
  `referrals`) and CLAUDE.md's security rules (payment data never touches
  our DB — Stripe handles it entirely) — not a generic template.
- Saved as a reference doc for the same reason as Task 3.

## Explicitly out of scope for this pass

- Everything requiring Ted's own Apple/Google accounts, a real device
  build, or App Store/Play Store submission — full Milestone 15 resumes
  once those exist.
- Real screenshots (needs a running build).
- The rollback/kill-switch plan the full Milestone 15 completion criteria
  calls for — worth doing before submission, not blocked on money, but
  deliberately left for its own pass rather than folded in here to keep
  this batch reviewable.

## Completion criteria for this partial pass

- [ ] `eas.json` has working `development`, `preview`, and `production`
      profiles for both platforms
- [ ] Privacy policy accurately discloses every data type the app
      currently collects, including push tokens
- [ ] Store listing copy and privacy-label answers exist as reviewable
      drafts, ready to paste in the moment Ted creates the developer
      accounts
