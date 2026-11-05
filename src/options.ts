import type { ImageOptions, ImageRequest, ModelDescriptor } from './contracts.ts';
import { ImageError } from './errors.ts';

const unsupported = (message: string) => new ImageError('CONTROL_UNSUPPORTED', message);

// GPT Image custom sizes, from OpenAI's image generation guide (checked 2026-11-05).
function checkGptImageSize(size: string, animated: boolean): void {
  if (size === 'auto') return;
  const match = /^(\d+)x(\d+)$/.exec(size);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (!match || !width || !height || width % 16 || height % 16) {
    throw new ImageError('SIZE_UNSUPPORTED', 'Use auto or WIDTHxHEIGHT with both edges in multiples of 16, such as 1536x1024.');
  }
  // GIF frames share a request pixel budget that OpenAI does not publish; it checks the rest.
  if (animated) return;
  const long = Math.max(width, height);
  const pixels = width * height;
  if (long > 3840 || long > 3 * Math.min(width, height) || pixels < 655_360 || pixels > 8_294_400) {
    throw new ImageError('SIZE_UNSUPPORTED',
      'GPT Image sizes need edges up to 3840 pixels, an aspect ratio between 1:3 and 3:1, and 655,360 to 8,294,400 pixels in total.');
  }
}

export function checkOptions(request: ImageRequest, model: ModelDescriptor): void {
  const { options } = request;
  for (const option of Object.keys(options) as (keyof ImageOptions)[]) {
    if (!model.controls.includes(option)) {
      throw unsupported(`${model.name} does not support the ${option} control on this route.`);
    }
    const allowed: readonly unknown[] | undefined = model.values?.[option];
    if (allowed && !allowed.includes(options[option])) {
      throw unsupported(`${model.name} accepts ${option} values ${allowed.join(', ')}.`);
    }
  }
  const format = options.output_format;
  const animated = format === 'gif';
  if (animated || format === 'svg') {
    const label = animated ? 'GIF' : 'SVG';
    if (request.references.length) {
      throw new ImageError('FORMAT_UNSUPPORTED', `${label} output is generation-only and cannot use reference images, masks, or markup.`);
    }
    if (options.output_compression !== undefined) throw unsupported('output_compression applies to JPEG and WebP output only.');
    if (format === 'svg' && request.count !== 1) {
      throw new ImageError('COUNT_UNSUPPORTED', 'SVG output returns one image per request. Set count to 1.');
    }
  }
  if (!animated && (options.frame_count !== undefined || options.frame_duration_ms !== undefined)) {
    throw unsupported('frame_count and frame_duration_ms apply to GIF output only.');
  }
  if (format !== 'svg' && options.svg_model !== undefined) throw unsupported('svg_model applies to SVG output only.');
  if (options.background === 'transparent' && format && format !== 'png' && format !== 'webp') {
    throw unsupported('Transparent backgrounds need PNG or WebP output.');
  }
  if (model.provider === 'openai' && options.size) checkGptImageSize(options.size, animated);
}
