# Install and use the image generation plugin

The runtime requires Node.js 24 or newer. Generation uses your provider's API credits. Image generation, reference-guided composition, and editing share the same local artifact and job system.

## From a source checkout

Run `npm ci`, then `npm run build`. The executable is `node dist/cli.js`. Use `npm run dev -- <command>` during development; it loads this checkout's `.env.local` explicitly.

Copy the empty values from `.env.example` into your private credential file and populate whichever providers you use. The configured names are `OPENAI_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_KEY`, and `OPENROUTER_API_KEY`.

Run `node dist/cli.js doctor --env-file /absolute/path/to/.env.local` to check credential presence. This does not authenticate with the providers. Existing environment variables take precedence over values in the selected file. Key values are never MCP arguments.

For an installed plugin, credentials can instead live in `credentials.env` inside its data directory. `doctor` reports the directory for the current launch environment; portable hosts supply `PLUGIN_DATA`, and Claude supplies `CLAUDE_PLUGIN_DATA`. Explicit `--env-file` works across hosts and avoids depending on inherited environment variables.

## Connect an agent host

Build once before connecting a host. The server's working directory is not the destination for generated images; pass an absolute project output directory in each request.

### Codex

The portable release is an Agent Plugins 1.0.0 package: `plugin.json`, `mcp.json`, and `skills/image-generation/SKILL.md`. `npm run package` also writes `.agents/plugins/marketplace.json` in the release directory, pointing to its `portable` folder. Run `codex plugin marketplace add /absolute/path/to/release-directory`, then install Image Generation from that local marketplace in the app. This follows the [official local marketplace procedure](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually); desktop rendering and activation still need host acceptance testing.

Use the generated release directory for installation. The development checkout contains private local state and credentials that must not be copied into an installation or distribution.

For direct MCP setup, add a server configuration pointing at the built executable. `node dist/cli.js host-config --host codex --env-file /absolute/path/to/credentials.env` prints the command and arguments. Codex's configuration file uses TOML:

```toml
[mcp_servers.image-generation]
command = "node"
args = ["/absolute/path/to/image-generation-plugin/dist/cli.js", "serve", "--env-file", "/absolute/path/to/credentials.env"]
```

Use forward slashes or TOML literal strings for Windows paths. Direct MCP setup also needs the shared skill installed through the host's skill mechanism.

### Claude Code

`npm run package` creates a Claude layout with `.claude-plugin/plugin.json`, `.mcp.json`, the shared skill, and runtime dependencies. Load that directory with Claude's `--plugin-dir` development option or distribute it through a plugin marketplace. The package's data location follows `CLAUDE_PLUGIN_DATA`.

For direct MCP configuration, run `node dist/cli.js host-config --host claude --env-file /absolute/path/to/credentials.env` and merge the resulting server entry into the appropriate MCP configuration.

### OpenCode v2

Run `node dist/cli.js host-config --host opencode --env-file /absolute/path/to/credentials.env` and merge its `mcp.servers` entry and `skills` path into the project's OpenCode configuration. It uses `protocol: "auto"` and points to the skill shipped alongside the runtime. OpenCode 2.0.18 connected to the packaged server and discovered this skill on Windows. Confirm the connection with `opencode mcp list`; an initial `pending` state can become `connected` after startup.

On the check date, the public `https://opencode.ai/config.json` schema rejected the v2 `mcp.servers` shape, while the installed v2 host accepted it. Follow the [v2 MCP documentation](https://opencode.ai/v2/docs/mcp-servers/) and the generated recipe; do not reshape it to the older flat MCP layout merely to satisfy that schema.

OpenCode v1 has a different configuration format and is not covered by this recipe.

### Updating and removing

Build a new release directory, point the host at that release, and restart/reload its MCP connection. Keep the same data directory to retain jobs and credentials. Direct MCP configurations need their executable path updated when the release path changes. Remove the plugin through the host's plugin manager, or remove its direct MCP configuration and installed skill. Generated project assets and the separate data directory remain available; delete them only when no longer needed.

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

Run `node dist/cli.js generate --request request.json --env-file /absolute/path/to/credentials.env`. For an edit, use the `edit` command, a new request ID, and a saved image path or returned `artifact:...` ID in `references`.

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
