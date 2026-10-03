import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const evidence = JSON.parse(await readFile('docs/live-validation.json', 'utf8'));
const models = [...new Set(evidence.workflows.map(item => item.model))];
const destination = resolve('.image-generation', 'review');
await mkdir(destination, { recursive: true });
const width = 1080;
const tile = 360;
const rowHeight = 310;
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
for (let start = 0; start < models.length; start += 4) {
  const group = models.slice(start, start + 4);
  const height = 40 + group.length * rowHeight;
  const layers = [];
  const labels = ['generate', 'reference', 'edit'].map((name, column) =>
    `<text x="${column * tile + 12}" y="27" font-size="20">${name}</text>`);
  for (const [row, model] of group.entries()) {
    labels.push(`<text x="12" y="${65 + row * rowHeight}" font-size="18">${escape(model)}</text>`);
    for (const [column, stage] of ['generate', 'reference', 'edit'].entries()) {
      const item = evidence.workflows.find(item => item.model === model && item.stage === stage);
      if (!item) continue;
      const input = await sharp(resolve(item.artifacts[0].path))
        .resize(tile - 16, 260, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
      layers.push({ input, left: column * tile + 8, top: 75 + row * rowHeight });
    }
  }
  layers.push({ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial" fill="#17202b">${labels.join('')}</g></svg>`), left: 0, top: 0 });
  const path = join(destination, `catalogue-${start / 4 + 1}.png`);
  await sharp({ create: { width, height, channels: 4, background: '#f0f2f4' } }).composite(layers).png().toFile(path);
  console.log(path);
}
