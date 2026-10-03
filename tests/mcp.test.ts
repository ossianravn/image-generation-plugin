import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fixture } from './helpers.ts';
import { keyNames } from '../src/credentials.ts';

for (const mode of ['legacy', 'auto'] as const) {
  test(`packaged stdio server lists tools and returns a native image (${mode} MCP)`, async () => {
    const f = await fixture();
    const path = join(f.directory, 'fixture.png');
    await writeFile(path, f.bytes);
    const client = new Client({ name: 'image-plugin-test', version: '1.0.0' }, { versionNegotiation: { mode } });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: [resolve(process.env.IMAGE_GENERATION_TEST_ENTRY ?? 'dist/cli.js'), 'serve', '--data-dir', f.directory], stderr: 'pipe',
      env: { ...Object.fromEntries(Object.values(keyNames).map(name => [name, 'mcp-test-secret'])),
        IMAGE_GENERATION_DATA: f.directory } });
    try {
      await client.connect(transport);
      assert.equal(client.getProtocolEra(), mode === 'auto' ? 'modern' : 'legacy');
      const tools = await client.listTools();
      assert.ok(tools.tools.some(tool => tool.name === 'edit_image'));
      const credentials = await client.callTool({ name: 'credential_status', arguments: {} });
      assert.equal(credentials.isError, undefined);
      assert.equal(JSON.stringify(credentials).includes('mcp-test-secret'), false);
      const status = credentials.structuredContent as { credentials: { configured: boolean; source: string }[] };
      assert.equal(status.credentials.length, 4);
      assert.ok(status.credentials.every(item => item.configured && item.source === 'environment'));
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
