// Copies pdf.js font and character-map assets into public/ so PDFs that rely
// on standard (non-embedded) fonts or CJK encodings render fully offline.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['standard_fonts', 'cmaps']) {
  const from = join(root, 'node_modules/pdfjs-dist', dir);
  if (!existsSync(from)) throw new Error(`Missing ${from}; run npm install first`);
  cpSync(from, join(root, 'public', dir), { recursive: true });
}
console.log('pdf.js assets copied to public/');
