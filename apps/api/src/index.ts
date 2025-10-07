import fs from "node:fs";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";
import type { ServeStaticOptions } from "serve-static";
import "./env.js";
import { createLogicAppRouter } from "./routes/logicapp.js";
import filesRouter from "./routes/files.js";
import { createRunsRouter } from "./routes/runs.js";
import { createOutputRouter } from "./routes/output.js";
import { RunsRepository } from "./services/db.js";

const port = parseInt(process.env.PORT ?? "4100", 10);
const allowedOrigins = [
  "http://localhost:4100",
  "http://localhost:5173",
  process.env.WEB_ORIGIN,
].filter(Boolean) as string[];

const app = express();
app.set("etag", false);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, origin ?? true);
      }
      return callback(null, false);
    },
    credentials: false,
  })
);
app.use(express.json({ limit: "5mb" }));

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

const runsStorePath = process.env.RUNS_DB_PATH ?? "./data/runs.json";
const runsRepo = new RunsRepository(runsStorePath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultWebRoot = path.resolve(__dirname, "../../web");
const webRoot = process.env.WEB_ROOT
  ? path.resolve(process.env.WEB_ROOT)
  : defaultWebRoot;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/files", filesRouter);
app.use("/api/logicapp", createLogicAppRouter(runsRepo));
app.use("/api/runs", createRunsRouter(runsRepo));
app.use("/api/output", createOutputRouter());

if (fs.existsSync(webRoot)) {
  console.log(`Serving frontend assets from ${webRoot}`);

  const noStoreHeaders: Record<string, string> = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  const sendPage = (res: express.Response, page: string) => {
    res.set(noStoreHeaders);
    res.sendFile(path.join(webRoot, page), { lastModified: false, headers: noStoreHeaders });
  };

  const staticOptions: ServeStaticOptions<ServerResponse> = {
    extensions: ["html"],
    redirect: false,
    setHeaders: (res: ServerResponse, filePath: string) => {
      if (filePath.endsWith(".html")) {
        for (const [key, value] of Object.entries(noStoreHeaders)) {
          res.setHeader(key, value);
        }
      }
    },
  };

  app.get(["/", "/index", "/index.html", "/index/"], (_req, res) => {
    sendPage(res, "index.html");
  });

  app.get(["/status", "/status.html", "/status/"], (_req, res) => {
    sendPage(res, "status.html");
  });

  app.get(["/output", "/output.html", "/output/"], (_req, res) => {
    sendPage(res, "output.html");
  });

  app.use("/web", express.static(webRoot, staticOptions));
  app.use(express.static(webRoot, staticOptions));
} else {
  console.warn(`Frontend assets directory not found at ${webRoot}`);
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error", err);
  res.status(500).json({ ok: false, message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
