import type { ControlValues, ImageOptions, ModelDescriptor, Provider } from './contracts.ts';
import { ImageError } from './errors.ts';
import validationData from './catalogue-validation.json' with { type: 'json' };

const validation: Record<string, ModelDescriptor['live_validation']> = validationData;

const openaiControls: (keyof ImageOptions)[] = [
  'size', 'quality', 'background', 'output_format', 'output_compression',
];
const openaiValues: ControlValues = {
  quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
  output_format: ['png', 'jpeg', 'webp'],
};
const openaiGuide = 'https://developers.openai.com/api/docs/guides/image-generation';

function model(
  provider: Provider, id: string, name: string, api: ModelDescriptor['api'],
  maxReferences: number | null, controls: (keyof ImageOptions)[], source: string,
  extra: Partial<Pick<ModelDescriptor, 'max_count' | 'masks' | 'markup' | 'values' | 'checked_at'>> = {},
): ModelDescriptor {
  return {
    provider, id, name, api, max_references: maxReferences, max_count: 1,
    controls, masks: false, markup: false, evidence: 'documented', source,
    checked_at: '2026-10-03', live_validation: validation[`${provider}:${id}`], ...extra,
  };
}

const tierName = (tier: string) => tier[0]!.toUpperCase() + tier.slice(1);

export const catalogue: ModelDescriptor[] = [
  ...['flare', 'sunburst'].map(tier => model(
    'openai', `gpt-image-2.5-${tier}`, `GPT Image 2.5 ${tierName(tier)}`, 'images', 16,
    openaiControls, openaiGuide,
    { masks: true, markup: true, max_count: 10, values: openaiValues, checked_at: '2026-11-05' },
  )),
  // OpenAI does not publish 2.6 reference or output-count limits; the API enforces them.
  ...['flare', 'sunburst'].map(tier => model(
    'openai', `gpt-image-2.6-${tier}`, `GPT Image 2.6 ${tierName(tier)}`, 'images', null,
    [...openaiControls, 'complexity', 'frame_count', 'frame_duration_ms', 'svg_model'], `${openaiGuide}#gpt-image-26`,
    { masks: true, markup: true, max_count: 10, checked_at: '2026-11-05', values: {
      ...openaiValues, output_format: ['png', 'jpeg', 'webp', 'gif', 'svg'], complexity: ['low', 'medium', 'high'],
    } },
  )),
  model('gemini', 'gemini-nano-banana-2.1', 'Nano Banana 2.1', 'interactions', 14,
    ['aspect_ratio', 'resolution', 'thinking_level'], 'https://aistudio.google.com/docs/models/gemini-nano-banana-2.1',
    { checked_at: '2026-11-05', values: { resolution: ['1K', '2K', '4K'], thinking_level: ['minimal', 'medium', 'high'] } }),
  model('gemini', 'gemini-3.1-flash-image', 'Nano Banana 2', 'interactions', 14,
    ['aspect_ratio', 'resolution'], 'https://ai.google.dev/gemini-api/docs/image-generation'),
  model('gemini', 'gemini-3-pro-image', 'Nano Banana Pro', 'interactions', 14,
    ['aspect_ratio', 'resolution'], 'https://ai.google.dev/gemini-api/docs/image-generation'),
  model('replicate', 'black-forest-labs/flux-3-image', 'FLUX 3 Image', 'predictions', 10,
    ['aspect_ratio', 'resolution', 'output_format', 'grounding'],
    'https://replicate.com/black-forest-labs/flux-3-image', { values: { output_format: ['png', 'jpeg', 'webp'] } }),
  model('openrouter', 'bytedance-seed/seedream-5-0-pro', 'Seedream 5.0 Pro', 'images', 14,
    ['aspect_ratio', 'resolution', 'seed'],
    'https://openrouter.ai/bytedance-seed/seedream-5-0-pro'),
  model('openrouter', 'microsoft/mai-image-2.6', 'MAI-Image-2.6', 'images', 5,
    ['aspect_ratio'], 'https://openrouter.ai/microsoft/mai-image-2.6'),
  model('openrouter', 'x-ai/grok-imagine-image-2.0', 'Grok Imagine Image 2.0', 'images', 3,
    ['aspect_ratio', 'resolution', 'quality'], 'https://openrouter.ai/x-ai/grok-imagine-image-2.0'),
  ...['qwen-image-3', 'qwen-image-3-pro'].map(id => model(
    'openrouter', `qwen/${id}`, id, 'images', 4, ['aspect_ratio', 'resolution', 'seed'],
    `https://openrouter.ai/qwen/${id}`, { max_count: 6 },
  )),
  model('openrouter', 'meta/muse-image', 'Muse Image', 'images', null, [],
    'https://openrouter.ai/meta/muse-image'),
];

export function findModel(provider: Provider, id: string): ModelDescriptor {
  const found = catalogue.find(item => item.provider === provider && item.id === id);
  if (!found) throw new ImageError('MODEL_NOT_FOUND', 'This model is not in the selected provider catalogue. Use list_models.');
  return found;
}
