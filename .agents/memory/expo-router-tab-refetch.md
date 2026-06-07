---
name: Expo Router tab list refresh
description: Why list screens in the tab bar go stale and how to keep them fresh
---

# Tab screens stay mounted — refetch list queries on focus

- Expo Router keeps tab screens **mounted** when you switch tabs, so React Query's `refetchOnMount` never fires on tab re-entry, and React Native has no window-focus events by default. A list rendered on a tab (e.g. the AI chat History list, and the home-screen chat count) therefore shows **stale data** after an item is created on a different screen, until a manual pull-to-refresh.
- Fix: wrap a `refetch()` in `useFocusEffect(useCallback(() => { refetch(); }, [refetch]))` on each tab screen that renders a server-backed list. Put `refetch` in the dep array (no stale closure, no loop).
  - **Why:** conversations are created in two heterogeneous places — `scan.tsx` via a direct `fetch('/api/scan')` and the home screen via the `useStartOpenaiChat` mutation — neither of which invalidated `getListOpenaiConversationsQueryKey`. Focus-refetch is robust to any current/future creation path without touching each call site.
  - **Alternative (optimization, not required):** call `queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() })` in each creation success handler to update subscribers immediately and avoid extra focus traffic. Focus-refetch is the simpler, catch-all approach and was chosen.
