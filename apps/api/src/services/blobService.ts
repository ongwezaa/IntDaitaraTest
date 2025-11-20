import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  BlobDownloadResponseParsed,
} from '@azure/storage-blob';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import mime from 'mime-types';
import { appConfig } from '../config.js';
import { ListBlobItem } from '../types.js';

const FOLDER_PLACEHOLDER = '.daitara-folder';

const credential = new StorageSharedKeyCredential(appConfig.storageAccount, appConfig.storageKey);
const blobService = new BlobServiceClient(`https://${appConfig.storageAccount}.blob.core.windows.net`, credential);

function getContainer(): ContainerClient {
  return blobService.getContainerClient(appConfig.container);
}

export async function uploadToBlob(blobPath: string, buffer: Buffer, contentType: string): Promise<void> {
  const container = getContainer();
  const blockBlob = container.getBlockBlobClient(blobPath);
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType,
    },
  });
}

export async function createFolderBlob(folderPath: string): Promise<void> {
  const normalised = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  const container = getContainer();
  const blobClient = container.getBlockBlobClient(`${normalised}${FOLDER_PLACEHOLDER}`);
  await blobClient.uploadData(Buffer.alloc(0), {
    blobHTTPHeaders: {
      blobContentType: 'application/x-directory',
    },
  });
}

async function copyBlob(sourcePath: string, targetPath: string): Promise<void> {
  const container = getContainer();
  const sourceClient = container.getBlobClient(sourcePath);
  const exists = await sourceClient.exists();
  if (!exists) {
    throw new Error('Source blob not found');
  }
  const targetClient = container.getBlockBlobClient(targetPath);
  const sasUrl = buildBlobSas(sourcePath, 'r', 10);
  await targetClient.syncCopyFromURL(sasUrl);
  await sourceClient.delete();
}

export async function deleteBlobPath(path: string): Promise<void> {
  const container = getContainer();
  if (path.endsWith('/')) {
    const prefix = normalisePrefix(path);
    for await (const blob of container.listBlobsFlat({ prefix })) {
      if (!blob.name) continue;
      const client = container.getBlobClient(blob.name);
      await client.deleteIfExists();
    }
    const placeholderClient = container.getBlobClient(`${prefix}${FOLDER_PLACEHOLDER}`);
    await placeholderClient.deleteIfExists();
    return;
  }
  const blobClient = container.getBlobClient(path);
  await blobClient.deleteIfExists();
}

export async function renameBlobPath(sourcePath: string, targetPath: string): Promise<void> {
  const container = getContainer();
  if (sourcePath.endsWith('/') && targetPath.endsWith('/')) {
    const sourcePrefix = normalisePrefix(sourcePath);
    const targetPrefix = normalisePrefix(targetPath);
    if (targetPrefix.startsWith(sourcePrefix)) {
      throw new Error('Cannot move folder into its own child');
    }
    const items: string[] = [];
    for await (const blob of container.listBlobsFlat({ prefix: sourcePrefix })) {
      if (!blob.name) continue;
      items.push(blob.name);
    }
    for (const name of items) {
      const relative = name.slice(sourcePrefix.length);
      const destination = `${targetPrefix}${relative}`;
      await copyBlob(name, destination);
    }
    return;
  }
  if (sourcePath.endsWith('/') !== targetPath.endsWith('/')) {
    throw new Error('Cannot change between folder and file paths');
  }
  await copyBlob(sourcePath, targetPath);
}

interface ListOptions {
  hierarchical?: boolean;
}

function normalisePrefix(prefix: string): string {
  if (!prefix) {
    return '';
  }
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export async function listBlobs(prefix: string, options: ListOptions = {}): Promise<ListBlobItem[]> {
  const container = getContainer();
  const results: ListBlobItem[] = [];
  const hierarchical = options.hierarchical ?? false;
  const normalisedPrefix = normalisePrefix(prefix);
  const folderSet = new Set<string>();

  for await (const item of container.listBlobsFlat({ prefix })) {
    if (!item.name) continue;
    if (item.name.endsWith(`/${FOLDER_PLACEHOLDER}`)) {
      const folderName = item.name.slice(0, -FOLDER_PLACEHOLDER.length - 1);
      if (normalisedPrefix && !folderName.startsWith(normalisedPrefix)) {
        continue;
      }
      const relativeName = normalisedPrefix ? folderName.slice(normalisedPrefix.length) : folderName;
      if (!relativeName) {
        continue;
      }
      if (relativeName.includes('/')) {
        continue;
      }
      const fullPath = `${folderName}/`;
      if (fullPath === normalisedPrefix) {
        continue;
      }
      const displayName = relativeName.split('/').pop() ?? relativeName;
      if (!folderSet.has(fullPath)) {
        folderSet.add(fullPath);
        results.push({
          name: fullPath,
          displayName,
          kind: 'folder',
        });
      }
      continue;
    }
    if (!hierarchical) {
      results.push({
        name: item.name,
        displayName: item.name,
        kind: 'file',
        size: item.properties.contentLength ?? 0,
        lastModified: item.properties.lastModified?.toISOString() ?? undefined,
        contentType: item.properties.contentType ?? undefined,
      });
      continue;
    }

    const relative = normalisedPrefix ? item.name.slice(normalisedPrefix.length) : item.name;
    if (!relative) {
      continue;
    }

    const parts = relative.split('/');
    if (parts.length > 1) {
      const folderPath = `${normalisedPrefix}${parts[0]}/`;
      if (!folderSet.has(folderPath)) {
        folderSet.add(folderPath);
        results.push({
          name: folderPath,
          displayName: parts[0],
          kind: 'folder',
        });
      }
      continue;
    }

    results.push({
      name: item.name,
      displayName: parts[0],
      kind: 'file',
      size: item.properties.contentLength ?? 0,
      lastModified: item.properties.lastModified?.toISOString() ?? undefined,
      contentType: item.properties.contentType ?? undefined,
    });
  }

  results.sort((a, b) => {
    if (a.kind === b.kind) {
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    }
    return a.kind === 'folder' ? -1 : 1;
  });

  return results;
}

export function guessContentType(name: string): string {
  return mime.lookup(name) || 'application/octet-stream';
}

export function buildBlobSas(blobPath: string, permissions: string, expiresInMinutes: number): string {
  const parsedPermissions = BlobSASPermissions.parse(permissions);
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: appConfig.container,
      blobName: blobPath,
      permissions: parsedPermissions,
      startsOn,
      expiresOn,
    },
    credential,
  );
  const container = getContainer();
  const blobClient = container.getBlobClient(blobPath);
  return `${blobClient.url}?${sas.toString()}`;
}

export async function getBlobMeta(blobPath: string) {
  const container = getContainer();
  const blobClient = container.getBlobClient(blobPath);
  const properties = await blobClient.getProperties();
  return {
    contentLength: properties.contentLength ?? 0,
    contentType: properties.contentType ?? 'application/octet-stream',
  };
}

export async function downloadTextBlob(blobPath: string, maxBytes: number): Promise<{ contentType: string; text: string } | null> {
  const container = getContainer();
  const blobClient = container.getBlobClient(blobPath);
  const props = await blobClient.getProperties();
  if ((props.contentLength ?? 0) > maxBytes) {
    return null;
  }
  const download = await blobClient.download();
  const chunks: Buffer[] = [];
  for await (const chunk of download.readableStreamBody ?? new PassThrough()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return {
    contentType: props.contentType ?? 'text/plain',
    text: Buffer.concat(chunks).toString('utf-8'),
  };
}

export async function getBlobDownload(blobPath: string): Promise<BlobDownloadResponseParsed> {
  const container = getContainer();
  const blobClient = container.getBlobClient(blobPath);
  return blobClient.download();
}

export async function streamPrefixAsZip(prefix: string): Promise<{ stream: NodeJS.ReadableStream | null; fileCount: number }> {
  const container = getContainer();
  const normalisedPrefix = normalisePrefix(prefix);
  const workingDir = await mkdtemp(path.join(tmpdir(), 'daitara-output-'));
  let fileCount = 0;

  const cleanup = () => rm(workingDir, { recursive: true, force: true }).catch(() => {});

  try {
    for await (const blob of container.listBlobsFlat({ prefix: normalisedPrefix })) {
      if (!blob.name || blob.name.endsWith(`/${FOLDER_PLACEHOLDER}`)) {
        continue;
      }
      const relativeName = normalisedPrefix ? blob.name.slice(normalisedPrefix.length) : blob.name;
      const targetPath = path.join(workingDir, relativeName);
      await mkdir(path.dirname(targetPath), { recursive: true });
      const blobClient = container.getBlobClient(blob.name);
      await blobClient.downloadToFile(targetPath);
      fileCount += 1;
    }

    if (fileCount === 0) {
      await cleanup();
      return { stream: null, fileCount: 0 };
    }

    const zipProcess = spawn('zip', ['-r', '-', '.'], { cwd: workingDir });
    const stream = zipProcess.stdout;

    if (!stream) {
      await cleanup();
      throw new Error('Unable to create archive stream');
    }

    zipProcess.on('close', (code) => {
      cleanup();
      if (code !== 0) {
        stream.destroy(new Error('Failed to create zip archive'));
      }
    });

    zipProcess.on('error', (error) => {
      cleanup();
      stream.destroy(error);
    });

    return { stream, fileCount };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
