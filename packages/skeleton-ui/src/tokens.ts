/**
 * Raw design tokens, shared across both apps. Per-app personality lives in
 * `theme.ts`'s palettes, not here — this file is the stuff that must stay
 * identical for the "same skeleton" signal to actually be visible: the
 * spacing/radius/type scale an app can't quietly drift away from.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/**
 * Space Grotesk (display/headings) + Inter (body/UI) — the one
 * typographic signature both apps share. Bold geometric sans throughout,
 * no serif — personality comes from weight/letter-spacing choices per
 * app, never a different family. Space Grotesk has no italic cut; use
 * `fontStyle: "italic"` in a component's style for a synthetic slant
 * where a personality difference is wanted (e.g. Haint).
 */
export const fontFamily = {
  displayLight: "SpaceGrotesk_300Light",
  displayRegular: "SpaceGrotesk_400Regular",
  displayMedium: "SpaceGrotesk_500Medium",
  displaySemiBold: "SpaceGrotesk_600SemiBold",
  displayBold: "SpaceGrotesk_700Bold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  display: 28,
  displayLg: 38,
} as const;
