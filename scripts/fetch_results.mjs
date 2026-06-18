// CLI: busca resultados da fonte (RESULTS_SOURCE_URL ou data/results_source.json) e sincroniza
// data/store.json. Equivalente ao botão "Buscar resultados" do Admin. Não inventa resultados.
//   node scripts/fetch_results.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadResultsSource } from '../src/results_source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const seed = read('data/seed.json');
const groups = seed.groups;
const teamGroup = {};
for (const [g, ts] of Object.entries(groups)) for (const t of ts) teamGroup[t] = g;
const codeToTeam = {};
for (const [name, meta] of Object.entries(seed.teams)) codeToTeam[meta.code] = name;

const storePath = join(root, 'data/store.json');
const store = existsSync(storePath)
  ? JSON.parse(readFileSync(storePath, 'utf8'))
  : { windowOpen: seed.windowOpen !== false, results: structuredClone(seed.results), bets: structuredClone(seed.bets) };

const { groups: src, source } = await loadResultsSource({ codeToTeam, teamGroup: (t) => teamGroup[t] || null });
let imported = 0;
const errors = [];
for (const [g, matches] of Object.entries(src)) {
  const list = store.results.groups[g] || (store.results.groups[g] = []);
  for (const m of matches) {
    if (teamGroup[m.home] !== g || teamGroup[m.away] !== g) { errors.push(`${g}: equipa fora do grupo`); continue; }
    const idx = list.findIndex((x) => (x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home));
    const match = { home: m.home, away: m.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals, matchday: m.matchday || 1 };
    if (idx >= 0) list[idx] = match;
    else list.push(match);
    imported++;
  }
}
writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(`Sincronizado de "${source}": ${imported} jogos.${errors.length ? ' avisos: ' + errors.length : ''}`);
