import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Mobile Navigation & Interaction Hooks Architecture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("useSinglePress logic", () => {
    function createSinglePressHarness<T extends (...args: any[]) => void>(
      callback: T,
      delay = 800
    ) {
      let isPressed = false;
      let timeoutId: any = null;
      let currentCallback = callback;

      const updateCallback = (newCb: T) => {
        currentCallback = newCb;
      };

      const trigger = (...args: Parameters<T>) => {
        if (isPressed) return;
        isPressed = true;
        try {
          currentCallback(...args);
        } finally {
          timeoutId = setTimeout(() => {
            isPressed = false;
          }, delay);
        }
      };

      const unmount = () => {
        if (timeoutId) clearTimeout(timeoutId);
      };

      return { trigger, updateCallback, unmount };
    }

    it("executes the callback immediately on the first press", () => {
      const fn = vi.fn();
      const harness = createSinglePressHarness(fn, 800);

      harness.trigger("item-1");
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("item-1");
    });

    it("prevents double-clicking by dropping all invocations within debounce window", () => {
      const fn = vi.fn();
      const harness = createSinglePressHarness(fn, 800);

      // Rapid multi-tap (e.g. user double-tapping a button)
      harness.trigger();
      harness.trigger();
      harness.trigger();
      expect(fn).toHaveBeenCalledTimes(1);

      // Advance 400ms (halfway)
      vi.advanceTimersByTime(400);
      harness.trigger();
      expect(fn).toHaveBeenCalledTimes(1);

      // Advance remaining 400ms
      vi.advanceTimersByTime(401);
      harness.trigger();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("avoids stale closures by always invoking the latest callback reference", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const harness = createSinglePressHarness(fn1, 500);

      harness.trigger();
      expect(fn1).toHaveBeenCalledTimes(1);

      // Update callback (e.g. parent component re-rendered with new state)
      harness.updateCallback(fn2);
      vi.advanceTimersByTime(500);

      harness.trigger();
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe("useBackHandler logic (legacy Android navigator edge cases)", () => {
    function createBackHandlerHarness(
      handler: () => boolean,
      enabled: boolean = true
    ) {
      let isFocused = false;
      let currentHandler = handler;
      let activeSubscription: (() => void) | null = null;
      let eventListener: (() => boolean) | null = null;

      const updateHandler = (newHandler: () => boolean) => {
        currentHandler = newHandler;
      };

      const focus = () => {
        isFocused = true;
        if (!enabled) return;
        eventListener = () => currentHandler();
        activeSubscription = () => {
          eventListener = null;
        };
      };

      const blur = () => {
        isFocused = false;
        if (activeSubscription) {
          activeSubscription();
          activeSubscription = null;
        }
      };

      const triggerHardwareBack = (): boolean => {
        if (!isFocused || !eventListener) {
          return false; // Default Android behavior (native pop/exit)
        }
        return eventListener();
      };

      return { focus, blur, updateHandler, triggerHardwareBack };
    }

    it("attaches listener only when screen is focused and cleans up on blur", () => {
      const onBack = vi.fn(() => true);
      const harness = createBackHandlerHarness(onBack, true);

      // Not focused: hardware back is unhandled
      expect(harness.triggerHardwareBack()).toBe(false);
      expect(onBack).not.toHaveBeenCalled();

      // Focused: hardware back is handled
      harness.focus();
      expect(harness.triggerHardwareBack()).toBe(true);
      expect(onBack).toHaveBeenCalledTimes(1);

      // Blurred (screen navigated away): hardware back is removed
      harness.blur();
      expect(harness.triggerHardwareBack()).toBe(false);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("allows blocking hardware back (e.g. during checkout/in-flight requests)", () => {
      let isSubmitting = true;
      const onBack = vi.fn(() => isSubmitting);
      const harness = createBackHandlerHarness(onBack, true);

      harness.focus();
      // While submitting, returns true to consume event and block exit
      expect(harness.triggerHardwareBack()).toBe(true);

      // Once done submitting, returns false to allow standard navigation
      isSubmitting = false;
      expect(harness.triggerHardwareBack()).toBe(false);
    });

    it("does not attach listener if enabled is false", () => {
      const onBack = vi.fn(() => true);
      const harness = createBackHandlerHarness(onBack, false);

      harness.focus();
      expect(harness.triggerHardwareBack()).toBe(false);
      expect(onBack).not.toHaveBeenCalled();
    });
  });

  describe("useSingleBack logic (double-click prevention + stack fallback)", () => {
    function createSingleBackHarness(options: {
      canGoBack: boolean;
      fallback?: string | (() => void);
      onBeforeBack?: () => boolean | void;
      delay?: number;
      handleHardwareBack?: boolean;
    }) {
      const router = {
        canGoBack: vi.fn(() => options.canGoBack),
        back: vi.fn(),
        replace: vi.fn(),
      };

      let isNavigating = false;
      let timeoutId: any = null;
      const delay = options.delay ?? 800;

      const handleBack = () => {
        if (isNavigating) return;

        if (options.onBeforeBack && options.onBeforeBack() === false) {
          return;
        }

        isNavigating = true;
        try {
          if (router.canGoBack()) {
            router.back();
          } else if (options.fallback) {
            if (typeof options.fallback === "function") {
              options.fallback();
            } else {
              router.replace(options.fallback);
            }
          }
        } finally {
          timeoutId = setTimeout(() => {
            isNavigating = false;
          }, delay);
        }
      };

      const handleHardwareBack = (): boolean => {
        if (!options.handleHardwareBack) return false;
        handleBack();
        return true;
      };

      return { handleBack, handleHardwareBack, router };
    }

    it("calls router.back() once and prevents double-popping on rapid clicks", () => {
      const harness = createSingleBackHarness({ canGoBack: true });

      // User double clicks "← Back" button
      harness.handleBack();
      harness.handleBack();
      harness.handleBack();

      expect(harness.router.canGoBack).toHaveBeenCalledTimes(1);
      expect(harness.router.back).toHaveBeenCalledTimes(1);
      expect(harness.router.replace).not.toHaveBeenCalled();

      // After debounce window expires, back can be triggered again
      vi.advanceTimersByTime(800);
      harness.handleBack();
      expect(harness.router.back).toHaveBeenCalledTimes(2);
    });

    it("safely navigates to fallback route when canGoBack is false (e.g. deep link / notification landing)", () => {
      const harness = createSingleBackHarness({
        canGoBack: false,
        fallback: "/(requester)/bookings",
      });

      harness.handleBack();

      expect(harness.router.back).not.toHaveBeenCalled();
      expect(harness.router.replace).toHaveBeenCalledTimes(1);
      expect(harness.router.replace).toHaveBeenCalledWith("/(requester)/bookings");
    });

    it("invokes custom fallback callback when provided", () => {
      const customFallback = vi.fn();
      const harness = createSingleBackHarness({
        canGoBack: false,
        fallback: customFallback,
      });

      harness.handleBack();

      expect(harness.router.back).not.toHaveBeenCalled();
      expect(customFallback).toHaveBeenCalledTimes(1);
    });

    it("aborts navigation if onBeforeBack returns false", () => {
      const harness = createSingleBackHarness({
        canGoBack: true,
        onBeforeBack: () => false, // e.g. unsaved changes dialog or submitting
      });

      harness.handleBack();

      expect(harness.router.back).not.toHaveBeenCalled();
      expect(harness.router.replace).not.toHaveBeenCalled();
    });

    it("wires hardware back button cleanly when handleHardwareBack is true", () => {
      const harness = createSingleBackHarness({
        canGoBack: true,
        handleHardwareBack: true,
      });

      const handled = harness.handleHardwareBack();
      expect(handled).toBe(true);
      expect(harness.router.back).toHaveBeenCalledTimes(1);

      // Rapid hardware back tap is debounced
      const secondHandled = harness.handleHardwareBack();
      expect(secondHandled).toBe(true);
      expect(harness.router.back).toHaveBeenCalledTimes(1);
    });
  });
});
