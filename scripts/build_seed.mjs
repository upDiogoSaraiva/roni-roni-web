// Constrói data/seed.json a partir dos dados reais do pool:
//  - groups.json: as 48 seleções por grupo (A–L)
//  - field_2026_real.csv: as 27 apostas reais (campeão, Final 4, 1.º/2.º/3.º por grupo)
//  - estado_atual_ref.json: os resultados reais já conhecidos (fase de grupos)
// Só LÊ dados; nenhuma lógica do motor é importada.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTeamsMeta } from './teams_meta.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// competição alvo (por defeito wc2026); os dados vivem em data/competitions/<id>/
const compId = process.argv[2] || 'wc2026';
const compRoot = `data/competitions/${compId}`;
const read = (p) => readFileSync(join(root, p), 'utf8');

const groups = JSON.parse(read(`${compRoot}/groups.json`));
const estado = JSON.parse(read(`${compRoot}/estado_atual_ref.json`));
const teams = buildTeamsMeta();

// índice equipa -> grupo, e validação de que cada nome do CSV é uma seleção conhecida
const teamGroup = {};
for (const [g, list] of Object.entries(groups)) {
  for (const t of list) teamGroup[t] = g;
}

const GROUP_IDS = Object.keys(groups); // A..L

// --- parse do CSV das apostas reais ---
const csv = read(`${compRoot}/field_2026_real.csv`).replace(/\r\n/g, '\n').trim();
const [headerLine, ...rows] = csv.split('\n');
const header = headerLine.split(',');

const bets = [];
const warnings = [];
for (const line of rows) {
  if (!line.trim()) continue;
  const cells = line.split(',');
  const rec = {};
  header.forEach((h, i) => (rec[h] = (cells[i] ?? '').trim()));

  const player = rec.participante;
  const grupos = {};
  // Regra do teto: quem listar mais de 8 terceiros só conta os 8 PRIMEIROS por ordem de
  // grupo (A->L); os restantes são descartados (não dão pontos de apuramento).
  let listed = 0;
  let kept = 0;
  let capped = 0;
  for (const g of GROUP_IDS) {
    const first = rec[`${g}1`] || null;
    const second = rec[`${g}2`] || null;
    let third = rec[`${g}3`] || null;
    if (third) {
      listed++;
      if (kept < 8) kept++;
      else { third = null; capped++; } // já tem 8 -> descarta este 3.º
    }
    grupos[g] = { first, second, third };
    for (const [slot, pick] of [['first', first], ['second', second], ['third', third]]) {
      if (pick && teamGroup[pick] !== g) {
        warnings.push(`${player}: ${g}.${slot}="${pick}" não pertence ao grupo ${g}`);
      }
    }
  }
  if (capped) warnings.push(`${player}: listou ${listed} terceiros -> aplicado teto de 8 (descartados ${capped} por ordem de grupo)`);
  else if (listed < 8) warnings.push(`${player}: só ${listed} terceiros`);

  bets.push({
    player,
    champion: rec.campeao || null,
    final4: [rec.sf1, rec.sf2, rec.sf3, rec.sf4].filter(Boolean),
    groups: grupos,
    // apostas reais (seed): bloqueadas no início, sem alterações
    locked: true,
    submittedAt: '2026-06-08T00:00:00.000Z',
    pin: null,
    seed: true,
  });
}

// --- resultados reais (fase de grupos) ---
// formato de origem: { A: { jornadas, jogos: [[home, away, hg, ag, matchday?], ...] }, ... }
const groupResults = {};
for (const g of GROUP_IDS) {
  const src = estado.grupos_resultados?.[g];
  groupResults[g] = (src?.jogos || []).map(([home, away, hg, ag, md]) => ({
    home,
    away,
    homeGoals: hg,
    awayGoals: ag,
    matchday: md || 1,
  }));
}

const seed = {
  meta: {
    tournament: 'Torneio Roni Roni 2026',
    players: bets.length,
    generatedFrom: 'field_2026_real.csv + estado_atual_ref.json',
    note: 'Conteúdo neutro: apostas, resultados e pontos. Sem outputs do motor de decisão.',
  },
  groups,
  groupOrder: GROUP_IDS,
  teams,
  results: { groups: groupResults },
  windowOpen: true,
  bets,
};

writeFileSync(join(root, `${compRoot}/seed.json`), JSON.stringify(seed, null, 2));
console.log(`seed.json: ${bets.length} apostas, ${Object.keys(teams).length} seleções, ${GROUP_IDS.length} grupos`);
if (warnings.length) {
  console.log(`\n${warnings.length} aviso(s) sobre os dados reais (mantidos tal como estão):`);
  for (const w of warnings) console.log('  - ' + w);
}
