/**
 * Sweet Shop brand palette.
 *
 * The web app currently only has shadcn/ui's default grayscale theme (see
 * src/app/globals.css at the repo root) — no brand colors were ever
 * established there. This is the first real Sweet Shop color system,
 * built for mobile per Milestone 11's design-system pass, approved by Ted
 * 2026-08-07. Worth backporting to web later so both platforms match.
 *
 * Warm/appetizing palette for a snack-box brand: cream background (not
 * stark white — reads bakery/candy-shop, not clinical), a warm orange
 * primary, and a berry-red accent reserved for urgency/CTA moments
 * (drop countdowns, "Buy Now", low-stock badges).
 */
export const colors = {
  background: "#FFFBF5",
  foreground: "#2B1E17",

  card: "#FFFFFF",
  cardForeground: "#2B1E17",

  primary: "#E8703A",
  primaryForeground: "#FFFFFF",

  secondary: "#F4E9DD",
  secondaryForeground: "#2B1E17",

  accent: "#D63447",
  accentForeground: "#FFFFFF",

  muted: "#F0E4D8",
  mutedForeground: "#8A7867",

  success: "#3F9142",
  successForeground: "#FFFFFF",

  destructive: "#C4342B",
  destructiveForeground: "#FFFFFF",

  border: "#E7D9C9",
  input: "#E7D9C9",
  ring: "#E8703A",
} as const;

export type ColorToken = keyof typeof colors;
