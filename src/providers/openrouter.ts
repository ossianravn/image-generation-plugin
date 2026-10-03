import { z } from 'zod';
import type { ProviderAdapter } from '../contracts.ts';
import type { Config } from '../config.ts';
import { Http, jsonBody } from '../http.ts';
import { dataUrl } from '../images.ts';
import { ImageError } from '../errors.ts';
import { numericUsage } from './usage.ts';

const capability = z.object({
  type: z.string(), values: z.array(z.union([z.string(), z.number()])).optional(),
  min: z.number().optional(), max: z.number().optional(),
});
export const endpointSchema = z.object({
  endpoints: z.array(z.object({
    provider_name: z.string(), provider_tag: z.string(),
    supported_parameters: z.record(z.string(), capability),
    evidence_source: z.string().optional(),
  })),
});
const imageResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
});

// Muse serves the Image API while its discovery endpoint returns an empty list.
// Keep the documented reference capability separate from a provider-advertised limit.
const curatedEndpoints: Record<string, z.infer<typeof endpointSchema>['endpoints']> = {
  'meta/muse-image': [{ provider_name: 'Meta', provider_tag: 'meta',
    supported_parameters: { n: { type: 'range', min: 1, max: 1 }, input_references: { type: 'boolean' } },
    evidence_source: 'Image API generation, two-reference composition, and editing verified 2026-10-03; discovery empty; maximum reference count unknown',
  }],
};

export async function imageEndpoints(model: string, http: Http) {
  const raw = await http.json(`https://openrouter.ai/api/v1/images/models/${model}/endpoints`, {});
  const parsed = endpointSchema.safeParse(raw);
  if (!parsed.success) throw new ImageError('DISCOVERY_FAILED', 'OpenRouter returned unreadable endpoint capabilities.');
  return parsed.data.endpoints.length ? parsed.data.endpoints : curatedEndpoints[model] ?? [];
}

function accepts(descriptor: z.infer<typeof capability> | undefined, value: string | number | boolean): boolean {
  if (!descriptor) return false;
  if (descriptor.values) return descriptor.values.includes(value as string | number);
  if (descriptor.type === 'range') return typeof value === 'number'
    && (descriptor.min === undefined || value >= descriptor.min)
    && (descriptor.max === undefined || value <= descriptor.max);
  return true;
}

export function openrouterAdapter(config: Config, http: Http): ProviderAdapter {
  const headers = () => ({ Authorization: `Bearer ${config.key('openrouter')}`, 'Content-Type': 'application/json' });

  return {
    async submit(input, context) {
      const { request, references } = input;
      const endpoints = await imageEndpoints(request.model, http);
      const controls = { ...request.options, n: request.count,
        ...(references.length ? { input_references: references.length } : {}) };
      const endpoint = endpoints.find(item => Object.entries(controls)
        .every(([key, value]) => accepts(item.supported_parameters[key], value)));
      if (!endpoint) throw new ImageError('NO_ENDPOINT', 'No current OpenRouter endpoint supports these image controls. Use get_model to inspect availability.');
      const raw = await http.json('https://openrouter.ai/api/v1/images', {
        ...jsonBody({ model: request.model, prompt: request.prompt, n: request.count, ...request.options,
          input_references: references.map(image => ({ type: 'image_url', image_url: { url: dataUrl(image) } })),
          provider: { only: [endpoint.provider_tag], allow_fallbacks: false },
        }), headers: headers(), signal: context.signal,
      }, true);
      const parsed = imageResponse.safeParse(raw);
      if (!parsed.success) throw new ImageError('NO_IMAGE', 'OpenRouter returned no usable Image API output.');
      return { images: parsed.data.data.map(image => ({ base64: image.b64_json })),
        routed_provider: endpoint.provider_name, usage: numericUsage(parsed.data.usage) };
    },
  };

}
