import "../env.js";
import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import { Readable } from "stream";

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const containerName = process.env.AZURE_STORAGE_CONTAINER;

if (!accountName || !accountKey || !containerName) {
  throw new Error(
    "Missing storage configuration. Ensure account name, key, and container are set."
  );
}

const sharedKeyCredential = new StorageSharedKeyCredential(
  accountName,
  accountKey
);

const blobServiceClient = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net`,
  sharedKeyCredential
);

const containerClient: ContainerClient = blobServiceClient.getContainerClient(
  containerName
);

export function getContainerClient() {
  return containerClient;
}

export function guessContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    case "txt":
    case "log":
      return "text/plain";
    case "xml":
      return "application/xml";
    case "sql":
      return "application/sql";
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

export async function uploadBlob(
  buffer: Buffer,
  contentType: string,
  blobPath: string
) {
  const client: BlockBlobClient = containerClient.getBlockBlobClient(blobPath);
  await client.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function listBlobs(prefix: string) {
  const results: Array<{
    name: string;
    size: number;
    lastModified: string;
    contentType?: string;
  }> = [];

  for await (const item of containerClient.listBlobsFlat({ prefix })) {
    results.push({
      name: item.name,
      size: item.properties.contentLength ?? 0,
      lastModified: item.properties.lastModified?.toISOString() ?? "",
      contentType: item.properties.contentType ?? undefined,
    });
  }

  return results;
}

export function getBlobSasUrl(
  blobPath: string,
  permissions: string,
  expiryMinutes: number
) {
  const expiresOn = new Date(Date.now() + expiryMinutes * 60 * 1000);
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      expiresOn,
      permissions,
      protocol: SASProtocol.Https,
    },
    sharedKeyCredential
  ).toString();

  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobPath}?${sasToken}`;
}

export async function streamTextBlob(blobPath: string, maxBytes: number) {
  const client = containerClient.getBlobClient(blobPath);
  const download = await client.download();
  const chunks: Buffer[] = [];
  let total = 0;

  const stream = download.readableStreamBody as Readable | null;
  if (!stream) {
    throw new Error("Unable to read blob stream");
  }

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error("Blob too large for inline preview");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf-8");
}
