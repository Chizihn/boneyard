import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../theme";
import { BodyText } from "./Typography";

export interface InputProps extends TextInputProps {
  label?: string;
  /** Ionicons name, e.g. "mail-outline" / "lock-closed-outline". */
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
}

/**
 * The one text-entry primitive both apps use — label, optional left icon,
 * a password-visibility toggle when secureTextEntry is set, a focus ring,
 * and an error state. Screens should reach for this instead of a bare
 * React Native TextInput.
 */
export function Input({ label, icon, error, secureTextEntry, style, ...rest }: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View>
      {label ? (
        <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>
          {label}
        </BodyText>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1.5,
          borderColor: error
            ? theme.palette.status.negative.fg
            : focused
              ? theme.palette.primary
              : theme.palette.border,
          borderRadius: theme.radius.md,
          backgroundColor: theme.palette.surface,
          paddingHorizontal: theme.spacing.md,
        }}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={focused ? theme.palette.primary : theme.palette.textSecondary}
            style={{ marginRight: theme.spacing.sm }}
          />
        ) : null}
        <TextInput
          {...rest}
          secureTextEntry={isPassword && !revealed}
          placeholderTextColor={theme.palette.textSecondary}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: theme.spacing.md,
              color: theme.palette.text,
              fontFamily: theme.fontFamily.body,
              fontSize: theme.fontSize.md,
            },
            style,
          ]}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={8}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={theme.palette.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <BodyText size="xs" style={{ color: theme.palette.status.negative.fg, marginTop: theme.spacing.xs }}>
          {error}
        </BodyText>
      ) : null}
    </View>
  );
}
