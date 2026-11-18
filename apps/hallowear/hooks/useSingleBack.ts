import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useBackHandler } from "./useBackHandler";

export type SingleBackFallback = Href | string | (() => void);

export interface UseSingleBackOptions {
  /**
   * Route or callback to invoke if router.canGoBack() returns false.
   * Prevents app freeze or unexpected drop-out when entering via deep link or push notification.
   */
  fallback?: SingleBackFallback;
  /**
   * Optional hook called before navigating.
   * If this returns `false`, back navigation is prevented.
   */
  onBeforeBack?: () => boolean | void;
  /**
   * Debounce delay in milliseconds to prevent double-clicking / rapid double-taps.
   * Defaults to 800ms.
   */
  delay?: number;
  /**
   * Automatically register Android hardware back button handler via useBackHandler.
   * When true, hardware back button presses trigger this debounced back handler.
   * Defaults to false.
   */
  handleHardwareBack?: boolean;
}

function isUseSingleBackOptions(val: unknown): val is UseSingleBackOptions {
  if (!val || typeof val !== "object") return false;
  return (
    "fallback" in val ||
    "onBeforeBack" in val ||
    "delay" in val ||
    "handleHardwareBack" in val
  );
}

/**
 * Hook to navigate back safely, preventing rapid double-clicking / double-popping
 * and handling fallbacks when the navigation stack is empty (e.g. deep links, push notifications,
 * or legacy Android navigator edge cases).
 */
export function useSingleBack(
  fallbackOrOptions?: SingleBackFallback | UseSingleBackOptions
): () => void {
  const router = useRouter();
  const isNavigating = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalize options
  const options: UseSingleBackOptions = isUseSingleBackOptions(fallbackOrOptions)
    ? fallbackOrOptions
    : fallbackOrOptions != null
    ? { fallback: fallbackOrOptions as SingleBackFallback }
    : {};

  const {
    fallback,
    onBeforeBack,
    delay = 800,
    handleHardwareBack = false,
  } = options;

  const fallbackRef = useRef(fallback);
  const onBeforeBackRef = useRef(onBeforeBack);

  useLayoutEffect(() => {
    fallbackRef.current = fallback;
    onBeforeBackRef.current = onBeforeBack;
  }, [fallback, onBeforeBack]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    if (isNavigating.current) return;

    if (onBeforeBackRef.current && onBeforeBackRef.current() === false) {
      return;
    }

    isNavigating.current = true;
    try {
      if (router.canGoBack()) {
        router.back();
      } else if (fallbackRef.current) {
        const fb = fallbackRef.current;
        if (typeof fb === "function") {
          fb();
        } else {
          router.replace(fb as any);
        }
      }
    } finally {
      timeoutRef.current = setTimeout(() => {
        isNavigating.current = false;
      }, delay);
    }
  }, [router, delay]);

  // Wire hardware back handler when requested
  useBackHandler(
    useCallback(() => {
      handleBack();
      return true;
    }, [handleBack]),
    handleHardwareBack
  );

  return handleBack;
}

export default useSingleBack;
