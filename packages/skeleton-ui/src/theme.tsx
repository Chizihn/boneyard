import { createContext, useContext } from "react";
import { fontFamily, fontSize, radius, spacing } from "./tokens";

export interface Palette {
  bg: string;
  surface: string;
  border: string;
  primary: string;
  primaryDark: string;
  accent: string;
  text: string;
  textSecondary: string;
  onPrimary: string;
  /** Used by StatusBadge — one bg/fg pair per semantic meaning, tuned per
   * app so badges stay legible against that app's background. */
  status: {
    neutral: { bg: string; fg: string };
    positive: { bg: string; fg: string };
    warning: { bg: string; fg: string };
    negative: { bg: string; fg: string };
    highlight: { bg: string; fg: string };
  };
}

export interface Theme {
  name: "hallowear" | "haint";
  isDark: boolean;
  palette: Palette;
  /** Same family (Space Grotesk) for both apps — personality comes from
   * weight/slant, not a different typeface, per docs/DESIGN.md. */
  headingFontFamily: string;
  /** Space Grotesk has no italic cut — true for a theme that wants a
   * synthetic (software-slanted) italic on display text, e.g. Haint. */
  headingItalic: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  fontFamily: typeof fontFamily;
  fontSize: typeof fontSize;
}

const hallowearPalette: Palette = {
  bg: "#FFF6EC",
  surface: "#FFFFFF",
  border: "#F0DCC4",
  primary: "#E2672A",
  primaryDark: "#C2501C",
  accent: "#6B3FA0",
  text: "#2B1D14",
  textSecondary: "#8A7260",
  onPrimary: "#FFFFFF",
  status: {
    neutral: { bg: "#FCE8CF", fg: "#8A4B1D" },
    positive: { bg: "#DCF0E3", fg: "#1F6B3D" },
    warning: { bg: "#FCE8CF", fg: "#8A4B1D" },
    negative: { bg: "#F7DCDC", fg: "#9C3A3A" },
    highlight: { bg: "#EBE0F7", fg: "#5B2C82" },
  },
};

const haintPalette: Palette = {
  bg: "#0E1512",
  surface: "#171F1B",
  border: "#28332D",
  primary: "#9C2B3A",
  primaryDark: "#7E2130",
  accent: "#2E6B55",
  text: "#EDE6DE",
  textSecondary: "#A89C8E",
  onPrimary: "#FFFFFF",
  status: {
    neutral: { bg: "#3A2A12", fg: "#E8A33D" },
    positive: { bg: "#1C3322", fg: "#6FCB8F" },
    warning: { bg: "#3A2A12", fg: "#E8A33D" },
    negative: { bg: "#2A2020", fg: "#D98D8D" },
    highlight: { bg: "#16332A", fg: "#5FBE9B" },
  },
};

export const hallowearTheme: Theme = {
  name: "hallowear",
  isDark: false,
  palette: hallowearPalette,
  headingFontFamily: fontFamily.displayBold,
  headingItalic: false,
  spacing,
  radius,
  fontFamily,
  fontSize,
};

export const haintTheme: Theme = {
  name: "haint",
  isDark: true,
  palette: haintPalette,
  headingFontFamily: fontFamily.displayBold,
  headingItalic: true,
  spacing,
  radius,
  fontFamily,
  fontSize,
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useTheme() called outside a <ThemeProvider> — wrap your app's root in one.");
  }
  return theme;
}
