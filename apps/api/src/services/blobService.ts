import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  BlobDownloadResponseParsed,
} from '@azure/storage-blob';
import { PassThrough } from 'node:stream';
import mime from 'mime-types';
import { appConfig } from '../config.js';
import { ListBlobItem } from '../types.js';

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

export async function listBlobs(prefix: string): Promise<ListBlobItem[]> {
  const container = getContainer();
  const results: ListBlobItem[] = [];
  for await (const item of container.listBlobsFlat({ prefix })) {
    if (!item.name) continue;
    results.push({
      name: item.name,
      size: item.properties.contentLength ?? 0,
      lastModified: item.properties.lastModified?.toISOString() ?? '',
      contentType: item.properties.contentType ?? undefined,
    });
  }
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
