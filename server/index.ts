import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { db } from "./db";
import { alerts } from "@shared/schema";
import { and, eq, like } from "drizzle-orm";
const app = express();

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
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
      res.header("Access-Control-Allow-Headers", "Content-Type");
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

  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "";
  const requestBaseUrl = `${protocol}://${host}`;
  const hostWithoutProtocol = host;

  if (manifest.launchAsset?.url) {
    manifest.launchAsset.url = rebaseUrl(manifest.launchAsset.url, requestBaseUrl);
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
    manifest.extra.expoClient.iconUrl = rebaseUrl(manifest.extra.expoClient.iconUrl, requestBaseUrl);
  }

  if (manifest.extra?.expoClient?.android?.adaptiveIcon) {
    const icon = manifest.extra.expoClient.android.adaptiveIcon;
    for (const key of ["foregroundImageUrl", "monochromeImageUrl", "backgroundImageUrl"]) {
      if (icon[key]) {
        icon[key] = rebaseUrl(icon[key], requestBaseUrl);
      }
    }
  }

  console.log(`[Manifest] Serving ${platform} manifest with baseUrl: ${requestBaseUrl}`);
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
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
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
      .where(and(eq(alerts.alertType, "RSS_ITEM"), like(alerts.body, "Page content updated%")))
      .returning({ id: alerts.id });
    bootstrapAlertsCleaned = true;
    if (result.length > 0) {
      console.log(`[Startup] Cleaned up ${result.length} false-positive RSS bootstrap alert(s)`);
    }
  } catch (err) {
    console.error("[Startup] Alert cleanup failed:", err);
  }
}

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  await cleanupBootstrapAlerts();

  let server: import("node:http").Server;
  try {
    server = await registerRoutes(app);
  } catch (err) {
    console.error("[Startup] registerRoutes() failed — server cannot start:", err);
    process.exit(1);
  }

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      console.log(`express server serving on port ${port}`);
    },
  );

  if (process.env.NODE_ENV === "development") {
    // Replit web preview expects the Expo manifest on port 8081 (the Metro bundler port).
    // Since we serve static builds (no Metro), we mirror the main app here so manifest
    // requests from the Expo Go app work on the Replit dev domain.
    const EXPO_PORT = 8081;
    const expoServer = http.createServer((req, res) => {
      app(req as any, res as any);
    });
    expoServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(`[ExpoServer] Port ${EXPO_PORT} in use (Metro running?), will retry in 5s...`);
        setTimeout(() => {
          expoServer.close();
          expoServer.listen({ port: EXPO_PORT, host: "0.0.0.0" });
        }, 5000);
      }
    });
    expoServer.listen({ port: EXPO_PORT, host: "0.0.0.0" }, () => {
      console.log(`[ExpoServer] Serving static Expo manifests on port ${EXPO_PORT}`);
    });
  }

})();
