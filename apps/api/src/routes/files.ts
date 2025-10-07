import { Router } from "express";
import multer from "multer";
import { env } from "../env.js";
import { guessContentType, uploadBuffer, getBlobSasUrl, listBlobs } from "../services/blob.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "-");

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, message: "File is required" });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "");
    const safeName = sanitizeName(file.originalname);
    const blobName = `${env.inputPrefix}${timestamp}__${safeName}`;
    const contentType = guessContentType(file.originalname);

    await uploadBuffer(file.buffer, contentType, blobName);
    const sasUrl = await getBlobSasUrl(blobName, "r", env.blobSasExpiryMinutes);

    res.json({
      ok: true,
      fileName: blobName,
      sasUrl,
      contentType,
    });
  } catch (error) {
    if ((error as multer.MulterError).code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, message: "File too large" });
    }
    next(error);
  }
});

router.get("/list", async (req, res, next) => {
  try {
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix : env.inputPrefix;
    const blobs = await listBlobs(prefix);
    res.json(blobs);
  } catch (error) {
    next(error);
  }
});

export default router;
