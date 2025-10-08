import { Router } from 'express';
import multer from 'multer';
import { appConfig } from '../config.js';
import { guessContentType, listBlobs, uploadToBlob, buildBlobSas } from '../services/blobService.js';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

function sanitizeName(original: string): string {
  return original.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const filesRouter = Router();

filesRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, message: 'File is required' });
    }
    const safeName = sanitizeName(file.originalname);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blobPath = `${appConfig.inputPrefix}${timestamp}__${safeName}`;
    const contentType = file.mimetype || guessContentType(file.originalname);
    await uploadToBlob(blobPath, file.buffer, contentType);
    const sasUrl = buildBlobSas(blobPath, 'r', appConfig.sasExpiryMinutes);
    return res.json({
      ok: true,
      fileName: blobPath,
      sasUrl,
      contentType,
    });
  } catch (error) {
    if ((error as Error).message.includes('File too large')) {
      return res.status(413).json({ ok: false, message: 'File exceeds 200MB limit' });
    }
    next(error);
  }
});

filesRouter.get('/list', async (req, res, next) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : appConfig.inputPrefix;
    const blobs = await listBlobs(prefix);
    res.json(blobs.filter((blob) => blob.kind === 'file'));
  } catch (error) {
    next(error);
  }
});
