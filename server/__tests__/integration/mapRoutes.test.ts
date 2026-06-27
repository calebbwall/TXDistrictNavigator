/**
 * Map boot-window regression suite.
 *
 * Guards the invariant that the map can NEVER serve blank districts:
 *   1. The simplified overlay endpoints always return a non-empty
 *      FeatureCollection OR a deliberate 503 — never an empty 200 (which the
 *      client treats as "validation failed" and escalates to the ~69 MB full
 *      file, the exact failure mode this suite exists to prevent).
 *   2. Point-in-district lookup and draw-to-search return correct results for a
 *      known central-Texas coordinate, proving the gated bindings are populated.
 *   3. The per-overlay cache never freezes an EMPTY collection: repeated lookups
 *      stay non-empty and stable.
 *   4. Input guards (missing coords, non-Polygon geometry, vertex cap) reject
 *      with 400 instead of crashing or returning bogus hits.
 *
 * These routes are file/CPU only (GeoJSON + turf); no DB is touched, so the
 * suite runs cleanly under the integration runner even without a populated
 * test database.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";
import {
  beginSuite,
  section,
  assert,
  assertEqual,
  startApp,
  api,
  type TestServer,
} from "./helpers";
import { registerMapRoutes } from "../../routes/mapRoutes";

const OVERLAY_ENDPOINTS = [
  "/api/geojson/tx_house",
  "/api/geojson/tx_senate",
  "/api/geojson/us_congress",
] as const;

// Downtown Austin — comfortably interior to a TX House, TX Senate, and US
// Congressional district, so a correct lookup must return one hit per overlay.
const AUSTIN = { lat: 30.2672, lng: -97.7431 };

// A ~0.2° box centered on Austin for draw-to-search.
const AUSTIN_BOX = {
  type: "Polygon" as const,
  coordinates: [
    [
      [AUSTIN.lng - 0.1, AUSTIN.lat - 0.1],
      [AUSTIN.lng + 0.1, AUSTIN.lat - 0.1],
      [AUSTIN.lng + 0.1, AUSTIN.lat + 0.1],
      [AUSTIN.lng - 0.1, AUSTIN.lat + 0.1],
      [AUSTIN.lng - 0.1, AUSTIN.lat - 0.1],
    ],
  ],
};

type FC = { type?: string; features?: unknown[] };

function isNonEmptyFC(body: unknown): boolean {
  const fc = body as FC;
  return (
    !!fc &&
    fc.type === "FeatureCollection" &&
    Array.isArray(fc.features) &&
    fc.features.length > 0
  );
}

async function testOverlaysNeverEmpty(server: TestServer): Promise<void> {
  section("overlay endpoints — non-empty FeatureCollection or 503, never empty 200");

  // Fire all three at once to mimic the client's concurrent boot load and the
  // brief window right after server start.
  const responses = await Promise.all(
    OVERLAY_ENDPOINTS.map((path) => api(server.url, "GET", path)),
  );

  responses.forEach((res, i) => {
    const path = OVERLAY_ENDPOINTS[i];
    // The forbidden state is an empty 200: a FeatureCollection with no
    // features served as success.
    const emptyOk =
      res.status === 200 &&
      (res.body as FC)?.type === "FeatureCollection" &&
      ((res.body as FC)?.features?.length ?? 0) === 0;
    assert(!emptyOk, `${path} never serves an empty 200 FeatureCollection`);

    assert(
      res.status === 200 || res.status === 503,
      `${path} returns 200 (data) or 503 (deliberate not-ready), got ${res.status}`,
    );

    if (res.status === 200) {
      assert(
        isNonEmptyFC(res.body),
        `${path} 200 body is a non-empty FeatureCollection`,
      );
    }
  });
}

async function testDistrictsAtPoint(server: TestServer): Promise<void> {
  section("districts-at-point — correct hits for a known Austin coordinate");

  const res = await api(server.url, "POST", "/api/lookup/districts-at-point", {
    body: AUSTIN,
  });
  assertEqual(res.status, 200, "Austin lookup → 200");

  const hits = (res.body as { hits?: { source: string; districtNumber: number }[] })
    ?.hits;
  assert(Array.isArray(hits), "response has a hits array");
  if (!Array.isArray(hits)) return;

  // Exact districts for downtown Austin (stable, verified against TLO/TxDOT
  // boundaries). Asserting the precise numbers — not just presence — catches a
  // silently corrupted or swapped overlay file that still happens to cover the
  // point.
  const EXPECTED_AUSTIN: Record<string, number> = {
    TX_HOUSE: 49,
    TX_SENATE: 14,
    US_HOUSE: 37,
  };
  const bySource = new Map<string, number[]>();
  for (const h of hits) {
    const arr = bySource.get(h.source) ?? [];
    arr.push(h.districtNumber);
    bySource.set(h.source, arr);
  }
  for (const [source, district] of Object.entries(EXPECTED_AUSTIN)) {
    const got = bySource.get(source) ?? [];
    assert(
      got.includes(district),
      `Austin point falls inside ${source} district ${district} (got ${JSON.stringify(got)})`,
    );
  }
  assert(
    hits.every(
      (h) => Number.isInteger(h.districtNumber) && h.districtNumber > 0,
    ),
    "every hit carries a positive integer district number",
  );

  // The per-overlay cache must not freeze an empty collection: a second
  // identical lookup must return the same non-empty result.
  const res2 = await api(server.url, "POST", "/api/lookup/districts-at-point", {
    body: AUSTIN,
  });
  const hits2 = (res2.body as { hits?: unknown[] })?.hits ?? [];
  assertEqual(
    (hits2 as unknown[]).length,
    hits.length,
    "repeated lookup is stable (cache never froze an empty collection)",
  );
}

async function testAreaHits(server: TestServer): Promise<void> {
  section("area-hits — draw-to-search returns hits for an Austin box");

  const res = await api(server.url, "POST", "/api/map/area-hits", {
    body: {
      geometry: AUSTIN_BOX,
      overlays: { house: true, senate: true, congress: true },
    },
  });
  assertEqual(res.status, 200, "Austin box area-hits → 200");

  const hits = (res.body as { hits?: unknown[] })?.hits ?? [];
  assert(
    Array.isArray(hits) && (hits as unknown[]).length > 0,
    "draw-to-search over Austin returns at least one district hit",
  );
}

async function testInputGuards(server: TestServer): Promise<void> {
  section("input guards — malformed requests reject with 400, never crash");

  const missingCoords = await api(
    server.url,
    "POST",
    "/api/lookup/districts-at-point",
    { body: { lat: "nope" } },
  );
  assertEqual(missingCoords.status, 400, "non-numeric lat/lng → 400");

  const badGeometry = await api(server.url, "POST", "/api/map/area-hits", {
    body: { geometry: { type: "Point", coordinates: [0, 0] }, overlays: {} },
  });
  assertEqual(badGeometry.status, 400, "non-Polygon geometry → 400");

  // Vertex cap (DoS guard): a ring with >1000 points must be rejected.
  const hugeRing = Array.from({ length: 1100 }, (_, i) => [
    AUSTIN.lng + i * 1e-5,
    AUSTIN.lat,
  ]);
  hugeRing.push(hugeRing[0]);
  const tooComplex = await api(server.url, "POST", "/api/map/area-hits", {
    body: {
      geometry: { type: "Polygon", coordinates: [hugeRing] },
      overlays: { house: true },
    },
  });
  assertEqual(tooComplex.status, 400, "polygon with >1000 vertices → 400");
}

function testSelfHostedLeaflet(): void {
  section("self-hosted Leaflet — vendored assets present, no CDN references");

  const root = process.cwd();

  // Vendored runtime assets must exist and be non-trivial. If these go missing
  // (or revert to a CDN), the map silently fails to render on a bad/firewalled
  // connection — the regression this vendoring exists to prevent.
  const vendorFiles = [
    "server/vendor/leaflet/leaflet.js",
    "server/vendor/leaflet/leaflet.css",
    "server/vendor/leaflet-draw/leaflet.draw.js",
    "server/vendor/leaflet-draw/leaflet.draw.css",
  ];
  for (const rel of vendorFiles) {
    const abs = resolve(root, rel);
    const ok = existsSync(abs) && statSync(abs).size > 1000;
    assert(ok, `vendored asset present and non-empty: ${rel}`);
  }

  // Neither the web iframe template nor the native WebView HTML may reference a
  // third-party CDN; both must load Leaflet from the self-hosted /vendor mount.
  const templates = [
    "server/templates/map.html",
    "client/screens/MapScreen.tsx",
  ];
  for (const rel of templates) {
    const src = readFileSync(resolve(root, rel), "utf8");
    assert(!src.includes("unpkg.com"), `${rel} has no unpkg CDN reference`);
    assert(
      !src.includes("cdn.jsdelivr"),
      `${rel} has no jsdelivr CDN reference`,
    );
    assert(
      src.includes("/vendor/leaflet"),
      `${rel} loads Leaflet from the self-hosted /vendor mount`,
    );
  }
}

export async function run(): Promise<void> {
  beginSuite("mapRoutes — boot-window / never-blank-districts");

  testSelfHostedLeaflet();

  const server = await startApp(registerMapRoutes);
  try {
    await testOverlaysNeverEmpty(server);
    await testDistrictsAtPoint(server);
    await testAreaHits(server);
    await testInputGuards(server);
  } finally {
    await server.close();
  }
}
