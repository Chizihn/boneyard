import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

/**
 * Custom hook to handle Android hardware/system back button presses when the screen is focused.
 * Addresses legacy Android navigator edge cases:
 * - Ensures listeners only run while screen is focused via useFocusEffect (prevents background triggers).
 * - Avoids stale closures and listener thrashing using a mutable callback ref.
 * - Allows returning `true` to consume/prevent the default back behavior (e.g. during active transactions,
 *   modal sheets, or custom exit flows).
 * - Allows returning `false` to let the system execute the default back behavior.
 * - Supports an `enabled` toggle (default true) to conditionally activate hardware back trapping.
 *
 * @param onBackPress Callback function triggered on hardware back press.
 *                    Return `true` to prevent default behavior, `false` to allow it.
 * @param enabled Whether the hardware back listener is active. Defaults to true.
 */
export function useBackHandler(onBackPress: () => boolean, enabled: boolean = true) {
  const callbackRef = useRef(onBackPress);

  useEffect(() => {
    callbackRef.current = onBackPress;
  });

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => callbackRef.current()
      );

      return () => subscription.remove();
    }, [enabled])
  );
}

export default useBackHandler;
