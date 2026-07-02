import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { standingsForGroup, computeWorldState, scoreBet, allStandings, clinchStatus } from './scoring.mjs';
import { assignThirds } from './bracket.mjs';

// Grupo simples: 1 jornada, define classificação provisória.
const groups = {
  A: ['Alfa', 'Bravo', 'Charlie', 'Delta'],
  B: ['Eco', 'Foxtrot', 'Golf', 'Hotel'],
};

// Resultados desenhados para dar 1.º Alfa, 2.º Bravo, 3.º Charlie, 4.º Delta;
// e no B: 1.º Eco, 2.º Foxtrot, 3.º Golf, 4.º Hotel.
const results = {
  A: [
    { home: 'Alfa', away: 'Delta', homeGoals: 3, awayGoals: 0 },
    { home: 'Bravo', away: 'Charlie', homeGoals: 2, awayGoals: 1 },
  ],
  B: [
    { home: 'Eco', away: 'Hotel', homeGoals: 2, awayGoals: 0 },
    { home: 'Foxtrot', away: 'Golf', homeGoals: 1, awayGoals: 0 },
  ],
};

test('classificação 3/1/0 e ordenação por pontos/DG/GM', () => {
  const s = standingsForGroup(groups.A, results.A);
  assert.equal(s[0].team, 'Alfa');
  assert.equal(s[0].points, 3);
  assert.equal(s[0].gd, 3);
  assert.equal(s[3].team, 'Delta');
  assert.equal(s[3].rank, 4);
});

test('desempate por confronto direto (Mundial 2026), não por diferença de golos', () => {
  const teams = ['Porto', 'Quim', 'Rui', 'Sa'];
  const games = [
    { home: 'Porto', away: 'Quim', homeGoals: 1, awayGoals: 0 }, // Porto ganha o confronto direto
    { home: 'Porto', away: 'Sa', homeGoals: 1, awayGoals: 0 },
    { home: 'Quim', away: 'Rui', homeGoals: 5, awayGoals: 0 },
    { home: 'Quim', away: 'Sa', homeGoals: 1, awayGoals: 0 },
  ];
  const s = standingsForGroup(teams, games);
  const porto = s.find((r) => r.team === 'Porto');
  const quim = s.find((r) => r.team === 'Quim');
  assert.equal(porto.points, 6);
  assert.equal(quim.points, 6);
  assert.ok(quim.gd > porto.gd); // Quim tem melhor DG geral (+5 vs +2)...
  assert.equal(porto.rank, 1); // ...mas Porto fica em 1.º porque ganhou o confronto direto
  assert.equal(quim.rank, 2);
});

test('clinching: 1.º garantido e eliminado, calculados com os jogos que faltam', () => {
  // A vence tudo (9 pts, terminou); D perde tudo (0 pts, terminou); B e C ainda jogam entre si.
  const games = [
    { home: 'A', away: 'B', homeGoals: 1, awayGoals: 0 },
    { home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
    { home: 'A', away: 'D', homeGoals: 1, awayGoals: 0 },
    { home: 'B', away: 'D', homeGoals: 1, awayGoals: 0 },
    { home: 'C', away: 'D', homeGoals: 1, awayGoals: 0 },
  ];
  const c = clinchStatus(['A', 'B', 'C', 'D'], games);
  assert.equal(c.A, 'winner'); // 9 pts, ninguém o apanha
  assert.equal(c.D, 'eliminated'); // 0 pts e já jogou tudo -> sempre último
  assert.equal(c.B, null); // joga com C: pode ser 2.º ou 3.º
  assert.equal(c.C, null);
});

test('grupo perfeito = 4 pts (2 apuradas + 2 posições)', () => {
  const world = computeWorldState(groups, results);
  const bet = { groups: { A: { first: 'Alfa', second: 'Bravo', third: null } } };
  const d = scoreBet(bet, world, () => 'A');
  // Alfa e Bravo apuram (top-2) => +2; posições 1.º/2.º certas => +2.
  assert.equal(d.qualification, 2);
  assert.equal(d.position, 2);
  assert.equal(d.total, 4);
});

test('ordem trocada = 3 pts (2 apuradas + 1 posição)', () => {
  const world = computeWorldState(groups, results);
  const bet = { groups: { A: { first: 'Bravo', second: 'Alfa', third: null } } };
  const d = scoreBet(bet, world, () => 'A');
  assert.equal(d.qualification, 2); // ambas apuram
  assert.equal(d.position, 0); // Bravo não é 1.º, Alfa não é 2.º
  assert.equal(d.total, 2);
});

test('uma certa de posição = 3 pts', () => {
  const world = computeWorldState(groups, results);
  const bet = { groups: { A: { first: 'Alfa', second: 'Charlie', third: null } } };
  const d = scoreBet(bet, world, () => 'A');
  // Alfa apura (+1, posição +1). Charlie é 3.º — só apura se entrar nos 8 melhores 3.os.
  // Com 2 grupos só há 2 terceiros, ambos entram nos "8 melhores" => Charlie apura (+1).
  assert.equal(d.qualification, 2);
  assert.equal(d.position, 1); // só Alfa acerta posição
  assert.equal(d.total, 3);
});

test('3.º só pontua se entrar nos 8 melhores 3.os', () => {
  // 9 grupos, cada um com um 3.º; só 8 entram. Construímos para Charlie ficar de fora.
  const manyGroups = {};
  const manyResults = {};
  for (let i = 0; i < 9; i++) {
    const g = String.fromCharCode(65 + i);
    manyGroups[g] = [`${g}1`, `${g}2`, `${g}3`, `${g}4`];
    // Round-robin com hierarquia clara g1>g2>g3>g4. A margem da vitória do 3.º (g3 vs g4)
    // cresce com i, por isso o 3.º do grupo 'A' (i=0) é o pior e fica fora dos 8 melhores.
    manyResults[g] = [
      { home: `${g}1`, away: `${g}2`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}1`, away: `${g}3`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}1`, away: `${g}4`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}2`, away: `${g}3`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}2`, away: `${g}4`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}3`, away: `${g}4`, homeGoals: i + 1, awayGoals: 0 },
    ];
  }
  const world = computeWorldState(manyGroups, manyResults);
  assert.equal(world.thirds.set.size, 8);
  assert.ok(!world.thirds.set.has('A3'), 'A3 deve ficar fora dos 8 melhores 3.os');

  const betOut = { groups: { A: { first: 'A1', second: 'A2', third: 'A3' } } };
  const dOut = scoreBet(betOut, world, () => 'A');
  // A1/A2 apuram (+2, posições +2). A3 não entra nos 8 melhores => não apura, sem posição.
  assert.equal(dOut.qualification, 2);
  assert.equal(dOut.position, 2);

  const betIn = { groups: { B: { first: 'B1', second: 'B2', third: 'B3' } } };
  const dIn = scoreBet(betIn, world, () => 'B');
  // B3 entra nos 8 melhores => apura (+1) e posição 3.º certa (+1).
  assert.equal(dIn.qualification, 3);
  assert.equal(dIn.position, 3);
});

test('teto de 3.os: quem indica mais de 8 só vê os primeiros (ordem alfabética dos grupos)', () => {
  // 9 grupos (A..I), cada um com hierarquia clara; os 8 melhores 3.os são B3..I3 (A3 fica fora).
  const manyGroups = {};
  const manyResults = {};
  for (let i = 0; i < 9; i++) {
    const g = String.fromCharCode(65 + i);
    manyGroups[g] = [`${g}1`, `${g}2`, `${g}3`, `${g}4`];
    manyResults[g] = [
      { home: `${g}1`, away: `${g}2`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}1`, away: `${g}3`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}1`, away: `${g}4`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}2`, away: `${g}3`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}2`, away: `${g}4`, homeGoals: 1, awayGoals: 0 },
      { home: `${g}3`, away: `${g}4`, homeGoals: i + 1, awayGoals: 0 },
    ];
  }
  const world = computeWorldState(manyGroups, manyResults);
  assert.equal(world.bestThirdsLimit, 8);
  // jogador indica um 3.º em TODOS os 9 grupos (A..I) — mais do que o teto de 8
  const groupsBet = {};
  for (const g of Object.keys(manyGroups)) groupsBet[g] = { third: `${g}3` };
  const d = scoreBet({ groups: groupsBet }, world, (t) => t[0]);
  // A3 está fora dos 8 melhores (não apura); I3 apura mas é o 9.º grupo => fora do teto.
  // Contam apenas B..H (7 grupos): +1 apuramento e +1 posição cada.
  assert.equal(d.qualification, 7);
  assert.equal(d.position, 7);
  assert.equal(d.groups.I.picks.third.capped, true);
  assert.equal(d.groups.I.picks.third.position, 0);
  assert.equal(d.groups.I.picks.third.credited, false);
  assert.equal(d.groups.H.picks.third.capped, undefined); // dentro do teto, conta normalmente
});

test('detalhe por seleção: apurou (verde) e posição (âmbar) por slot', () => {
  const world = computeWorldState(groups, results);
  const bet = { groups: { A: { first: 'Alfa', second: 'Charlie', third: null } } };
  const d = scoreBet(bet, world, () => 'A');
  const a = d.groups.A.picks;
  // Alfa: apura (1.ª vez -> creditado) e posição 1.º certa
  assert.deepEqual({ q: a.first.qualifies, c: a.first.credited, p: a.first.position }, { q: true, c: true, p: 1 });
  // Charlie previsto como 2.º mas é 3.º: apura (nos 8 melhores) mas posição 2.º errada
  assert.deepEqual({ q: a.second.qualifies, c: a.second.credited, p: a.second.position }, { q: true, c: true, p: 0 });
  assert.equal(a.third, null);
});

test('detalhe não credita apuramento duas vezes para a mesma equipa', () => {
  const world = computeWorldState(groups, results);
  const bet = { groups: { A: { first: 'Alfa', second: 'Bravo', third: 'Alfa' } } };
  const d = scoreBet(bet, world, () => 'A');
  assert.equal(d.groups.A.picks.first.credited, true);
  assert.equal(d.groups.A.picks.third.qualifies, true);
  assert.equal(d.groups.A.picks.third.credited, false); // já contado no 1.º slot
  assert.equal(d.qualification, 2);
});

test('3.º duplicado (mesma equipa noutro slot do grupo) não pontua posição', () => {
  const world = computeWorldState(groups, results);
  // Charlie é o 3.º real do A e entra nos 8 melhores; repetido como 2.º e 3.º só o apuramento conta
  const bet = { groups: { A: { first: 'Alfa', second: 'Charlie', third: 'Charlie' } } };
  const d = scoreBet(bet, world, () => 'A');
  assert.equal(d.qualification, 2); // Alfa + Charlie (uma vez)
  assert.equal(d.position, 1); // só Alfa (1.º certo); o 3.º duplicado não pontua posição
  assert.equal(d.groups.A.picks.third.position, 0);
});

test('não há dupla contagem quando a mesma equipa aparece em dois slots', () => {
  const world = computeWorldState(groups, results);
  // Alfa como 1.º E como 3.º (dado real tem quirks destes). Apura uma só vez.
  const bet = { groups: { A: { first: 'Alfa', second: 'Bravo', third: 'Alfa' } } };
  const d = scoreBet(bet, world, () => 'A');
  assert.equal(d.qualification, 2); // {Alfa, Bravo} apuram = 2 equipas distintas
});

// ---------- mata-mata ----------
const koBracket = {
  rounds: [
    { id: 'r32', winPts: 2, methodPts: 1, joker: true },
    { id: 'sf', winPts: 4, methodPts: 2, joker: false },
    { id: 'final', winPts: 6, methodPts: 3, joker: false },
  ],
  matches: { '73': { round: 'r32' }, '85': { round: 'r32' }, '101': { round: 'sf' }, '102': { round: 'sf' }, '104': { round: 'final' } },
};
const koResults = {
  '73': { home: 'Alfa', away: 'Bravo', winner: 'Alfa', method: 'PEN' },
  '85': { home: 'Eco', away: 'Foxtrot', winner: 'Eco', method: 'TR' },
  '101': { home: 'Eco', away: 'Golf' }, // semifinalistas
  '102': { home: 'Hotel', away: 'India' },
  '104': { winner: 'Eco' }, // campeão
};
const koWorld = () => computeWorldState({}, {}, { bracket: koBracket, knockoutResults: koResults });

test('mata-mata: vencedor + fase, com joker a duplicar', () => {
  const bet = { groups: {}, knockouts: { '73': { winner: 'Alfa', method: 'PEN' } }, jokers: ['73'] };
  const d = scoreBet(bet, koWorld(), () => null);
  // 2 (vencedor) + 1 (PEN) = 3, joker duplica -> 6
  assert.equal(d.knockout, 6);
  assert.equal(d.correctWinners, 1);
});

test('mata-mata: vencedor certo, fase errada = só pontos de vitória', () => {
  const bet = { groups: {}, knockouts: { '85': { winner: 'Eco', method: 'PEN' } } };
  const d = scoreBet(bet, koWorld(), () => null);
  assert.equal(d.knockout, 2); // venceu certo (+2), fase errada (TR≠PEN)
});

test('mata-mata: vencedor errado = 0 mesmo com fase certa', () => {
  const bet = { groups: {}, knockouts: { '73': { winner: 'Bravo', method: 'PEN' } } };
  const d = scoreBet(bet, koWorld(), () => null);
  assert.equal(d.knockout, 0);
  assert.equal(d.correctWinners, 0);
});

test('mata-mata: campeão (8) e Final 4 (3 cada)', () => {
  const bet = { groups: {}, champion: 'Eco', final4: ['Eco', 'Golf', 'Zulu', 'Yankee'] };
  const d = scoreBet(bet, koWorld(), () => null);
  assert.equal(d.champion, 8);
  assert.equal(d.final4, 6); // Eco e Golf são semifinalistas; Zulu/Yankee não
});

test('mercados extra: pick certo vale os pontos do mercado', () => {
  const comp = { markets: [{ id: 'topScorer', points: 5 }, { id: 'bestWorst', points: 6 }] };
  const ko = { bracket: { rounds: [], matches: {} }, knockoutResults: {}, marketResults: { topScorer: 'Mbappé', bestWorst: 'Cabo Verde' } };
  const world = computeWorldState({}, {}, ko, comp);
  const bet = { groups: {}, markets: { topScorer: 'Mbappé', bestWorst: 'Senegal' } };
  const d = scoreBet(bet, world, () => null);
  assert.equal(d.markets, 5); // topScorer certo (+5), bestWorst errado (0)
  assert.equal(d.total, 5);
});

test('atribuição dos 8 melhores 3.os respeita os grupos elegíveis (matching Anexo C)', () => {
  const seed = JSON.parse(readFileSync(new URL('../data/competitions/wc2026/seed.json', import.meta.url)));
  const bracket = JSON.parse(readFileSync(new URL('../data/competitions/wc2026/bracket.json', import.meta.url)));
  const standings = allStandings(seed.groups, seed.results.groups);
  const assign = assignThirds(bracket, standings);
  assert.equal(Object.keys(assign).length, 8); // 8 slots todos preenchidos
  const usedGroups = new Set();
  for (const [mid, a] of Object.entries(assign)) {
    assert.ok(bracket.matches[mid].away.groups.includes(a.group), `grupo ${a.group} não é elegível no jogo ${mid}`);
    assert.ok(!usedGroups.has(a.group), 'grupo repetido');
    usedGroups.add(a.group);
  }
});
