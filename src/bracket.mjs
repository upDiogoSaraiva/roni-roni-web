// Resolve os slots do bracket (1.º A, 2.º B, 3.º de [...], vencedor do jogo N) em equipas reais,
// a partir da classificação dos grupos e dos resultados do mata-mata já conhecidos.
// Os slots de 3.º e os emparelhamentos resolvidos vêm de knockoutResults (ESPN/admin) quando existem.

import { bestThirds } from './scoring.mjs';

// Atribui os 8 melhores 3.os aos slots de 3.º do bracket (problema do Anexo C da FIFA),
// por emparelhamento bipartido (Kuhn): cada grupo-terceiro vai para um slot que o permita.
// Devolve { matchId: { group, team } }. Usa a classificação ATUAL — provisório "se acabasse agora".
export function assignThirds(bracket, standings) {
  // o nº de 3.os que apuram é o nº de slots de 3.º do próprio quadro (8 no Mundial, 4 no Euro)
  const slots = [];
  for (const [id, m] of Object.entries(bracket.matches)) {
    if (m.away?.type === 'third') slots.push({ id, groups: m.away.groups });
    else if (m.home?.type === 'third') slots.push({ id, groups: m.home.groups });
  }
  const ranked = bestThirds(standings, slots.length).ranked.filter((t) => t.qualifies);
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
export function resolveBracket(bracket, standings, knockoutResults = {}) {
  const ctx = { standings, results: knockoutResults, thirds: assignThirds(bracket, standings), complete: groupStageComplete(standings) };
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
