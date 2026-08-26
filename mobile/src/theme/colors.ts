/**
 * Sweet Shop brand palette.
 *
 * Milestone 17: replaces the ad-hoc orange palette from Milestone 11 with
 * colors sourced from Ted's "THE SWEET SHOP — SINCE 1928" storefront
 * illustration, matching the web app's src/app/globals.css (see that
 * file's header comment for the full sampling methodology - facade
 * teal-blue, cream signage backdrop, and candy-pink lettering sampled
 * directly from illustration pixels via PIL, converted sRGB -> OKLCH).
 * `primary` and `accent` are the sampled hues deepened in lightness so
 * white text on top clears WCAG AA (verified programmatically), same
 * technique used for the web theme's --primary.
 *
 * accent keeps its Milestone 11 role (urgency/CTA: drop countdowns, "Buy
 * Now", low-stock badges) - now a deepened candy-pink instead of orange,
 * still visually distinct from the calmer teal primary.
 */
export const colors = {
  background: "#FCEDCE",
  foreground: "#211910",

  card: "#FFFBF1",
  cardForeground: "#211910",

  primary: "#00737F",
  primaryForeground: "#FFFFFF",

  secondary: "#D9ECEE",
  secondaryForeground: "#211910",

  accent: "#BC3F4D",
  accentForeground: "#FFFFFF",

  muted: "#EFE7D9",
  mutedForeground: "#615649",

  success: "#3F9142",
  successForeground: "#FFFFFF",

  destructive: "#C4342B",
  destructiveForeground: "#FFFFFF",

  border: "#E1D6C6",
  input: "#E1D6C6",
  ring: "#00737F",
} as const;

export type ColorToken = keyof typeof colors;
