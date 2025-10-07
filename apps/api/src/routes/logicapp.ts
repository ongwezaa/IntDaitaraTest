import { Router } from "express";
import { getBlobSasUrl } from "../services/blob.js";
import { env } from "../env.js";
import { triggerRun } from "../services/logicapp.js";
import { saveRun } from "../services/db.js";
import { RunRecord } from "../types.js";
import { ulid } from "ulid";

const router = Router();

router.post("/trigger", async (req, res, next) => {
  try {
    const { fileName, parameters } = req.body ?? {};
    if (!fileName || typeof fileName !== "string") {
      return res.status(400).json({ ok: false, message: "fileName is required" });
    }
    const extraParams = typeof parameters === "object" && parameters !== null ? parameters : {};

    const sasUrl = await getBlobSasUrl(fileName, "r", env.blobSasExpiryMinutes);
    const triggerResult = await triggerRun(sasUrl, extraParams);

    const id = ulid();
    const now = new Date().toISOString();
    const initialStatus =
      triggerResult.runId || triggerResult.trackingUrl || triggerResult.location
        ? "Running"
        : "Queued";

    const run: RunRecord = {
      id,
      fileName,
      fileUrl: sasUrl,
      logicRunId: triggerResult.runId ?? null,
      status: initialStatus,
      createdAt: now,
      updatedAt: now,
      outputPrefix: `${env.outputPrefix}${id}/`,
      trackingUrl: triggerResult.trackingUrl ?? null,
      location: triggerResult.location ?? null,
    };

    await saveRun(run);
    res.json(run);
  } catch (error) {
    next(error);
  }
});

export default router;
