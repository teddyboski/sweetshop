import { Platform } from "react-native";

/**
 * Type scale. Uses the platform system font for now (San Francisco on iOS,
 * Roboto on Android) rather than pulling in a custom font — the web app
 * uses Geist (next/font), which we could match later with expo-font, but
 * that's a deliberate deferral, not an oversight: getting a real font
 * loading pipeline right (weights, FOUT handling) is its own small task,
 * and system fonts render identically well on day one for Milestone 11's
 * scope. Revisit alongside the icon/asset pass in Milestone 12 if brand
 * consistency with web's Geist headings turns out to matter enough.
 */
const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

const fontFamilyMedium = Platform.select({
  ios: "System",
  android: "sans-serif-medium",
  default: "System",
});

export const typography = {
  fontFamily,
  fontFamilyMedium,
  sizes: {
    xs: { fontSize: 12, lineHeight: 16 },
    sm: { fontSize: 14, lineHeight: 20 },
    base: { fontSize: 16, lineHeight: 24 },
    lg: { fontSize: 18, lineHeight: 26 },
    xl: { fontSize: 20, lineHeight: 28 },
    "2xl": { fontSize: 24, lineHeight: 32 },
    "3xl": { fontSize: 30, lineHeight: 38 },
    "4xl": { fontSize: 36, lineHeight: 44 },
  },
} as const;

export type TypeSizeToken = keyof typeof typography.sizes;
