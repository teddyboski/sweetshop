# Scan-to-15%-off Welcome Offer — Design

Milestone: `milestone-25-scan-offer` (isolated worktree, per PROJECT_CONSTITUTION §6).

## Goal and business reason

Turn every house-snack bag and box into a sign-up billboard. A 2"×2" sticker
carries one QR code; scanning it leads to an account sign-up and a **15% discount
on the customer's first order**, applied automatically at checkout. This drives
account creation (the base for rewards, referrals and subscriptions — CLAUDE.md
growth priorities) and a first sale, at a bounded cost (15% off one order per new
customer).

## Decisions (approved by Ted, 2026-09-20)

1. **Rule:** 15% off the customer's *first order*, *one use per customer*.
   Auto-applied for customers who signed up through the scan; the same offer is
   also honoured if such a customer types the code (see Eligibility).
2. **One QR code for everything** → `https://www.sweetshopcentral.com/scan`.
   No per-product or per-batch codes (not needed for the MVP).
3. **Label:** 2"×2" sticker in the site's teal (`#00727f`) and cream (`#f8ecd0`)
   with Ted's cupcake icon in the QR centre, headline "SCAN FOR 15% OFF", subline
   "your first order", fine print "New accounts only · one use per customer".

## Customer flow

1. Scan → `/scan`: a short welcome page ("15% off your first order — create your
   account, confirm your email, then shop; your discount applies automatically at
   checkout"). Primary button → `/signup?offer=SCAN15`; secondary → log in.
2. Signup (existing form) reads `offer`, sends it as
   `options.data.offer_code` (same mechanism as `?ref=` → `referral_code`), so it
   is stored on the auth user and **survives the email-confirmation step**, which
   may happen in a different browser (a cookie would not).
3. After confirming and logging in, the customer shops normally. The cart page
   shows the offer line and the discounted total. Checkout applies the discount.
4. The redemption is recorded only after Stripe confirms payment (webhook), so an
   abandoned or failed checkout never consumes the offer.

## Eligibility (server-side, the only source of truth)

A `first_order_only` promotion applies to a request when **all** hold:
- the request is authenticated (guests cannot use it: "Log in or sign up to use
  this offer");
- the customer has **no prior order** in status `paid`, `fulfilled` or `shipped`;
- there is **no `promotion_redemptions` row** for (promotion, customer);
- the promotion is not expired and under `usage_limit` (existing rules).

Auto-apply: with no `promoCode` in the request, an authenticated customer whose
`profiles.signup_offer_code` names such a promotion gets it automatically; if they
are ineligible the request proceeds at full price with no error. A typed code that
is ineligible returns 400 with a specific message ("That offer is for your first
order only"). One promotion per order (existing schema); the rewards-points
redemption still stacks as today. The discount is 15% of the cart *subtotal*
(shipping excluded), as all percent promos work today.

Because `promotions` rows are publicly readable (existing RLS), the code `SCAN15`
is discoverable; a customer who never scanned but has no prior paid order can type
it. That is accepted: they are, in effect, a new customer.

## Design

### Database (one migration)
- `promotions.first_order_only boolean not null default false`.
- New table `promotion_redemptions` (`id`, `promotion_id`, `user_id`, `order_id`,
  `created_at`, `updated_at`; `unique (promotion_id, user_id)`; RLS on: customers
  read own rows, writes service-role only — the webhook).
- `profiles.signup_offer_code text` — written **only** by `handle_new_user()` from
  `raw_user_meta_data->>'offer_code'`, and only stored when it matches an existing
  `first_order_only` promotion (otherwise a silent no-op, like `referral_code`).
  Clients must not be able to change it: the existing
  `prevent_profile_privilege_escalation` trigger is extended to guard it (service
  role exempt, per the existing exemption migration).
- Seed: promotion `SCAN15` — percent, value 15, `first_order_only = true`, no
  expiry, no usage limit (`insert … on conflict (code) do nothing`). Managed later
  through the existing admin promotions screens.

### Server
- New `src/lib/promotions/resolve-promotion.ts`: one function that, given the
  admin client, optional user id, optional typed code and the cart subtotal,
  returns `{ promotionId, discountCents }`, `{ none }` (auto-apply not eligible) or
  `{ error, status }`. Both `/api/checkout/session` and
  `/api/checkout/payment-intent` currently carry near-identical copies of this
  logic; both are switched to the shared function (justified extraction: already
  duplicated, and now gaining rules). Existing typed-code behaviour is preserved
  exactly and covered by tests before the rules are added.
- Stripe wiring is unchanged: the discount still becomes a one-off
  `amount_off` coupon and `promotion_id` rides in session/payment-intent metadata.
- Webhook (both existing handlers): after the existing
  `increment_promotion_used_count`, insert the `promotion_redemptions` row
  (`on conflict do nothing`, idempotent on redelivery). A failure is logged, never
  thrown (order/payment already confirmed), matching the existing promo handling.
- `signupSchema` (+ `/api/auth/signup`, used by mobile) gains optional `offerCode`,
  forwarded as `offer_code` metadata; the web signup page forwards `?offer=`.

### Pages
- `src/app/(marketing)/scan/page.tsx`: static, brand-consistent, `noindex`
  (print-only landing), with loading/empty states not applicable (static).
- Cart page: server-computes the same resolution for the signed-in customer and
  renders "Welcome offer (15% off) −$X" plus the adjusted total (`data-testid`
  attributes alongside the existing ones).

### Label artwork
- `scripts/generate-scan-label.mjs` (`npm run label:scan`) builds the label from
  the URL: QR at error-correction level H, icon in the centre, teal/cream design →
  `design/scan-label/` as SVG, 300-dpi PNG, exact-size PDF, and a US-Letter sheet
  of 12 labels (3×4). The script **decodes its own PNG** and fails unless it reads
  back the exact URL. The cupcake icon is committed at
  `design/scan-label/icon.png`. New dev-only dependencies: `qrcode`, `jsqr`,
  `pngjs`; PDF rendering uses the already-installed Playwright.
- Physical check before any print run: scan a printed proof with two phones.

## Non-goals

- Per-product / per-batch QR codes or a redirect/tracking service.
- Referral changes; a mobile-app welcome screen (mobile checkout gets the discount
  through the same server routes, but has no new UI); an admin toggle for
  `first_order_only` (the seeded promotion is edited through existing screens).
- Anti-abuse beyond one use per account (a person can make several accounts; the
  cost is a single 15% discount and `usage_limit` can cap it later).

## Security and scale

- Eligibility and the discount amount are computed only on the server from the
  authenticated session; nothing the browser sends can grant the offer.
- `signup_offer_code` is client-immutable; redemptions are service-role-written
  with a uniqueness constraint. Known residual: two checkouts paid concurrently by
  the same new customer could both receive 15% (eligibility is checked at session
  creation, accounting at webhook); the second redemption insert no-ops and is
  logged. Accepted for the MVP.
- No new public write endpoint; `/scan` is static. Load is negligible.

## Testing

- Unit (Vitest, TDD): the resolution rules (guest, prior paid order, prior
  redemption, expired, typed vs auto-apply, percent maths, stacking with points),
  `signupSchema` `offerCode`, label URL/decoding.
- Integration (local Supabase, no mocks): `handle_new_user` stores a valid offer
  and ignores an invalid one; client cannot update `signup_offer_code`;
  `promotion_redemptions` uniqueness and RLS.
- E2E (Playwright): scan page → signup with offer → (confirmed user) cart shows
  the offer → checkout total is 15% lower → after payment a redemption exists → a
  second order pays full price; an existing customer with a paid order is not
  eligible; a guest typing the code is refused.
- The two existing checkout routes' promo tests must pass unchanged.

## Rollout

- `main` auto-deploys to production; **database migrations are pushed manually
  (`supabase db push`)** and only with Ted's explicit go-ahead (shared production
  data). Order: merge → push migration → confirm `/scan` and a real test order →
  only then print labels.
- Success metrics (SQL, no UI): sign-ups with `signup_offer_code = 'SCAN15'`;
  rows in `promotion_redemptions`.
