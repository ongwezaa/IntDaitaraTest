import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { env } from "../env.js";
import { lookup as mimeLookup } from "mime-types";

const credential = new StorageSharedKeyCredential(env.storageAccount, env.storageKey);
const blobServiceClient = new BlobServiceClient(
  `https://${env.storageAccount}.blob.core.windows.net`,
  credential
);

const containerClient = blobServiceClient.getContainerClient(env.container);

export interface ListBlobItem {
  name: string;
  size: number;
  lastModified: string;
  contentType?: string;
}

export const ensureContainer = async () => {
  await containerClient.createIfNotExists();
};

export const uploadBuffer = async (
  buffer: Buffer,
  contentType: string,
  blobPath: string
) => {
  const blockBlob = containerClient.getBlockBlobClient(blobPath);
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType,
    },
  });
};

export const listBlobs = async (prefix: string): Promise<ListBlobItem[]> => {
  const iterator = containerClient.listBlobsFlat({ prefix });
  const results: ListBlobItem[] = [];
  for await (const item of iterator) {
    if (!item.name) continue;
    results.push({
      name: item.name,
      size: Number(item.properties.contentLength ?? 0),
      lastModified: item.properties.lastModified?.toISOString() ?? new Date().toISOString(),
      contentType: item.properties.contentType ?? undefined,
    });
  }
  return results;
};

export const getBlobSasUrl = async (
  blobPath: string,
  permissions: string,
  expiryMinutes: number
): Promise<string> => {
  const blobClient = containerClient.getBlobClient(blobPath);
  const perms = BlobSASPermissions.parse(permissions);
  const expiresOn = new Date(Date.now() + expiryMinutes * 60 * 1000);
  const sas = await blobClient.generateSasUrl({
    permissions: perms,
    expiresOn,
    protocol: SASProtocol.Https,
  });
  return sas;
};

export const streamText = async (blobPath: string, maxBytes: number): Promise<string> => {
  const blobClient = containerClient.getBlobClient(blobPath);
  const download = await blobClient.download();
  const readable = download.readableStreamBody;
  if (!readable) {
    throw new Error("Blob is not readable");
  }
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  for await (const chunk of readable) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.length;
    if (bytesRead > maxBytes) {
      throw new Error("Blob exceeds preview size limit");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
};

export const guessContentType = (fileName: string): string => {
  return (mimeLookup(fileName) as string | false) || "application/octet-stream";
};

export const openDownloadStream = async (
  blobPath: string
): Promise<NodeJS.ReadableStream> => {
  const blobClient = containerClient.getBlobClient(blobPath);
  const response = await blobClient.download();
  const stream = response.readableStreamBody;
  if (!stream) {
    throw new Error("Blob stream unavailable");
  }
  return stream;
};

export const getBlobProperties = async (
  blobPath: string
): Promise<{ contentType: string; contentLength: number }> => {
  const blobClient = containerClient.getBlobClient(blobPath);
  const properties = await blobClient.getProperties();
  return {
    contentType: properties.contentType ?? "application/octet-stream",
    contentLength: Number(properties.contentLength ?? 0),
  };
};
