// Motor de pontuação — implementado de raiz a partir do regulamento do Torneio Roni Roni.
// NÃO importa nada do motor de decisão (wc2026-roni); só aplica as regras de pontos.
//
// Regulamento (fase de grupos):
//   - Cada equipa corretamente identificada como APURADA: +1 (independente da posição prevista).
//   - POSIÇÃO final correta no grupo (1.º/2.º/3.º): +1.
//   - 3.º só pontua (apura) se entrar nos 8 MELHORES 3.os do torneio inteiro.
//   - Alterar picks de um grupo após o início faz perder o bónus de POSIÇÃO desse grupo
//     (mantém-se o +1 de apuramento por equipa).
// Apostas iniciais: Campeão = 8; cada seleção do Final 4 = 3.
// Eliminatórias: apostadas ronda a ronda (fora da aposta inicial; 0 enquanto não há dados).
//
// Apuram-se 32 equipas: 1.º e 2.º de cada grupo (24) + os 8 melhores 3.os.

const CHAMPION_POINTS = 8;
const FINAL4_POINTS = 3;

// Desempate de classificação de grupo: pontos, diferença de golos, golos marcados e,
// como critério final transparente, ordem alfabética (estável e explicável num protótipo).
function compareStanding(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.team.localeCompare(b.team, 'pt');
}

// Classificação de UM grupo a partir dos jogos já inseridos (3/1/0).
export function standingsForGroup(teams, games) {
  const rows = new Map(
    teams.map((team) => [team, { team, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, points: 0 }]),
  );
  for (const g of games) {
    const home = rows.get(g.home);
    const away = rows.get(g.away);
    if (!home || !away) continue; // jogo com equipa fora do grupo — ignora defensivamente
    if (g.homeGoals == null || g.awayGoals == null) continue;
    home.played++; away.played++;
    home.gf += g.homeGoals; home.ga += g.awayGoals;
    away.gf += g.awayGoals; away.ga += g.homeGoals;
    if (g.homeGoals > g.awayGoals) { home.w++; home.points += 3; away.l++; }
    else if (g.homeGoals < g.awayGoals) { away.w++; away.points += 3; home.l++; }
    else { home.d++; away.d++; home.points++; away.points++; }
  }
  const list = [...rows.values()];
  for (const r of list) r.gd = r.gf - r.ga;
  list.sort(compareStanding);
  list.forEach((r, i) => (r.rank = i + 1));
  return list;
}

// Classificação de todos os grupos.
export function allStandings(groups, resultsByGroup) {
  const out = {};
  for (const [g, teams] of Object.entries(groups)) {
    out[g] = standingsForGroup(teams, resultsByGroup[g] || []);
  }
  return out;
}

// Os 8 melhores 3.os do torneio inteiro (corte global), por pontos/DG/GM.
export function bestThirds(standings, limit = 8) {
  const thirds = [];
  for (const [g, list] of Object.entries(standings)) {
    const third = list.find((r) => r.rank === 3);
    if (third) thirds.push({ ...third, group: g });
  }
  thirds.sort(compareStanding);
  const qualified = thirds.slice(0, limit);
  return {
    ranked: thirds.map((t, i) => ({ ...t, thirdRank: i + 1, qualifies: i < limit })),
    set: new Set(qualified.map((t) => t.team)),
  };
}

// Conjunto das 32 equipas apuradas: 1.º + 2.º de cada grupo + 8 melhores 3.os.
export function qualifiedSet(standings, bestThirdsSet) {
  const set = new Set(bestThirdsSet);
  for (const list of Object.values(standings)) {
    for (const r of list) if (r.rank === 1 || r.rank === 2) set.add(r.team);
  }
  return set;
}

// Estado do mata-mata a partir do bracket + resultados reais dos jogos eliminatórios.
// koResults: { "73": { home, away, homeGoals, awayGoals, winner, method }, ... } (method: TR|PROL|PEN)
export function computeKnockout(bracket, koResults) {
  const roundPts = {};
  for (const r of bracket?.rounds || []) roundPts[r.id] = { win: r.winPts, method: r.methodPts, joker: !!r.joker };
  const matchRound = {};
  for (const [id, m] of Object.entries(bracket?.matches || {})) matchRound[id] = m.round;
  const results = {};
  for (const [id, r] of Object.entries(koResults || {})) {
    if (!r || !r.winner) continue;
    results[id] = { winner: r.winner, method: r.method || null, round: matchRound[id] };
  }
  // Final 4 = os 4 semifinalistas = participantes das meias-finais (jogos 101 e 102)
  const final4 = [];
  for (const sf of ['101', '102']) {
    const m = koResults?.[sf];
    if (m?.home) final4.push(m.home);
    if (m?.away) final4.push(m.away);
  }
  const champion = koResults?.['104']?.winner || null;
  return { roundPts, matchRound, results, final4, champion };
}

// Estado completo derivado dos resultados reais — calculado uma vez por pedido.
export function computeWorldState(groups, resultsByGroup, ko = null) {
  const standings = allStandings(groups, resultsByGroup);
  const thirds = bestThirds(standings);
  const qualified = qualifiedSet(standings, thirds.set);
  const matchesPlayed = Object.values(resultsByGroup).reduce((n, g) => n + (g?.length || 0), 0);
  const knockout = ko ? computeKnockout(ko.bracket, ko.knockoutResults) : null;
  return { standings, thirds, qualified, matchesPlayed, knockout };
}

// Posição real de uma equipa no seu grupo (1..4) ou null.
function rankOf(standings, group, team) {
  const row = (standings[group] || []).find((r) => r.team === team);
  return row ? row.rank : null;
}

// Pontua UMA aposta contra o estado real. Devolve total e detalhe por secção.
export function scoreBet(bet, world, groupOf) {
  const { standings, thirds, qualified } = world;
  const detail = { groups: {}, qualification: 0, position: 0, champion: 0, final4: 0, knockout: 0 };

  // Pontua slot a slot, guardando o detalhe por seleção (de onde vieram os pontos).
  // Apuramento conta UMA vez por equipa distinta (credita-se a 1.ª ocorrência).
  const credited = new Set();
  const SLOTS = [['first', 1], ['second', 2], ['third', 3]];
  for (const g of Object.keys(bet.groups || {})) {
    const pick = bet.groups[g] || {};
    const mexido = !!pick.mexido;
    const picks = {};
    let groupPos = 0;
    for (const [slot, expectedRank] of SLOTS) {
      const team = pick[slot] || null;
      if (!team) { picks[slot] = null; continue; }
      const qualifies = qualified.has(team);
      // +1 de apuramento (uma vez por equipa)
      const creditQ = qualifies && !credited.has(team);
      if (creditQ) { credited.add(team); detail.qualification += 1; }
      // +1 de posição exata (3.º só se for 3.º real E entrar nos 8 melhores; perde-se em grupo mexido)
      let position = 0;
      if (!mexido) {
        if (slot === 'third') {
          if (rankOf(standings, g, team) === 3 && thirds.set.has(team)) position = 1;
        } else if (rankOf(standings, g, team) === expectedRank) position = 1;
      }
      groupPos += position;
      picks[slot] = { team, qualifies, credited: creditQ, position };
    }
    detail.position += groupPos;
    detail.groups[g] = { mexido, position: groupPos, picks };
  }

  // Mata-mata: campeão (8), Final 4 (3 cada) e jogos eliminatórios (vencedor + fase + jokers).
  const ko = world.knockout;
  detail.knockoutDetail = {};
  detail.correctWinners = 0; // prémio "acertei mais jogos" (vitórias acertadas nos playoffs)
  if (ko) {
    if (bet.champion && ko.champion && bet.champion === ko.champion) detail.champion = CHAMPION_POINTS;
    if (Array.isArray(bet.final4) && ko.final4.length) {
      for (const t of bet.final4) if (ko.final4.includes(t)) detail.final4 += FINAL4_POINTS;
    }
    const jokers = new Set((bet.jokers || []).map(String));
    for (const [id, pick] of Object.entries(bet.knockouts || {})) {
      const res = ko.results[id];
      if (!res || !pick) continue; // jogo ainda não decidido
      const cfg = ko.roundPts[res.round] || { win: 0, method: 0, joker: false };
      const winnerCorrect = !!pick.winner && pick.winner === res.winner;
      let pts = 0;
      if (winnerCorrect) {
        detail.correctWinners += 1;
        pts = cfg.win;
        if (pick.method && pick.method === res.method) pts += cfg.method;
      }
      const joker = jokers.has(String(id)) && cfg.joker;
      if (joker) pts *= 2;
      detail.knockout += pts;
      detail.knockoutDetail[id] = {
        pts, winnerCorrect, methodCorrect: winnerCorrect && pick.method === res.method, joker,
      };
    }
  }

  detail.total = detail.qualification + detail.position + detail.champion + detail.final4 + detail.knockout;
  return detail;
}

// Constrói a tabela de classificação geral (ordenada por pontos, depois nome).
export function leaderboard(bets, world, groupOf) {
  const rows = bets.map((bet) => {
    const score = scoreBet(bet, world, groupOf);
    return { player: bet.player, score, seed: !!bet.seed };
  });
  rows.sort((a, b) => b.score.total - a.score.total || a.player.localeCompare(b.player, 'pt'));
  // posições com empates (mesma posição para pontuações iguais)
  let lastPoints = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.score.total !== lastPoints) {
      lastRank = i + 1;
      lastPoints = r.score.total;
    }
    r.rank = lastRank;
  });
  return rows;
}

export const POINTS = { CHAMPION_POINTS, FINAL4_POINTS };
