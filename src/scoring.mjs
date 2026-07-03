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

// Critério "geral" (sem confronto direto): pontos, diferença de golos, golos marcados e, como
// último critério transparente, ordem alfabética. Usado nos 8 melhores 3.os (que não jogaram
// entre si) e como recurso final dentro de um grupo. (Fair play e ranking FIFA não os temos.)
function compareStanding(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.team.localeCompare(b.team, 'pt');
}

// Desempate dentro de um grupo pelo critério do Mundial 2026 (Art. 13): entre equipas
// empatadas em pontos, vale primeiro o CONFRONTO DIRETO (pontos, depois DG, depois golos, só
// nos jogos entre elas) e só depois os critérios gerais. Aplica-se recursivamente ao subconjunto
// que continuar empatado.
function headToHead(rows, games) {
  if (rows.length <= 1) return rows;
  const set = new Set(rows.map((r) => r.team));
  const mini = new Map(rows.map((r) => [r.team, { team: r.team, p: 0, gd: 0, gf: 0 }]));
  for (const g of games) {
    if (g.homeGoals == null || g.awayGoals == null) continue;
    if (!set.has(g.home) || !set.has(g.away)) continue; // só jogos entre os empatados
    const h = mini.get(g.home);
    const a = mini.get(g.away);
    h.gf += g.homeGoals; a.gf += g.awayGoals;
    h.gd += g.homeGoals - g.awayGoals; a.gd += g.awayGoals - g.homeGoals;
    if (g.homeGoals > g.awayGoals) h.p += 3;
    else if (g.homeGoals < g.awayGoals) a.p += 3;
    else { h.p += 1; a.p += 1; }
  }
  const sameMini = (x, y) => {
    const mx = mini.get(x.team); const my = mini.get(y.team);
    return mx.p === my.p && mx.gd === my.gd && mx.gf === my.gf;
  };
  const sorted = [...rows].sort((x, y) => {
    const mx = mini.get(x.team); const my = mini.get(y.team);
    return my.p - mx.p || my.gd - mx.gd || my.gf - mx.gf;
  });
  const out = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sameMini(sorted[i], sorted[j + 1])) j++;
    const block = sorted.slice(i, j + 1);
    if (block.length === 1) out.push(block[0]);
    else if (block.length === rows.length) out.push(...[...block].sort(compareStanding)); // confronto não separou
    else out.push(...headToHead(block, games)); // re-aplica ao subconjunto ainda empatado
    i = j + 1;
  }
  return out;
}

// Ordena um grupo: por pontos e, dentro de cada empate em pontos, por confronto direto.
function rankGroup(rows, games) {
  const byPoints = [...rows].sort((a, b) => b.points - a.points);
  const out = [];
  for (let i = 0; i < byPoints.length; ) {
    let j = i;
    while (j + 1 < byPoints.length && byPoints[j + 1].points === byPoints[i].points) j++;
    const block = byPoints.slice(i, j + 1);
    out.push(...(block.length === 1 ? block : headToHead(block, games)));
    i = j + 1;
  }
  return out;
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
  const ranked = rankGroup(list, games);
  ranked.forEach((r, i) => (r.rank = i + 1));
  return ranked;
}

// Jogos que ainda faltam num grupo de 4 (todos jogam todos uma vez).
function remainingFixtures(teams, games) {
  const played = new Set();
  for (const g of games) {
    if (g.homeGoals == null || g.awayGoals == null) continue;
    played.add([g.home, g.away].sort().join('\0'));
  }
  const rem = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      if (!played.has([teams[i], teams[j]].sort().join('\0'))) rem.push([teams[i], teams[j]]);
    }
  }
  return rem;
}

// Estado garantido de cada equipa (regras 2026), por força bruta dos jogos que faltam.
// Margens extremas (BIG) cobrem qualquer desempate por diferença de golos. Devolve por equipa:
// 'winner' (sempre 1.º), 'qualified' (sempre top-2), 'eliminated' (sempre último) ou null.
const BIG = 20;
// inclui empate com muitos golos e vitórias tangenciais com muitos golos: GM é critério de
// desempate, por isso resultados que sobem golos sem mudar DG também têm de ser enumerados
const GAME_OUTCOMES = [[BIG, 0], [1, 0], [0, 0], [0, 1], [0, BIG], [BIG, BIG], [BIG + 1, BIG], [BIG, BIG + 1]];
const clinchCache = new Map(); // função pura de (teams, games) e cara — memoiza por estado do grupo
export function clinchStatus(teams, games) {
  const key = teams.join('\0') + '|' + JSON.stringify(games);
  if (clinchCache.has(key)) return clinchCache.get(key);
  if (clinchCache.size > 200) clinchCache.clear();
  const out = Object.fromEntries(teams.map((t) => [t, null]));
  clinchCache.set(key, out);
  const rem = remainingFixtures(teams, games);
  if (rem.length > 4) return out; // cedo demais: nada garantido num grupo de 4
  const ranksOf = new Map(teams.map((t) => [t, new Set()]));
  const combos = GAME_OUTCOMES.length ** rem.length;
  for (let c = 0; c < combos; c++) {
    const hyp = [];
    let n = c;
    for (const [home, away] of rem) {
      const [hg, ag] = GAME_OUTCOMES[n % GAME_OUTCOMES.length];
      n = Math.floor(n / GAME_OUTCOMES.length);
      hyp.push({ home, away, homeGoals: hg, awayGoals: ag });
    }
    for (const r of standingsForGroup(teams, games.concat(hyp))) ranksOf.get(r.team).add(r.rank);
  }
  for (const t of teams) {
    const ranks = [...ranksOf.get(t)];
    if (!ranks.length) continue;
    const mx = Math.max(...ranks);
    const mn = Math.min(...ranks);
    if (mx === 1) out[t] = 'winner';
    else if (mx <= 2) out[t] = 'qualified';
    else if (mn >= 4) out[t] = 'eliminated';
  }
  return out;
}

// Classificação de todos os grupos (com o estado de garantia de cada equipa).
export function allStandings(groups, resultsByGroup) {
  const out = {};
  for (const [g, teams] of Object.entries(groups)) {
    const games = resultsByGroup[g] || [];
    const st = standingsForGroup(teams, games);
    const clinch = clinchStatus(teams, games);
    for (const r of st) r.clinch = clinch[r.team] || null;
    out[g] = st;
  }
  return out;
}

// Os 8 melhores 3.os do torneio inteiro (corte global). Critério (Art. 13): pontos, diferença
// de golos, golos marcados e, em empate, RANKING FIFA (mais pontos FIFA = melhor) — não a ordem
// alfabética. `teams` é o mapa nome->{fifa}; sem ele, recai no nome (compatível com os testes).
export function bestThirds(standings, limit = 8, teams = null) {
  const fifa = (t) => (teams && teams[t] ? teams[t].fifa || 0 : 0);
  const compareThirds = (a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    if (teams && fifa(b.team) !== fifa(a.team)) return fifa(b.team) - fifa(a.team);
    return a.team.localeCompare(b.team, 'pt');
  };
  const thirds = [];
  for (const [g, list] of Object.entries(standings)) {
    const third = list.find((r) => r.rank === 3);
    if (third) thirds.push({ ...third, group: g });
  }
  thirds.sort(compareThirds);
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
  // Final 4 = os 4 semifinalistas = participantes das meias-finais (ids lidos do bracket,
  // não hardcoded — um Euro pode numerar diferente). Se as meias ainda não têm emparelhamento
  // guardado, cai para os vencedores dos quartos (slots winnerOf) — os semifinalistas ficam
  // definidos quando os quartos acabam, não quando as meias são jogadas.
  const sfIds = (bracket?.rounds?.find((r) => r.id === 'sf')?.matches || [101, 102]).map(String);
  const finalId = String((bracket?.rounds?.find((r) => r.id === 'final')?.matches || [104])[0]);
  const final4 = [];
  for (const sf of sfIds) {
    const m = koResults?.[sf];
    const slot = bracket?.matches?.[sf] || {};
    const fromFeeder = (s) => (s?.type === 'winnerOf' ? koResults?.[String(s.match)]?.winner : null);
    const home = m?.home || fromFeeder(slot.home);
    const away = m?.away || fromFeeder(slot.away);
    if (home) final4.push(home);
    if (away) final4.push(away);
  }
  const champion = koResults?.[finalId]?.winner || null;
  return { roundPts, matchRound, results, final4, champion };
}

// Estado completo derivado dos resultados reais — calculado uma vez por pedido.
// `comp` é a configuração da competição (formato + pontos). Sem ela, usa os valores do Mundial.
export function computeWorldState(groups, resultsByGroup, ko = null, comp = null) {
  const bestThirdsLimit = comp?.format?.bestThirds ?? 8;
  const standings = allStandings(groups, resultsByGroup);
  const thirds = bestThirds(standings, bestThirdsLimit, comp?.teams || null);
  const qualified = qualifiedSet(standings, thirds.set);
  const matchesPlayed = Object.values(resultsByGroup).reduce((n, g) => n + (g?.length || 0), 0);
  const knockout = ko ? computeKnockout(ko.bracket, ko.knockoutResults) : null;
  const points = { champion: comp?.scoring?.champion ?? CHAMPION_POINTS, final4: comp?.scoring?.final4 ?? FINAL4_POINTS };
  // mercados extra (melhor marcador, melhor jogador, "melhor pior equipa"...) — configuráveis por edição
  const markets = comp?.markets || [];
  const marketResults = ko?.marketResults || {};
  return { standings, thirds, qualified, matchesPlayed, knockout, points, markets, marketResults, bestThirdsLimit };
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
  // Teto de 3.os: apuram-se no máximo `bestThirdsLimit` (8) terceiros. Quem indicou um 3.º em mais
  // grupos do que isso só vê contar os primeiros, por ordem alfabética dos grupos; os restantes 3.os
  // não dão apuramento nem posição (mas continuam visíveis na folha, marcados como fora do teto).
  const THIRD_LIMIT = world.bestThirdsLimit ?? 8;
  const allowedThird = new Set(
    Object.keys(bet.groups || {})
      .filter((g) => (bet.groups[g] || {}).third)
      .sort((a, b) => a.localeCompare(b, 'pt'))
      .slice(0, THIRD_LIMIT),
  );
  for (const g of Object.keys(bet.groups || {})) {
    const pick = bet.groups[g] || {};
    const mexido = !!pick.mexido;
    const picks = {};
    let groupPos = 0;
    for (const [slot, expectedRank] of SLOTS) {
      const team = pick[slot] || null;
      if (!team) { picks[slot] = null; continue; }
      // 3.º acima do teto (por ordem alfabética dos grupos): não conta para nada
      if (slot === 'third' && !allowedThird.has(g)) {
        picks[slot] = { team, qualifies: qualified.has(team), credited: false, position: 0, capped: true };
        continue;
      }
      const qualifies = qualified.has(team);
      // +1 de apuramento (uma vez por equipa)
      const creditQ = qualifies && !credited.has(team);
      if (creditQ) { credited.add(team); detail.qualification += 1; }
      // +1 de posição exata (3.º só se for 3.º real E entrar nos 8 melhores; perde-se em grupo mexido)
      let position = 0;
      if (!mexido) {
        if (slot === 'third') {
          // equipa repetida no mesmo grupo (também 1.º ou 2.º): o 3.º duplicado não pontua posição
          const dup = team === pick.first || team === pick.second;
          if (!dup && rankOf(standings, g, team) === 3 && thirds.set.has(team)) position = 1;
        } else if (rankOf(standings, g, team) === expectedRank) position = 1;
      }
      groupPos += position;
      picks[slot] = { team, qualifies, credited: creditQ, position };
    }
    const joker = bet.groupJoker === g; // joker de grupo: duplica os pontos de posição deste grupo
    detail.position += joker ? groupPos * 2 : groupPos;
    detail.groups[g] = { mexido, position: groupPos, joker, picks };
  }

  // Mata-mata: campeão (8), Final 4 (3 cada) e jogos eliminatórios (vencedor + fase + jokers).
  const ko = world.knockout;
  const P = world.points || { champion: CHAMPION_POINTS, final4: FINAL4_POINTS };
  detail.knockoutDetail = {};
  detail.correctWinners = 0; // prémio "acertei mais jogos" (vitórias acertadas nos playoffs)
  if (ko) {
    if (bet.champion && ko.champion && bet.champion === ko.champion) detail.champion = P.champion;
    if (Array.isArray(bet.final4) && ko.final4.length) {
      // Set: uma seleção repetida na aposta não pontua duas vezes
      for (const t of new Set(bet.final4)) if (ko.final4.includes(t)) detail.final4 += P.final4;
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

  // mercados extra (configuráveis): cada pick certo vale os pontos do mercado
  detail.markets = 0;
  for (const m of world.markets || []) {
    const pick = bet.markets?.[m.id];
    if (pick && world.marketResults?.[m.id] && pick === world.marketResults[m.id]) detail.markets += (m.points || 0);
  }

  detail.total = detail.qualification + detail.position + detail.champion + detail.final4 + detail.knockout + detail.markets;
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
