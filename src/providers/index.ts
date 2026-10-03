import type { Provider, ProviderAdapter } from '../contracts.ts';
import type { Config } from '../config.ts';
import type { Http } from '../http.ts';
import { openaiAdapter } from './openai.ts';
import { geminiAdapter } from './gemini.ts';
import { replicateAdapter } from './replicate.ts';
import { openrouterAdapter } from './openrouter.ts';

export function createAdapters(config: Config, http: Http): Record<Provider, ProviderAdapter> {
  return {
    openai: openaiAdapter(config, http), gemini: geminiAdapter(config, http),
    replicate: replicateAdapter(config, http), openrouter: openrouterAdapter(config, http),
  };
}
