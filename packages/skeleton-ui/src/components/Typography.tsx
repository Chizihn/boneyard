import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "../theme";

export interface HeadingProps extends RNTextProps {
  size?: "md" | "lg" | "display" | "displayLg";
}

/**
 * Only "display"/"displayLg" sizes get the theme's personality slant
 * (upright for Hallowear, synthetic italic for Haint) — that treatment is
 * reserved for big headlines. Smaller sizes (card titles, section
 * headers) stay upright so every card doesn't end up slanted on Haint.
 */
export function Heading({ size = "display", style, ...rest }: HeadingProps) {
  const theme = useTheme();
  const isDisplaySize = size === "display" || size === "displayLg";
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: isDisplaySize ? theme.headingFontFamily : theme.fontFamily.displaySemiBold,
          fontStyle: isDisplaySize && theme.headingItalic ? "italic" : "normal",
          fontSize: theme.fontSize[size],
          color: theme.palette.text,
        },
        style,
      ]}
    />
  );
}

export interface BodyTextProps extends RNTextProps {
  size?: "xs" | "sm" | "md" | "lg";
  weight?: "regular" | "medium" | "semiBold" | "bold";
  color?: "primary" | "secondary";
}

const bodyWeightToFamily = {
  regular: "body",
  medium: "bodyMedium",
  semiBold: "bodySemiBold",
  bold: "bodyBold",
} as const;

export function BodyText({
  size = "md",
  weight = "regular",
  color = "primary",
  style,
  ...rest
}: BodyTextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: theme.fontFamily[bodyWeightToFamily[weight]],
          fontSize: theme.fontSize[size],
          color: color === "primary" ? theme.palette.text : theme.palette.textSecondary,
        },
        style,
      ]}
    />
  );
}
