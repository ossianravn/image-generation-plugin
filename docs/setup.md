# Install and use the image generation plugin

The runtime requires Node.js 24 or newer. Generation uses your provider's API credits. Image generation, reference-guided composition, and editing share the same local artifact and job system.

## Table of contents

- [From a source checkout](#from-a-source-checkout)
- [Configure providers once](#configure-providers-once)
- [Connect an agent host](#connect-an-agent-host)
- [Generate and edit](#generate-and-edit)
- [Recovery and cancellation](#recovery-and-cancellation)
- [Data and distribution](#data-and-distribution)

## From a source checkout

Run `npm ci`, then `npm run build:runtime`. The executable is `node dist/cli.js`. Use `npm run dev -- <command>` during development; it loads this checkout's `.env.local` explicitly. The build command has an explicit suffix so npm Git installation does not trigger unnecessary development dependency preparation.

## Configure providers once

Run this in your own interactive terminal from the checkout or installed package directory:

```sh
node dist/cli.js setup
```

Select providers with Space, then press Enter. The wizard prompts for each selected provider's API key with masked input and verifies that the saved value can be read back. Unselected providers keep their keys. When updating a saved provider, Enter keeps its existing key. Each successful save takes effect immediately; cancelling later prompts preserves those earlier saves.

Keys are stored under the `image-generation-plugin` service, with one entry per provider, in Windows Credential Manager, macOS Keychain, or Linux Secret Service. The same OS user can use these keys from Codex, Claude Code, and OpenCode on this computer. The server retrieves them itself; the clients only need their normal MCP launch configuration. This does not change any client's own login credentials. Another OS user, remote machine, or container needs its own configuration and access to a credential store.

If the plugin is already connected, ask the agent to configure its image providers. The `credential_status` tool supplies a terminal command with the installed executable's absolute path. Run it yourself, then tell the agent setup is complete. Status checks, model listings, and new image actions refresh credentials without restarting the server. Keys belong only in the terminal's masked prompts, never in chat or MCP arguments. Setup makes no provider request; presence does not establish account access, credits, or model availability.

The shared wizard is a separate terminal step, not an automatic install dialog. Claude's native `userConfig` prompt stores host-specific values, and OpenAI plugins do not run that prompt. This plugin uses the shared store chosen for all hosts instead of maintaining separate sets. See [Claude user configuration](https://code.claude.com/docs/en/plugins-reference#user-configuration) and [OpenAI's migration guidance](https://developers.openai.com/plugins/guides/submit-claude-plugin#replace-claude-userconfig).

To configure one provider, use `node dist/cli.js setup --provider openai`. Run the same command to rotate its key. To delete its saved key across hosts, use `node dist/cli.js setup --remove --provider openai`. Substitute `gemini`, `replicate`, or `openrouter` as needed. Deletion removes the stored copy; it does not revoke the key at the provider or remove environment/file overrides.

Run `node dist/cli.js doctor` to see credential presence and the active source without exposing values. If the OS store is unavailable or locked, unlock it and retry. On Linux, a running Secret Service such as GNOME Keyring or KWallet is required; setup does not silently fall back to temporary or plaintext storage. Headless sessions can use the explicit overrides below.

### Environment and file overrides

For development or automation, the supported names remain `OPENAI_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_KEY`, and `OPENROUTER_API_KEY`. The empty `.env.example` lists them. For each provider, the first nonempty value wins:

1. The image server's environment.
2. A file explicitly selected with `--env-file`.
3. The shared OS credential store.
4. A legacy `credentials.env` in the data directory, only when no explicit file was selected.

An explicit file can supply some providers while the OS store supplies others. A saved key does not override an active environment variable or explicit file. `doctor` and `credential_status` show which source is in use. Hosts may filter the environment they pass to MCP processes, so environment-only configurations need the host's explicit environment forwarding.

If you choose a credential file, copy `.env.example` into a private file, populate the providers you use, restrict its permissions, and keep it out of version control. It is plaintext. Run `node dist/cli.js doctor --env-file /absolute/path/to/credentials.env` to check it. `npm run dev` explicitly loads the checkout's `.env.local`; normal installed launches do not search the working directory for dotenv files.

Existing legacy files are not migrated or deleted automatically. `doctor` reports the data directory for the current launch environment; portable hosts supply `PLUGIN_DATA`, and Claude supplies `CLAUDE_PLUGIN_DATA`. After saving a key through setup, the OS store takes precedence over that provider's legacy file entry.

## Connect an agent host

For direct installation from GitHub, follow the client commands at the beginning of the [README](../README.md#install). The repository includes Codex and Claude marketplace entries and an OpenCode v2 package adapter. Git installs bootstrap locked production dependencies into the data directory, using Node 24's built-in TypeScript support. Installed plugin files remain unchanged; a completed runtime is cached for subsequent launches. The dependency lock is shipped as `npm-shrinkwrap.json` so it also survives Git package installation.

The options below are for local development, prebuilt bundles, and manual MCP configuration. Build once before connecting a host through these options. The server's working directory is not the destination for generated images; pass an absolute project output directory in each request.

### Codex

The portable release is an Agent Plugins 1.0.0 package: `plugin.json`, `mcp.json`, and `skills/image-generation/SKILL.md`. `npm run package` also writes `.agents/plugins/marketplace.json` in the release directory, pointing to its `portable` folder. Run `codex plugin marketplace add /absolute/path/to/release-directory`, then install Image Generation from that local marketplace in the app. This follows the [official local marketplace procedure](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually); desktop rendering and activation still need host acceptance testing.

Use the generated release directory for installation. The development checkout contains private local state and credentials that must not be copied into an installation or distribution.

For direct MCP setup, add a server configuration pointing at the built executable. `node dist/cli.js host-config --host codex` prints the command and arguments. Codex's configuration file uses TOML:

```toml
[mcp_servers.image-generation]
command = "node"
args = ["/absolute/path/to/image-generation-plugin/dist/cli.js", "serve"]
```

Use forward slashes or TOML literal strings for Windows paths. Direct MCP setup also needs the shared skill installed through the host's skill mechanism.

### Claude Code

`npm run package` creates a Claude layout with `.claude-plugin/plugin.json`, `.mcp.json`, the shared skill, and runtime dependencies. Load that directory with Claude's `--plugin-dir` development option or distribute it through a plugin marketplace. The package's data location follows `CLAUDE_PLUGIN_DATA`.

For direct MCP configuration, run `node dist/cli.js host-config --host claude` and merge the resulting server entry into the appropriate MCP configuration.

### OpenCode v2

Run `node dist/cli.js host-config --host opencode` and merge its `mcp.servers` entry and `skills` path into the project's OpenCode configuration. It uses `protocol: "auto"` and points to the skill shipped alongside the runtime. OpenCode 2.0.18 connected to the v0.1.0 packaged server and discovered this skill on Windows. Confirm the connection with `opencode mcp list`; an initial `pending` state can become `connected` after startup.

For native plugin installation, `opencode plugin add github:ossianravn/image-generation-plugin` registers both components automatically. For a local checkout, add its absolute directory to `plugins` in `opencode.json`; OpenCode 2.0.18 resolves the package through the root `index.js` entry. The adapter preserves an existing MCP entry named `image-generation`, allowing deliberate manual configuration to take precedence.

On the check date, the public `https://opencode.ai/config.json` schema rejected the v2 `mcp.servers` shape, while the installed v2 host accepted it. Follow the [v2 MCP documentation](https://opencode.ai/v2/docs/mcp-servers/) and the generated recipe; do not reshape it to the older flat MCP layout merely to satisfy that schema.

OpenCode v1 has a different configuration format and is not covered by this recipe.

### Updating and removing

Git-installed plugins use the host's update mechanism. Refresh the Codex marketplace with `codex plugin marketplace upgrade image-generation`, refresh the Claude marketplace with `claude plugin marketplace update image-generation`, or run `opencode plugin update github:ossianravn/image-generation-plugin`. Install the available plugin update in the client and start a new session. A changed runtime gets a separate cache; older runtime caches remain available until you remove the plugin's data. Credentials remain shared across updates.

Build a new release directory, point the host at that release, and restart/reload its MCP connection. Shared OS credentials survive package updates and data-directory changes. Keep the same data directory to retain jobs and any legacy credential file. Direct MCP configurations need their executable path updated when the release path changes. Add `--env-file /absolute/path/to/credentials.env` to `host-config` only when you deliberately want that override.

Remove saved provider keys with `setup --remove --provider NAME` before uninstalling if you no longer want this plugin to retain them. Uninstalling from one host leaves shared keys available to the others. Remove the plugin through the host's plugin manager, or remove its direct MCP configuration and installed skill. Hosts may delete their plugin data on uninstall; generated files in your project remain where you saved them.

## Generate and edit

The agent should inspect available models and controls with `list_models` and `get_model`, then call `generate_image` or `edit_image`. Editing uses the first reference as the source. Additional references guide composition or identity. `inspect_image` lets the agent inspect a local reference without uploading it.

The CLI accepts the same request as a JSON file:

```json
{
  "request_id": "project-logo-concept-1",
  "provider": "openai",
  "model": "gpt-image-2.5-flare",
  "prompt": "A red ceramic mug with a white circular emblem on a pale gray background",
  "output_directory": "/absolute/path/to/project/assets",
  "references": [],
  "options": { "size": "1024x1024", "quality": "low" }
}
```

Run `node dist/cli.js generate --request request.json`. For an edit, use the `edit` command, a new request ID, and a saved image path or returned `artifact:...` ID in `references`.

Each action receives a durable job ID. Reuse its request ID only to retrieve that same action. A new creative revision needs a new request ID. Output filenames derive from the job identity and preserve original provider bytes. An existing different file is never overwritten.

MCP calls wait briefly and return a job handle for slow work. Use `get_job` to retrieve the result. The response contains all output paths and a preview of the first image; use `inspect_image` to view another output. CLI generation waits until it completes or reaches an actionable failure.

## Recovery and cancellation

Replicate predictions with saved IDs can be recovered after a process restart. A synchronous request interrupted before receiving a result can remain `unknown`; the plugin will not submit it again. Check the provider account before intentionally starting another action.

If output saving fails, the result remains in local job state. Retrieve the same job to retry saving, without paying for another generation. A retrieval makes one recovery attempt; polling does not continuously retry a failed download.

`cancel_job` requests cancellation. Replicate can confirm cancellation. For providers without a cancellation API, an interrupted connection leaves the outcome uncertain and may still incur charges.

## Data and distribution

Job metadata and retained results live outside the immutable plugin installation, in a SQLite database. Original prompts and copies of input references are not stored in those records. Generated output files remain where requested. Pending output data and temporary provider URLs are retained for save recovery; completed records retain artifact paths, checksums, model identity, and reported usage.

Gemini requests use `store=false`; this does not promise zero provider logging. FLUX web grounding defaults off and can be enabled explicitly with `options.grounding`. Provider policies and account settings still apply.

`npm run package` produces separate portable and Claude directories with dependencies for the build machine's operating system and architecture. Build a package on each target platform before distributing it there. No keys, live test outputs, or job database are included. A source checkout can install dependencies on another supported platform.

Publication and licensing remain separate release decisions. This repository is currently a private development package.
