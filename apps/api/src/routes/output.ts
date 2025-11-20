import { Router } from 'express';
import { appConfig } from '../config.js';
import { getBlobDownload, getBlobMeta, listBlobs, downloadTextBlob, streamPrefixAsZip } from '../services/blobService.js';
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
    const lowerPath = blob.toLowerCase();
    const extension = lowerPath.includes('.') ? lowerPath.slice(lowerPath.lastIndexOf('.') + 1) : '';
    const textExtensions = new Set(['sql', 'txt', 'json', 'csv', 'tsv', 'xml', 'log']);
    const sizeLimit = 10 * 1024 * 1024;
    const allowByExtension = textExtensions.has(extension) && meta.contentLength <= sizeLimit;
    if (!isPreviewable(meta.contentType, meta.contentLength, sizeLimit) && !allowByExtension) {
      return res.status(413).json({ ok: false, message: 'Blob too large or not previewable' });
    }
    const text = await downloadTextBlob(blob, sizeLimit);
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

outputRouter.get('/download-zip', async (req, res, next) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : appConfig.outputPrefix;
    const { stream, fileCount } = await streamPrefixAsZip(prefix);
    if (fileCount === 0) {
      return res.status(404).json({ ok: false, message: 'No files found for this path' });
    }
    if (!stream) {
      return res.status(500).json({ ok: false, message: 'Unable to create archive stream' });
    }
    const trimmed = prefix.replace(/\/$/, '');
    const lastSegment = trimmed.split('/').filter(Boolean).pop() || 'output';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${lastSegment}-files.zip"`);
    stream.on('error', (error) => {
      if (!res.headersSent) {
        next(error);
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
