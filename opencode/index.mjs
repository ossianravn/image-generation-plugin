import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default {
  id: 'image-generation',
  async setup(ctx) {
    const path = resolve(root, 'skills/image-generation/SKILL.md');
    const skill = await readFile(path, 'utf8');
    const description = skill.match(/^description: (.+)$/m)?.[1];
    if (!description) throw new Error('Image Generation skill description is missing.');
    await ctx.skill.transform(editor => editor.add({
      id: 'image-generation', name: 'image-generation', description, path,
      content: skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''),
    }));
    await ctx.mcp.transform(editor => {
      if (!editor.get('image-generation')) editor.set('image-generation', {
        type: 'local', command: ['node', resolve(root, 'bin/image-generation.mjs'), 'serve'], protocol: 'auto',
      });
    });
  },
};
