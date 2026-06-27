/**
 * Subprocess helper for timezone tests. Run with a specific TZ env var; it
 * exercises the client date helpers against fixed instants and prints JSON.
 * The client helpers are device-local by design — the parent test asserts
 * per-TZ expectations.
 */
import {
  toISODateString,
  parseISODate,
  toStorageDateString,
} from "../../../client/utils/validation";

// 7:00 PM Jan 15 2026 in Chicago (CST, UTC-6) == 01:00 Jan 16 UTC
const eveningChicagoWinter = new Date("2026-01-16T01:00:00Z");
// 6:00 PM Jun 11 2026 in Chicago (CDT, UTC-5) == 23:00 Jun 11 UTC
const eveningChicagoSummer = new Date("2026-06-11T23:00:00Z");
// 2:00 AM Jun 11 2026 in Chicago == 07:00 Jun 11 UTC
const earlyChicagoSummer = new Date("2026-06-11T07:00:00Z");

const roundTrip = parseISODate("2026-03-08"); // DST spring-forward day

console.log(
  JSON.stringify({
    tz: process.env.TZ ?? "(unset)",
    eveningWinterLocal: toISODateString(eveningChicagoWinter),
    eveningWinterUtcShifted: eveningChicagoWinter.toISOString().slice(0, 10),
    eveningSummerLocal: toISODateString(eveningChicagoSummer),
    earlySummerLocal: toISODateString(earlyChicagoSummer),
    roundTripKey: roundTrip ? toISODateString(roundTrip) : null,
    storageFromUs: toStorageDateString("03-08-2026"),
  }),
);
