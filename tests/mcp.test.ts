import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fixture } from './helpers.ts';

for (const mode of ['legacy', 'auto'] as const) {
  test(`packaged stdio server lists tools and returns a native image (${mode} MCP)`, async () => {
    const f = await fixture();
    const path = join(f.directory, 'fixture.png');
    await writeFile(path, f.bytes);
    const client = new Client({ name: 'image-plugin-test', version: '1.0.0' }, { versionNegotiation: { mode } });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: [resolve(process.env.IMAGE_GENERATION_TEST_ENTRY ?? 'dist/cli.js'), 'serve', '--data-dir', f.directory], stderr: 'pipe' });
    try {
      await client.connect(transport);
      assert.equal(client.getProtocolEra(), mode === 'auto' ? 'modern' : 'legacy');
      const tools = await client.listTools();
      assert.ok(tools.tools.some(tool => tool.name === 'edit_image'));
      const models = await client.callTool({ name: 'list_models', arguments: {} });
      assert.equal(models.isError, undefined);
      const image = await client.callTool({ name: 'inspect_image', arguments: { image: path } });
      const blocks = image.content as { type: string; mimeType?: string }[];
      assert.ok(blocks.some(block => block.type === 'image' && block.mimeType === 'image/png'));
      const missing = await client.callTool({ name: 'get_job', arguments: { job_id: 'missing', wait_ms: 0 } });
      assert.equal(missing.isError, true);
    } finally { await client.close(); }
  });
}
