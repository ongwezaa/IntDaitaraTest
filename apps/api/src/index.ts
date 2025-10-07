import express from "express";
import cors from "cors";
import path from "node:path";
import { env } from "./env.js";
import filesRouter from "./routes/files.js";
import logicRouter from "./routes/logicapp.js";
import runsRouter from "./routes/runs.js";
import outputRouter from "./routes/output.js";
import { ensureContainer } from "./services/blob.js";

const app = express();

app.disable("etag");

app.use(
  cors({
    origin: ["http://localhost:4100", "http://localhost:5173", "http://127.0.0.1:4100"],
    credentials: false,
  })
);
app.use(express.json({ limit: "5mb" }));

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/api/files", filesRouter);
app.use("/api/logicapp", logicRouter);
app.use("/api/runs", runsRouter);
app.use("/api/output", outputRouter);

const webRoot = env.webRoot;
const staticOptions = {
  extensions: ["html"],
  setHeaders(res: express.Response) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  },
};

app.use("/web", express.static(webRoot, staticOptions));
app.use("/css", express.static(path.join(webRoot, "css"), staticOptions));
app.use("/js", express.static(path.join(webRoot, "js"), staticOptions));
app.use(express.static(webRoot, staticOptions));

const sendHtml = (file: string) => (
  _req: express.Request,
  res: express.Response
) => {
  res.status(200);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.sendFile(path.join(webRoot, file));
};

app.get(["/", "/index", "/index.html"], sendHtml("index.html"));
app.get(["/status", "/status.html"], sendHtml("status.html"));
app.get(["/output", "/output.html"], sendHtml("output.html"));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ ok: false, message: "Internal server error" });
});

const start = async () => {
  try {
    await ensureContainer();
  } catch (error) {
    console.error("Failed to ensure container", error);
  }

  const server = app.listen(env.port, () => {
    console.log(`API server listening on port ${env.port}`);
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
};

start();
