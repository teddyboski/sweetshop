# Marketing Pages — Design Spec

**Date:** 2026-07-08
**Status:** Approved

## Context

Defines the complete `(marketing)` route group content: 9 pages, each with a
business objective, primary CTA, SEO/mobile/conversion notes, and real copy
reflecting The Sweet Shop's brand voice (playful, snack-obsessed, hand-packed
and fast-shipping, Whatnot-live-selling community) — sourced from the legacy
site analysis in `docs/superpowers/specs/2026-07-07-v1-product-blueprint-design.md`
§1, not invented from scratch. Extends the route list in
`docs/superpowers/specs/2026-07-08-routing-architecture-design.md`.

`/build-a-box` and `/subscriptions` here are marketing explainer pages —
distinct from the functional `/shop/build-a-box` picker (Milestone 4) and
real subscription checkout (Milestone 6). Their CTAs forward-reference those
routes; they won't be functional until those milestones ship, which is
expected in iterative development, not a defect.

## 1. Home — `/`

- **Objective:** Convert an anonymous visitor into a shop browser or social follow within seconds.
- **Primary CTA:** "Shop Boxes" → `/shop`
- **SEO:** Title *"The Sweet Shop | Hand-Packed Snack Boxes, Build-Your-Own & Subscriptions"*; keyword "snack box" / "snack subscription box"
- **Mobile:** Single-column hero, thumb-reachable CTA in first viewport, no heavy hero media (fast LCP)
- **Conversion:** Social proof strip, "Best Seller" badge on Munchie Box, urgency nod to drops

**Copy:**
- H1: "Snacks that hit different."
- Subhead: "Hand-packed, shipped fast, and never boring. From best-seller boxes to build-your-own, mystery drops to a monthly subscription — The Sweet Shop is snacking, leveled up."
- CTA button: "Shop Boxes"
- Featured product card: "🍿 Best Seller — Munchie Box — $15 — The ultimate snack attack. Chips, candy, gummies & a surprise bonus snack."
- Social strip: "Catch us live — new drops & giveaways every week on Whatnot." CTA: "Follow @sweet_shop_official"

## 2. About — `/about`

- **Objective:** Build trust and brand affinity.
- **Primary CTA:** "See What's In Our Boxes" → `/shop` (secondary: "Watch us live" → Whatnot)
- **SEO:** Title *"About The Sweet Shop — Curated Snacks, Hand-Packed With Love"*
- **Mobile:** Short paragraphs, one pull-quote
- **Conversion:** Authenticity (started live on Whatnot) + social proof

**Copy:**
- H1: "We started on Whatnot. We never stopped hand-packing."
- Body: "The Sweet Shop began as a live-selling snack shop — literally packing boxes on camera for people who love snacks as much as we do. Every box is still hand-packed fresh to order, no exceptions. We just added a storefront so you don't have to catch us live to get in on it."
- CTA button: "Shop Boxes"

## 3. Build A Box — `/build-a-box`

- **Objective:** Pre-sell BYO's value (customization + gifting), capture intent ahead of Milestone 4.
- **Primary CTA:** "Start Building" → `/shop/build-a-box`
- **SEO:** Title *"Build Your Own Snack Box | Custom Snack Boxes — The Sweet Shop"*
- **Mobile:** 1-2-3 step visual, large tappable CTA
- **Conversion:** Upfront pricing, gift framing

**Copy:**
- H1: "Three sizes. Your call on what's inside."
- Body: "Small (8 items) · Medium (15 items) · Large (25 items). Tell us your preferences, we'll pack it fresh — perfect for picky snackers and even better as a gift."
- Price line: "Small $15 · Medium $25 · Large $35 — one flat price per size, no surprises at checkout."
- CTA button: "Start Building"

## 4. Subscription Boxes — `/subscriptions`

- **Objective:** Convert one-time buyers into recurring revenue — highest-LTV action on the site.
- **Primary CTA:** "Subscribe — $50/mo" → `/shop`
- **SEO:** Title *"Monthly Snack Box Subscription | $50/mo Exotic Snacks — The Sweet Shop"*
- **Mobile:** Price above the fold, "cancel anytime" visible without scrolling
- **Conversion:** Cancel-anytime badge, monthly cadence clarity, value-over-price framing

**Copy:**
- H1: "A fresh exotic haul, every month."
- Body: "$50/month, curated by The Sweet Shop. New flavors, new imports, always worth more than you paid. Cancel anytime — no contracts, no hassle."
- CTA button: "Subscribe Now"

## 5. How It Works — `/how-it-works`

- **Objective:** Remove purchase-path confusion, cross-sell rewards/referrals pre-signup.
- **Primary CTA:** "Shop Now" → `/shop`
- **SEO:** Title *"How It Works | The Sweet Shop — Order, Ship, Earn Rewards"*
- **Mobile:** Numbered 1-4 icon-led steps
- **Conversion:** Early rewards/referral mention

**Copy (4 numbered steps):**
1. "Pick your box — curated, mystery, or build-your-own."
2. "We pack it fresh — hand-packed to order, shipped fast."
3. "Earn rewards — every order earns points toward your next box."
4. "Refer a friend — you both get credit when they order."
- CTA button: "Shop Now"

## 6. Contact — `/contact`

- **Objective:** Reduce pre-purchase anxiety, give hesitant buyers a real channel.
- **Primary CTA:** "Email Us" (mailto — the real, current channel; no form/live-chat in V1)
- **SEO:** Low priority, basic meta only
- **Mobile:** Tap-to-email, tap-to-follow social icons
- **Conversion:** Sets a response-time expectation

**Copy:**
- H1: "Questions? We've got you."
- Body: "Email Manager@middlemanmerchants.com — we usually reply within 1 business day. Or catch us live on Whatnot and ask right there."

## 7. FAQ — `/faq`

- **Objective:** Deflect support volume, pre-answer conversion-blocking objections.
- **Primary CTA:** Soft — "Still have questions? Email us" / "Ready to shop?" → `/shop`
- **SEO:** Snippet-eligible; each Q as its own heading
- **Mobile:** Collapsible accordion using native `<details>`/`<summary>` (no new shadcn dependency needed)
- **Conversion:** Answers "what if I don't like the mystery box" and "can I actually cancel"

**Copy (real Q&A):**
- Q: "How fast do you ship?" A: "Every box is packed fresh to order and ships fast, domestically."
- Q: "What if I don't like what's in my Mystery Box?" A: "That's the fun of it — but if something's wrong with your order, email us and we'll make it right."
- Q: "Can I cancel my subscription?" A: "Yes, anytime, from your account page. No contracts."
- Q: "Do you ship internationally?" A: "Not yet — domestic U.S. shipping only for now."
- Q: "Are allergens listed?" A: "Each snack's page lists nutrition info where available — always check before gifting to someone with dietary restrictions."

## 8. Privacy Policy — `/privacy`

- **Objective:** Legal compliance and trust signal — absence hurts conversion more than presence helps.
- **Primary CTA:** None (footer-linked)
- **SEO:** Low priority, indexable for legitimacy
- **Conversion:** Indirect — removes a checkout-hesitation objection

**Content (real draft, flagged for legal review before production launch):**
- What we collect: email, shipping address, order history, preferences
- Payment: processed by Stripe; we never store card details directly
- Processors we share data with: Stripe, Resend, Supabase — no third-party sale of data
- Cookies/analytics: session/auth cookies only in V1, no third-party ad tracking (consistent with no-paid-ads acquisition strategy)
- User rights: request access to or deletion of your data by emailing us

## 9. Terms of Service — `/terms`

- **Objective:** Protects the business — order/subscription terms, liability limits, dispute reduction.
- **Primary CTA:** None
- **SEO:** Low priority

**Content (real draft, flagged for legal review before production launch):**
- Orders & payment: processed via Stripe; prices in USD
- Subscriptions: monthly billing, cancel anytime from account page, no partial-month refunds
- Shipping: domestic U.S. only, no guaranteed exact delivery date
- Returns: due to the nature of food products, we don't accept returns — contact us if there's a problem with your order and we'll make it right
- Rewards/referrals: points and referral credits have no cash value, subject to change, abuse (self-referral, fake accounts) forfeits rewards
- **Open item, not placeholder copy — needs the business owner, not invented:** governing-law jurisdiction and registered business entity name/address.
