import { Router } from 'express';
import multer from 'multer';
import { appConfig } from '../config.js';
import {
  guessContentType,
  listBlobs,
  uploadToBlob,
  buildBlobSas,
  createFolderBlob,
} from '../services/blobService.js';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

function sanitizeName(original: string): string {
  const trimmed = original.trim();
  return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '_');
}

export const filesRouter = Router();

function normaliseTargetPath(raw?: string): string {
  const base = appConfig.inputPrefix;
  if (!raw || typeof raw !== 'string') {
    return base;
  }
  const trimmed = raw.trim().replace(/\\/g, '/');
  const segments = trimmed
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..');
  const rebuilt = segments.join('/');
  const prefixed = rebuilt.startsWith(base) ? rebuilt : `${base}${rebuilt.replace(/^\//, '')}`;
  const normalised = prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
  if (!normalised.startsWith(base)) {
    return base;
  }
  return normalised;
}

filesRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, message: 'File is required' });
    }
    const targetPath = normaliseTargetPath(req.body?.path);
    const safeName = sanitizeName(file.originalname);
    if (!safeName) {
      return res.status(400).json({ ok: false, message: 'File name is invalid' });
    }
    const blobPath = `${targetPath}${safeName}`;
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
    const hierarchical = req.query.hierarchical === 'true';
    const blobs = await listBlobs(prefix, { hierarchical });
    res.json(hierarchical ? blobs : blobs.filter((blob) => blob.kind === 'file'));
  } catch (error) {
    next(error);
  }
});

filesRouter.post('/folder', async (req, res, next) => {
  try {
    const parent = normaliseTargetPath(req.body?.parent);
    const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!nameRaw) {
      return res.status(400).json({ ok: false, message: 'Folder name is required' });
    }
    const safe = sanitizeName(nameRaw).replace(/\.+$/, (match) => match.replace(/\./g, '_'));
    if (!safe) {
      return res.status(400).json({ ok: false, message: 'Folder name is invalid' });
    }
    const folderPath = `${parent}${safe}`;
    await createFolderBlob(folderPath);
    res.json({ ok: true, folder: `${folderPath}/` });
  } catch (error) {
    next(error);
  }
});
