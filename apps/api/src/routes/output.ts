import { Router } from "express";
import { env } from "../env.js";
import {
  getBlobProperties,
  listBlobs,
  openDownloadStream,
  streamText,
} from "../services/blob.js";
import { shouldPreview } from "../services/preview.js";

const router = Router();

router.get("/list", async (req, res, next) => {
  try {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : env.outputPrefix;
    const blobs = await listBlobs(prefix);
    res.json(blobs);
  } catch (error) {
    next(error);
  }
});

router.get("/preview", async (req, res, next) => {
  try {
    const blob = typeof req.query.blob === "string" ? req.query.blob : undefined;
    if (!blob) {
      return res.status(400).json({ ok: false, message: "blob parameter is required" });
    }
    const properties = await getBlobProperties(blob);
    if (!shouldPreview(properties.contentType, properties.contentLength)) {
      return res.status(413).json({ ok: false, message: "too large to preview" });
    }
    const text = await streamText(blob, properties.contentLength);
    res.setHeader("Content-Type", properties.contentType);
    res.send(text);
  } catch (error) {
    next(error);
  }
});

router.get("/download", async (req, res, next) => {
  try {
    const blob = typeof req.query.blob === "string" ? req.query.blob : undefined;
    if (!blob) {
      return res.status(400).json({ ok: false, message: "blob parameter is required" });
    }
    const properties = await getBlobProperties(blob);
    const stream = await openDownloadStream(blob);
    res.setHeader("Content-Type", properties.contentType);
    const fileName = blob.split("/").pop() ?? "download";
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
