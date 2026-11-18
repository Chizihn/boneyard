import { View, type ViewProps } from "react-native";
import { useTheme } from "../theme";

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.palette.surface,
          borderColor: theme.palette.border,
          borderWidth: 1,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
        },
        style,
      ]}
    />
  );
}
