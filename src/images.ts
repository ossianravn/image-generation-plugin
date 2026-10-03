import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import sharp from 'sharp';
import type { Artifact, ImageOutput, InputImage } from './contracts.ts';
import { hasCode, ImageError } from './errors.ts';
import type { Http } from './http.ts';

export function digest(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const formats: Record<string, { mime: string; extension: string }> = {
  png: { mime: 'image/png', extension: 'png' },
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  webp: { mime: 'image/webp', extension: 'webp' },
  gif: { mime: 'image/gif', extension: 'gif' },
};

export async function inspect(bytes: Buffer): Promise<{ mime: string; extension: string; width: number; height: number; alpha: boolean }> {
  try {
    const metadata = await sharp(bytes).metadata();
    const format = metadata.format && formats[metadata.format];
    if (!format || !metadata.width || !metadata.height) throw new Error('Unsupported image');
    await sharp(bytes).stats();
    return { ...format, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha };
  } catch {
    throw new ImageError('INVALID_IMAGE', 'Expected a decodable PNG, JPEG, WebP, or GIF image.');
  }
}

export async function readImage(path: string): Promise<InputImage> {
  if (!isAbsolute(path)) throw new ImageError('IMAGE_PATH', 'Use an absolute image path or a returned artifact ID.');
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch { throw new ImageError('IMAGE_READ', 'Cannot read a reference image. Check its path and permissions.'); }
  const info = await inspect(bytes);
  return { path, bytes, mime: info.mime, width: info.width, height: info.height };
}

export function dataUrl(image: InputImage): string {
  return `data:${image.mime};base64,${image.bytes.toString('base64')}`;
}

export async function checkDestination(directory: string): Promise<void> {
  const temporary = join(directory, `.image-generation-${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, '', { flag: 'wx', mode: 0o600 });
    await unlink(temporary);
  } catch {
    throw new ImageError('OUTPUT_DIRECTORY', 'Cannot write to the output directory. Choose a writable absolute path.');
  }
}

export async function saveImage(output: ImageOutput, directory: string, jobId: string, index: number, http: Http): Promise<Artifact> {
  const bytes = 'base64' in output ? Buffer.from(output.base64, 'base64') : await http.download(output.url);
  const info = await inspect(bytes);
  const sha256 = digest(bytes);
  const path = join(directory, `${jobId}-${index + 1}.${info.extension}`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  try {
    // A hard link publishes complete bytes without overwriting an existing asset.
    await link(temporary, path);
  } catch (error) {
    if (!hasCode(error, 'EEXIST') || digest(await readFile(path)) !== sha256) {
      throw new ImageError('OUTPUT_SAVE', 'Cannot publish the generated file. Its result is retained; retry the existing job.');
    }
  } finally {
    await unlink(temporary);
  }
  return { id: `artifact:${jobId}:${index}`, path, mime_type: info.mime,
    width: info.width, height: info.height, sha256 };
}

export async function preview(path: string): Promise<string> {
  const bytes = await sharp(path).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png().toBuffer();
  return bytes.toString('base64');
}
