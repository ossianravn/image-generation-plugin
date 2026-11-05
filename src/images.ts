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
  svg: { mime: 'image/svg+xml', extension: 'svg' },
};

export interface ImageInfo {
  mime: string; extension: string; width: number; height: number; alpha: boolean;
  frames?: number; duration_ms?: number;
}

// OpenAI documents SVG output as static: no scripts, external resources, or embedded rasters.
// Check that before a renderer or the user's browser ever opens the file.
function staticSvg(bytes: Buffer): boolean {
  const text = bytes.toString('utf8');
  if (/<script|<foreignObject|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|\son[a-z]+\s*=|javascript:|@import/i.test(text)) return false;
  return [...text.matchAll(/(?:href\s*=\s*["']|url\(\s*["']?)([^"')\s]*)/gi)].every(match => match[1]!.startsWith('#'));
}

/** Reads raster images; `vector` also accepts static SVG (provider outputs and inspect_image). */
export async function inspect(bytes: Buffer, vector = false): Promise<ImageInfo> {
  const metadata = await sharp(bytes).metadata().catch(() => {
    throw new ImageError('INVALID_IMAGE', 'Expected a decodable PNG, JPEG, WebP, or GIF image.');
  });
  if (metadata.format === 'svg') {
    if (!vector) throw new ImageError('INVALID_IMAGE', 'SVG is not accepted as an input image. Use PNG, JPEG, WebP, or GIF.');
    if (!staticSvg(bytes)) throw new ImageError('UNSAFE_SVG', 'The SVG contains scripts or external references, so it was not opened or saved.');
  }
  try {
    const format = metadata.format && formats[metadata.format];
    if (!format || !metadata.width || !metadata.height) throw new Error('Unsupported image');
    await sharp(bytes).stats();
    const frames = metadata.pages && metadata.pages > 1 ? metadata.pages : undefined;
    return { ...format, width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha,
      ...(frames ? { frames, duration_ms: (metadata.delay ?? []).reduce((total: number, delay: number) => total + delay, 0) } : {}) };
  } catch {
    throw new ImageError('INVALID_IMAGE', 'Expected a decodable PNG, JPEG, WebP, or GIF image.');
  }
}

/** Width and height after EXIF orientation, and whether any pixel is transparent. */
export async function layer(bytes: Buffer): Promise<{ width: number; height: number; transparent: boolean }> {
  const [metadata, stats] = await Promise.all([sharp(bytes).metadata(), sharp(bytes).stats()]);
  const turned = (metadata.orientation ?? 1) >= 5;
  return { width: turned ? metadata.height : metadata.width, height: turned ? metadata.width : metadata.height,
    transparent: metadata.hasAlpha && (stats.channels[3]?.min ?? 255) < 255 };
}

export async function readImage(path: string, vector = false): Promise<InputImage> {
  if (!isAbsolute(path)) throw new ImageError('IMAGE_PATH', 'Use an absolute image path or a returned artifact ID.');
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch { throw new ImageError('IMAGE_READ', 'Cannot read a reference image. Check its path and permissions.'); }
  const info = await inspect(bytes, vector);
  return { path, bytes, mime: info.mime, width: info.width, height: info.height,
    ...(info.frames ? { frames: info.frames, duration_ms: info.duration_ms } : {}) };
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
  const info = await inspect(bytes, true);
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
    width: info.width, height: info.height, sha256,
    ...(info.frames ? { frames: info.frames, duration_ms: info.duration_ms } : {}) };
}

/** A PNG of at most 1024 pixels per edge. Animations show their first frame. */
export async function preview(path: string): Promise<string> {
  const { format, width = 1024, height = 1024 } = await sharp(path).metadata();
  // Vectors render at the density that fills the preview, rather than being upscaled after rasterizing.
  const density = format === 'svg' ? Math.min(2400, Math.max(1, 72 * 1024 / Math.max(width, height))) : undefined;
  const bytes = await sharp(path, density ? { density } : {})
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return bytes.toString('base64');
}
