import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Prevents multiple rapid invocations of a callback (e.g. double-tapping buttons).
 * Mirrors Plot Armor's useSinglePress architecture.
 *
 * @param callback The function to invoke on press.
 * @param delay Milliseconds to wait before accepting another press. Defaults to 800ms.
 */
export function useSinglePress<T extends (...args: any[]) => void>(
  callback: T,
  delay = 800
): (...args: Parameters<T>) => void {
  const isPressed = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (isPressed.current) return;

      isPressed.current = true;
      try {
        callbackRef.current(...args);
      } finally {
        timeoutRef.current = setTimeout(() => {
          isPressed.current = false;
        }, delay);
      }
    },
    [delay]
  );
}

export default useSinglePress;
