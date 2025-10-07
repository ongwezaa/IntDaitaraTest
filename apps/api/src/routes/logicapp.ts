import "../env.js";
import { Router } from "express";
import { ulid } from "ulid";
import { RunsRepository } from "../services/db.js";
import { getBlobSasUrl } from "../services/blob.js";
import { pollStatus, triggerRun } from "../services/logicapp.js";
import { RunRecord, RunStatus } from "../types.js";

const inputPrefix = process.env.INPUT_PREFIX ?? "input/";
const outputPrefix = process.env.OUTPUT_PREFIX ?? "output/";
const sasExpiry = parseInt(process.env.BLOB_SAS_EXPIRY_MINUTES ?? "30", 10);

export function createLogicAppRouter(repo: RunsRepository) {
  const router = Router();

  router.post("/trigger", async (req, res) => {
    try {
      const { fileName, parameters } = req.body ?? {};
      if (!fileName || typeof fileName !== "string") {
        return res
          .status(400)
          .json({ ok: false, message: "fileName is required" });
      }

      if (!fileName.startsWith(inputPrefix)) {
        return res.status(400).json({
          ok: false,
          message: `fileName must start with ${inputPrefix}`,
        });
      }

      const sasUrl = getBlobSasUrl(fileName, "r", sasExpiry);

      const triggerResult = await triggerRun({
        sasUrl,
        params: parameters && typeof parameters === "object" ? parameters : {},
      });

      const id = ulid();
      const now = new Date().toISOString();
      const status: RunStatus = triggerResult.location || triggerResult.trackingUrl
        ? "Running"
        : triggerResult.runId
        ? "Queued"
        : "Queued";

      const run: RunRecord = {
        id,
        fileName,
        fileUrl: sasUrl,
        logicRunId: triggerResult.runId ?? null,
        status,
        createdAt: now,
        updatedAt: now,
        outputPrefix: `${outputPrefix}${id}/`,
        trackingUrl: triggerResult.trackingUrl ?? null,
        location: triggerResult.location ?? null,
      };

      repo.create(run);

      return res.json({ run });
    } catch (error: any) {
      console.error("Trigger Logic App failed", error);
      return res.status(500).json({
        ok: false,
        message: error?.message ?? "Failed to trigger Logic App",
      });
    }
  });

  router.post("/:id/poll", async (req, res) => {
    try {
      const id = req.params.id;
      const run = repo.get(id);
      if (!run) {
        return res.status(404).json({ ok: false, message: "Run not found" });
      }

      const status = await pollStatus({
        runId: run.logicRunId,
        trackingUrl: run.trackingUrl,
        location: run.location,
      });

      const updated = repo.updateStatus(id, status, {});
      return res.json({ run: updated ?? run });
    } catch (error) {
      console.error("Poll run failed", error);
      return res.status(500).json({ ok: false, message: "Failed to poll run" });
    }
  });

  return router;
}
