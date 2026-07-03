// Descarrega os 48 SVGs de bandeira (flagcdn.com — domínio público, baseado em lipis/flag-icons)
// para public/flags/, tornando a app auto-contida e fiável em qualquer plataforma (inc. Windows).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flagFiles } from './teams_meta.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, '..', 'public', 'flags');
mkdirSync(out, { recursive: true });

const files = [...new Set(flagFiles())];
let ok = 0;
for (const f of files) {
  const dest = join(out, `${f}.svg`);
  if (existsSync(dest) && f !== 'pt') continue; // já existe — não re-descarrega nem reescreve
  const res = await fetch(`https://flagcdn.com/${f}.svg`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) { console.error('FALHOU', f, res.status); continue; }
  const svg = await res.text();
  writeFileSync(dest, svg);
  ok++;
}
console.log(`bandeiras: ${ok}/${files.length} guardadas em public/flags/`);
