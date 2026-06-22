import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import * as zlib from "node:zlib";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "node:child_process";
import { db } from "./db";
import { alerts } from "@shared/schema";
import { and, eq, like } from "drizzle-orm";

// Apply Drizzle schema at startup so any direct entry point (npm run dev,
// tsx, etc.) cannot serve traffic on a drifted schema. Fail-fast on error.
// Skip with SKIP_STARTUP_DB_PUSH=1.
function applySchemaMigrations(): Promise<void> {
  return new Promise((resolve) => {
    if (process.env.SKIP_STARTUP_DB_PUSH === "1") {
      console.log(
        "[Startup] SKIP_STARTUP_DB_PUSH=1 — skipping drizzle-kit push",
      );
      return resolve();
    }
    console.log(
      "[Startup] Applying Drizzle schema (drizzle-kit push --force)...",
    );
    const t0 = Date.now();
    const child = spawn("npx", ["drizzle-kit", "push", "--force"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.on("close", (code: number | null) => {
      const ms = Date.now() - t0;
      if (code === 0) {
        console.log(
          `[Startup] Schema push OK (${ms}ms): ${out.split("\n").filter(Boolean).slice(-3).join(" | ")}`,
        );
        resolve();
      } else {
        // Fail-fast: any startup path (npm run dev, tsx server/index.ts, etc.)
        // must refuse to serve traffic on a drifted schema. Set
        // SKIP_STARTUP_DB_PUSH=1 to opt out (e.g., for tests).
        console.error(
          `[Startup] Schema push FAILED (exit=${code}, ${ms}ms):\n${out}`,
        );
        process.exit(1);
      }
    });
    child.on("error", (err) => {
      console.error("[Startup] Could not spawn drizzle-kit:", err);
      process.exit(1);
    });
  });
}
const app = express();

// ── Process-level safety nets ──
// Without these, a single rejected promise inside a background job (RSS poll,
// daily refresh, hometown scrape, etc.) terminates the Node process and brings
// the whole server down. Log loudly and keep running — the HTTP listener and
// other jobs should be unaffected by a single async failure.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process] Unhandled promise rejection:", reason);
  if (promise) {
    console.error("[Process] Promise:", promise);
  }
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception (server staying up):", err);
});

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Generic comma-separated full origins, e.g. https://myapp.up.railway.app
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(",").forEach((o: string) => {
        origins.add(o.trim());
      });
    }

    // Legacy Replit env vars — kept so the app keeps working during migration
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d: string) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-user-token, x-admin-token, x-admin-secret",
      );
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(express.json());

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      const maxLen = process.env.NODE_ENV === "development" ? 500 : 200;
      if (logLine.length > maxLen) {
        logLine = logLine.slice(0, maxLen - 1) + "…";
      }

      console.log(logLine);
    });

    next();
  });
}

function setupCompression(app: express.Application) {
  // Dependency-free gzip for JSON responses. Every large payload (GeoJSON
  // layers, the officials roster, legislative lists) is emitted via res.json,
  // so wrapping res.json is sufficient — there is no need to intercept the raw
  // response stream. Compression runs asynchronously so gzipping a multi-MB
  // GeoJSON body never blocks the event loop, and only kicks in above a small
  // size threshold to avoid overhead on tiny responses.
  const MIN_GZIP_BYTES = 1024;
  app.use((req: Request, res: Response, next: NextFunction) => {
    const accept = String(req.headers["accept-encoding"] || "");
    if (!/\bgzip\b/.test(accept)) return next();

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      try {
        if (res.headersSent || res.getHeader("Content-Encoding")) {
          return originalJson(body);
        }
        const json = JSON.stringify(body);
        if (Buffer.byteLength(json) < MIN_GZIP_BYTES) {
          return originalJson(body);
        }
        zlib.gzip(json, (err, compressed) => {
          if (err || res.writableEnded || res.headersSent) {
            if (!err && !res.writableEnded && !res.headersSent) {
              originalJson(body);
            }
            return;
          }
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Content-Encoding", "gzip");
          res.setHeader("Content-Length", compressed.length);
          res.setHeader("Vary", "Accept-Encoding");
          res.removeHeader("ETag");
          res.end(compressed);
        });
        return res;
      } catch {
        return originalJson(body);
      }
    } as typeof res.json;

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

// x-forwarded-proto / x-forwarded-host are attacker-controllable request
// headers. They are interpolated into served HTML (landing page) and JSON
// (manifest URLs), so restrict them to a strict charset before use — a value
// failing validation falls back to a safe default. This closes a reflected
// XSS hole without needing per-context escaping.
function sanitizeProto(proto: string | undefined, fallback: string): string {
  return proto === "http" || proto === "https" ? proto : fallback;
}

function sanitizeHost(host: string | undefined, fallback: string): string {
  if (host && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return host;
  return fallback;
}

function rebaseUrl(url: string, baseUrl: string): string {
  // Works for both absolute URLs and relative paths (e.g. "./bundles/ios-xxx.js")
  try {
    const parsed = new URL(url, baseUrl);
    return `${baseUrl}${parsed.pathname}`;
  } catch {
    // If URL is already a bare path, prepend base
    const pathname = url.startsWith("/") ? url : `/${url}`;
    return `${baseUrl}${pathname}`;
  }
}

function serveExpoManifest(platform: string, req: Request, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const protocol = sanitizeProto(
    req.header("x-forwarded-proto"),
    req.protocol || "https",
  );
  const host = sanitizeHost(
    req.header("x-forwarded-host"),
    sanitizeHost(req.get("host"), ""),
  );
  const requestBaseUrl = `${protocol}://${host}`;
  const hostWithoutProtocol = host;

  if (manifest.launchAsset?.url) {
    manifest.launchAsset.url = rebaseUrl(
      manifest.launchAsset.url,
      requestBaseUrl,
    );
  }

  if (manifest.assets) {
    manifest.assets.forEach((asset: { url?: string }) => {
      if (asset.url) {
        asset.url = rebaseUrl(asset.url, requestBaseUrl);
      }
    });
  }

  if (manifest.extra?.expoClient) {
    manifest.extra.expoClient.hostUri = `${hostWithoutProtocol}/${platform}`;
  }
  if (manifest.extra?.expoGo) {
    manifest.extra.expoGo.debuggerHost = `${hostWithoutProtocol}/${platform}`;
  }

  if (manifest.extra?.expoClient?.iconUrl) {
    manifest.extra.expoClient.iconUrl = rebaseUrl(
      manifest.extra.expoClient.iconUrl,
      requestBaseUrl,
    );
  }

  if (manifest.extra?.expoClient?.android?.adaptiveIcon) {
    const icon = manifest.extra.expoClient.android.adaptiveIcon;
    for (const key of [
      "foregroundImageUrl",
      "monochromeImageUrl",
      "backgroundImageUrl",
    ]) {
      if (icon[key]) {
        icon[key] = rebaseUrl(icon[key], requestBaseUrl);
      }
    }
  }

  console.log(
    `[Manifest] Serving ${platform} manifest with baseUrl: ${requestBaseUrl}`,
  );
  res.json(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const protocol = sanitizeProto(
    req.header("x-forwarded-proto"),
    req.protocol || "https",
  );
  const host = sanitizeHost(
    req.header("x-forwarded-host"),
    sanitizeHost(req.get("host"), ""),
  );
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  console.log(`baseUrl`, baseUrl);
  console.log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  console.log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      try {
        return serveExpoManifest(platform, req, res);
      } catch (manifestErr) {
        console.log("[Manifest] Error serving manifest:", manifestErr);
        return res.status(500).json({ error: "Failed to serve manifest" });
      }
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  console.log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });

    // Log the error for observability without re-throwing.  Re-throwing after
    // res.json() has already been called causes a double-fault: Express catches
    // it again, tries to write a second response (which Node silently drops),
    // and the original error stack is lost in the noise.
    console.error("[Error]", err);
  });
}

let bootstrapAlertsCleaned = false;

async function cleanupBootstrapAlerts(): Promise<void> {
  if (bootstrapAlertsCleaned) return;
  try {
    const result = await db
      .delete(alerts)
      .where(
        and(
          eq(alerts.alertType, "RSS_ITEM"),
          like(alerts.body, "Page content updated%"),
        ),
      )
      .returning({ id: alerts.id });
    bootstrapAlertsCleaned = true;
    if (result.length > 0) {
      console.log(
        `[Startup] Cleaned up ${result.length} false-positive RSS bootstrap alert(s)`,
      );
    }
  } catch (err) {
    console.error("[Startup] Alert cleanup failed:", err);
  }
}

// Register /status synchronously BEFORE listen so deployment health checks
// (autoscale, VM) get HTTP 200 immediately — even before async init completes.
app.get("/status", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Bind port synchronously at module load — before any async work.
// This satisfies Replit's waitForPort immediately so the preview loads
// regardless of how long async initialization (DB, routes) takes.
const port = parseInt(process.env.PORT || "8081", 10);
const server = createServer(app);
server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
  console.log(`express server serving on port ${port}`);
});

(async () => {
  try {
    // Verify the runtime correctly reports America/Chicago offsets.
    // If TZ is not set on the production server, naive `new Date(localString)`
    // calls may treat wall-clock times as UTC, causing a 5–6 hour shift.
    const tzCheck = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    })
      .formatToParts(new Date("2025-06-01T15:00:00Z"))
      .find((p) => p.type === "hour");
    const chicagoHour = tzCheck ? parseInt(tzCheck.value, 10) : -1;
    if (chicagoHour !== 10) {
      console.warn(
        `[Startup] TZ WARNING: America/Chicago offset check failed (expected hour=10 for 15:00 UTC in CDT, got ${chicagoHour}). ` +
          "Ensure TZ=America/Chicago is set in the production environment.",
      );
    } else {
      console.log(
        "[Startup] Timezone check passed (America/Chicago CDT offset correct)",
      );
    }

    setupCors(app);
    setupBodyParsing(app);
    setupRequestLogging(app);
    setupCompression(app);

    configureExpoAndLanding(app);
    // Run schema migrations BEFORE registerRoutes (which starts the schedulers
    // that issue queries against the schema). HTTP listener is already bound,
    // so /status returns 200 throughout.
    await applySchemaMigrations();
    await registerRoutes(app);
    setupErrorHandler(app);
    await cleanupBootstrapAlerts();
    console.log("[Startup] Initialization complete");
  } catch (err) {
    console.error(
      "[FATAL] Startup error (server still running on port " + port + "):",
      err,
    );
  }
})();
