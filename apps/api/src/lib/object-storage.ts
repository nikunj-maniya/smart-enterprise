import { Client } from 'minio';

const BUCKET = process.env.MINIO_BUCKET ?? 'smart-enterprise';

function requireEnv(envVar: string): string {
  const value = process.env[envVar];
  if (!value) throw new Error(`${envVar} is not configured`);
  return value;
}

const client = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: Number(process.env.MINIO_PORT ?? 9500),
  useSSL: false,
  accessKey: requireEnv('MINIO_ACCESS_KEY'),
  secretKey: requireEnv('MINIO_SECRET_KEY'),
});

let bucketReady: Promise<void> | null = null;

/** Lazily creates the bucket on first use — nothing in it is ever made public (design.md:
 *  "MinIO via signed URLs only"). */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const exists = await client.bucketExists(BUCKET).catch(() => false);
    if (!exists) await client.makeBucket(BUCKET);
  })();
  return bucketReady;
}

export async function uploadObject(key: string, data: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await client.putObject(BUCKET, key, data, data.length, { 'Content-Type': contentType });
}

/** A time-limited, signed GET URL — the only way anything in the bucket is ever read (visitor-signatures spec). */
export async function getSignedDownloadUrl(key: string, expirySeconds = 300): Promise<string> {
  await ensureBucket();
  return client.presignedGetObject(BUCKET, key, expirySeconds);
}
