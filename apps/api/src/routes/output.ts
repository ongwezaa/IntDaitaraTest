import { Router } from 'express';
import { appConfig } from '../config.js';
import { getBlobDownload, getBlobMeta, listBlobs, downloadTextBlob } from '../services/blobService.js';
import { isPreviewable } from '../services/previewService.js';

export const outputRouter = Router();

outputRouter.get('/list', async (req, res, next) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : appConfig.outputPrefix;
    const blobs = await listBlobs(prefix, { hierarchical: true });
    res.json(blobs);
  } catch (error) {
    next(error);
  }
});

outputRouter.get('/preview', async (req, res, next) => {
  try {
    const blob = typeof req.query.blob === 'string' ? req.query.blob : undefined;
    if (!blob) {
      return res.status(400).json({ ok: false, message: 'blob parameter is required' });
    }
    const meta = await getBlobMeta(blob);
    if (!isPreviewable(meta.contentType, meta.contentLength)) {
      return res.status(413).json({ ok: false, message: 'Blob too large or not previewable' });
    }
    const text = await downloadTextBlob(blob, 5 * 1024 * 1024);
    if (!text) {
      return res.status(413).json({ ok: false, message: 'Blob too large to preview' });
    }
    res.type(text.contentType).send(text.text);
  } catch (error) {
    next(error);
  }
});

outputRouter.get('/download', async (req, res, next) => {
  try {
    const blob = typeof req.query.blob === 'string' ? req.query.blob : undefined;
    if (!blob) {
      return res.status(400).json({ ok: false, message: 'blob parameter is required' });
    }
    const download = await getBlobDownload(blob);
    const stream = download.readableStreamBody;
    if (!stream) {
      return res.status(500).json({ ok: false, message: 'Unable to read blob stream' });
    }
    res.setHeader('Content-Type', download.contentType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${blob.split('/').pop() ?? 'file'}"`);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
