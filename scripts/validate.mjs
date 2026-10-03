import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const problems = [];
for (const name of ['plugin', 'mcp']) {
  const schema = JSON.parse(await readFile(`schemas/${name}.schema.json`, 'utf8'));
  const value = JSON.parse(await readFile(`${name}.json`, 'utf8'));
  const validate = ajv.compile(schema);
  if (!validate(value)) problems.push(`${name}.json: ${ajv.errorsText(validate.errors)}`);
}
const manifest = JSON.parse(await readFile('plugin.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== pkg.version) problems.push('Package and plugin versions disagree.');
await stat('dist/cli.js');

async function checkCode(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await checkCode(path);
    else if (/\.(?:ts|mjs)$/.test(path)) {
      const lines = (await readFile(path, 'utf8')).trimEnd().split(/\r?\n/).length;
      if (lines > 300) problems.push(`${path}: ${lines} physical lines exceeds the 300-line rule.`);
    }
  }
}
for (const directory of ['src', 'tests', 'scripts']) await checkCode(directory);

const skill = await readFile('skills/image-generation/SKILL.md', 'utf8');
if (!/^---\r?\nname: image-generation\r?\ndescription: .+\r?\n---/.test(skill)) {
  problems.push('The image-generation skill needs valid name and description frontmatter.');
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.log('Portable schemas, version metadata, built entry point, skill frontmatter, and code line limits passed.');
