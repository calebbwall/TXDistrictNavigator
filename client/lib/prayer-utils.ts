import type { QueryClient } from "@tanstack/react-query";

// User-facing labels for prayer status. The backend uses the keys
// (OPEN/ANSWERED/ARCHIVED); the UI should always show these words so the
// terminology stays consistent across every screen.
export const PRAYER_STATUS_LABELS: Record<string, string> = {
  OPEN: "Active",
  ANSWERED: "Answered",
  ARCHIVED: "Archived",
  ALL: "All",
};

export function prayerStatusLabel(status: string): string {
  return PRAYER_STATUS_LABELS[status] ?? status;
}

// Returns a YYYY-MM-DD date key in the app's reference timezone (Central),
// matching how the server buckets daily picks and streaks.
export function getDateKey(date: Date): string {
  const localeStr = date.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
  });
  const [month, day, year] = localeStr.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function getTodayDateKey(): string {
  return getDateKey(new Date());
}

export function invalidatePrayerQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return (
        typeof key === "string" &&
        (key.startsWith("/api/prayers") ||
          key.startsWith("/api/daily-prayer-picks") ||
          key.startsWith("/api/prayer-streak"))
      );
    },
  });
}
