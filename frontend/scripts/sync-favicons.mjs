import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');
const assetsPath = path.join(publicDir, 'favicon-assets.json');

async function main() {
  const json = await readFile(assetsPath, 'utf8');
  const assets = JSON.parse(json);

  await Promise.all(
    Object.entries(assets).map(async ([name, base64]) => {
      const targetPath = path.join(publicDir, name);
      await writeFile(targetPath, Buffer.from(base64, 'base64'));
    })
  );

  console.log(`Generated ${Object.keys(assets).length} favicon assets in ${publicDir}`);
}

main().catch((error) => {
  console.error('Failed to sync favicon assets:', error);
  process.exitCode = 1;
});
