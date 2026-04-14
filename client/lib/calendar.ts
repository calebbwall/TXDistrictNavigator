import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Alert, Share } from "react-native";

interface HearingCalendarData {
  id: string;
  title: string;
  committeeName: string | null;
  chamber: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  location: string | null;
  sourceUrl: string;
}

function chamberLabel(chamber: string | null): string {
  if (chamber === "TX_HOUSE") return "Texas House";
  if (chamber === "TX_SENATE") return "Texas Senate";
  return "Texas Legislature";
}

/** Format a Date to ICS local datetime: YYYYMMDDTHHmmss */
function toIcsDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}`;
}

/** Escape special characters for ICS text fields */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Generate ICS file content for a hearing */
export function generateHearingIcs(hearing: HearingCalendarData): string {
  const start = new Date(hearing.startsAt!);
  const end = hearing.endsAt
    ? new Date(hearing.endsAt)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2 hours

  const summary = escapeIcsText(
    hearing.committeeName ?? hearing.title
  );
  const chamber = chamberLabel(hearing.chamber);
  const description = escapeIcsText(
    `${chamber} committee hearing\\nSource: ${hearing.sourceUrl}`
  );
  const location = hearing.location
    ? escapeIcsText(hearing.location)
    : "";
  const uid = `${hearing.id}@txdistrictnavigator`;
  const now = toIcsDateTime(new Date());
  const tz = hearing.timezone || "America/Chicago";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TXDistrictNavigator//Hearing//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}Z`,
    `DTSTART;TZID=${tz}:${toIcsDateTime(start)}`,
    `DTEND;TZID=${tz}:${toIcsDateTime(end)}`,
    `SUMMARY:${summary}`,
    ...(location ? [`LOCATION:${location}`] : []),
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Hearing in 30 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

/** Generate an ICS file for a hearing and open the share sheet */
export async function addHearingToCalendar(
  hearing: HearingCalendarData
): Promise<void> {
  if (!hearing.startsAt) {
    Alert.alert("No Date", "This hearing does not have a scheduled date.");
    return;
  }

  try {
    const icsContent = generateHearingIcs(hearing);
    const filename = `hearing_${hearing.id}.ics`;
    const file = new File(Paths.cache, filename);
    await file.write(icsContent);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/calendar",
        dialogTitle: "Add Hearing to Calendar",
        UTI: "com.apple.ical.ics",
      });
    } else {
      await Share.share({
        message: icsContent,
        title: "Hearing Calendar Event",
      });
    }
  } catch {
    Alert.alert(
      "Export Failed",
      "Could not create calendar event. Please try again."
    );
  }
}
