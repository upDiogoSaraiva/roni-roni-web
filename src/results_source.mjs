// Fonte de resultados para o botão "Buscar resultados" do Admin.
// Ordem: (1) RESULTS_SOURCE_URL (feed JSON com o mesmo formato), (2) ESPN ao vivo
// (Mundial 2026, fifa.world — sem chave), (3) data/results_source.json (fallback local).
// Honesto: nunca inventa resultados — só importa o que a fonte real fornecer.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let lastLiveError = null;

// fase de grupos do Mundial 2026 (12-27 jun). O filtro "mesmo grupo" exclui o mata-mata.
const ESPN_DATES = '20260611-20260627';
const ESPN_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${ESPN_DATES}`;

// aceita o formato normalizado e o formato "estado" do pool
function normalize(raw) {
  if (raw && raw.groups) return raw.groups;
  const groups = {};
  for (const [g, info] of Object.entries(raw?.grupos_resultados || {})) {
    groups[g] = (info.jogos || []).map(([home, away, hg, ag]) => ({
      home, away, homeGoals: hg, awayGoals: ag, matchday: info.jornadas || 1,
    }));
  }
  return groups;
}

// Junta por CÓDIGO FIFA (ESPN abbreviation == teams_meta.code) — imune a diacríticos/aliases.
// ctx = { codeToTeam: {COD:'Congo',...}, teamGroup: (nome)=>grupo }
export async function fetchEspnGroupResults({ codeToTeam, teamGroup }) {
  const res = await fetch(ESPN_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);
  const data = await res.json();
  const byGroup = {};
  for (const e of data.events || []) {
    if (e.status?.type?.state !== 'post') continue; // só jogos terminados
    const comp = e.competitions?.[0];
    const cs = comp?.competitors || [];
    const hc = cs.find((c) => c.homeAway === 'home');
    const ac = cs.find((c) => c.homeAway === 'away');
    if (!hc || !ac) continue;
    const home = codeToTeam[hc.team?.abbreviation];
    const away = codeToTeam[ac.team?.abbreviation];
    if (!home || !away) continue; // seleção fora deste pool
    const g = teamGroup(home);
    if (!g || teamGroup(away) !== g) continue; // não é jogo da fase de grupos deste grupo
    const hg = parseInt(hc.score, 10);
    const ag = parseInt(ac.score, 10);
    if (!Number.isInteger(hg) || !Number.isInteger(ag)) continue;
    (byGroup[g] ||= []).push({ home, away, homeGoals: hg, awayGoals: ag, date: e.date || '' });
  }
  // jornada inferida por ordem de data dentro do grupo (2 jogos por jornada)
  for (const g of Object.keys(byGroup)) {
    byGroup[g].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    byGroup[g].forEach((m, i) => { m.matchday = Math.floor(i / 2) + 1; delete m.date; });
  }
  const count = Object.values(byGroup).reduce((n, a) => n + a.length, 0);
  if (!count) throw new Error('ESPN não devolveu jogos terminados');
  return { groups: byGroup, source: 'ESPN — Mundial 2026 (ao vivo)', count };
}

export async function loadResultsSource(ctx) {
  const url = process.env.RESULTS_SOURCE_URL;
  if (url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`fonte respondeu ${res.status}`);
    return { groups: normalize(await res.json()), source: url };
  }
  // fonte ao vivo (ESPN) por defeito
  if (ctx?.codeToTeam && ctx?.teamGroup) {
    try { return await fetchEspnGroupResults(ctx); }
    catch (e) { lastLiveError = e.message; } // cai para o ficheiro local
  }
  const file = join(root, 'data/results_source.json');
  if (!existsSync(file)) throw new Error(lastLiveError || 'sem fonte de resultados disponível');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return { groups: normalize(raw), source: (raw.source || 'data/results_source.json') + (lastLiveError ? ` (ESPN indisponível: ${lastLiveError})` : '') };
}
