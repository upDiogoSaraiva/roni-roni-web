// Resolve os slots do bracket (1.º A, 2.º B, 3.º de [...], vencedor do jogo N) em equipas reais,
// a partir da classificação dos grupos e dos resultados do mata-mata já conhecidos.
// Os slots de 3.º e os emparelhamentos resolvidos vêm de knockoutResults (ESPN/admin) quando existem.

import { bestThirds } from './scoring.mjs';

// Atribui os 8 melhores 3.os aos slots de 3.º do bracket (problema do Anexo C da FIFA),
// por emparelhamento bipartido (Kuhn): cada grupo-terceiro vai para um slot que o permita.
// Devolve { matchId: { group, team } }. Usa a classificação ATUAL — provisório "se acabasse agora".
export function assignThirds(bracket, standings, teams = null) {
  // o nº de 3.os que apuram é o nº de slots de 3.º do próprio quadro (8 no Mundial, 4 no Euro)
  const slots = [];
  for (const [id, m] of Object.entries(bracket.matches)) {
    if (m.away?.type === 'third') slots.push({ id, groups: m.away.groups });
    else if (m.home?.type === 'third') slots.push({ id, groups: m.home.groups });
  }
  const ranked = bestThirds(standings, slots.length, teams).ranked.filter((t) => t.qualifies);
  const qualifying = new Set(ranked.map((t) => t.group));
  const teamByGroup = {};
  for (const t of ranked) teamByGroup[t.group] = t.team;
  const groupToSlot = {}; // grupo -> slotId (lado direito do matching)
  function augment(slotId, eligible, seen) {
    for (const g of eligible) {
      if (!qualifying.has(g) || seen.has(g)) continue;
      seen.add(g);
      const holder = groupToSlot[g];
      if (holder === undefined || augment(holder, slots.find((s) => s.id === holder).groups, seen)) {
        groupToSlot[g] = slotId;
        return true;
      }
    }
    return false;
  }
  for (const s of slots) augment(s.id, s.groups, new Set());

  const out = {};
  for (const [g, slotId] of Object.entries(groupToSlot)) out[slotId] = { group: g, team: teamByGroup[g] };
  return out;
}

function teamAtRank(standings, group, rank) {
  const row = (standings[group] || []).find((r) => r.rank === rank);
  return row ? row.team : null;
}
function groupDecided(standings, group) {
  // grupo decidido quando cada equipa jogou os 3 jogos (4 equipas, 6 jogos)
  return (standings[group] || []).every((r) => r.played >= 3);
}
// fase de grupos terminada = todos os 12 grupos decididos
export function groupStageComplete(standings) {
  const gs = Object.keys(standings);
  return gs.length > 0 && gs.every((g) => groupDecided(standings, g));
}

const POS_LABEL = { winner: '1.º', runnerup: '2.º' };

// devolve { team, label, decided, provisional? }
function resolveSlot(slot, ctx, matchId) {
  const { standings, results } = ctx;
  switch (slot.type) {
    case 'winner':
    case 'runnerup': {
      const rank = slot.type === 'winner' ? 1 : 2;
      return { team: teamAtRank(standings, slot.group, rank), label: `${POS_LABEL[slot.type]} ${slot.group}`, decided: groupDecided(standings, slot.group) };
    }
    case 'third': {
      const a = ctx.thirds?.[matchId];
      const label = `3.º de [${slot.groups.join('/')}]`;
      if (a?.team) return { team: a.team, label, decided: ctx.complete, provisional: !ctx.complete };
      return { team: null, label, decided: false };
    }
    case 'winnerOf': {
      const r = results[slot.match];
      return { team: r?.winner || null, label: `Venc. jogo ${slot.match}`, decided: !!r?.winner };
    }
    case 'loserOf': {
      const r = results[slot.match];
      let loser = null;
      if (r?.winner && r.home && r.away) loser = r.winner === r.home ? r.away : r.home;
      return { team: loser, label: `Perd. jogo ${slot.match}`, decided: !!loser };
    }
    default:
      return { team: null, label: '?', decided: false };
  }
}

// Resolve todos os jogos do bracket. knockoutResults: { id: { home, away, homeGoals, awayGoals, winner, method } }
// Os emparelhamentos reais (home/away) de knockoutResults têm prioridade sobre a dedução por slot.
export function resolveBracket(bracket, standings, knockoutResults = {}, teams = null) {
  const ctx = { standings, results: knockoutResults, thirds: assignThirds(bracket, standings, teams), complete: groupStageComplete(standings) };
  const out = {};
  for (const [id, m] of Object.entries(bracket.matches)) {
    const stored = knockoutResults[id] || {};
    const home = stored.home ? { team: stored.home, label: null, decided: true } : resolveSlot(m.home, ctx, id);
    const away = stored.away ? { team: stored.away, label: null, decided: true } : resolveSlot(m.away, ctx, id);
    out[id] = {
      id,
      round: m.round,
      home,
      away,
      homeGoals: stored.homeGoals ?? null,
      awayGoals: stored.awayGoals ?? null,
      winner: stored.winner || null,
      method: stored.method || null,
      played: stored.winner != null,
    };
  }
  return out;
}

// Lista de equipas elegíveis para apostar num jogo (as que já estão resolvidas).
export function matchTeams(resolvedMatch) {
  return [resolvedMatch.home.team, resolvedMatch.away.team].filter(Boolean);
}

// Gera um quadro de mata-mata padrão a partir da ordem dos grupos.
// Suporta os casos "limpos": 2 apurados/grupo (cruzamento 1.º x 2.º) ou 1 apurado/grupo (só vencedores),
// com o total de apurados a ser potência de 2 e sem melhores 3.os. Caso contrário devolve um quadro
// vazio ({ rounds: [], matches: {} }) — a competição corre como liga, sem mata-mata.
// Devolve também `generated` (bool) e `qualified` (nº de apurados) para o chamador informar o admin.
const KO_TEAMS_ID = { 32: 'r32', 16: 'r16', 8: 'qf', 4: 'sf', 2: 'final' };
const KO_TEAMS_LABEL = { 32: '16-avos', 16: '8-avos', 8: 'Quartos de final', 4: 'Meias-finais', 2: 'Final' };

export function generateBracket(groupOrder, opts = {}) {
  const qpg = Number(opts.qualifiersPerGroup) || 2;
  const thirds = Number(opts.bestThirds) || 0;
  const winPts = Number(opts.koWin) || 2;
  const methodPts = Number(opts.koMethod) || 1;
  const joker = opts.koJoker !== false;
  const G = groupOrder.length;
  const Q = G * qpg + thirds;
  const isPow2 = (x) => x >= 2 && (x & (x - 1)) === 0;
  const clean = isPow2(Q) && thirds === 0 && (qpg === 1 || qpg === 2) && isPow2(G);
  if (!clean) return { rounds: [], matches: {}, generated: false, qualified: Q };

  // Ronda 1: emparelhamentos a partir dos grupos.
  let r1;
  if (qpg === 1) {
    r1 = [];
    for (let i = 0; i < G; i += 2) r1.push([{ type: 'winner', group: groupOrder[i] }, { type: 'winner', group: groupOrder[i + 1] }]);
  } else {
    // Duos (a, b): X = 1.º de a x 2.º de b vai para a 1.ª metade do quadro;
    // Y = 1.º de b x 2.º de a vai para a 2.ª metade. Assim as duas equipas do mesmo
    // duo só se podem reencontrar na final (evita repetição precoce de grupo).
    const X = []; const Y = [];
    for (let i = 0; i < G; i += 2) {
      const a = groupOrder[i]; const b = groupOrder[i + 1];
      X.push([{ type: 'winner', group: a }, { type: 'runnerup', group: b }]);
      Y.push([{ type: 'winner', group: b }, { type: 'runnerup', group: a }]);
    }
    r1 = X.concat(Y);
  }

  const matches = {};
  let mid = 1;
  let cur = r1.map((slots) => {
    const id = mid++;
    matches[id] = { round: null, home: slots[0], away: slots[1] };
    return id;
  });
  const roundOrder = [{ teams: cur.length * 2, ids: cur }];
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      const id = mid++;
      matches[id] = { round: null, home: { type: 'winnerOf', match: cur[i] }, away: { type: 'winnerOf', match: cur[i + 1] } };
      next.push(id);
    }
    cur = next;
    roundOrder.push({ teams: cur.length * 2, ids: cur });
  }

  const rounds = [];
  for (const r of roundOrder) {
    const id = KO_TEAMS_ID[r.teams];
    for (const m of r.ids) matches[m].round = id;
    rounds.push({ id, label: KO_TEAMS_LABEL[r.teams], matches: r.ids, winPts, methodPts, joker });
  }
  // 3.º/4.º lugar: perdedores das meias-finais (a ronda de 4 equipas). Fica antes da final.
  const sf = roundOrder.find((r) => r.teams === 4);
  if (sf && sf.ids.length === 2) {
    const id = mid++;
    matches[id] = { round: 'third', home: { type: 'loserOf', match: sf.ids[0] }, away: { type: 'loserOf', match: sf.ids[1] } };
    rounds.splice(rounds.length - 1, 0, { id: 'third', label: '3.º/4.º lugar', matches: [id], winPts, methodPts, joker: false });
  }
  return { rounds, matches, generated: true, qualified: Q };
}
