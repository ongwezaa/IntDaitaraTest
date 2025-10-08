import { Router } from 'express';
import multer from 'multer';
import { appConfig } from '../config.js';
import {
  guessContentType,
  listBlobs,
  uploadToBlob,
  buildBlobSas,
  createFolderBlob,
  deleteBlobPath,
  renameBlobPath,
} from '../services/blobService.js';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

function sanitizeName(original: string): string {
  const trimmed = original.trim();
  return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '_');
}

export const filesRouter = Router();

function ensureWithinInput(raw?: string): string {
  const base = appConfig.inputPrefix.endsWith('/') ? appConfig.inputPrefix : `${appConfig.inputPrefix}/`;
  const baseNoSlash = base.replace(/\/$/, '');
  if (!raw || typeof raw !== 'string') {
    return base;
  }
  let value = raw.trim().replace(/\\/g, '/');
  if (!value) {
    return base;
  }
  value = value.replace(/\/{2,}/g, '/');
  if (value.startsWith(base)) {
    return value;
  }
  if (value.startsWith(baseNoSlash)) {
    const remainder = value.slice(baseNoSlash.length).replace(/^\//, '');
    return remainder ? `${base}${remainder}` : base;
  }
  const stripped = value.replace(/^\/+/, '');
  return `${base}${stripped}`;
}

function normaliseTargetPath(raw?: string): string {
  const within = ensureWithinInput(raw);
  return within.endsWith('/') ? within : `${within}/`;
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

filesRouter.post('/rename', async (req, res, next) => {
  try {
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    const rawName = typeof req.body?.newName === 'string' ? req.body.newName.trim() : '';
    if (!rawPath) {
      return res.status(400).json({ ok: false, message: 'Path is required' });
    }
    if (!rawName) {
      return res.status(400).json({ ok: false, message: 'New name is required' });
    }
    const safeName = sanitizeName(rawName);
    if (!safeName) {
      return res.status(400).json({ ok: false, message: 'New name is invalid' });
    }
    const isFolder = rawPath.endsWith('/');
    const sourcePath = isFolder ? normaliseTargetPath(rawPath) : ensureWithinInput(rawPath);
    if (sourcePath === appConfig.inputPrefix) {
      return res.status(400).json({ ok: false, message: 'Cannot rename the root input directory' });
    }
    const parentPath = (() => {
      if (isFolder) {
        const trimmed = sourcePath.replace(/\/$/, '');
        const lastSlash = trimmed.lastIndexOf('/');
        if (lastSlash === -1) {
          return appConfig.inputPrefix;
        }
        return `${trimmed.slice(0, lastSlash + 1)}`;
      }
      const lastSlash = sourcePath.lastIndexOf('/');
      if (lastSlash === -1) {
        return appConfig.inputPrefix;
      }
      return sourcePath.slice(0, lastSlash + 1);
    })();
    const targetPath = isFolder
      ? `${parentPath}${safeName}/`
      : `${parentPath}${safeName}`;
    if (targetPath === sourcePath) {
      return res.json({ ok: true, path: targetPath });
    }
    await renameBlobPath(sourcePath, targetPath);
    res.json({ ok: true, path: targetPath });
  } catch (error) {
    next(error);
  }
});

filesRouter.post('/delete', async (req, res, next) => {
  try {
    const rawPath = typeof req.body?.path === 'string' ? req.body.path : '';
    if (!rawPath) {
      return res.status(400).json({ ok: false, message: 'Path is required' });
    }
    const isFolder = rawPath.endsWith('/');
    const targetPath = isFolder ? normaliseTargetPath(rawPath) : ensureWithinInput(rawPath);
    if (targetPath === appConfig.inputPrefix) {
      return res.status(400).json({ ok: false, message: 'Cannot delete the root input directory' });
    }
    await deleteBlobPath(targetPath);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
