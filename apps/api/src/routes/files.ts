import "../env.js";
import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  getBlobSasUrl,
  guessContentType,
  listBlobs,
  uploadBlob,
} from "../services/blob.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const inputPrefix = process.env.INPUT_PREFIX ?? "input/";
const sasExpiry = parseInt(process.env.BLOB_SAS_EXPIRY_MINUTES ?? "30", 10);
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, message: "File is required" });
    }

    if (file.size > MAX_FILE_SIZE) {
      return res.status(413).json({
        ok: false,
        message: "File too large. Maximum size is 200 MB.",
      });
    }

    const original = path.basename(file.originalname).replace(/[^a-zA-Z0-9_.-]/g, "_");
    const blobName = `${inputPrefix}${Date.now()}__${original}`;
    const contentType = file.mimetype || guessContentType(original);

    await uploadBlob(file.buffer, contentType, blobName);

    const sasUrl = getBlobSasUrl(blobName, "r", sasExpiry);

    return res.json({
      ok: true,
      fileName: blobName,
      sasUrl,
      contentType,
    });
  } catch (error) {
    console.error("Upload failed", error);
    return res.status(500).json({ ok: false, message: "Upload failed" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const prefix = (req.query.prefix as string) ?? inputPrefix;
    const blobs = await listBlobs(prefix);
    return res.json(blobs);
  } catch (error) {
    console.error("List blobs failed", error);
    return res.status(500).json({ ok: false, message: "Failed to list blobs" });
  }
});

export default router;
