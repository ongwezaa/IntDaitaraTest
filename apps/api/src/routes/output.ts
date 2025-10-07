import "../env.js";
import { Router } from "express";
import { getContainerClient, listBlobs, streamTextBlob } from "../services/blob.js";
import { shouldPreview } from "../services/preview.js";

const outputPrefix = process.env.OUTPUT_PREFIX ?? "output/";

export function createOutputRouter() {
  const router = Router();

  router.get("/list", async (req, res) => {
    try {
      const prefix = (req.query.prefix as string) ?? outputPrefix;
      const blobs = await listBlobs(prefix);
      return res.json(blobs);
    } catch (error) {
      console.error("List output failed", error);
      return res.status(500).json({ ok: false, message: "Failed to list output" });
    }
  });

  router.get("/preview", async (req, res) => {
    try {
      const blobPath = req.query.blob as string;
      if (!blobPath) {
        return res.status(400).json({ ok: false, message: "blob query is required" });
      }
      const client = getContainerClient().getBlobClient(blobPath);
      const props = await client.getProperties();
      const contentType = props.contentType ?? "application/octet-stream";
      const size = props.contentLength ?? 0;

      if (!shouldPreview(contentType, size)) {
        return res
          .status(413)
          .json({ ok: false, message: "too large to preview" });
      }

      let text: string;
      try {
        text = await streamTextBlob(blobPath, 5 * 1024 * 1024);
      } catch (err: any) {
        return res
          .status(413)
          .json({ ok: false, message: "too large to preview" });
      }
      res.setHeader("Content-Type", contentType);
      return res.send(text);
    } catch (error) {
      console.error("Preview failed", error);
      return res.status(500).json({ ok: false, message: "Failed to preview blob" });
    }
  });

  router.get("/download", async (req, res) => {
    try {
      const blobPath = req.query.blob as string;
      if (!blobPath) {
        return res.status(400).json({ ok: false, message: "blob query is required" });
      }
      const client = getContainerClient().getBlobClient(blobPath);
      const props = await client.getProperties();
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(blobPath.split("/").pop() || "download")}"`
      );
      if (props.contentType) {
        res.setHeader("Content-Type", props.contentType);
      }
      const download = await client.download();
      download.readableStreamBody?.pipe(res);
    } catch (error) {
      console.error("Download failed", error);
      return res.status(500).json({ ok: false, message: "Failed to download blob" });
    }
  });

  return router;
}
