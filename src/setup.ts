import { resolve } from 'node:path';
import type { Config } from './config.ts';
import type { Provider } from './contracts.ts';
import { credentialService, providerNames, providers, systemCredentialStore, type CredentialStore } from './credentials.ts';
import { ImageError } from './errors.ts';

export interface SetupPrompts {
  choose(): Promise<Provider[]>;
  key(provider: Provider, saved: boolean): Promise<string>;
}

export async function configureCredentials(
  store: CredentialStore, prompts: SetupPrompts, report: (message: string) => void, provider?: Provider,
): Promise<void> {
  const selected = provider ? [provider] : await prompts.choose();
  if (!selected.length) { report('No providers selected. Saved keys are unchanged.'); return; }
  for (const provider of selected) {
    const saved = Boolean(await store.get(provider));
    const value = (await prompts.key(provider, saved)).trim();
    if (!value) {
      if (!saved) throw new ImageError('EMPTY_KEY', `Enter an API key for ${providerNames[provider]}.`);
      report(`${providerNames[provider]}: kept the saved key.`);
      continue;
    }
    await store.set(provider, value);
    if (await store.get(provider) !== value) {
      throw new ImageError('CREDENTIAL_SAVE', `${providerNames[provider]}: could not verify the saved key. Run setup again.`);
    }
    report(`${providerNames[provider]}: saved in the OS credential store.`);
  }
}

export async function setup(provider?: Provider, remove = false): Promise<void> {
  const store = systemCredentialStore();
  if (remove) {
    if (!provider) throw new ImageError('PROVIDER_REQUIRED', 'Use setup --remove --provider openai|gemini|replicate|openrouter.');
    const removed = await store.remove(provider);
    process.stdout.write(`${providerNames[provider]}: ${removed ? 'removed the shared saved key' : 'no saved key to remove'}.\n`);
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ImageError('SETUP_TERMINAL', 'Run setup in your own interactive terminal to enter masked keys. Do not paste keys into the agent chat.');
  }
  const { checkbox, password } = await import('@inquirer/prompts');
  process.stdout.write('Save provider keys for Codex, Claude Code, and OpenCode under this OS user.\n'
    + 'Select providers to add or update. Unselected providers keep their saved keys.\n');
  try {
    await configureCredentials(store, {
      choose: () => checkbox({ message: 'Which providers do you want to configure?',
        choices: providers.map(value => ({ value, name: providerNames[value] })) }),
      key: (provider, saved) => password({
        message: `${providerNames[provider]} API key${saved ? ' (Enter keeps the saved key)' : ''}:`,
        mask: true, toggleMask: false,
        validate: value => saved || Boolean(value.trim()) || 'Enter an API key.',
      }),
    }, message => process.stdout.write(`${message}\n`), provider);
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      throw new ImageError('SETUP_CANCELLED', 'Setup cancelled. Keys already reported as saved remain available.');
    }
    throw error;
  }
}

export async function credentialStatus(config: Config, entry = process.argv[1]!) {
  await config.refresh();
  const command = [process.execPath, resolve(entry), 'setup'];
  const quote = (value: string) => process.platform === 'win32'
    ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`;
  return {
    credentials: config.credentials(), authentication_verified: false,
    storage: { service: credentialService, scope: 'Shared across hosts for this OS user on this computer' },
    setup: { command: command[0], args: command.slice(1),
      shell: process.platform === 'win32' ? 'PowerShell' : 'POSIX',
      terminal_command: `${process.platform === 'win32' ? '& ' : ''}${command.map(quote).join(' ')}`,
      instruction: 'Run this command in your own terminal. Enter keys only into its masked prompts. Then check credential_status again.' },
  };
}
