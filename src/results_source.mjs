// Fonte de resultados para o botão "Buscar resultados" do Admin.
// Ordem: (1) RESULTS_SOURCE_URL (feed JSON com o mesmo formato), (2) ESPN ao vivo
// (Mundial 2026, fifa.world — sem chave), (3) data/results_source.json (fallback local).
// Honesto: nunca inventa resultados — só importa o que a fonte real fornecer.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveBracket } from './bracket.mjs';

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

// ---- mata-mata ao vivo (ESPN) ----
const ESPN_KO_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260720';

// deteta a fase em que o jogo acabou: penáltis, prolongamento ou tempo regulamentar
function detectMethod(status, competitors) {
  if ((competitors || []).some((c) => c.shootoutScore != null)) return 'PEN';
  const detail = (status?.type?.detail || status?.type?.name || '').toUpperCase();
  if ((status?.period || 0) > 2 || /AET|OT|EXTRA/.test(detail)) return 'PROL';
  return 'TR';
}

// escolhe o jogo do bracket a que um evento ESPN corresponde, ancorando nos lados já resolvidos.
// devolve null se nenhum bater OU se for ambíguo (deixa para correção manual).
function bestMatchFor(bracket, resolved, assigned, teams) {
  const cands = [];
  for (const id of Object.keys(bracket.matches)) {
    if (assigned[id]) continue;
    const r = resolved[id];
    const known = [r.home.team, r.away.team].filter(Boolean);
    if (!known.length || !known.every((t) => teams.has(t))) continue;
    cands.push({ id, score: known.length });
  }
  if (!cands.length) return null;
  const max = Math.max(...cands.map((c) => c.score));
  const top = cands.filter((c) => c.score === max);
  return top.length === 1 ? top[0].id : null; // ambíguo -> não arrisca
}

// Busca os jogos do mata-mata terminados e mapeia-os aos IDs do bracket. ctx inclui standings.
export async function fetchEspnKnockout({ codeToTeam, teamGroup, bracket, standings }) {
  const res = await fetch(ESPN_KO_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);
  const data = await res.json();
  const events = [];
  for (const e of data.events || []) {
    if (e.status?.type?.state !== 'post') continue;
    const cs = e.competitions?.[0]?.competitors || [];
    const hc = cs.find((c) => c.homeAway === 'home');
    const ac = cs.find((c) => c.homeAway === 'away');
    if (!hc || !ac) continue;
    const home = codeToTeam[hc.team?.abbreviation];
    const away = codeToTeam[ac.team?.abbreviation];
    if (!home || !away) continue;
    const wc = cs.find((c) => c.winner === true);
    events.push({
      home, away,
      homeGoals: parseInt(hc.score, 10),
      awayGoals: parseInt(ac.score, 10),
      winner: wc ? codeToTeam[wc.team?.abbreviation] : null,
      method: detectMethod(e.status, cs),
      teams: new Set([home, away]),
    });
  }
  // ponto-fixo: R32 ancora-se na classificação dos grupos; ao mapear, os winnerOf propagam
  const assigned = {};
  const used = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    const acc = {};
    for (const [mid, ev] of Object.entries(assigned)) acc[mid] = { home: ev.home, away: ev.away, winner: ev.winner };
    const resolved = resolveBracket(bracket, standings, acc);
    for (const ev of events) {
      if (used.has(ev)) continue;
      const mid = bestMatchFor(bracket, resolved, assigned, ev.teams);
      if (mid) { assigned[mid] = ev; used.add(ev); changed = true; }
    }
  }
  const out = {};
  for (const [mid, ev] of Object.entries(assigned)) {
    out[mid] = { home: ev.home, away: ev.away, homeGoals: ev.homeGoals, awayGoals: ev.awayGoals, winner: ev.winner, method: ev.method };
  }
  return out;
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
