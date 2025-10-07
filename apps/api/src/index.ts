import cors from "cors";
import express from "express";
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

const runsStorePath = process.env.RUNS_DB_PATH ?? "./data/runs.json";
const runsRepo = new RunsRepository(runsStorePath);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/files", filesRouter);
app.use("/api/logicapp", createLogicAppRouter(runsRepo));
app.use("/api/runs", createRunsRouter(runsRepo));
app.use("/api/output", createOutputRouter());

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error", err);
  res.status(500).json({ ok: false, message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
