// Fonte de resultados para o botão "Buscar resultados" do Admin.
// Tenta, por ordem: (1) RESULTS_SOURCE_URL (um feed JSON com o mesmo formato),
// (2) data/results_source.json (ficheiro local que o organizador mantém).
// Devolve resultados normalizados; a validação contra grupos/equipas é feita pelo servidor.
// Honesto: não inventa resultados — só importa o que a fonte fornecer.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Aceita dois formatos: o normalizado ({ groups: { A: [{home,away,homeGoals,awayGoals,matchday}] } })
// e o formato "estado" do pool ({ grupos_resultados: { A: { jogos: [[home,away,hg,ag]] } } }).
function normalize(raw) {
  if (raw && raw.groups) return raw.groups;
  const groups = {};
  const src = raw?.grupos_resultados || {};
  for (const [g, info] of Object.entries(src)) {
    groups[g] = (info.jogos || []).map(([home, away, hg, ag]) => ({
      home, away, homeGoals: hg, awayGoals: ag, matchday: info.jornadas || 1,
    }));
  }
  return groups;
}

export async function loadResultsSource() {
  const url = process.env.RESULTS_SOURCE_URL;
  if (url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`fonte respondeu ${res.status}`);
    const raw = await res.json();
    return { groups: normalize(raw), source: url };
  }
  const file = join(root, 'data/results_source.json');
  if (!existsSync(file)) throw new Error('sem fonte de resultados (define RESULTS_SOURCE_URL ou cria data/results_source.json)');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return { groups: normalize(raw), source: raw.source || 'data/results_source.json' };
}
