import React from "react";
import { GestureResponderEvent, Pressable, type PressableProps } from "react-native";
import { useSinglePress } from "../hooks/useSinglePress";

export interface SinglePressableProps extends Omit<PressableProps, "onPress"> {
  onPress?: null | ((event: GestureResponderEvent) => void);
  /** Custom delay in ms for single press debounce (default: 800) */
  delay?: number;
}

/**
 * SinglePressable - A Pressable that only fires onPress once per debounce window (default 800ms).
 * Prevents double-tap rendering/navigation glitches.
 */
export const SinglePressable: React.FC<SinglePressableProps> = ({
  onPress,
  delay = 800,
  disabled,
  style,
  ...rest
}) => {
  const handlePress = useSinglePress((event: GestureResponderEvent) => {
    if (disabled) return;
    onPress?.(event);
  }, delay);

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      disabled={disabled}
      style={style}
      {...rest}
    />
  );
};

SinglePressable.displayName = "SinglePressable";
export default SinglePressable;
