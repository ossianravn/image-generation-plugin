import type { ImageRequest, InputImage, Operation, PreparedRequest } from './contracts.ts';
import { ImageError } from './errors.ts';
import { inspect, layer, readImage } from './images.ts';
import type { JobStore } from './store.ts';

export function artifactPath(reference: string, store: JobStore): string {
  if (!reference.startsWith('artifact:')) return reference;
  const match = /^artifact:([a-f0-9]{64}):(\d+)$/.exec(reference);
  const artifact = match?.[1] && store.get(match[1])?.job.artifacts.find(item => item.id === reference);
  if (!artifact) throw new ImageError('ARTIFACT_NOT_FOUND', 'The artifact ID is unknown in this plugin data directory.');
  return artifact.path;
}

export async function prepare(request: ImageRequest, operation: Operation, store: JobStore): Promise<PreparedRequest> {
  const references = await Promise.all(request.references.map(path => readImage(artifactPath(path, store))));
  const mask = request.mask ? await readImage(artifactPath(request.mask, store)) : undefined;
  const markup = request.markup ? await readImage(artifactPath(request.markup, store)) : undefined;
  if (request.provider === 'openai' && references.some(image => image.mime === 'image/gif')) {
    throw new ImageError('REFERENCE_FORMAT', 'OpenAI references must be PNG, JPEG, or WebP.');
  }
  if (request.provider === 'replicate' && references.some(image => image.width < 256 || image.height < 256
    || image.width * image.height > 16_000_000)) {
    throw new ImageError('REFERENCE_DIMENSIONS', 'FLUX 3 references must be at least 256×256 pixels and at most 16 megapixels.');
  }
  if (mask) {
    const first = references[0];
    const info = await inspect(mask.bytes);
    if (!first || mask.mime !== 'image/png' || !info.alpha
      || mask.width !== first.width || mask.height !== first.height) {
      throw new ImageError('MASK_FORMAT', 'The mask must be a PNG with alpha and the same dimensions as the first reference.');
    }
  }
  if (markup) await checkMarkup(markup, references[0]);
  return { request, operation, references, mask, markup };
}

// OpenAI markup limits, from its image generation guide (checked 2026-11-05).
async function checkMarkup(markup: InputImage, first: InputImage | undefined): Promise<void> {
  if (!first) throw new ImageError('REFERENCE_REQUIRED', 'Markup applies to the first reference image.');
  const [source, overlay] = await Promise.all([layer(first.bytes), layer(markup.bytes)]);
  if (markup.mime !== 'image/png' || !overlay.transparent) {
    throw new ImageError('MARKUP_FORMAT', 'Markup must be a PNG annotation layer with transparent pixels, not flattened onto the image.');
  }
  if (overlay.width !== source.width || overlay.height !== source.height) {
    throw new ImageError('MARKUP_FORMAT', 'The markup layer must have the same width and height as the first reference.');
  }
  if (source.width * source.height > 16_777_216 || markup.bytes.length > 50 * 1024 * 1024) {
    throw new ImageError('MARKUP_FORMAT', 'The first reference and markup layer may each have at most 16,777,216 pixels, and the markup file at most 50 MB.');
  }
}
