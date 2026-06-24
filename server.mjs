// Servidor do pool Torneio Roni Roni — zero dependências (node:http), persistência em JSON.
// Serve a SPA em public/ e uma API neutra (apostas, resultados, pontos). Nada do motor.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { computeWorldState, leaderboard } from './src/scoring.mjs';
import { loadResultsSource, fetchEspnKnockout } from './src/results_source.mjs';
import { resolveBracket, groupStageComplete } from './src/bracket.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, 'public');
const PORT = Number(process.env.PORT || 4026);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'roni2026';
const REGISTRY_PATH = join(root, 'data/registry.json');
const compDir = (id) => join(root, 'data/competitions', id);

// --- registo de competições (qual é a ativa, quais existem) ---
let registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const saveRegistry = () => writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));

// --- competição ATIVA: estes valores são recarregados ao trocar de competição ---
let activeId; let seed; let GROUPS; let GROUP_ORDER; let TEAMS; let META; let BRACKET; let COMP;
let KO_ROUNDS; let matchRound; let roundJoker; let groupOf; let store; let STORE_PATH;
const teamGroup = (t) => groupOf[t] || null;
let codeToTeam = {};

function defaultWindows(groupsOpen) {
  const w = { grupos: groupsOpen };
  for (const r of KO_ROUNDS) w[r] = false;
  return w;
}
// escreve com cópia de segurança .bak antes de cada gravação (nunca perder dados)
function backupThenWrite(path, data) {
  try { if (existsSync(path)) copyFileSync(path, path + '.bak'); } catch { /* backup best-effort */ }
  writeFileSync(path, data);
}
const saveStore = () => backupThenWrite(STORE_PATH, JSON.stringify(store, null, 2));

// identidades (token de dispositivo, sem password) — ficheiro transversal às edições
const IDENTITIES_PATH = join(root, 'data/identities.json');
let identities = existsSync(IDENTITIES_PATH) ? JSON.parse(readFileSync(IDENTITIES_PATH, 'utf8')) : { byToken: {}, byPlayer: {} };
const saveIdentities = () => backupThenWrite(IDENTITIES_PATH, JSON.stringify(identities, null, 2));

// Lê uma competição (qualquer, não só a ativa) para um objeto, sem tocar nos globais.
function readCompetition(id) {
  const dir = compDir(id);
  const s = JSON.parse(readFileSync(join(dir, 'seed.json'), 'utf8'));
  const bracket = JSON.parse(readFileSync(join(dir, 'bracket.json'), 'utf8'));
  const comp = JSON.parse(readFileSync(join(dir, 'competition.json'), 'utf8'));
  comp.sourceFile = join(dir, 'results_source.json');
  const koRounds = bracket.rounds.map((r) => r.id);
  const mRound = {};
  for (const [mid, m] of Object.entries(bracket.matches)) mRound[mid] = m.round;
  const gOf = {};
  for (const [g, ts] of Object.entries(s.groups)) for (const t of ts) gOf[t] = g;
  const c2t = {};
  for (const [name, meta] of Object.entries(s.teams)) c2t[meta.code] = name;
  const storePath = join(dir, 'store.json');
  let st;
  if (existsSync(storePath)) st = JSON.parse(readFileSync(storePath, 'utf8'));
  else st = { windowOpen: s.windowOpen !== false, results: structuredClone(s.results), bets: structuredClone(s.bets) };
  if (!st.windows) { st.windows = { grupos: s.windowOpen !== false }; for (const r of koRounds) st.windows[r] = false; }
  if (!st.knockouts) st.knockouts = {};
  if (!st.marketResults) st.marketResults = {}; // vencedores dos mercados extra (melhor marcador, etc.)
  for (const b of st.bets) { if (!b.knockouts) b.knockouts = {}; if (!b.jokers) b.jokers = []; if (!b.markets) b.markets = {}; }
  return {
    id, seed: s, GROUPS: s.groups, GROUP_ORDER: s.groupOrder, TEAMS: s.teams, META: s.meta,
    BRACKET: bracket, COMP: comp, KO_ROUNDS: koRounds, matchRound: mRound,
    roundJoker: Object.fromEntries(bracket.rounds.map((r) => [r.id, !!r.joker])),
    groupOf: gOf, codeToTeam: c2t, store: st, STORE_PATH: storePath,
  };
}

function loadActive(id) {
  const c = readCompetition(id);
  ({ seed, GROUPS, GROUP_ORDER, TEAMS, META, BRACKET, COMP, KO_ROUNDS, matchRound, roundJoker, groupOf, codeToTeam, store, STORE_PATH } = c);
  activeId = id;
  saveStore();
}
loadActive(registry.activeId);

// Classificação final guardada de uma edição importada (sem grupos para recalcular).
function archivedSummary(id) {
  const comp = JSON.parse(readFileSync(join(compDir(id), 'competition.json'), 'utf8'));
  const rows = [...(comp.finalStandings || [])].sort((a, b) => b.total - a.total).map((r) => ({ player: r.player, score: { total: r.total } }));
  let lastPts = null;
  let lastRank = 0;
  rows.forEach((r, i) => { if (r.score.total !== lastPts) { lastRank = i + 1; lastPts = r.score.total; } r.rank = lastRank; });
  const meta = registry.competitions.find((x) => x.id === id) || { id, name: comp.name, edition: comp.edition, status: 'archived' };
  return { meta, competition: { name: comp.name, edition: comp.edition, entry: comp.entry || 0, prizes: comp.prizes || [] }, leaderboard: rows, teams: {}, groupOrder: [], matchesPlayed: null, bets: {}, archived: true };
}

// Resumo de uma competição (ativa ou arquivada): classificação + folhas, sem mexer na ativa.
function competitionSummary(id) {
  if (registry.competitions.find((x) => x.id === id)?.kind === 'archive') return archivedSummary(id);
  const c = id === activeId
    ? { GROUPS, BRACKET, COMP, store, groupOf, TEAMS, GROUP_ORDER }
    : readCompetition(id);
  const w = computeWorldState(c.GROUPS, c.store.results.groups, { bracket: c.BRACKET, knockoutResults: c.store.knockouts }, c.COMP);
  const lb = leaderboard(c.store.bets, w, (t) => c.groupOf[t] || null);
  const meta = registry.competitions.find((x) => x.id === id) || { id, name: c.COMP.name, edition: c.COMP.edition, status: 'active' };
  return { meta, competition: { name: c.COMP.name, edition: c.COMP.edition, entry: c.COMP.entry, prizes: c.COMP.prizes }, leaderboard: lb, teams: c.TEAMS, groupOrder: c.GROUP_ORDER, matchesPlayed: w.matchesPlayed, bets: Object.fromEntries(c.store.bets.map((b) => [b.player, publicBet(b)])) };
}

// tokens de admin válidos (memória; nível protótipo)
const adminTokens = new Set();

// ---------- helpers ----------
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('payload demasiado grande'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });

const isAdmin = (req) => adminTokens.has(req.headers['x-admin-token']);

// equipas que o jogador deixou fora do grupo certo / outras validações
function validateBet(b) {
  const errors = [];
  if (!b || typeof b.player !== 'string' || !b.player.trim()) errors.push('Nome do jogador em falta.');
  const valid = (t) => typeof t === 'string' && !!TEAMS[t];
  if (!valid(b.champion)) errors.push('Campeão inválido.');
  if (!Array.isArray(b.final4) || b.final4.length !== 4) errors.push('Final 4 tem de ter 4 seleções.');
  else {
    if (new Set(b.final4).size !== 4) errors.push('Final 4 não pode repetir seleções.');
    for (const t of b.final4) if (!valid(t)) errors.push(`Final 4: "${t}" inválida.`);
  }
  let thirds = 0;
  for (const g of GROUP_ORDER) {
    const pick = (b.groups || {})[g] || {};
    const { first, second, third } = pick;
    if (!valid(first) || teamGroup(first) !== g) errors.push(`Grupo ${g}: 1.º inválido.`);
    if (!valid(second) || teamGroup(second) !== g) errors.push(`Grupo ${g}: 2.º inválido.`);
    if (first && second && first === second) errors.push(`Grupo ${g}: 1.º e 2.º iguais.`);
    if (third) {
      if (teamGroup(third) !== g) errors.push(`Grupo ${g}: 3.º inválido.`);
      if (third === first || third === second) errors.push(`Grupo ${g}: 3.º repete o 1.º/2.º.`);
      thirds++;
    }
  }
  if (thirds !== 8) errors.push(`Tens de escolher exatamente 8 terceiros (tens ${thirds}).`);
  return errors;
}

// estado do mundo + leaderboard, recalculado a cada pedido (barato: 27 apostas)
function world() {
  return computeWorldState(GROUPS, store.results.groups, { bracket: BRACKET, knockoutResults: store.knockouts, marketResults: store.marketResults }, COMP);
}
// guarda as posições atuais para calcular o indicador de movimento após a próxima mudança
function snapshotRanks() {
  const lb = leaderboard(store.bets, world(), teamGroup);
  store.prevRanks = Object.fromEntries(lb.map((r) => [r.player, r.rank]));
}

// valida e insere/atualiza UM resultado (sem snapshot nem save — o chamador trata disso).
// devolve 'novo' | 'atualizado' | 'igual', ou lança Error com mensagem clara.
function upsertResult({ group, home, away, homeGoals, awayGoals, matchday }) {
  if (!GROUPS[group]) throw new Error(`Grupo inválido: ${group}`);
  if (teamGroup(home) !== group || teamGroup(away) !== group) throw new Error(`Equipa fora do grupo ${group}.`);
  if (home === away) throw new Error('Equipas iguais.');
  const hg = Number(homeGoals);
  const ag = Number(awayGoals);
  if (!Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) throw new Error('Resultado inválido.');
  const list = store.results.groups[group];
  const idx = list.findIndex((m) => (m.home === home && m.away === away) || (m.home === away && m.away === home));
  const match = { home, away, homeGoals: hg, awayGoals: ag, matchday: Number(matchday) || 1 };
  if (idx < 0) { list.push(match); return 'novo'; }
  const prev = list[idx];
  const same = prev.home === home && prev.away === away && prev.homeGoals === hg && prev.awayGoals === ag;
  list[idx] = match;
  return same ? 'igual' : 'atualizado';
}
function publicBet(b) {
  return {
    player: b.player,
    champion: b.champion,
    final4: b.final4,
    groups: b.groups,
    knockouts: b.knockouts || {},
    jokers: b.jokers || [],
    markets: b.markets || {},
    seed: !!b.seed,
    hasPin: !!b.pin,
    submittedAt: b.submittedAt || null,
  };
}
function submissionStatus() {
  const submitted = store.bets.map((b) => b.player);
  return {
    windowOpen: store.windows.grupos,
    windows: store.windows,
    total: store.bets.length,
    seedPlayers: seed.bets.map((b) => b.player),
    submitted,
  };
}

// ---------- API ----------
async function api(req, res, path) {
  const method = req.method;

  if (path === '/api/state' && method === 'GET') {
    return json(res, 200, {
      groups: GROUPS,
      groupOrder: GROUP_ORDER,
      teams: TEAMS,
      meta: META,
      competition: { id: COMP.id, name: COMP.name, edition: COMP.edition, tagline: COMP.tagline, entry: COMP.entry, prizes: COMP.prizes, markets: COMP.markets || [] },
      windowOpen: store.windows.grupos,
      windows: store.windows,
      koRounds: BRACKET.rounds.map((r) => ({ id: r.id, label: r.label, joker: !!r.joker, winPts: r.winPts, methodPts: r.methodPts, matches: r.matches })),
      players: store.bets.map((b) => ({ player: b.player, seed: !!b.seed, hasPin: !!b.pin })),
    });
  }

  if (path === '/api/bracket' && method === 'GET') {
    const w = world();
    return json(res, 200, {
      rounds: BRACKET.rounds,
      matches: BRACKET.matches,
      resolved: resolveBracket(BRACKET, w.standings, store.knockouts),
      windows: store.windows,
      groupStageComplete: groupStageComplete(w.standings),
    });
  }

  // lista de competições (ativa + arquivadas)
  if (path === '/api/competitions' && method === 'GET') {
    return json(res, 200, { activeId, competitions: registry.competitions });
  }

  // resumo de uma competição (qualquer): classificação final/atual + folhas
  if (path.startsWith('/api/history/') && method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/history/'.length));
    if (!registry.competitions.some((c) => c.id === id)) return json(res, 404, { error: 'Competição desconhecida.' });
    try { return json(res, 200, competitionSummary(id)); }
    catch (e) { return json(res, 500, { error: String(e.message || e) }); }
  }

  // historial de um jogador ao longo de todas as edições
  if (path.startsWith('/api/player/') && method === 'GET') {
    const name = decodeURIComponent(path.slice('/api/player/'.length));
    const editions = [];
    for (const c of registry.competitions) {
      let sum;
      try { sum = competitionSummary(c.id); } catch { continue; }
      const row = sum.leaderboard.find((r) => r.player === name);
      if (!row) continue;
      editions.push({ id: c.id, name: sum.competition.name, edition: sum.competition.edition, status: c.status, rank: row.rank, total: row.score.total, players: sum.leaderboard.length });
    }
    return json(res, 200, { player: name, editions });
  }

  // ---------- identidade (token de dispositivo, sem password) ----------
  // reivindicar um nome: emite token + código de 6 dígitos para ligar outros dispositivos
  if (path === '/api/identity/claim' && method === 'POST') {
    const body = await readBody(req);
    const player = (body.player || '').trim();
    if (!player) return json(res, 400, { error: 'Indica o teu nome.' });
    if (identities.byPlayer[player]) return json(res, 409, { error: 'Este nome já foi reivindicado. No outro dispositivo usa "Ligar dispositivo" com o código.' });
    const token = randomUUID();
    const code = (randomUUID().replace(/[^0-9]/g, '') + '000000').slice(0, 6);
    identities.byPlayer[player] = { code, tokens: [token] };
    identities.byToken[token] = player;
    saveIdentities();
    return json(res, 200, { player, token, code });
  }
  // ligar este dispositivo a um nome já reivindicado, com o código
  if (path === '/api/identity/link' && method === 'POST') {
    const body = await readBody(req);
    const player = (body.player || '').trim();
    const code = (body.code || '').trim();
    const rec = identities.byPlayer[player];
    if (!rec || rec.code !== code) return json(res, 403, { error: 'Nome ou código errado.' });
    const token = randomUUID();
    rec.tokens.push(token);
    identities.byToken[token] = player;
    saveIdentities();
    return json(res, 200, { player, token });
  }
  // quem sou eu (a partir do token do dispositivo) + código para ligar outros dispositivos
  if (path === '/api/identity/me' && method === 'GET') {
    const token = req.headers['x-player-token'];
    const player = (token && identities.byToken[token]) || null;
    return json(res, 200, { player, code: player ? (identities.byPlayer[player]?.code || null) : null });
  }

  // hall da fama — agregação entre TODAS as edições do registo (títulos, pódios, pontos, recordes)
  if (path === '/api/halloffame' && method === 'GET') {
    const players = {};
    const champions = [];
    let topScore = null;
    for (const c of registry.competitions) {
      let sum;
      try { sum = competitionSummary(c.id); } catch { continue; }
      const lb = sum.leaderboard;
      if (!lb.length) continue;
      champions.push({ id: c.id, edition: sum.competition.edition, player: lb[0].player, total: lb[0].score.total });
      for (const r of lb) {
        const p = players[r.player] || (players[r.player] = { player: r.player, editions: 0, titles: 0, podiums: 0, points: 0, bestRank: 99 });
        p.editions++; p.points += r.score.total; p.bestRank = Math.min(p.bestRank, r.rank);
        if (r.rank === 1) p.titles++;
        if (r.rank <= 3) p.podiums++;
        if (!topScore || r.score.total > topScore.total) topScore = { player: r.player, total: r.score.total, edition: sum.competition.edition };
      }
    }
    const table = Object.values(players).map((p) => ({ ...p, avgPoints: Math.round(p.points / p.editions) }))
      .sort((a, b) => b.titles - a.titles || b.points - a.points || a.bestRank - b.bestRank);
    return json(res, 200, { table, champions, records: { topScore }, editions: champions.length });
  }

  if (path === '/api/results' && method === 'GET') {
    const w = world();
    // pontos de POSIÇÃO distribuídos por grupo + total de pontos no leaderboard
    const lb = leaderboard(store.bets, w, teamGroup);
    const pointsByGroup = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0]));
    let totalPoints = 0;
    for (const r of lb) {
      totalPoints += r.score.total;
      for (const g of GROUP_ORDER) {
        const gd = r.score.groups[g];
        if (gd) pointsByGroup[g] += gd.position;
      }
    }
    return json(res, 200, {
      standings: w.standings,
      thirds: w.thirds.ranked,
      matchesPlayed: w.matchesPlayed,
      results: store.results.groups,
      pointsByGroup,
      totalPoints,
    });
  }

  if (path === '/api/leaderboard' && method === 'GET') {
    const w = world();
    const lb = leaderboard(store.bets, w, teamGroup);
    const prev = store.prevRanks || {};
    for (const r of lb) {
      const p = prev[r.player];
      r.movement = p == null ? 0 : p - r.rank; // >0 subiu, <0 desceu
    }
    const betsByPlayer = Object.fromEntries(store.bets.map((b) => [b.player, publicBet(b)]));
    return json(res, 200, {
      leaderboard: lb,
      bets: betsByPlayer,
      matchesPlayed: w.matchesPlayed,
      provisional: w.matchesPlayed < GROUP_ORDER.length * 6,
    });
  }

  // evolução das posições jornada a jornada — replay determinístico dos resultados de grupo
  // (recalcula a classificação como se a fase de grupos terminasse no fim de cada jornada)
  if (path === '/api/timeline' && method === 'GET') {
    let maxMd = 0;
    for (const g of GROUP_ORDER) for (const m of store.results.groups[g] || []) maxMd = Math.max(maxMd, m.matchday || 1);
    const matchdays = [];
    const series = new Map(store.bets.map((b) => [b.player, { player: b.player, seed: !!b.seed, points: [] }]));
    for (let md = 1; md <= maxMd; md++) {
      const cut = {};
      let any = false;
      for (const g of GROUP_ORDER) {
        cut[g] = (store.results.groups[g] || []).filter((m) => (m.matchday || 1) <= md);
        if (cut[g].length) any = true;
      }
      if (!any) continue;
      matchdays.push(md);
      const w = computeWorldState(GROUPS, cut, { bracket: BRACKET, knockoutResults: {}, marketResults: {} }, COMP);
      const lb = leaderboard(store.bets, w, teamGroup);
      for (const r of lb) series.get(r.player)?.points.push({ md, rank: r.rank, total: r.score.total });
    }
    return json(res, 200, { matchdays, groupGames: COMP.format?.groupGames || 3, count: store.bets.length, players: [...series.values()] });
  }

  // simulador "e se?" — sobrepõe resultados hipotéticos aos reais e devolve a classificação
  // projetada, com o movimento de cada jogador face a agora. NÃO persiste (clone do estado).
  if (path === '/api/whatif' && method === 'POST') {
    const body = await readBody(req);
    const hyp = Array.isArray(body.results) ? body.results : [];
    const groups = structuredClone(store.results.groups);
    for (const it of hyp) {
      const { group, home, away } = it;
      if (!groups[group] || teamGroup(home) !== group || teamGroup(away) !== group || home === away) continue;
      const hg = Number(it.homeGoals);
      const ag = Number(it.awayGoals);
      if (!Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) continue;
      const list = groups[group];
      const idx = list.findIndex((m) => (m.home === home && m.away === away) || (m.home === away && m.away === home));
      const match = { home, away, homeGoals: hg, awayGoals: ag, matchday: Number(it.matchday) || 1 };
      if (idx < 0) list.push(match); else list[idx] = match;
    }
    const rankNow = Object.fromEntries(leaderboard(store.bets, world(), teamGroup).map((r) => [r.player, r.rank]));
    const wHyp = computeWorldState(GROUPS, groups, { bracket: BRACKET, knockoutResults: store.knockouts, marketResults: store.marketResults }, COMP);
    const lbHyp = leaderboard(store.bets, wHyp, teamGroup);
    for (const r of lbHyp) { const p = rankNow[r.player]; r.movement = p == null ? 0 : p - r.rank; r.baselineRank = p ?? null; }
    return json(res, 200, { leaderboard: lbHyp, matchesPlayed: wHyp.matchesPlayed });
  }

  if (path === '/api/bets' && method === 'GET') {
    return json(res, 200, { bets: store.bets.map(publicBet) });
  }

  if (path.startsWith('/api/bet/') && method === 'GET') {
    const player = decodeURIComponent(path.slice('/api/bet/'.length));
    const bet = store.bets.find((b) => b.player === player);
    if (!bet) return json(res, 404, { error: 'Jogador não encontrado.' });
    return json(res, 200, { bet: publicBet(bet) });
  }

  if (path === '/api/bet' && method === 'POST') {
    const body = await readBody(req);
    const errors = validateBet(body);
    if (errors.length) return json(res, 400, { errors });

    const existing = store.bets.find((b) => b.player === body.player.trim());
    if (existing) {
      // editar exige janela aberta e (se houver PIN) o PIN correto
      if (!store.windowOpen && !isAdmin(req)) return json(res, 403, { errors: ['A janela de submissões está fechada.'] });
      if (existing.pin && existing.pin !== (body.pin || '') && !isAdmin(req)) {
        return json(res, 403, { errors: ['PIN incorreto para editar esta aposta.'] });
      }
      existing.champion = body.champion;
      existing.final4 = body.final4;
      existing.groups = normalizeGroups(body.groups);
      if (body.markets) existing.markets = sanitizeMarkets(body.markets);
      existing.submittedAt = new Date().toISOString();
      if (body.pin) existing.pin = String(body.pin);
      existing.seed = false;
      saveStore();
      return json(res, 200, { ok: true, updated: true, bet: publicBet(existing) });
    }

    if (!store.windowOpen && !isAdmin(req)) return json(res, 403, { errors: ['A janela de submissões está fechada.'] });
    const bet = {
      player: body.player.trim(),
      champion: body.champion,
      final4: body.final4,
      groups: normalizeGroups(body.groups),
      markets: sanitizeMarkets(body.markets),
      pin: body.pin ? String(body.pin) : null,
      submittedAt: new Date().toISOString(),
      seed: false,
    };
    store.bets.push(bet);
    saveStore();
    return json(res, 201, { ok: true, created: true, bet: publicBet(bet) });
  }

  // aposta de mata-mata (vencedor + fase por jogo de uma ronda + jokers)
  if (path === '/api/bet/knockout' && method === 'POST') {
    const body = await readBody(req);
    const existing = store.bets.find((b) => b.player === (body.player || '').trim());
    if (!existing) return json(res, 404, { errors: ['Jogador não encontrado. Faz primeiro a aposta da fase de grupos.'] });
    const round = body.round;
    if (!KO_ROUNDS.includes(round)) return json(res, 400, { errors: ['Ronda inválida.'] });
    if (!store.windows[round] && !isAdmin(req)) return json(res, 403, { errors: [`A janela de apostas (${round}) está fechada.`] });
    if (existing.pin && existing.pin !== (body.pin || '') && !isAdmin(req)) {
      return json(res, 403, { errors: ['PIN incorreto para editar esta aposta.'] });
    }
    const w = world();
    const resolved = resolveBracket(BRACKET, w.standings, store.knockouts);
    const errors = [];
    const picks = body.picks || {};
    for (const [mid, pick] of Object.entries(picks)) {
      if (matchRound[mid] !== round) { errors.push(`Jogo ${mid} não é da ronda ${round}.`); continue; }
      const teams = [resolved[mid]?.home?.team, resolved[mid]?.away?.team].filter(Boolean);
      if (pick.winner && !teams.includes(pick.winner)) errors.push(`Jogo ${mid}: vencedor inválido.`);
      if (pick.method && !['TR', 'PROL', 'PEN'].includes(pick.method)) errors.push(`Jogo ${mid}: fase inválida.`);
    }
    // junta as escolhas desta ronda à aposta
    const merged = { ...(existing.knockouts || {}) };
    for (const [mid, pick] of Object.entries(picks)) {
      if (!pick || !pick.winner) { delete merged[mid]; continue; }
      merged[mid] = { winner: pick.winner, method: pick.method || null };
    }
    // jokers: lista completa do jogador (máx 2, só em rondas elegíveis, só em jogos apostados)
    const jokers = [...new Set((body.jokers || []).map(String))];
    if (jokers.length > 2) errors.push('No máximo 2 jokers.');
    for (const j of jokers) {
      if (!roundJoker[matchRound[j]]) errors.push(`Joker inválido no jogo ${j} (só 16-avos/8-avos/quartos).`);
      else if (!merged[j]) errors.push(`Joker no jogo ${j} exige uma aposta nesse jogo.`);
    }
    if (errors.length) return json(res, 400, { errors });
    existing.knockouts = merged;
    existing.jokers = jokers;
    existing.submittedAt = new Date().toISOString();
    saveStore();
    return json(res, 200, { ok: true, bet: publicBet(existing) });
  }

  // ---------- admin ----------
  if (path === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    if (body.password !== ADMIN_PASSWORD) return json(res, 401, { error: 'Password incorreta.' });
    const token = randomUUID();
    adminTokens.add(token);
    return json(res, 200, { token });
  }

  // a partir daqui exige admin
  if (path.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'Não autenticado.' });

    // trocar a competição ativa
    if (path === '/api/admin/competition/active' && method === 'POST') {
      const body = await readBody(req);
      const reg = registry.competitions.find((c) => c.id === body.id);
      if (!reg) return json(res, 400, { error: 'Competição desconhecida.' });
      if (reg.kind === 'archive') return json(res, 400, { error: 'Uma edição arquivada não pode ser a ativa.' });
      loadActive(body.id);
      registry.activeId = body.id;
      saveRegistry();
      return json(res, 200, { activeId });
    }

    // importar uma edição passada (classificação final) para o histórico
    if (path === '/api/admin/import' && method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || 'Roni Roni').trim();
      const edition = (body.edition || '').trim();
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!edition) return json(res, 400, { error: 'Indica o nome da edição.' });
      const finalStandings = rows.filter((r) => r.player && r.points != null).map((r) => ({ player: String(r.player).trim(), total: Number(r.points) }));
      if (!finalStandings.length) return json(res, 400, { error: 'Classificação vazia ou inválida.' });
      const base = (body.id || edition).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'edicao';
      let id = base;
      let n = 2;
      while (registry.competitions.some((c) => c.id === id)) id = `${base}-${n++}`;
      mkdirSync(compDir(id), { recursive: true });
      writeFileSync(join(compDir(id), 'competition.json'), JSON.stringify({ id, name, edition, kind: 'archive', entry: body.entry || 0, prizes: body.prizes || [], finalStandings }, null, 2));
      registry.competitions.push({ id, name, edition, status: 'archived', kind: 'archive' });
      saveRegistry();
      return json(res, 200, { ok: true, id, players: finalStandings.length });
    }

    if (path === '/api/admin/window' && method === 'POST') {
      const body = await readBody(req);
      const round = body.round || 'grupos';
      if (round !== 'grupos' && !KO_ROUNDS.includes(round)) return json(res, 400, { error: 'Ronda inválida.' });
      store.windows[round] = !!body.open;
      if (round === 'grupos') store.windowOpen = !!body.open;
      saveStore();
      return json(res, 200, { windows: store.windows });
    }

    // resolver um mercado extra (ex.: melhor marcador) — guarda o vencedor
    if (path === '/api/admin/market' && method === 'POST') {
      const body = await readBody(req);
      if (!(COMP.markets || []).some((m) => m.id === body.id)) return json(res, 400, { error: 'Mercado desconhecido.' });
      snapshotRanks();
      if (body.winner) store.marketResults[body.id] = String(body.winner);
      else delete store.marketResults[body.id];
      saveStore();
      return json(res, 200, { ok: true });
    }

    // resultado de um jogo do mata-mata (vencedor + fase)
    if (path === '/api/admin/knockout' && method === 'POST') {
      const body = await readBody(req);
      const { match, home, away, homeGoals, awayGoals, winner, method } = body;
      if (!BRACKET.matches[match]) return json(res, 400, { error: 'Jogo inválido.' });
      if (winner && winner !== home && winner !== away) return json(res, 400, { error: 'Vencedor tem de ser uma das equipas.' });
      if (method && !['TR', 'PROL', 'PEN'].includes(method)) return json(res, 400, { error: 'Fase inválida.' });
      snapshotRanks();
      store.knockouts[match] = {
        home: home || null, away: away || null,
        homeGoals: homeGoals == null ? null : Number(homeGoals),
        awayGoals: awayGoals == null ? null : Number(awayGoals),
        winner: winner || null, method: method || null,
      };
      saveStore();
      return json(res, 200, { ok: true });
    }

    if (path === '/api/admin/knockout' && method === 'DELETE') {
      const body = await readBody(req);
      snapshotRanks();
      delete store.knockouts[body.match];
      saveStore();
      return json(res, 200, { ok: true });
    }

    if (path === '/api/admin/result' && method === 'POST') {
      const body = await readBody(req);
      try {
        snapshotRanks();
        const status = upsertResult(body);
        saveStore();
        return json(res, 200, { ok: true, status });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // gravar VÁRIOS resultados de uma vez (um snapshot só -> movimento correto)
    if (path === '/api/admin/results' && method === 'POST') {
      const body = await readBody(req);
      const items = Array.isArray(body.results) ? body.results : [];
      if (!items.length) return json(res, 400, { error: 'Sem resultados para gravar.' });
      snapshotRanks();
      const counts = { novo: 0, atualizado: 0, igual: 0 };
      const errors = [];
      for (const it of items) {
        try { counts[upsertResult(it)]++; } catch (e) { errors.push(e.message); }
      }
      saveStore();
      return json(res, 200, { ok: true, ...counts, saved: counts.novo + counts.atualizado, errors });
    }

    // buscar resultados da fonte (RESULTS_SOURCE_URL ou data/results_source.json) e sincronizar
    if (path === '/api/admin/fetch' && method === 'POST') {
      let loaded;
      try { loaded = await loadResultsSource({ codeToTeam, teamGroup, source: { ...COMP.source, file: COMP.sourceFile } }); } catch (e) { return json(res, 502, { error: 'Falha a buscar a fonte: ' + e.message }); }
      snapshotRanks();
      const counts = { novo: 0, atualizado: 0, igual: 0 };
      const errors = [];
      for (const [group, matches] of Object.entries(loaded.groups || {})) {
        for (const m of matches) {
          try { counts[upsertResult({ group, ...m })]++; } catch (e) { errors.push(`${group}: ${e.message}`); }
        }
      }
      // mata-mata (best-effort): emparelhamentos + resultados já resolvidos
      let koImported = 0;
      try {
        const standings = world().standings;
        const ko = await fetchEspnKnockout({ codeToTeam, teamGroup, bracket: BRACKET, standings, source: COMP.source });
        for (const [mid, m] of Object.entries(ko)) { store.knockouts[mid] = { ...(store.knockouts[mid] || {}), ...m }; koImported++; }
      } catch (e) { errors.push('mata-mata: ' + e.message); }
      saveStore();
      return json(res, 200, { ok: true, source: loaded.source, ...counts, imported: counts.novo + counts.atualizado, koImported, errors });
    }

    if (path === '/api/admin/result' && method === 'DELETE') {
      const body = await readBody(req);
      const { group, home, away } = body;
      snapshotRanks();
      const list = store.results.groups[group] || [];
      store.results.groups[group] = list.filter(
        (m) => !((m.home === home && m.away === away) || (m.home === away && m.away === home)),
      );
      saveStore();
      return json(res, 200, { ok: true });
    }

    if (path === '/api/admin/status' && method === 'GET') {
      return json(res, 200, submissionStatus());
    }

    return json(res, 404, { error: 'Rota admin desconhecida.' });
  }

  return json(res, 404, { error: 'Rota desconhecida.' });
}

function normalizeGroups(groups) {
  const out = {};
  for (const g of GROUP_ORDER) {
    const p = (groups || {})[g] || {};
    out[g] = { first: p.first || null, second: p.second || null, third: p.third || null };
  }
  return out;
}
// mantém só picks de mercados que a competição define
function sanitizeMarkets(m) {
  const out = {};
  for (const mk of COMP.markets || []) if (m && typeof m[mk.id] === 'string' && m[mk.id].trim()) out[mk.id] = m[mk.id].trim();
  return out;
}

// ---------- estáticos ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = normalize(join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback para rotas do cliente
    const idx = join(PUBLIC, 'index.html');
    res.writeHead(200, { 'content-type': MIME['.html'] });
    return createReadStream(idx).pipe(res);
  }
  const ext = extname(filePath);
  // bandeiras/fontes podem cachear; HTML/JS/CSS revalidam sempre (iteração fiável + sem stale no pitch)
  const cache = ext === '.svg' || ext === '.woff2' || ext === '.png' ? 'public, max-age=86400' : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath.startsWith('/api/')) return await api(req, res, urlPath);
    return serveStatic(req, res, req.url || '/');
  } catch (err) {
    json(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Roni Roni a correr em http://${HOST}:${PORT}  (admin password: ${ADMIN_PASSWORD})`);
});
