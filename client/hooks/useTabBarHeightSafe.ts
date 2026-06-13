import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

/**
 * useBottomTabBarHeight, but safe on screens that can also render outside a
 * bottom-tab navigator (e.g. pushed onto a native stack).
 *
 * The underlying hook is useContext-based, so wrapping it in try/catch does
 * not change hook call order — the only failure mode is the synchronous
 * "couldn't find the bottom tab bar height" throw when no tab navigator is
 * present, which becomes the provided fallback instead.
 */
export function useTabBarHeightSafe(fallback = 0): number {
  try {
    return useBottomTabBarHeight();
  } catch {
    return fallback;
  }
}
