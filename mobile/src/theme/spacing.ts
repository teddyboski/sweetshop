/**
 * 4px base-unit spacing scale — matches the web app's Tailwind convention
 * (Tailwind's default spacing scale is also 4px-based) so a "space-4"
 * instinct carries over between platforms even though mobile uses raw
 * numbers instead of utility classes.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
} as const;

export type SpacingToken = keyof typeof spacing;

/**
 * Border radius scale. Mirrors the web app's --radius-* custom properties
 * (globals.css) in spirit — smallest to largest — but with concrete pixel
 * values since React Native has no CSS calc().
 */
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  "2xl": 28,
  full: 999,
} as const;

export type RadiusToken = keyof typeof radii;
