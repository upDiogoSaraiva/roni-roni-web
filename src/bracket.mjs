// Resolve os slots do bracket (1.º A, 2.º B, 3.º de [...], vencedor do jogo N) em equipas reais,
// a partir da classificação dos grupos e dos resultados do mata-mata já conhecidos.
// Os slots de 3.º e os emparelhamentos resolvidos vêm de knockoutResults (ESPN/admin) quando existem.

function teamAtRank(standings, group, rank) {
  const row = (standings[group] || []).find((r) => r.rank === rank);
  return row ? row.team : null;
}
function groupDecided(standings, group) {
  // grupo decidido quando cada equipa jogou os 3 jogos (4 equipas, 6 jogos)
  return (standings[group] || []).every((r) => r.played >= 3);
}

const POS_LABEL = { winner: '1.º', runnerup: '2.º' };

// devolve { team, label, decided }
function resolveSlot(slot, ctx) {
  const { standings, results } = ctx;
  switch (slot.type) {
    case 'winner':
    case 'runnerup': {
      const rank = slot.type === 'winner' ? 1 : 2;
      return { team: teamAtRank(standings, slot.group, rank), label: `${POS_LABEL[slot.type]} ${slot.group}`, decided: groupDecided(standings, slot.group) };
    }
    case 'third':
      return { team: null, label: `3.º de [${slot.groups.join('/')}]`, decided: false };
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
  const ctx = { standings, results: knockoutResults };
  const out = {};
  for (const [id, m] of Object.entries(bracket.matches)) {
    const stored = knockoutResults[id] || {};
    const home = stored.home ? { team: stored.home, label: null, decided: true } : resolveSlot(m.home, ctx);
    const away = stored.away ? { team: stored.away, label: null, decided: true } : resolveSlot(m.away, ctx);
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
