import type { QueryClient } from "@tanstack/react-query";

export function invalidatePrayerQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && (
        key.startsWith("/api/prayers") ||
        key.startsWith("/api/daily-prayer-picks") ||
        key.startsWith("/api/prayer-streak")
      );
    },
  });
}
