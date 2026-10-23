// useFastScanGesture.js - Reusable gesture hook for detecting Double-Tap (<300ms)
// and Long-Press (~500ms with scale/pulse feedback) to launch QR camera scanner.
import { useRef, useState, useCallback } from "react";

/**
 * Attaches gesture handlers for Single Tap, Double Tap (<300ms), and Long Press (~500ms).
 *
 * @param {object} params
 * @param {Function} params.onSingleTap - Standard action (e.g. navigation or open quick actions)
 * @param {Function} params.onFastScan - Triggered on Double-Tap or Long-Press to open live scanner
 * @returns {object} { bindGesture, isHolding }
 */
export function useFastScanGesture({ onSingleTap, onFastScan }) {
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef(null);
  const lastTapRef = useRef(0);
  const longPressTriggeredRef = useRef(false);

  // Start 500ms press-and-hold timer on touch/pointer down
  const handlePointerDown = useCallback((e) => {
    longPressTriggeredRef.current = false;
    setIsHolding(true);

    timerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsHolding(false);

      // Light haptic feedback if supported by device
      try {
        if (navigator.vibrate) navigator.vibrate(50);
      } catch (err) {}

      if (onFastScan) {
        onFastScan();
      }
    }, 500);
  }, [onFastScan]);

  // Cancel hold if finger moves or leaves early
  const cancelHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsHolding(false);
  }, []);

  // Handle pointer/touch release
  const handlePointerUp = useCallback((e) => {
    cancelHold();

    // If hold reached 500ms, long-press was already triggered; suppress single tap
    if (longPressTriggeredRef.current) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    // a) Double Tap: detected if second tap occurs within 300ms
    if (timeSinceLastTap > 0 && timeSinceLastTap < 300) {
      lastTapRef.current = 0;
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (onFastScan) {
        onFastScan();
      }
      return;
    }

    // Record tap time and execute standard single tap
    lastTapRef.current = now;
    if (onSingleTap) {
      onSingleTap(e);
    }
  }, [cancelHold, onFastScan, onSingleTap]);

  // Explicit desktop double click
  const handleDoubleClick = useCallback((e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    cancelHold();
    if (onFastScan) {
      onFastScan();
    }
  }, [cancelHold, onFastScan]);

  return {
    isHolding,
    bindGesture: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerLeave: cancelHold,
      onPointerCancel: cancelHold,
      onDoubleClick: handleDoubleClick,
    },
  };
}
