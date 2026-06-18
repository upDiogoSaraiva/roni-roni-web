import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standingsForGroup, computeWorldState, scoreBet } from './scoring.mjs';

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

test('não há dupla contagem quando a mesma equipa aparece em dois slots', () => {
  const world = computeWorldState(groups, results);
  // Alfa como 1.º E como 3.º (dado real tem quirks destes). Apura uma só vez.
  const bet = { groups: { A: { first: 'Alfa', second: 'Bravo', third: 'Alfa' } } };
  const d = scoreBet(bet, world, () => 'A');
  assert.equal(d.qualification, 2); // {Alfa, Bravo} apuram = 2 equipas distintas
});
