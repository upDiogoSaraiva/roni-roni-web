// Roni Roni — SPA (vanilla, sem build). Conteúdo neutro: apostas, resultados e pontos.
// Sem innerHTML cru: todo o conteúdo é construído com nós (el/icon) — seguro e acessível.

const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (sel, root = document) => root.querySelector(sel);
const MAIN = $('#main');

const STATE = { teams: {}, groups: {}, groupOrder: [], windowOpen: true, players: [], meta: {} };
let ADMIN_TOKEN = sessionStorage.getItem('roni-admin') || null;

/* ---------------- DOM helpers ---------------- */
const PROP_AS_PROPERTY = new Set(['value', 'checked', 'disabled', 'selected']);
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'for') node.htmlFor = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROP_AS_PROPERTY.has(k)) node[k] = v;
    else node.setAttribute(k, v);
  }
  append(node, kids);
  return node;
}
function append(node, kids) {
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    node.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

const ICONS = {
  chevron: ['M6 9l6 6 6-6'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  check: ['M20 6L9 17l-5-5'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  flat: ['M5 12h14'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 1 1 8 0v4'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M7 5H4v2a3 3 0 0 0 3 3', 'M17 5h3v2a3 3 0 0 1-3 3'],
};
function icon(name, cls) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (cls) svg.setAttribute('class', cls);
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/* ---------------- API ---------------- */
async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (ADMIN_TOKEN) headers['x-admin-token'] = ADMIN_TOKEN;
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erro'), { status: res.status, data });
  return data;
}

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

/* ---------------- team / monogram ---------------- */
// Bandeiras como SVG bundled (fiável em todas as plataformas, incl. Windows).
function flag(name) {
  const f = STATE.teams[name]?.flagFile;
  if (!f) return el('span', { class: 'flag-img', 'aria-hidden': 'true' });
  return el('img', { class: 'flag-img', src: `flags/${f}.svg`, alt: '', 'aria-hidden': 'true', loading: 'lazy', width: '20', height: '14' });
}
function teamChip(name, { code = false } = {}) {
  if (!name) return el('span', { class: 'muted' }, '—');
  return el('span', { class: 'team' }, flag(name),
    el('span', { class: 'nm' }, code ? STATE.teams[name]?.code || name : name));
}
const MONO_COLORS = ['#C2410C', '#B45309', '#15803D', '#0E7490', '#9A3412', '#1D4ED8', '#7C2D12', '#A16207', '#0F766E', '#9D174D'];
function monoColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return MONO_COLORS[h % MONO_COLORS.length];
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function monogram(name) {
  return el('span', { class: 'mono', style: { background: monoColor(name) }, 'aria-hidden': 'true' }, initials(name));
}

/* ---------------- combobox (pesquisável, acessível) ---------------- */
function combobox({ value, options, placeholder = 'Escolher…', onChange, disabled = new Set(), id }) {
  let open = false;
  let activeIdx = -1;
  let filter = '';
  const wrap = el('div', { class: 'combo' });
  const trigger = el('button', { type: 'button', class: 'combo-trigger', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', id },
    value ? teamChip(value) : el('span', { class: 'placeholder' }, placeholder),
    icon('chevron', 'chev'));
  let pop;

  function visibleOptions() {
    const f = filter.trim().toLowerCase();
    return options.filter((o) => !f || o.toLowerCase().includes(f) || (STATE.teams[o]?.code || '').toLowerCase().includes(f));
  }
  function renderList() {
    const list = $('.combo-list', pop);
    clear(list);
    const vis = visibleOptions();
    if (!vis.length) { list.appendChild(el('div', { class: 'combo-empty' }, 'Sem resultados')); return; }
    vis.forEach((o, i) => {
      const isDisabled = disabled.has(o) && o !== value;
      list.appendChild(el('button', {
        type: 'button', class: 'combo-opt' + (i === activeIdx ? ' active' : ''),
        role: 'option', 'aria-selected': o === value ? 'true' : 'false', disabled: isDisabled,
        onclick: () => select(o),
      }, flag(o), el('span', {}, o)));
    });
  }
  function openPop() {
    if (open) return;
    open = true; filter = ''; activeIdx = -1;
    trigger.setAttribute('aria-expanded', 'true');
    pop = el('div', { class: 'combo-pop', role: 'listbox' },
      el('div', { class: 'combo-search' }, icon('search'),
        el('input', { type: 'text', placeholder: 'Procurar seleção…', 'aria-label': 'Procurar seleção',
          oninput: (e) => { filter = e.target.value; activeIdx = -1; renderList(); },
          onkeydown: onSearchKey })),
      el('div', { class: 'combo-list' }));
    wrap.appendChild(pop);
    renderList();
    setTimeout(() => { if (pop) pop.querySelector('.combo-search input')?.focus(); }, 0);
    document.addEventListener('click', onOutside, true);
  }
  function closePop() {
    if (!open) return;
    open = false;
    trigger.setAttribute('aria-expanded', 'false');
    pop?.remove(); pop = null;
    document.removeEventListener('click', onOutside, true);
  }
  function select(o) {
    closePop();
    onChange?.(o);
  }
  function onOutside(e) { if (!wrap.contains(e.target)) closePop(); }
  function onSearchKey(e) {
    const vis = visibleOptions();
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, vis.length - 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (vis[activeIdx] && !disabled.has(vis[activeIdx])) select(vis[activeIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); closePop(); trigger.focus(); }
  }
  trigger.addEventListener('click', () => (open ? closePop() : openPop()));
  trigger.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); openPop(); } });
  wrap.appendChild(trigger);
  return wrap;
}

/* ---------------- states ---------------- */
function skeletonList(rows = 6) {
  const box = el('div', { class: 'card' });
  for (let i = 0; i < rows; i++) {
    box.appendChild(el('div', { class: 'sk-row' },
      el('div', { class: 'skeleton sk-dot' }),
      el('div', { class: 'skeleton sk-bar', style: { width: 40 + (i % 3) * 15 + '%' } })));
  }
  return box;
}
function emptyState(title, sub, icoName = 'search') {
  return el('div', { class: 'empty' }, el('span', { class: 'ico' }, icon(icoName)), el('h3', {}, title), el('p', {}, sub || ''));
}
function errorState(msg, retry) {
  return el('div', { class: 'errbox' }, el('span', { class: 'ico' }, '!'), el('p', {}, msg),
    retry && el('button', { class: 'btn btn-ghost', onclick: retry }, 'Tentar de novo'));
}

/* ---------------- router ---------------- */
const ROUTES = ['geral', 'apostar', 'resultados', 'admin'];
function currentRoute() {
  const h = location.hash.replace(/^#\//, '').split('/')[0];
  return ROUTES.includes(h) ? h : 'geral';
}
function navigate(route) { location.hash = '#/' + route; }
function setActiveTab() {
  const r = currentRoute();
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.route === r) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
}
async function render() {
  setActiveTab();
  clear(MAIN);
  MAIN.scrollTop = 0;
  const r = currentRoute();
  try {
    if (r === 'geral') await pageGeral();
    else if (r === 'apostar') await pageApostar();
    else if (r === 'resultados') await pageResultados();
    else if (r === 'admin') await pageAdmin();
  } catch (e) {
    MAIN.appendChild(errorState(e.message || 'Erro inesperado.', render));
  }
}

/* ---------------- PÁGINA: GERAL (leaderboard) ---------------- */
const MEDALS = { 1: '#F2B441', 2: '#B9B3A6', 3: '#C58A57' };
function medal(rank) {
  if (rank > 3) return null;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'lb-medal'); svg.setAttribute('aria-hidden', 'true');
  const c = document.createElementNS(SVGNS, 'circle');
  c.setAttribute('cx', '12'); c.setAttribute('cy', '13'); c.setAttribute('r', '7');
  c.setAttribute('fill', MEDALS[rank]);
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('x', '12'); t.setAttribute('y', '16'); t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', '8'); t.setAttribute('font-weight', '700'); t.setAttribute('fill', '#1b1712');
  t.setAttribute('font-family', "'DM Mono',monospace");
  t.textContent = rank;
  svg.append(c, t);
  return svg;
}
function movementEl(m) {
  if (m > 0) return el('span', { class: 'mv up', title: `subiu ${m}`, 'aria-label': `subiu ${m} posições` }, icon('up'));
  if (m < 0) return el('span', { class: 'mv down', title: `desceu ${-m}`, 'aria-label': `desceu ${-m} posições` }, icon('down'));
  return el('span', { class: 'mv flat', 'aria-hidden': 'true' }); // espaçador discreto, sem alteração
}
let lbSort = { key: 'rank', dir: 1 };
async function pageGeral() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Classificação geral'),
    el('p', {}, 'Pontos ao vivo sobre os resultados reais. Toca num jogador para ver a folha.')));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList());
  const data = await api('/api/leaderboard');
  clear(host);

  const myName = localStorage.getItem('roni-me');
  let query = '';
  const expanded = new Set();

  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'Procurar jogador…', 'aria-label': 'Procurar jogador',
    oninput: (e) => { query = e.target.value.toLowerCase(); paint(); } });
  host.appendChild(el('div', { class: 'toolbar' }, el('div', { class: 'search', style: { flex: '1' } }, icon('search'), searchInput)));

  if (data.provisional) {
    host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '0 0 12px' } },
      `Provisório · ${data.matchesPlayed} jogos inseridos · classificação recalcula a cada resultado.`));
  }

  const card = el('div', { class: 'card' });
  host.appendChild(card);

  function sortRows(rows) {
    const r = [...rows];
    if (lbSort.key === 'name') r.sort((a, b) => a.player.localeCompare(b.player, 'pt') * lbSort.dir);
    else r.sort((a, b) => (b.score.total - a.score.total || a.rank - b.rank) * lbSort.dir);
    return r;
  }
  function headBtn(label, key, alignRight) {
    return el('button', { class: alignRight ? 'right' : '', onclick: () => { lbSort = { key, dir: lbSort.key === key ? -lbSort.dir : (key === 'name' ? 1 : 1) }; paint(); } },
      label, lbSort.key === key ? (lbSort.dir > 0 ? ' ↓' : ' ↑') : '');
  }
  function paint() {
    clear(card);
    card.appendChild(el('div', { class: 'lb-head' },
      headBtn('#', 'rank'), headBtn('Jogador', 'name'), headBtn('Pontos', 'points', true)));
    const rows = sortRows(data.leaderboard).filter((r) => !query || r.player.toLowerCase().includes(query));
    if (!rows.length) { card.appendChild(emptyState('Ninguém encontrado', 'Tenta outro nome.')); return; }
    rows.forEach((r, i) => {
      const isMe = myName && r.player === myName;
      const row = el('button', {
        class: 'lb-row' + (r.rank === 1 ? ' leader' : '') + (isMe ? ' me' : ''),
        style: { animationDelay: Math.min(i * 18, 360) + 'ms' },
        'aria-expanded': expanded.has(r.player) ? 'true' : 'false',
        onclick: () => { expanded.has(r.player) ? expanded.delete(r.player) : expanded.add(r.player); paint(); },
      },
        el('div', { class: 'lb-pos' }, medal(r.rank) || el('span', { class: 'lb-rank num' }, r.rank)),
        el('div', { class: 'lb-player' }, monogram(r.player),
          el('div', { style: { minWidth: '0' } },
            el('div', { class: 'nm' }, r.player),
            el('div', { class: 'sub' }, isMe ? 'Tu' : (r.seed ? 'Aposta inicial' : 'Submetida')))),
        el('div', { class: 'lb-pts' }, movementEl(r.movement || 0), el('span', { class: 'v num' }, r.score.total)));
      card.appendChild(row);
      if (expanded.has(r.player)) card.appendChild(sheetDetail(data.bets[r.player], r.score));
    });
  }
  paint();
}

// chips de pontos por seleção: verde = apurou (+1), âmbar = posição certa (+1)
function pointBadges(pick) {
  const b = el('span', { class: 'pt-badges' });
  if (!pick) return b;
  if (pick.credited) b.appendChild(el('span', { class: 'pt-chip apura', title: 'Apurou (+1)' }, '+1'));
  if (pick.position) b.appendChild(el('span', { class: 'pt-chip pos', title: 'Posição certa (+1)' }, '+1'));
  if (pick.qualifies && !pick.credited) b.appendChild(el('span', { class: 'pt-chip dup', title: 'Apurou, mas já contada noutro lugar' }, '✓'));
  if (!pick.qualifies) b.appendChild(el('span', { class: 'pt-chip out', title: 'Não apurou' }, '—'));
  return b;
}
function sheetLine(label, team, pick) {
  if (!team) return null;
  const qualifies = pick ? pick.qualifies : null;
  return el('div', { class: 'sheet-line' + (qualifies === false ? ' faded' : '') },
    el('span', { class: 'pos' }, label), teamChip(team), pointBadges(pick));
}
function sheetDetail(bet, score) {
  const box = el('div', { class: 'lb-detail' });
  if (!bet) { box.appendChild(el('p', { class: 'muted' }, 'Sem folha.')); return box; }
  box.appendChild(el('div', { class: 'sheet-top' },
    el('div', { class: 'kv' }, el('b', {}, 'Campeão'), teamChip(bet.champion)),
    ...bet.final4.map((t) => el('div', { class: 'kv' }, el('b', {}, 'Final 4'), teamChip(t)))));
  box.appendChild(el('p', { class: 'muted', style: { fontSize: '11.5px', margin: '0 0 4px' } },
    'Campeão e Final 4 contam nas eliminatórias.'));
  if (score) {
    box.appendChild(el('div', { class: 'sheet-top' },
      el('div', { class: 'kv' }, el('b', {}, 'Apuramento'), el('span', { class: 'num', style: { color: 'var(--ok)' } }, '+' + score.qualification)),
      el('div', { class: 'kv' }, el('b', {}, 'Posições'), el('span', { class: 'num', style: { color: 'var(--gold)' } }, '+' + score.position)),
      el('div', { class: 'kv' }, el('b', {}, 'Total'), el('span', { class: 'num' }, score.total))));
  }
  box.appendChild(el('div', { class: 'section-label' }, 'Folha por grupo · de onde vêm os pontos'));
  box.appendChild(el('div', { class: 'sheet-legend' },
    el('span', {}, el('span', { class: 'pt-chip apura' }, '+1'), 'apurou'),
    el('span', {}, el('span', { class: 'pt-chip pos' }, '+1'), 'posição certa')));
  const grid = el('div', { class: 'sheet-grid' });
  for (const g of STATE.groupOrder) {
    const p = bet.groups[g] || {};
    const picks = (score && score.groups && score.groups[g] && score.groups[g].picks) || {};
    grid.appendChild(el('div', { class: 'sheet-grp' },
      el('div', { class: 'g' }, 'GRUPO ' + g),
      sheetLine('1.º', p.first, picks.first),
      sheetLine('2.º', p.second, picks.second),
      p.third ? sheetLine('3.º', p.third, picks.third) : null));
  }
  box.appendChild(grid);
  return box;
}

/* ---------------- PÁGINA: APOSTAR (form multi-passo) ---------------- */
function blankDraft() {
  const groups = {};
  for (const g of STATE.groupOrder) groups[g] = { first: null, second: null, third: null };
  return { player: '', pin: '', editing: false, champion: null, final4: [null, null, null, null], groups };
}
let draft = null;
let stepIdx = 0;
function formSteps() {
  return ['ident', 'champion', 'final4', ...STATE.groupOrder.map((g) => 'g:' + g), 'thirds', 'review'];
}
function countThirds() { return STATE.groupOrder.filter((g) => draft.groups[g].third).length; }

async function pageApostar() {
  if (!draft) draft = blankDraft();
  paintForm();
}
function progressBar() {
  const steps = formSteps();
  const bar = el('div', { class: 'steps' });
  steps.forEach((_, i) => bar.appendChild(el('div', { class: 'seg' + (i < stepIdx ? ' done' : i === stepIdx ? ' done' : '') },
    el('span', { class: 'fill', style: { width: i <= stepIdx ? '100%' : '0' } }))));
  return bar;
}
function stepHeader(kicker, title, countText) {
  return el('div', {},
    el('div', { class: 'step-meta' }, el('span', { class: 'kicker' }, kicker), countText && el('span', { class: 'count' }, countText)),
    el('h1', { class: 'page-head', style: { fontSize: '24px', marginBottom: '16px' } }, title));
}
function navButtons({ onNext, nextLabel = 'Continuar', nextDisabled = false, onBack = goBack, showBack = true, nextKind = 'btn-primary' }) {
  return el('div', { class: 'row-actions' },
    showBack && el('button', { class: 'btn btn-ghost', onclick: onBack }, 'Voltar'),
    el('button', { class: 'btn ' + nextKind, disabled: nextDisabled, onclick: onNext },
      nextLabel, nextKind === 'btn-primary' && icon('arrow')));
}
function goBack() { if (stepIdx > 0) { stepIdx--; paintForm(); } }
function goNext() { stepIdx++; paintForm(); }

function paintForm() {
  clear(MAIN);
  if (!STATE.windowOpen && !draft.editing) {
    // janela fechada: ainda permite escolher jogador para ver, mas avisa
    MAIN.appendChild(el('div', { class: 'pill closed', style: { marginBottom: '12px' } }, el('span', { class: 'dot' }), 'Janela de submissões fechada'));
  }
  const steps = formSteps();
  const step = steps[stepIdx];
  MAIN.appendChild(progressBar());
  const body = el('div', {});
  MAIN.appendChild(body);

  if (step === 'ident') return renderIdent(body);
  if (step === 'champion') return renderChampion(body);
  if (step === 'final4') return renderFinal4(body);
  if (step.startsWith('g:')) return renderGroupStep(body, step.slice(2));
  if (step === 'thirds') return renderThirds(body);
  if (step === 'review') return renderReview(body);
}

function renderIdent(body) {
  body.appendChild(stepHeader('Quem és', 'Faz a tua aposta'));
  body.appendChild(el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '20px' } },
    'Escolhe-te da lista para editar a tua aposta, ou escreve um nome novo.'));

  // Jogadores não têm bandeira; um <select> nativo é o controlo certo (acessível e fiável).
  const sel = el('select', { class: 'select', id: 'pick-player', style: { width: '100%' },
    onchange: (e) => { if (e.target.value) loadExisting(e.target.value); } },
    el('option', { value: '' }, '— escolher jogador —'),
    ...STATE.players.map((p) => el('option', { value: p.player, selected: draft.editing && draft.player === p.player }, p.player + (p.hasPin ? ' 🔒' : ''))));
  body.appendChild(el('div', { class: 'field' }, el('label', { for: 'pick-player' }, 'Jogador existente (editar)'), sel));

  body.appendChild(el('div', { class: 'section-label' }, 'ou'));

  const nameField = el('div', { class: 'field' },
    el('label', { for: 'new-name' }, 'Nome novo'),
    el('input', { class: 'input', id: 'new-name', type: 'text', placeholder: 'O teu nome', value: draft.editing ? '' : draft.player,
      oninput: (e) => { draft.player = e.target.value; draft.editing = false; } }));
  body.appendChild(nameField);

  const pinField = el('div', { class: 'field' },
    el('label', { for: 'pin' }, 'PIN (opcional)'),
    el('input', { class: 'input num', id: 'pin', type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: 'p.ex. 1234', value: draft.pin || '',
      oninput: (e) => { draft.pin = e.target.value.replace(/\D/g, ''); } }),
    el('div', { class: 'hint' }, 'Define um PIN para que só tu possas editar a tua aposta. Para editar uma aposta com PIN, terás de o introduzir.'));
  body.appendChild(pinField);

  body.appendChild(navButtons({
    showBack: false,
    onNext: () => { if (!draft.player.trim()) return toast('Escreve ou escolhe um nome.', true); goNext(); },
    nextLabel: 'Começar',
  }));
}

async function loadExisting(player) {
  try {
    const { bet } = await api('/api/bet/' + encodeURIComponent(player));
    draft = blankDraft();
    draft.player = player; draft.editing = true;
    draft.champion = bet.champion;
    draft.final4 = [...bet.final4, null, null, null, null].slice(0, 4);
    for (const g of STATE.groupOrder) draft.groups[g] = { first: bet.groups[g]?.first || null, second: bet.groups[g]?.second || null, third: bet.groups[g]?.third || null };
    if (bet.hasPin) {
      const pin = prompt('Esta aposta tem PIN. Introduz o PIN para editar:');
      draft.pin = (pin || '').replace(/\D/g, '');
    }
    toast(`Aposta de ${player} carregada para edição.`);
    paintForm();
  } catch (e) { toast(e.message, true); }
}

function renderChampion(body) {
  body.appendChild(stepHeader('Passo 1', 'Quem é o campeão?'));
  body.appendChild(el('div', { class: 'field' },
    combobox({ value: draft.champion, options: allTeams(), placeholder: 'Escolher seleção…',
      onChange: (t) => { draft.champion = t; paintForm(); } })));
  body.appendChild(el('p', { class: 'hint' }, 'Vale 8 pontos no fim, se acertares.'));
  body.appendChild(navButtons({ onNext: () => { if (!draft.champion) return toast('Escolhe o campeão.', true); goNext(); } }));
}

function renderFinal4(body) {
  body.appendChild(stepHeader('Passo 2', 'O teu Final 4'));
  body.appendChild(el('p', { class: 'muted', style: { marginTop: '-8px' } }, 'As 4 seleções que chegam às meias-finais. Cada uma certa vale 3 pontos.'));
  const picked = new Set(draft.final4.filter(Boolean));
  for (let i = 0; i < 4; i++) {
    const cur = draft.final4[i];
    const disabled = new Set([...picked].filter((t) => t !== cur));
    body.appendChild(el('div', { class: 'field' },
      el('label', {}, `Semifinalista ${i + 1}`),
      combobox({ value: cur, options: allTeams(), disabled, placeholder: 'Escolher seleção…',
        onChange: (t) => { draft.final4[i] = t; paintForm(); } })));
  }
  const filled = draft.final4.filter(Boolean).length;
  body.appendChild(navButtons({ onNext: () => { if (filled !== 4) return toast('Escolhe as 4 seleções.', true); goNext(); }, nextDisabled: false }));
}

function renderGroupStep(body, g) {
  const teams = STATE.groups[g];
  const idx = STATE.groupOrder.indexOf(g) + 1;
  body.appendChild(stepHeader(`Grupo ${g} · ${idx}/12`, `Grupo ${g}`, null));
  body.appendChild(el('div', { class: 'stack', style: { marginBottom: '8px' } },
    el('div', { class: 'muted', style: { fontSize: '13px', display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center' } },
      teams.map((t) => el('span', { class: 'team' }, flag(t), ' ', t)))));
  const p = draft.groups[g];
  body.appendChild(el('div', { class: 'field' }, el('label', {}, '1.º lugar'),
    combobox({ value: p.first, options: teams, disabled: new Set([p.second].filter(Boolean)), placeholder: 'Quem vence o grupo?',
      onChange: (t) => { p.first = t; paintForm(); } })));
  body.appendChild(el('div', { class: 'field' }, el('label', {}, '2.º lugar'),
    combobox({ value: p.second, options: teams, disabled: new Set([p.first].filter(Boolean)), placeholder: 'Quem fica em 2.º?',
      onChange: (t) => { p.second = t; paintForm(); } })));
  body.appendChild(el('p', { class: 'hint' }, 'O 3.º escolhes mais à frente, no passo dos 8 melhores 3.os.'));
  const ok = p.first && p.second && p.first !== p.second;
  body.appendChild(navButtons({ onNext: () => { if (!ok) return toast('Escolhe 1.º e 2.º (diferentes).', true); goNext(); } }));
}

function renderThirds(body) {
  const n = countThirds();
  body.appendChild(stepHeader('Passo final', '8 melhores 3.os', `${n}/8 escolhidos`));
  body.appendChild(el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '16px' } },
    'Escolhe exatamente 8 seleções que ficam em 3.º e apuram. Toca para escolher o 3.º de cada grupo.'));
  for (const g of STATE.groupOrder) {
    const p = draft.groups[g];
    const candidates = STATE.groups[g].filter((t) => t !== p.first && t !== p.second);
    const card = el('div', { class: 'card', style: { padding: '12px 14px', marginTop: '8px' } });
    card.appendChild(el('div', { style: { fontSize: '12px', fontWeight: '700', color: 'var(--text-soft)', marginBottom: '8px' } }, 'GRUPO ' + g));
    const chips = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    for (const t of candidates) {
      const active = p.third === t;
      chips.appendChild(el('button', {
        type: 'button', class: 'pill', style: active ? { color: 'var(--brand)', borderColor: 'var(--brand)', background: 'color-mix(in srgb,var(--brand) 10%,transparent)', fontWeight: '700' } : {},
        'aria-pressed': active ? 'true' : 'false',
        onclick: () => {
          if (p.third === t) p.third = null;
          else { if (!p.third && countThirds() >= 8) return toast('Já tens 8 terceiros. Tira um para trocar.', true); p.third = t; }
          paintForm();
        },
      }, flag(t), ' ', t, active && icon('check')));
    }
    card.appendChild(chips);
    body.appendChild(card);
  }
  body.appendChild(el('div', { style: { height: '12px' } }));
  body.appendChild(navButtons({ onNext: () => { if (countThirds() !== 8) return toast(`Escolhe exatamente 8 (tens ${countThirds()}).`, true); goNext(); },
    nextLabel: 'Rever aposta' }));
}

function renderReview(body) {
  body.appendChild(stepHeader('Revisão', 'Confere antes de submeter'));
  const errors = validateDraft();
  if (errors.length) {
    body.appendChild(el('div', { class: 'card', style: { padding: '14px', borderColor: 'var(--out)' } },
      el('div', { class: 'field-error', style: { marginTop: 0 } }, 'Falta corrigir:'),
      el('ul', { style: { margin: '8px 0 0', paddingLeft: '18px' } }, ...errors.map((e) => el('li', { class: 'field-error', style: { marginTop: '2px' } }, e)))));
  }
  body.appendChild(el('div', { class: 'card', style: { padding: '16px' } },
    el('div', { class: 'sheet-top' },
      el('div', { class: 'kv' }, el('b', {}, 'Jogador'), draft.player),
      el('div', { class: 'kv' }, el('b', {}, 'Campeão'), teamChip(draft.champion)),
      el('div', { class: 'kv' }, el('b', {}, 'PIN'), draft.pin ? '•••' : '—')),
    el('div', { class: 'section-label' }, 'Final 4'),
    el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ...draft.final4.map((t) => el('span', { class: 'pill' }, teamChip(t))))));

  const grid = el('div', { class: 'sheet-grid', style: { marginTop: '12px' } });
  for (const g of STATE.groupOrder) {
    const p = draft.groups[g];
    grid.appendChild(el('div', { class: 'sheet-grp' },
      el('div', { class: 'g' }, 'GRUPO ' + g),
      el('div', { class: 'sheet-line' }, el('span', { class: 'pos' }, '1.º'), teamChip(p.first)),
      el('div', { class: 'sheet-line' }, el('span', { class: 'pos' }, '2.º'), teamChip(p.second)),
      p.third && el('div', { class: 'sheet-line' }, el('span', { class: 'pos' }, '3.º'), teamChip(p.third))));
  }
  body.appendChild(el('div', { class: 'card', style: { padding: '16px', marginTop: '12px' } },
    el('div', { class: 'section-label', style: { marginTop: 0 } }, 'Grupos · 8 terceiros'), grid));

  body.appendChild(navButtons({
    onNext: submitDraft, nextLabel: draft.editing ? 'Guardar alterações' : 'Confirmar e submeter',
    nextDisabled: errors.length > 0,
  }));
}

function allTeams() { return Object.keys(STATE.teams); }
function validateDraft() {
  const e = [];
  if (!draft.player.trim()) e.push('Nome em falta.');
  if (!draft.champion) e.push('Campeão em falta.');
  if (draft.final4.filter(Boolean).length !== 4) e.push('Final 4 incompleto.');
  for (const g of STATE.groupOrder) {
    const p = draft.groups[g];
    if (!p.first || !p.second) e.push(`Grupo ${g}: falta 1.º/2.º.`);
  }
  const n = countThirds();
  if (n !== 8) e.push(`Tens ${n} terceiros (precisas de 8).`);
  return e;
}
async function submitDraft() {
  const body = {
    player: draft.player.trim(), pin: draft.pin || undefined,
    champion: draft.champion, final4: draft.final4.filter(Boolean), groups: draft.groups,
  };
  try {
    const res = await api('/api/bet', { method: 'POST', body });
    localStorage.setItem('roni-me', body.player);
    renderSuccess(res.updated);
  } catch (e) {
    const msgs = e.data?.errors || [e.message];
    toast(msgs[0], true);
  }
}
function renderSuccess(updated) {
  clear(MAIN);
  MAIN.appendChild(el('div', { class: 'success-hero' },
    el('div', { class: 'check' }, icon('check')),
    el('h2', {}, updated ? 'Aposta atualizada!' : 'Aposta submetida!'),
    el('p', {}, `${draft.player}, a tua folha está registada. Vais aparecer na classificação geral.`),
    el('div', { class: 'row-actions', style: { maxWidth: '360px', margin: '0 auto' } },
      el('button', { class: 'btn btn-ghost', onclick: () => { stepIdx = 0; paintForm(); } }, icon('edit'), 'Editar de novo'),
      el('button', { class: 'btn btn-primary', onclick: () => navigate('geral') }, 'Ver classificação'))));
  draft = null; stepIdx = 0;
}

/* ---------------- PÁGINA: RESULTADOS ---------------- */
async function pageResultados() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Resultados'),
    el('p', {}, 'Jogos e classificação por grupo. Os 8 melhores 3.os apuram.')));
  const host = el('div', {});
  MAIN.appendChild(host);
  host.appendChild(skeletonList(8));
  const data = await api('/api/results');
  clear(host);

  host.appendChild(el('div', { class: 'sheet-top' },
    el('div', { class: 'kv' }, el('b', {}, 'Jogos inseridos'), el('span', { class: 'num' }, data.matchesPlayed)),
    el('div', { class: 'kv' }, el('b', {}, 'Pontos distribuídos'), el('span', { class: 'num' }, data.totalPoints)),
    el('div', { class: 'kv' }, el('b', {}, 'Apuram'), el('span', { class: 'num' }, '32'))));

  host.appendChild(el('div', { class: 'section-label' }, 'Por grupo'));
  const cols = el('div', { class: 'grp-cols' });
  host.appendChild(cols);
  for (const g of STATE.groupOrder) {
    cols.appendChild(groupResultCard(g, data));
  }

  // 8 melhores terceiros
  host.appendChild(el('div', { class: 'section-label' }, 'Corrida aos 8 melhores 3.os'));
  const tcard = el('div', { class: 'card', style: { padding: '6px 0' } });
  data.thirds.forEach((t) => {
    tcard.appendChild(el('div', { class: 'match', style: { gridTemplateColumns: '28px 1fr auto' } },
      el('span', { class: 'num', style: { color: t.qualifies ? 'var(--ok)' : 'var(--text-soft)', fontWeight: t.qualifies ? '700' : '400' } }, t.thirdRank),
      el('div', { style: { justifySelf: 'start', display: 'flex', alignItems: 'center', gap: '8px' } },
        teamChip(t.team), el('span', { class: 'muted', style: { fontSize: '11px' } }, 'grupo ' + t.group)),
      el('span', {}, t.qualifies ? el('span', { class: 'badge ok' }, icon('check'), 'Apura') : el('span', { class: 'badge pending' }, 'Fora'))));
  });
  host.appendChild(tcard);
}
function groupResultCard(g, data) {
  const card = el('div', { class: 'card grp-card' });
  card.appendChild(el('h3', {}, el('span', { class: 'tag num' }, g), 'Grupo ' + g));
  const standings = data.standings[g];
  const table = el('table', { class: 'stand' },
    el('thead', {}, el('tr', {},
      el('th', { class: 'rank-col', 'aria-label': 'Posição' }, ''),
      el('th', { class: 'team-cell' }, 'Equipa'),
      el('th', {}, 'J'), el('th', {}, 'DG'), el('th', {}, 'Pts'))));
  const tb = el('tbody', {});
  standings.forEach((r) => {
    const qcls = r.rank === 1 ? 'q1' : r.rank === 2 ? 'q2' : r.rank === 3 ? 'q3' : '';
    tb.appendChild(el('tr', { class: qcls },
      el('td', {}, r.rank),
      el('td', { class: 'team-cell' }, el('span', { class: 'qbar' }), teamChip(r.team)),
      el('td', { class: 'num' }, r.played),
      el('td', { class: 'num' }, (r.gd > 0 ? '+' : '') + r.gd),
      el('td', { class: 'num pts' }, r.points)));
  });
  table.appendChild(tb);
  card.appendChild(table);

  const matches = data.results[g] || [];
  if (matches.length) {
    card.appendChild(el('div', { class: 'section-label', style: { margin: '12px 0 4px' } }, 'Jogos'));
    matches.sort((a, b) => (a.matchday || 0) - (b.matchday || 0));
    matches.forEach((m) => {
      card.appendChild(el('div', { class: 'match' },
        el('div', { class: 'team h' }, el('span', { class: 'nm' }, m.home), flag(m.home)),
        el('span', { class: 'score num' }, `${m.homeGoals} – ${m.awayGoals}`),
        el('div', { class: 'team a' }, flag(m.away), el('span', { class: 'nm' }, m.away))));
    });
  }
  card.appendChild(el('div', { class: 'match-pts' }, `${data.pointsByGroup[g]} pontos de posição distribuídos`));
  return card;
}

/* ---------------- PÁGINA: ADMIN ---------------- */
async function pageAdmin() {
  if (!ADMIN_TOKEN) return renderAdminLogin();
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Administração'),
    el('p', {}, 'Resultados, janela de submissões e grelha de apostas.')));
  const host = el('div', {});
  MAIN.appendChild(host);
  host.appendChild(skeletonList(5));
  let status, results;
  try { [status, results] = await Promise.all([api('/api/admin/status'), api('/api/results')]); }
  catch (e) { if (e.status === 401) { ADMIN_TOKEN = null; sessionStorage.removeItem('roni-admin'); return renderAdminLogin(); } throw e; }
  clear(host);

  // janela
  host.appendChild(el('div', { class: 'section-label' }, 'Janela de submissões'));
  const winCard = el('div', { class: 'card', style: { padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } });
  winCard.appendChild(el('div', {}, el('div', { style: { fontWeight: '700' } }, status.windowOpen ? 'Aberta' : 'Fechada'),
    el('div', { class: 'muted', style: { fontSize: '13px' } }, 'Quando fechada, ninguém pode submeter nem editar.')));
  winCard.appendChild(el('button', { class: 'btn ' + (status.windowOpen ? 'btn-ghost' : 'btn-primary'),
    onclick: async () => { await api('/api/admin/window', { method: 'POST', body: { open: !status.windowOpen } }); toast('Janela ' + (!status.windowOpen ? 'aberta' : 'fechada')); render(); } },
    status.windowOpen ? 'Fechar janela' : 'Abrir janela'));
  host.appendChild(winCard);

  // estado das submissões
  host.appendChild(el('div', { class: 'section-label' }, `Submissões · ${status.submitted.length} jogadores`));
  const subWrap = el('div', { class: 'status-row' });
  const submittedSet = new Set(status.submitted);
  const all = [...new Set([...status.seedPlayers, ...status.submitted])].sort((a, b) => a.localeCompare(b, 'pt'));
  all.forEach((p) => subWrap.appendChild(el('span', { class: 'who' + (submittedSet.has(p) ? ' done' : '') },
    submittedSet.has(p) ? icon('check') : null, p)));
  host.appendChild(subWrap);

  // editor de resultados
  host.appendChild(el('div', { class: 'section-label' }, 'Editar resultados'));
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '-4px' } }, 'Cada alteração recalcula a classificação.'));
  const grpSel = el('select', { class: 'select', onchange: (e) => paintResEditor(e.target.value) },
    ...STATE.groupOrder.map((g) => el('option', { value: g }, 'Grupo ' + g)));
  host.appendChild(el('div', { class: 'toolbar' }, grpSel));
  const resHost = el('div', {});
  host.appendChild(resHost);
  function paintResEditor(g) {
    clear(resHost);
    resHost.appendChild(resultEditor(g, results.results[g] || []));
  }
  paintResEditor(STATE.groupOrder[0]);

  // grelha de apostas
  host.appendChild(el('div', { class: 'section-label' }, 'Apostas de todos'));
  const betsHost = el('div', {});
  host.appendChild(betsHost);
  betsHost.appendChild(el('p', { class: 'muted' }, 'A carregar apostas…'));
  const { bets } = await api('/api/bets');
  clear(betsHost);
  betsHost.appendChild(betsGrid(bets));
}

function resultEditor(g, existing) {
  const teams = STATE.groups[g];
  // calendário canónico de um grupo de 4 (3 jornadas)
  const schedule = [
    [1, teams[0], teams[1]], [1, teams[2], teams[3]],
    [2, teams[0], teams[2]], [2, teams[3], teams[1]],
    [3, teams[0], teams[3]], [3, teams[1], teams[2]],
  ];
  const findExisting = (a, b) => existing.find((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a));
  const card = el('div', { class: 'card res-editor' });
  schedule.forEach(([md, a, b]) => {
    const ex = findExisting(a, b);
    // mantém a ordem casa/fora já registada
    const home = ex ? ex.home : a;
    const away = ex ? ex.away : b;
    const hg = el('input', { class: 'num', type: 'number', min: '0', inputmode: 'numeric', value: ex ? ex.homeGoals : '', 'aria-label': `golos ${home}` });
    const ag = el('input', { class: 'num', type: 'number', min: '0', inputmode: 'numeric', value: ex ? ex.awayGoals : '', 'aria-label': `golos ${away}` });
    const save = async () => {
      if (hg.value === '' || ag.value === '') return;
      try {
        await api('/api/admin/result', { method: 'POST', body: { group: g, home, away, homeGoals: Number(hg.value), awayGoals: Number(ag.value), matchday: md } });
        toast(`J${md}: ${home} ${hg.value}–${ag.value} ${away}`);
        render();
      } catch (e) { toast(e.message, true); }
    };
    card.appendChild(el('div', { class: 'res-row' },
      el('div', { class: 'team h', style: { justifySelf: 'end' } }, el('span', { class: 'nm' }, home), flag(home)),
      el('div', { class: 'gscore' }, hg, el('span', { class: 'muted' }, ':'), ag,
        el('button', { class: 'icon-btn', style: { width: '36px', height: '36px' }, title: 'Guardar', 'aria-label': 'Guardar resultado', onclick: save }, icon('check'))),
      el('div', { class: 'team a', style: { justifySelf: 'start' } }, flag(away), el('span', { class: 'nm' }, away))));
    card.lastChild.dataset.md = md;
  });
  return card;
}

function betsGrid(bets) {
  let q = '';
  let groupFilter = 'all';
  const wrap = el('div', {});
  const search = el('input', { class: 'input', type: 'search', placeholder: 'Procurar jogador…', 'aria-label': 'Procurar jogador', oninput: (e) => { q = e.target.value.toLowerCase(); paint(); } });
  const gsel = el('select', { class: 'select', 'aria-label': 'Filtrar por grupo', onchange: (e) => { groupFilter = e.target.value; paint(); } },
    el('option', { value: 'all' }, 'Todos os grupos'), ...STATE.groupOrder.map((g) => el('option', { value: g }, 'Grupo ' + g)));
  wrap.appendChild(el('div', { class: 'toolbar' }, el('div', { class: 'search' }, icon('search'), search), gsel));
  const scroll = el('div', { class: 'grid-scroll' });
  wrap.appendChild(scroll);

  function paint() {
    clear(scroll);
    const groupsToShow = groupFilter === 'all' ? STATE.groupOrder : [groupFilter];
    const head = el('tr', {}, el('th', { class: 'player-col' }, 'Jogador'), el('th', {}, 'Campeão'));
    if (groupFilter === 'all') head.appendChild(el('th', {}, 'Final 4'));
    for (const g of groupsToShow) { head.appendChild(el('th', {}, `${g} 1.º`)); head.appendChild(el('th', {}, `${g} 2.º`)); head.appendChild(el('th', {}, `${g} 3.º`)); }
    const tbody = el('tbody', {});
    const rows = bets.filter((b) => !q || b.player.toLowerCase().includes(q)).sort((a, b) => a.player.localeCompare(b.player, 'pt'));
    rows.forEach((b) => {
      const tr = el('tr', {}, el('td', { class: 'player-col' }, b.player),
        el('td', {}, cell(b.champion)));
      if (groupFilter === 'all') tr.appendChild(el('td', {}, b.final4.map((t) => STATE.teams[t]?.code || t).join(' ')));
      for (const g of groupsToShow) {
        const p = b.groups[g] || {};
        tr.appendChild(el('td', {}, cell(p.first)));
        tr.appendChild(el('td', {}, cell(p.second)));
        tr.appendChild(el('td', {}, p.third ? cell(p.third) : el('span', { class: 'muted' }, '—')));
      }
      tbody.appendChild(tr);
    });
    scroll.appendChild(el('table', { class: 'bets-grid' }, el('thead', {}, head), tbody));
  }
  function cell(name) { return name ? el('span', { class: 'team' }, flag(name), el('span', {}, STATE.teams[name]?.code || name)) : el('span', { class: 'muted' }, '—'); }
  paint();
  return wrap;
}

function renderAdminLogin() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Administração')));
  const input = el('input', { class: 'input', type: 'password', placeholder: 'Password', 'aria-label': 'Password de administração',
    onkeydown: (e) => { if (e.key === 'Enter') doLogin(); } });
  async function doLogin() {
    try {
      const { token } = await api('/api/admin/login', { method: 'POST', body: { password: input.value } });
      ADMIN_TOKEN = token; sessionStorage.setItem('roni-admin', token);
      toast('Entraste como admin.');
      render();
    } catch (e) { toast('Password incorreta.', true); }
  }
  MAIN.appendChild(el('div', { class: 'card', style: { padding: '20px', maxWidth: '420px' } },
    el('div', { class: 'field' }, el('label', { for: 'pw' }, el('span', {}, icon('lock'), ' Acesso do organizador')), input),
    el('button', { class: 'btn btn-primary btn-block', onclick: doLogin }, 'Entrar')));
}

/* ---------------- theme ---------------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('roni-theme', t);
  const btn = $('#theme-toggle');
  clear(btn);
  btn.appendChild(document.createTextNode(t === 'dark' ? '☀' : '☾'));
}
$('#theme-toggle').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

/* ---------------- window pill ---------------- */
function paintWindowPill() {
  const pill = $('#window-pill');
  pill.hidden = false;
  pill.className = 'pill ' + (STATE.windowOpen ? 'open' : 'closed');
  clear(pill);
  pill.append(el('span', { class: 'dot' }), STATE.windowOpen ? 'Aberta' : 'Fechada');
}

/* ---------------- boot ---------------- */
async function boot() {
  applyTheme(localStorage.getItem('roni-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  try {
    const st = await api('/api/state');
    Object.assign(STATE, st);
    paintWindowPill();
  } catch (e) {
    MAIN.appendChild(errorState('Não foi possível ligar ao servidor.', boot));
    return;
  }
  window.addEventListener('hashchange', () => { if (currentRoute() !== 'apostar') { draft = null; stepIdx = 0; } render(); });
  if (!location.hash) navigate('geral');
  render();
}
boot();
