// Servidor do pool Torneio Roni Roni — zero dependências (node:http), persistência em JSON.
// Serve a SPA em public/ e uma API neutra (apostas, resultados, pontos). Nada do motor.

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { computeWorldState, leaderboard } from './src/scoring.mjs';
import { loadResultsSource } from './src/results_source.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(root, 'public');
const SEED_PATH = join(root, 'data/seed.json');
const STORE_PATH = join(root, 'data/store.json');
const PORT = Number(process.env.PORT || 4026);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'roni2026';

// --- config estático (grupos, equipas) vem do seed; nunca muda em runtime ---
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
const GROUPS = seed.groups;
const GROUP_ORDER = seed.groupOrder;
const TEAMS = seed.teams;
const META = seed.meta;
const groupOf = {};
for (const [g, ts] of Object.entries(GROUPS)) for (const t of ts) groupOf[t] = g;
const teamGroup = (t) => groupOf[t] || null;
// código FIFA (ESPN abbreviation) -> nome PT, para a fonte ao vivo
const codeToTeam = {};
for (const [name, meta] of Object.entries(TEAMS)) codeToTeam[meta.code] = name;

// --- estado mutável (apostas, resultados, janela) em store.json ---
function loadStore() {
  if (existsSync(STORE_PATH)) return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  // primeira execução: inicializa a partir das 27 apostas reais (seed)
  const init = {
    windowOpen: seed.windowOpen !== false,
    results: structuredClone(seed.results),
    bets: structuredClone(seed.bets),
  };
  writeFileSync(STORE_PATH, JSON.stringify(init, null, 2));
  return init;
}
let store = loadStore();
const saveStore = () => writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));

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
  return computeWorldState(GROUPS, store.results.groups);
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
    seed: !!b.seed,
    hasPin: !!b.pin,
    submittedAt: b.submittedAt || null,
  };
}
function submissionStatus() {
  const submitted = store.bets.map((b) => b.player);
  return {
    windowOpen: store.windowOpen,
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
      windowOpen: store.windowOpen,
      players: store.bets.map((b) => ({ player: b.player, seed: !!b.seed, hasPin: !!b.pin })),
    });
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
      pin: body.pin ? String(body.pin) : null,
      submittedAt: new Date().toISOString(),
      seed: false,
    };
    store.bets.push(bet);
    saveStore();
    return json(res, 201, { ok: true, created: true, bet: publicBet(bet) });
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

    if (path === '/api/admin/window' && method === 'POST') {
      const body = await readBody(req);
      store.windowOpen = !!body.open;
      saveStore();
      return json(res, 200, { windowOpen: store.windowOpen });
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
      try { loaded = await loadResultsSource({ codeToTeam, teamGroup }); } catch (e) { return json(res, 502, { error: 'Falha a buscar a fonte: ' + e.message }); }
      snapshotRanks();
      const counts = { novo: 0, atualizado: 0, igual: 0 };
      const errors = [];
      for (const [group, matches] of Object.entries(loaded.groups || {})) {
        for (const m of matches) {
          try { counts[upsertResult({ group, ...m })]++; } catch (e) { errors.push(`${group}: ${e.message}`); }
        }
      }
      saveStore();
      return json(res, 200, { ok: true, source: loaded.source, ...counts, imported: counts.novo + counts.atualizado, errors });
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
