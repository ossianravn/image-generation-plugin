import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import type { ProviderAdapter, ProviderContext, ProviderResult } from '../contracts.ts';
import type { Config } from '../config.ts';
import { Http, jsonBody } from '../http.ts';
import { dataUrl } from '../images.ts';
import { ImageError } from '../errors.ts';
import { numericUsage } from './usage.ts';

const predictionSchema = z.object({
  id: z.string(), status: z.string(), version: z.string().nullish(),
  output: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  metrics: z.record(z.string(), z.unknown()).nullish(),
});

export function replicateAdapter(config: Config, http: Http): ProviderAdapter {
  const headers = () => ({ Authorization: `Bearer ${config.key('replicate')}`, 'Content-Type': 'application/json' });

  async function poll(raw: unknown, context: ProviderContext): Promise<ProviderResult> {
    for (;;) {
      const identity = z.object({ id: z.string() }).safeParse(raw);
      if (identity.success) await context.checkpoint(identity.data.id);
      const parsed = predictionSchema.safeParse(raw);
      if (!parsed.success) throw new ImageError('INVALID_PREDICTION', 'Replicate returned an unreadable prediction.', true);
      const prediction = parsed.data;
      if (prediction.status === 'succeeded') {
        const urls = Array.isArray(prediction.output) ? prediction.output : prediction.output ? [prediction.output] : [];
        if (!urls.length) throw new ImageError('NO_IMAGE', 'Replicate completed without image output.');
        return { images: urls.map(url => ({ url })), request_id: prediction.id,
          version: prediction.version ?? undefined, usage: numericUsage(prediction.metrics) };
      }
      if (prediction.status === 'failed') throw new ImageError('PREDICTION_FAILED', 'The Replicate prediction failed. Inspect its ID in your provider dashboard.');
      if (prediction.status === 'canceled') throw new ImageError('CANCELLED', 'Replicate confirmed cancellation. Billing may still apply.');
      await delay(1500, undefined, { signal: context.signal });
      raw = await http.json(`https://api.replicate.com/v1/predictions/${encodeURIComponent(prediction.id)}`,
        { headers: headers(), signal: context.signal });
    }
  }

  return {
    async submit({ request, references }, context) {
      const input = { prompt: request.prompt, images: references.map(dataUrl),
        ...request.options, grounding: request.options.grounding ?? false,
        output_format: request.options.output_format === 'jpeg' ? 'jpg' : request.options.output_format };
      const raw = await http.json(`https://api.replicate.com/v1/models/${request.model}/predictions`, {
        ...jsonBody({ input }), headers: headers(), signal: context.signal,
      }, true);
      return poll(raw, context);
    },
    async recover(id, context) {
      return poll(await http.json(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`,
        { headers: headers(), signal: context.signal }), context);
    },
    async cancel(id) {
      await http.json(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}/cancel`,
        { method: 'POST', headers: headers() });
    },
  };
}
