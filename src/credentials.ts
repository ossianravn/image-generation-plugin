import type { Provider } from './contracts.ts';
import { ImageError } from './errors.ts';

export const providers: Provider[] = ['openai', 'gemini', 'replicate', 'openrouter'];
export const providerNames: Record<Provider, string> = {
  openai: 'OpenAI', gemini: 'Google Gemini', replicate: 'Replicate', openrouter: 'OpenRouter',
};
export const keyNames: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
  replicate: 'REPLICATE_API_KEY', openrouter: 'OPENROUTER_API_KEY',
};
export const credentialService = 'image-generation-plugin';

export interface CredentialStore {
  get(provider: Provider): Promise<string | undefined>;
  set(provider: Provider, value: string): Promise<void>;
  remove(provider: Provider): Promise<boolean>;
}

export function credentialStoreError(): ImageError {
  return new ImageError('CREDENTIAL_STORE',
    'Cannot access the OS credential store. Unlock Windows Credential Manager or macOS Keychain; '
    + 'on Linux, start and unlock a Secret Service (such as GNOME Keyring or KWallet) in this login session. '
    + 'Then retry. Environment variables or an explicit --env-file are available for headless use.');
}

// Load the native binding only when needed; environment-only hosts need no desktop keyring.
export function systemCredentialStore(service = credentialService): CredentialStore {
  async function entry(provider: Provider) {
    const { AsyncEntry } = await import('@napi-rs/keyring');
    // The library's default Linux keyutils fallback disappears at reboot.
    return new AsyncEntry(service, provider, { linux: { store: 'secret-service' } });
  }
  return {
    async get(provider) {
      try { return (await (await entry(provider)).getPassword()) ?? undefined; }
      catch { throw credentialStoreError(); }
    },
    async set(provider, value) {
      try { await (await entry(provider)).setPassword(value); }
      catch { throw credentialStoreError(); }
    },
    async remove(provider) {
      try { return await (await entry(provider)).deleteCredential(); }
      catch { throw credentialStoreError(); }
    },
  };
}
