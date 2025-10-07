import { Router } from "express";
import { getRun, listRuns, saveRun } from "../services/db.js";
import { pollStatus } from "../services/logicapp.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const runs = await listRuns();
    res.json(runs);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const run = await getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, message: "Run not found" });
    }
    res.json(run);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/poll", async (req, res, next) => {
  try {
    const run = await getRun(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, message: "Run not found" });
    }
    const poll = await pollStatus({
      runId: run.logicRunId,
      trackingUrl: run.trackingUrl,
      location: run.location,
    });
    run.status = poll.status;
    run.updatedAt = new Date().toISOString();
    await saveRun(run);
    res.json(run);
  } catch (error) {
    next(error);
  }
});

export default router;
