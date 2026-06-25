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
// elemento SVG genérico — para gráficos construídos nó-a-nó (sem innerHTML cru)
function svgEl(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; node.setAttribute(k, v); }
  for (const k of kids.flat()) { if (k == null || k === false) continue; node.appendChild(k.nodeType ? k : document.createTextNode(String(k))); }
  return node;
}
// mini-gráfico (sparkline) da posição de um jogador ao longo das jornadas
function rankSparkline(series, count) {
  if (!series || series.points.length < 2) return null;
  const W = 132, H = 30, pad = 4, n = series.points.length;
  const X = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
  const Y = (rank) => pad + ((rank - 1) / Math.max(1, count - 1)) * (H - 2 * pad);
  const pts = series.points.map((p, i) => `${X(i)},${Y(p.rank)}`).join(' ');
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'spark', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: 'var(--brand)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const last = series.points[n - 1];
  svg.appendChild(svgEl('circle', { cx: X(n - 1), cy: Y(last.rank), r: 3, fill: 'var(--brand)' }));
  return svg;
}
// animação count-up de um número (respeita prefers-reduced-motion)
function countUp(elm, to, ms = 650) {
  to = Number(to) || 0;
  if (to <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) { elm.textContent = to; return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    elm.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// FLIP: anima a reordenação de filhos (medir antes -> mutar -> inverter -> tocar). Só transform (60fps, sem layout thrash).
function flipReorder(container, selector, mutate) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { mutate(); return; }
  const first = new Map();
  container.querySelectorAll(selector).forEach((n) => { if (n.dataset.flip) first.set(n.dataset.flip, n.getBoundingClientRect()); });
  mutate();
  if (!first.size) return;
  container.querySelectorAll(selector).forEach((n) => {
    const a = first.get(n.dataset.flip);
    if (!a) return;
    const b = n.getBoundingClientRect();
    const dy = a.top - b.top;
    if (!dy) return;
    n.style.transform = `translateY(${dy}px)`;
    n.style.transition = 'none';
    requestAnimationFrame(() => {
      n.style.transition = 'transform .42s cubic-bezier(.2,.8,.2,1)';
      n.style.transform = '';
    });
  });
}
// momento de celebração: confetti em canvas (ouro/ember/creme), ~1.6s, respeita prefers-reduced-motion
function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.vibrate) { try { navigator.vibrate([0, 35, 25, 45]); } catch {} }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = el('canvas', { class: 'confetti' });
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const colors = ['#e8b23a', '#e5482a', '#f3ece0', '#c9962a'];
  const N = 120;
  const parts = Array.from({ length: N }, (_, k) => ({
    x: W / 2 + (((k * 73) % 100) - 50),
    y: H * 0.32,
    vx: (((k * 31) % 100) / 100 - 0.5) * 9,
    vy: -6 - ((k * 17) % 100) / 100 * 7,
    w: 6 + (k % 4) * 2, h: 4 + (k % 3) * 2,
    rot: (k % 360) * Math.PI / 180, vr: ((k % 7) - 3) * 0.12,
    c: colors[k % colors.length],
  }));
  const t0 = performance.now();
  function frame(now) {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.99;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - t / 1600);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 1600) requestAnimationFrame(frame); else cv.remove();
  }
  requestAnimationFrame(frame);
}

/* ---------------- API ---------------- */
async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (ADMIN_TOKEN) headers['x-admin-token'] = ADMIN_TOKEN;
  const playerToken = localStorage.getItem('roni-token');
  if (playerToken) headers['x-player-token'] = playerToken;
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
function codeOf(name) { return STATE.teams[name]?.code || name; }
// bandeira + código de 3 letras — compacto, para listas de jogos (sem nomes longos)
function teamMini(name, { reverse = false } = {}) {
  const parts = [flag(name), el('span', { class: 'nm' }, codeOf(name))];
  return el('span', { class: 'team mini' }, ...(reverse ? parts.reverse() : parts));
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
const ROUTES = ['geral', 'apostar', 'premios', 'resultados', 'admin', 'historico', 'pessoal', 'evolucao', 'simular', 'reveal', 'h2h', 'cartao', 'halloffame', 'conquistas', 'folha', 'partilhar'];
function currentRoute() {
  const h = location.hash.replace(/^#\//, '').split('/')[0];
  return ROUTES.includes(h) ? h : 'geral';
}
function navigate(route) { location.hash = '#/' + route; }

// barra de chips que une as páginas de "drama" (mostra só as já existentes)
const ENGAGE = [
  ['geral', 'Tabela'], ['evolucao', 'Evolução'], ['simular', 'E se?'],
  ['reveal', 'Reveal'], ['h2h', 'Frente a frente'], ['partilhar', 'Partilhar'], ['halloffame', 'Hall da Fama'], ['conquistas', 'Conquistas'],
];
function engageNav(active) {
  const row = el('div', { class: 'engage-nav', role: 'navigation', 'aria-label': 'Mais vistas',
    onkeydown: (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const btns = [...row.querySelectorAll('.chip-nav')];
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length].focus();
    } });
  for (const [route, label] of ENGAGE) {
    if (!ROUTES.includes(route)) continue;
    row.appendChild(el('button', { type: 'button', class: 'chip-nav' + (route === active ? ' on' : ''), onclick: () => navigate(route) }, label));
  }
  return row;
}
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
  MAIN.classList.remove('pg-in'); void MAIN.offsetWidth; MAIN.classList.add('pg-in'); // re-dispara a transição
  const r = currentRoute();
  try {
    if (r === 'geral') await pageGeral();
    else if (r === 'apostar') await pageApostar();
    else if (r === 'premios') await pagePremios();
    else if (r === 'resultados') await pageResultados();
    else if (r === 'admin') await pageAdmin();
    else if (r === 'historico') await pageHistorico();
    else if (r === 'pessoal') await pagePessoal();
    else if (r === 'evolucao') await pageEvolucao();
    else if (r === 'simular') await pageSimular();
    else if (r === 'reveal') await pageReveal();
    else if (r === 'h2h') await pageH2H();
    else if (r === 'cartao') await pageCartao();
    else if (r === 'partilhar') await pagePartilhar();
    else if (r === 'halloffame') await pageHallOfFame();
    else if (r === 'conquistas') await pageConquistas();
    else if (r === 'folha') await pageFolha();
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
  if (m > 0) return el('span', { class: 'mv up', title: `subiu ${m}`, 'aria-label': `subiu ${m} posições` }, icon('up'), el('span', { class: 'mv-n' }, String(m)));
  if (m < 0) return el('span', { class: 'mv down', title: `desceu ${-m}`, 'aria-label': `desceu ${-m} posições` }, icon('down'), el('span', { class: 'mv-n' }, String(-m)));
  return el('span', { class: 'mv flat', 'aria-hidden': 'true' }); // espaçador discreto, sem alteração
}
// texto da contagem decrescente para o fim da fase de grupos (datas em "AAAAMMDD-AAAAMMDD")
function groupStageCountdown() {
  const dates = STATE.competition?.source?.groupStageDates;
  const end = dates && dates.split('-')[1];
  if (!end || end.length !== 8) return null;
  const d = new Date(+end.slice(0, 4), +end.slice(4, 6) - 1, +end.slice(6, 8), 23, 59);
  const days = Math.ceil((d - new Date()) / 86400000);
  if (Number.isNaN(days) || days < 0) return null;
  return days === 0 ? 'Último dia da fase de grupos' : `Faltam ${days} dia(s) para o fim da fase de grupos`;
}
let lbSort = { key: 'rank', dir: 1 };
async function pageGeral() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Classificação geral'),
    el('p', {}, 'Pontos ao vivo sobre os resultados reais. Toca num jogador para ver a folha.')));
  MAIN.appendChild(engageNav('geral'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList());
  const [data, tl] = await Promise.all([api('/api/leaderboard'), api('/api/timeline').catch(() => null)]);
  clear(host);

  const myName = localStorage.getItem('roni-me');
  let query = '';
  const expanded = new Set();
  let firstLbPaint = true;

  // contagem decrescente (entra no bento abaixo)
  const cd = groupStageCountdown();

  // cartão pessoal: a minha posição de relance (quando identificado / escolhido)
  const myRow = myName && data.leaderboard.find((r) => r.player === myName);
  if (myRow) {
    const myIdx = data.leaderboard.findIndex((r) => r.player === myName);
    const above = myIdx > 0 ? data.leaderboard[myIdx - 1] : null;
    const sub = !above ? 'Estás na liderança!' : `Apanhar ${above.player} · +${above.score.total - myRow.score.total} pts · ${myRow.rank}.º de ${data.leaderboard.length}`;
    const avg = Math.round(data.leaderboard.reduce((a, r) => a + r.score.total, 0) / data.leaderboard.length);
    const vsAvg = myRow.score.total - avg;
    const avgTxt = vsAvg === 0 ? 'em linha com a média do grupo' : `${vsAvg > 0 ? '+' + vsAvg : vsAvg} pts vs média do grupo`;
    const spark = rankSparkline(tl && tl.players.find((p) => p.player === myName), tl ? tl.count : data.leaderboard.length);
    host.appendChild(el('div', { class: 'card hero' },
      monogram(myRow.player),
      el('div', { style: { flex: '1', minWidth: '0' } },
        el('div', { class: 'hero-rank num' }, myRow.rank + '.º'),
        el('div', { class: 'hero-sub' }, sub),
        el('div', { class: 'hero-sub' }, avgTxt),
        spark || null),
      el('div', { class: 'hero-pts' }, movementEl(myRow.movement || 0), el('span', { class: 'num' }, myRow.score.total))));
    host.appendChild(el('button', { class: 'btn btn-ghost', style: { marginBottom: '12px' },
      onclick: async () => {
        const t = `Estou em ${myRow.rank}.º de ${data.leaderboard.length} no Torneio Roni Roni com ${myRow.score.total} pontos.`;
        try { await navigator.clipboard.writeText(t); toast('Resumo copiado!'); } catch { toast('Copia manualmente, por favor.', true); }
      } }, 'Copiar o meu resumo'));
  }

  // bento: módulos de relance (prazo · conquistas · partilhar)
  const bento = el('div', { class: 'bento' });
  if (cd) bento.appendChild(el('div', { class: 'bento-tile' }, el('div', { class: 'bento-k' }, 'Próximo prazo'), el('div', { class: 'bento-v' }, cd)));
  if (myRow) {
    const champCounts = new Map();
    for (const p of Object.values(data.bets)) if (p.champion) champCounts.set(p.champion, (champCounts.get(p.champion) || 0) + 1);
    const earned = computeBadges(myRow, data.bets[myName], { champCounts, maxChamp: Math.max(0, ...champCounts.values()) }).filter((b) => b.earned).length;
    bento.appendChild(el('button', { class: 'bento-tile bento-cta', onclick: () => navigate('conquistas') }, el('div', { class: 'bento-k' }, 'Conquistas'), el('div', { class: 'bento-v' }, earned + '/9')));
  }
  bento.appendChild(el('button', { class: 'bento-tile bento-cta', onclick: () => navigate('partilhar') }, el('div', { class: 'bento-k' }, 'Partilhar'), el('div', { class: 'bento-v' }, 'Cartões e stories')));
  if (bento.childElementCount) host.appendChild(bento);

  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'Procurar jogador…', 'aria-label': 'Procurar jogador',
    oninput: (e) => { query = e.target.value.toLowerCase(); paint(); } });
  host.appendChild(el('div', { class: 'toolbar' }, el('div', { class: 'search', style: { flex: '1' } }, icon('search'), searchInput),
    el('button', { class: 'btn btn-ghost', style: { whiteSpace: 'nowrap' }, onclick: () => shareTable(data.leaderboard) }, 'Partilhar')));

  if (data.provisional) {
    host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '0 0 12px' } },
      `Provisório · ${data.matchesPlayed} jogos inseridos · classificação recalcula a cada resultado.`));
  }

  const card = el('div', { class: 'card' });
  host.appendChild(card);

  // celebração discreta: uma vez por sessão quando lidero ou subo (respeita prefers-reduced-motion)
  function maybeCelebrate() {
    if (!myRow) return;
    const climbed = (myRow.movement || 0) > 0;
    if (myRow.rank !== 1 && !climbed) return;
    const sig = `${myRow.rank}|${data.matchesPlayed || 0}|${myRow.score.total}`;
    if (sessionStorage.getItem('roni-celebrated') === sig) return;
    sessionStorage.setItem('roni-celebrated', sig);
    celebrate();
  }

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
  function build() {
    clear(card);
    card.appendChild(el('div', { class: 'lb-head' },
      headBtn('#', 'rank'), headBtn('Jogador', 'name'), headBtn('Pontos', 'points', true)));
    const rows = sortRows(data.leaderboard).filter((r) => !query || r.player.toLowerCase().includes(query));
    if (!rows.length) { card.appendChild(emptyState('Ninguém encontrado', 'Tenta outro nome.')); return; }
    rows.forEach((r, i) => {
      const isMe = myName && r.player === myName;
      const row = el('button', {
        class: 'lb-row' + (r.rank === 1 ? ' leader' : '') + (isMe ? ' me' : ''),
        'data-flip': r.player,
        style: { animationDelay: Math.min(i * 18, 360) + 'ms' },
        'aria-expanded': expanded.has(r.player) ? 'true' : 'false',
        onclick: () => { expanded.has(r.player) ? expanded.delete(r.player) : expanded.add(r.player); paint(); },
      },
        el('div', { class: 'lb-pos' }, medal(r.rank) || el('span', { class: 'lb-rank num' }, r.rank)),
        el('div', { class: 'lb-player' }, monogram(r.player),
          el('div', { style: { minWidth: '0' } },
            el('div', { class: 'nm' }, (r.rank === 1 ? '👑 ' : '') + r.player),
            el('div', { class: 'sub' }, isMe ? 'Tu' : (r.seed ? 'Aposta inicial' : 'Submetida')))),
        el('div', { class: 'lb-pts' }, movementEl(r.movement || 0), el('span', { class: 'v num' }, r.score.total)));
      card.appendChild(row);
      if (expanded.has(r.player)) card.appendChild(sheetDetail(data.bets[r.player], r.score));
    });
  }
  function paint() {
    if (firstLbPaint) {
      firstLbPaint = false;
      build();
      for (const v of card.querySelectorAll('.lb-pts .v')) countUp(v, v.textContent);
      maybeCelebrate();
    } else {
      flipReorder(card, '.lb-row', build);
    }
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
// barra empilhada: de onde vêm os pontos de um jogador (composição neutra do score)
function pointsBar(score) {
  const segs = [
    { k: 'qualification', label: 'Apuramento', color: 'var(--ok)' },
    { k: 'position', label: 'Posição', color: 'var(--gold)' },
    { k: 'champion', label: 'Campeão', color: 'var(--brand)' },
    { k: 'final4', label: 'Final 4', color: 'var(--brand-ink)' },
    { k: 'knockout', label: 'Mata-mata', color: 'var(--pending)' },
    { k: 'markets', label: 'Extras', color: 'var(--out)' },
  ].map((s) => ({ ...s, v: score[s.k] || 0 })).filter((s) => s.v > 0);
  const total = segs.reduce((n, s) => n + s.v, 0);
  if (!total) return null;
  const bar = el('div', { class: 'pbar' });
  for (const s of segs) bar.appendChild(el('div', { class: 'pbar-seg', style: { width: (s.v / total * 100) + '%', background: s.color }, title: `${s.label}: ${s.v}` }));
  const legend = el('div', { class: 'pbar-legend' });
  for (const s of segs) legend.appendChild(el('span', {}, el('i', { style: { background: s.color } }), `${s.label} ${s.v}`));
  return el('div', { style: { marginTop: '12px' } }, el('div', { class: 'section-label', style: { marginTop: 0 } }, 'Composição dos pontos'), bar, legend);
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
    const kvs = [
      el('div', { class: 'kv' }, el('b', {}, 'Apuramento'), el('span', { class: 'num', style: { color: 'var(--ok)' } }, '+' + score.qualification)),
      el('div', { class: 'kv' }, el('b', {}, 'Posições'), el('span', { class: 'num', style: { color: 'var(--gold)' } }, '+' + score.position)),
    ];
    if (score.knockout) kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Mata-mata'), el('span', { class: 'num', style: { color: 'var(--brand)' } }, '+' + score.knockout)));
    if (score.champion) kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Campeão'), el('span', { class: 'num' }, '+' + score.champion)));
    if (score.final4) kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Final 4'), el('span', { class: 'num' }, '+' + score.final4)));
    if (score.markets) kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Extras'), el('span', { class: 'num' }, '+' + score.markets)));
    kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Total'), el('span', { class: 'num' }, score.total)));
    box.appendChild(el('div', { class: 'sheet-top' }, ...kvs));
    const pb = pointsBar(score);
    if (pb) box.appendChild(pb);
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

/* ---------------- PÁGINA: EVOLUÇÃO (posição por jornada) ---------------- */
async function pageEvolucao() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Evolução'),
    el('p', {}, 'Como mexeu a classificação, jornada a jornada. Escolhe-te para destacares o teu percurso.')));
  MAIN.appendChild(engageNav('evolucao'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(4));
  const data = await api('/api/timeline');
  clear(host);

  const players = data.players.filter((p) => p.points.length);
  if (!data.matchdays.length || !players.length) {
    host.appendChild(emptyState('Ainda sem jornadas', 'Aparece aqui assim que houver resultados inseridos.', 'search'));
    return;
  }

  let me = localStorage.getItem('roni-me') || '';
  const sel = el('select', { class: 'select', style: { width: '100%' },
    onchange: (e) => { me = e.target.value; if (me) localStorage.setItem('roni-me', me); paint(); } },
    el('option', { value: '' }, '— destacar um jogador —'),
    ...[...players].sort((a, b) => a.player.localeCompare(b.player, 'pt'))
      .map((p) => el('option', { value: p.player, selected: p.player === me }, p.player)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } },
    el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, 'Destacar o meu percurso'), sel)));

  // maior subida / queda entre a 1.ª e a última jornada com dados — a picardia
  if (data.matchdays.length >= 2) {
    const movers = players.map((p) => ({ player: p.player, delta: p.points[0].rank - p.points[p.points.length - 1].rank }));
    const up = movers.reduce((b, m) => (m.delta > b.delta ? m : b));
    const down = movers.reduce((b, m) => (m.delta < b.delta ? m : b));
    const kvs = [];
    if (up.delta > 0) kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Maior subida'), el('span', { class: 'v' }, `${up.player} · +${up.delta}`)));
    if (down.delta < 0) kvs.push(el('div', { class: 'kv' }, el('b', {}, 'Maior queda'), el('span', { class: 'v' }, `${down.player} · ${down.delta}`)));
    const lastK = data.matchdays.length - 1;
    const full = players.filter((p) => p.points.length === data.matchdays.length);
    if (full.length) {
      const champJ = full.map((p) => ({ player: p.player, gain: p.points[lastK].total - p.points[lastK - 1].total })).reduce((b, m) => (m.gain > b.gain ? m : b));
      if (champJ.gain > 0) kvs.push(el('div', { class: 'kv' }, el('b', {}, `Campeão da J${data.matchdays[lastK]}`), el('span', { class: 'v' }, `${champJ.player} · +${champJ.gain} pts`)));
    }
    if (kvs.length) host.appendChild(el('div', { class: 'pot', style: { marginTop: '12px' } }, ...kvs));
  }

  const chartCard = el('div', { class: 'card', style: { padding: '14px 10px 10px', marginTop: '12px', overflow: 'hidden' } });
  host.appendChild(chartCard);
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '11.5px', marginTop: '10px' } },
    'Passa o rato por uma linha para ver o jogador. Posição recalculada como se a fase de grupos terminasse no fim de cada jornada (provisório).'));

  const recaps = buildRecaps(data);
  if (recaps.length) {
    host.appendChild(el('div', { class: 'section-label' }, 'História da época'));
    const rc = el('div', { class: 'card', style: { padding: '4px 0' } });
    for (const r of recaps) rc.appendChild(el('div', { class: 'recap' }, el('span', { class: 'recap-j num' }, r.title), el('p', {}, r.text)));
    host.appendChild(rc);
  }

  const rivals = buildRivalries(data);
  if (rivals.length) {
    host.appendChild(el('div', { class: 'section-label' }, 'Rivalidades'));
    const rc = el('div', { class: 'card' });
    for (const r of rivals) rc.appendChild(el('div', { class: 'lb-row', style: { gridTemplateColumns: '1fr auto' } },
      el('div', { class: 'lb-player' }, el('span', { class: 'nm' }, `${r.a}  ↔  ${r.b}`)),
      el('span', { class: 'muted', style: { fontSize: '12px' } }, r.swaps ? `${r.swaps} troca(s) de posição` : `separados por ${r.gap} lugar(es)`)));
    host.appendChild(rc);
  }

  function paint() { clear(chartCard); chartCard.appendChild(buildEvolutionChart(data, players, me)); }
  paint();
}

// nome curto para o rótulo no fim da linha (cabe no espaço à direita)
function shortName(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

function buildEvolutionChart(data, players, me) {
  const W = 700, H = 380, padL = 32, padR = 104, padT = 18, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const mds = data.matchdays, n = mds.length, count = Math.max(data.count, 2);
  const X = (md) => (n === 1 ? padL + plotW / 2 : padL + (mds.indexOf(md) / (n - 1)) * plotW);
  const Y = (rank) => padT + ((rank - 1) / (count - 1)) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ev-chart', width: '100%', role: 'img',
    'aria-label': 'Gráfico da posição de cada jogador por jornada' });
  svg.appendChild(svgEl('title', {}, 'Evolução da posição por jornada'));

  // grelha + eixos (topo = 1.º; cada coluna = uma jornada)
  const axis = svgEl('g', { class: 'ev-axis' });
  for (const md of mds) {
    axis.appendChild(svgEl('line', { class: 'ev-grid', x1: X(md), y1: padT, x2: X(md), y2: padT + plotH }));
    axis.appendChild(svgEl('text', { class: 'ev-xlab', x: X(md), y: H - 10, 'text-anchor': 'middle' }, 'J' + md));
  }
  axis.appendChild(svgEl('text', { class: 'ev-ylab', x: padL - 8, y: Y(1) + 3, 'text-anchor': 'end' }, '1.º'));
  axis.appendChild(svgEl('text', { class: 'ev-ylab', x: padL - 8, y: Y(data.count) + 3, 'text-anchor': 'end' }, data.count + '.º'));
  svg.appendChild(axis);

  const lineFor = (p) => p.points.map((pt) => `${X(pt.md)},${Y(pt.rank)}`).join(' ');
  const leader = players.find((p) => p.points[p.points.length - 1].rank === 1);

  // uma série por jogador: linha visível + pontos + rótulo + área larga invisível para o hover.
  // por defeito as linhas estão esbatidas; líder (ouro) e eu (brand) ficam sempre realçados;
  // passar o rato por qualquer linha realça-a, mostra o nome e trá-la para a frente.
  const layer = svgEl('g', { class: 'ev-series-layer' });
  function series(p) {
    const cls = p.player === me ? 'me' : (leader && p.player === leader.player ? 'leader' : '');
    const g = svgEl('g', { class: 'ev-series' + (cls ? ' ' + cls : '') });
    g.appendChild(svgEl('polyline', { class: 'ev-line ' + cls, points: lineFor(p) }));
    for (const pt of p.points) g.appendChild(svgEl('circle', { class: 'ev-dot ' + cls, cx: X(pt.md), cy: Y(pt.rank), r: 3.2 }));
    const last = p.points[p.points.length - 1];
    g.appendChild(svgEl('text', { class: 'ev-end ' + cls, x: X(last.md) + 8, y: Y(last.rank) + 4 }, `${shortName(p.player)} · ${last.rank}.º`));
    g.appendChild(svgEl('polyline', { class: 'ev-hit', points: lineFor(p) }));
    // realça só a linha sob o rato; limpa qualquer destaque preso ao entrar e ao sair.
    // (NÃO reparentar aqui — mover o nó em hover impede o mouseleave de disparar = linha presa.)
    g.addEventListener('mouseenter', () => {
      for (const s of layer.querySelectorAll('.ev-series.hover')) s.classList.remove('hover');
      g.classList.add('hover');
    });
    g.addEventListener('mouseleave', () => g.classList.remove('hover'));
    return g;
  }
  // desenha primeiro as linhas normais; líder e eu por cima (persistentes)
  for (const p of players) if (p.player !== me && !(leader && p.player === leader.player)) layer.appendChild(series(p));
  if (leader && leader.player !== me) layer.appendChild(series(leader));
  const meP = players.find((p) => p.player === me);
  if (meP) layer.appendChild(series(meP));
  svg.appendChild(layer);

  return svg;
}

// recap textual determinístico de cada transição de jornada, a partir dos deltas de posição
function buildRecaps(data) {
  const mds = data.matchdays;
  if (mds.length < 2) return [];
  const rankAt = (p, md) => (p.points.find((pt) => pt.md === md) || {}).rank;
  const lines = [];
  for (let i = 1; i < mds.length; i++) {
    const prev = mds[i - 1], cur = mds[i];
    let climber = null, faller = null, leader = null;
    for (const p of data.players) {
      const rp = rankAt(p, prev), rc = rankAt(p, cur);
      if (rp == null || rc == null) continue;
      const d = rp - rc; // >0 subiu de posição
      if (!climber || d > climber.d) climber = { player: p.player, d };
      if (!faller || d < faller.d) faller = { player: p.player, d };
      if (rc === 1) leader = { player: p.player, prev: rp };
    }
    const parts = [];
    if (leader) parts.push(leader.prev === 1 ? `${leader.player} manteve a liderança` : `${leader.player} assumiu a liderança (era ${leader.prev}.º)`);
    if (climber && climber.d > 0) parts.push(`${climber.player} foi quem mais subiu (+${climber.d})`);
    if (faller && faller.d < 0) parts.push(`${faller.player} quem mais caiu (${faller.d})`);
    lines.push({ title: `J${prev}→J${cur}`, text: parts.join('; ') + '.' });
  }
  return lines;
}

// rivalidades: pares que mais trocaram de posição entre si (desempate: mais próximos agora)
function buildRivalries(data) {
  const mds = data.matchdays;
  const players = data.players.filter((p) => p.points.length === mds.length);
  if (players.length < 2 || mds.length < 2) return [];
  const rankAt = (p, md) => (p.points.find((pt) => pt.md === md) || {}).rank;
  const pairs = [];
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    let swaps = 0;
    for (let k = 1; k < mds.length; k++) {
      const prev = rankAt(a, mds[k - 1]) - rankAt(b, mds[k - 1]);
      const cur = rankAt(a, mds[k]) - rankAt(b, mds[k]);
      if (prev !== 0 && cur !== 0 && Math.sign(prev) !== Math.sign(cur)) swaps++;
    }
    const gap = Math.abs(rankAt(a, mds[mds.length - 1]) - rankAt(b, mds[mds.length - 1]));
    pairs.push({ a: a.player, b: b.player, swaps, gap });
  }
  pairs.sort((x, y) => y.swaps - x.swaps || x.gap - y.gap);
  return pairs.slice(0, 3);
}

/* ---------------- PÁGINA: SIMULAR ("e se?") ---------------- */
const WHATIF_SCORE = { H: [2, 0], D: [1, 1], A: [0, 2] }; // casa / empate / fora -> golos representativos
async function pageSimular() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'E se?'),
    el('p', {}, 'Escolhe como acabam os jogos que faltam e vê a classificação projetada.')));
  MAIN.appendChild(engageNav('simular'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(6));
  const data = await api('/api/results');
  clear(host);

  // jogos por jogar = calendário canónico de cada grupo menos os já registados
  const played = data.results;
  const remaining = {};
  for (const g of STATE.groupOrder) {
    const t = STATE.groups[g];
    const sched = [
      [1, t[0], t[1]], [1, t[2], t[3]],
      [2, t[0], t[2]], [2, t[3], t[1]],
      [3, t[0], t[3]], [3, t[1], t[2]],
    ];
    const isPlayed = (a, b) => (played[g] || []).some((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a));
    remaining[g] = sched.filter(([, a, b]) => !isPlayed(a, b));
  }
  const total = STATE.groupOrder.reduce((s, g) => s + remaining[g].length, 0);
  if (!total) { host.appendChild(emptyState('Fase de grupos completa', 'Já não há jogos de grupo por simular.', 'check')); return; }

  let me = localStorage.getItem('roni-me') || '';
  const choices = {}; // `${g}|${home}|${away}` -> 'H'|'D'|'A'
  const key = (g, a, b) => `${g}|${a}|${b}`;

  const meSel = el('select', { class: 'select', style: { width: '100%' },
    onchange: (e) => { me = e.target.value; if (me) localStorage.setItem('roni-me', me); if (resHost.childElementCount) simulate(); } },
    el('option', { value: '' }, '— destacar um jogador —'),
    ...[...STATE.players].sort((a, b) => a.player.localeCompare(b.player, 'pt'))
      .map((p) => el('option', { value: p.player, selected: p.player === me }, p.player)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } },
    el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, 'Destacar o meu percurso'), meSel)));

  const fixturesHost = el('div', {});
  host.append(fixturesHost);
  const resHost = el('div', {});
  host.append(resHost);

  function paintFixtures() {
    clear(fixturesHost);
    for (const g of STATE.groupOrder) {
      if (!remaining[g].length) continue;
      fixturesHost.appendChild(el('div', { class: 'section-label' }, 'Grupo ' + g + ' · faltam ' + remaining[g].length));
      for (const [md, home, away] of remaining[g]) {
        const cur = choices[key(g, home, away)];
        const seg = el('div', { class: 'ko-seg' });
        for (const [val, lbl] of [['H', 'Casa'], ['D', 'X'], ['A', 'Fora']]) {
          seg.appendChild(el('button', { type: 'button', class: 'seg-opt' + (cur === val ? ' on' : ''),
            onclick: () => { choices[key(g, home, away)] = val; paintFixtures(); } }, lbl));
        }
        fixturesHost.appendChild(el('div', { class: 'card', style: { padding: '12px', marginTop: '8px' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
            el('span', { class: 'team mini' }, flag(home), el('span', { class: 'nm' }, codeOf(home))),
            el('span', { class: 'num muted', style: { fontSize: '11px' } }, 'J' + md),
            el('span', { class: 'team mini' }, el('span', { class: 'nm' }, codeOf(away)), flag(away))),
          seg));
      }
    }
  }

  const countChosen = () => Object.keys(choices).length;
  const actions = el('div', { class: 'row-actions', style: { marginTop: '16px' } },
    el('button', { class: 'btn btn-ghost', onclick: () => { for (const g of STATE.groupOrder) for (const [, a, b] of remaining[g]) choices[key(g, a, b)] = ['H', 'D', 'A'][Math.floor(Math.random() * 3)]; paintFixtures(); simulate(); } }, 'Sortear tudo'),
    el('button', { class: 'btn btn-primary', onclick: simulate }, icon('arrow'), 'Simular'));
  host.append(actions);

  async function simulate() {
    const results = [];
    for (const g of STATE.groupOrder) {
      for (const [md, home, away] of remaining[g]) {
        const c = choices[key(g, home, away)];
        if (!c) continue;
        const [hg, ag] = WHATIF_SCORE[c];
        results.push({ group: g, home, away, homeGoals: hg, awayGoals: ag, matchday: md });
      }
    }
    if (!results.length) return toast('Escolhe pelo menos um resultado.', true);
    clear(resHost);
    resHost.appendChild(skeletonList(5));
    try {
      const proj = await api('/api/whatif', { method: 'POST', body: { results } });
      renderProjection(resHost, proj, me, countChosen());
      resHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { clear(resHost); resHost.appendChild(errorState(e.message, simulate)); }
  }

  paintFixtures();
}

function renderProjection(resHost, data, me, chosen) {
  clear(resHost);
  const lb = data.leaderboard;
  resHost.appendChild(el('div', { class: 'section-label' }, `Classificação projetada · ${chosen} jogo(s)`));
  const meRow = me && lb.find((r) => r.player === me);
  if (meRow) {
    const mv = meRow.movement;
    resHost.appendChild(el('div', { class: 'pot' },
      el('div', { class: 'kv' }, el('b', {}, 'Ficavas em'), el('span', { class: 'v num' }, `${meRow.rank}.º de ${lb.length}`)),
      el('div', { class: 'kv' }, el('b', {}, 'vs agora'), el('span', { class: 'v', style: { color: mv > 0 ? 'var(--ok)' : mv < 0 ? 'var(--out)' : 'var(--text-soft)' } }, mv > 0 ? `subias ${mv}` : mv < 0 ? `descias ${-mv}` : 'igual')),
      el('div', { class: 'kv' }, el('b', {}, 'Pontos'), el('span', { class: 'v num' }, meRow.score.total))));
  }
  const card = el('div', { class: 'card' });
  lb.forEach((r) => {
    const isMe = r.player === me;
    card.appendChild(el('div', { class: 'lb-row' + (r.rank === 1 ? ' leader' : '') + (isMe ? ' me' : '') },
      el('div', { class: 'lb-pos' }, medal(r.rank) || el('span', { class: 'lb-rank num' }, r.rank)),
      el('div', { class: 'lb-player' }, monogram(r.player),
        el('div', { style: { minWidth: '0' } }, el('div', { class: 'nm' }, r.player),
          el('div', { class: 'sub' }, r.baselineRank ? 'era ' + r.baselineRank + '.º' : ''))),
      el('div', { class: 'lb-pts' }, movementEl(r.movement || 0), el('span', { class: 'v num' }, r.score.total))));
  });
  resHost.appendChild(card);
}

/* ---------------- PÁGINA: REVEAL (apostas do grupo) ---------------- */
// conta ocorrências de nomes -> [{team, n}] ordenado desc
function countPicks(list) {
  const m = new Map();
  for (const t of list) { if (!t) continue; m.set(t, (m.get(t) || 0) + 1); }
  return [...m.entries()].map(([team, n]) => ({ team, n })).sort((a, b) => b.n - a.n || a.team.localeCompare(b.team, 'pt'));
}
// cartão com barras horizontais (seleção + barra proporcional + contagem)
function barCard(rows, max) {
  const card = el('div', { class: 'card', style: { padding: '10px 14px' } });
  const top = max || (rows.length ? rows[0].n : 1);
  for (const r of rows) {
    card.appendChild(el('div', { class: 'reveal-row' },
      el('div', { class: 'reveal-team' }, teamChip(r.team)),
      el('div', { class: 'reveal-bar-wrap' }, el('div', { class: 'reveal-bar', style: { width: Math.round((r.n / top) * 100) + '%' } })),
      el('span', { class: 'num reveal-n' }, r.n)));
  }
  return card;
}
// histograma simples: barras por intervalo de pontos (rótulo de texto + barra proporcional)
function histCard(buckets) {
  const card = el('div', { class: 'card', style: { padding: '10px 14px' } });
  const max = Math.max(1, ...buckets.map((b) => b.n));
  for (const b of buckets) {
    card.appendChild(el('div', { class: 'reveal-row' },
      el('div', { class: 'reveal-team num', style: { fontSize: '12px' } }, `${b.lo}–${b.hi}`),
      el('div', { class: 'reveal-bar-wrap' }, el('div', { class: 'reveal-bar', style: { width: Math.round(b.n / max * 100) + '%' } })),
      el('span', { class: 'num reveal-n' }, b.n)));
  }
  return card;
}
async function pageReveal() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Reveal'),
    el('p', {}, 'Como o grupo apostou — o consenso e a coragem de cada um.')));
  MAIN.appendChild(engageNav('reveal'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(6));
  const [{ bets }, lbData] = await Promise.all([api('/api/bets'), api('/api/leaderboard')]);
  clear(host);
  if (!bets.length) { host.appendChild(emptyState('Sem apostas', 'Ainda não há folhas submetidas.', 'search')); return; }
  const total = bets.length;

  const champ = countPicks(bets.map((b) => b.champion));
  const final4 = countPicks(bets.flatMap((b) => b.final4 || []));
  const champLone = [...champ].reverse().find((c) => c.n === 1);

  host.appendChild(el('div', { class: 'pot' },
    el('div', { class: 'kv' }, el('b', {}, 'Campeão favorito'), el('span', { class: 'v' }, `${champ[0].team} · ${champ[0].n}/${total}`)),
    champLone ? el('div', { class: 'kv' }, el('b', {}, 'Aposta solitária'), el('span', { class: 'v' }, `${champLone.team}`)) : null));

  // estatísticas da época (média e extremos de pontos)
  const lb = lbData.leaderboard;
  if (lb.length) {
    const avg = Math.round(lb.reduce((a, r) => a + r.score.total, 0) / lb.length);
    const top = lb[0], bottom = lb[lb.length - 1];
    host.appendChild(el('div', { class: 'section-label' }, 'Estatísticas da época'));
    host.appendChild(el('div', { class: 'pot' },
      el('div', { class: 'kv' }, el('b', {}, 'Média do grupo'), el('span', { class: 'v num' }, String(avg))),
      el('div', { class: 'kv' }, el('b', {}, 'Mais pontos'), el('span', { class: 'v' }, `${top.player} · ${top.score.total}`)),
      el('div', { class: 'kv' }, el('b', {}, 'Menos pontos'), el('span', { class: 'v' }, `${bottom.player} · ${bottom.score.total}`))));
    const totals = lb.map((r) => r.score.total);
    const min = Math.min(...totals), max = Math.max(...totals), size = 5, start = Math.floor(min / size) * size;
    const buckets = [];
    for (let b = start; b <= max; b += size) buckets.push({ lo: b, hi: b + size - 1, n: totals.filter((t) => t >= b && t < b + size).length });
    host.appendChild(el('div', { class: 'section-label' }, 'Distribuição de pontos'));
    host.appendChild(histCard(buckets));
  }

  host.appendChild(el('div', { class: 'section-label' }, 'Campeão · quem escolheu cada seleção'));
  host.appendChild(barCard(champ));

  host.appendChild(el('div', { class: 'section-label' }, 'Final 4 · seleções mais escolhidas'));
  host.appendChild(barCard(final4.slice(0, 10)));

  const qualifyPicks = countPicks(bets.flatMap((b) => STATE.groupOrder.flatMap((g) => [b.groups?.[g]?.first, b.groups?.[g]?.second])));
  host.appendChild(el('div', { class: 'section-label' }, 'Mais escolhidas para apurar'));
  host.appendChild(barCard(qualifyPicks.slice(0, 12)));

  host.appendChild(el('div', { class: 'section-label' }, 'Vencedor de cada grupo · consenso'));
  const grid = el('div', { class: 'sheet-grid' });
  for (const g of STATE.groupOrder) {
    const c = countPicks(bets.map((b) => b.groups?.[g]?.first));
    if (!c.length) continue;
    grid.appendChild(el('div', { class: 'sheet-grp' },
      el('div', { class: 'g' }, 'GRUPO ' + g),
      el('div', { class: 'sheet-line' }, teamChip(c[0].team),
        el('span', { class: 'muted', style: { marginLeft: 'auto', fontSize: '12px' } }, `${c[0].n}/${total}`))));
  }
  host.appendChild(grid);
}

/* ---------------- PÁGINA: FRENTE A FRENTE (H2H) ---------------- */
function h2hTrio(bet, g) {
  const p = bet.groups?.[g] || {};
  return [p.first, p.second, p.third].filter(Boolean).map(codeOf).join('/') || '—';
}
function h2hRow(label, a, b, eq, win) {
  return el('div', { class: 'h2h-row' + (eq ? ' eq' : '') },
    el('span', { class: 'h2h-lbl' }, label),
    el('span', { class: 'h2h-a num' + (win === 'a' ? ' win' : '') }, a),
    el('span', { class: 'h2h-b num' + (win === 'b' ? ' win' : '') }, b));
}
// quem ganha uma métrica: 'a'|'b'|null (hi=true → maior é melhor)
function h2hWin(x, y, hi = true) { return x === y ? null : ((hi ? x > y : x < y) ? 'a' : 'b'); }
async function pageH2H() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Frente a frente'),
    el('p', {}, 'Compara dois jogadores lado a lado — quem lidera e onde diferem.')));
  MAIN.appendChild(engageNav('h2h'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(6));
  const data = await api('/api/leaderboard');
  clear(host);
  const lb = data.leaderboard;
  const byPlayer = Object.fromEntries(lb.map((r) => [r.player, r]));
  const names = lb.map((r) => r.player).sort((a, b) => a.localeCompare(b, 'pt'));
  const meName = localStorage.getItem('roni-me');
  let A = meName && byPlayer[meName] ? meName : names[0];
  let B = (lb.find((r) => r.player !== A) || {}).player || names[0];

  const selWrap = el('div', { class: 'h2h-selects' });
  const body = el('div', {});
  const mkSel = (val, onChange) => el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => onChange(e.target.value) },
    ...names.map((n) => el('option', { value: n, selected: n === val }, n)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } }, selWrap));
  host.append(body);

  function paint() {
    clear(selWrap);
    selWrap.appendChild(mkSel(A, (v) => { A = v; paint(); }));
    selWrap.appendChild(el('span', { class: 'h2h-vs num' }, 'vs'));
    selWrap.appendChild(mkSel(B, (v) => { B = v; paint(); }));
    clear(body);
    const ra = byPlayer[A], rb = byPlayer[B], ba = data.bets[A], bb = data.bets[B];
    if (!ra || !rb || !ba || !bb) { body.appendChild(emptyState('Escolhe dois jogadores', '', 'search')); return; }

    body.appendChild(el('div', { class: 'h2h-head' }, el('div', {}),
      el('div', { class: 'h2h-pl' }, monogram(A), el('div', { class: 'nm' }, A), el('div', { class: 'sub num' }, ra.rank + '.º · ' + ra.score.total + ' pts')),
      el('div', { class: 'h2h-pl' }, monogram(B), el('div', { class: 'nm' }, B), el('div', { class: 'sub num' }, rb.rank + '.º · ' + rb.score.total + ' pts'))));

    const diff = ra.score.total - rb.score.total;
    const lead = diff === 0 ? 'Empatados em pontos.' : `${diff > 0 ? A : B} lidera por ${Math.abs(diff)} ponto(s).`;
    let sameG = 0;
    for (const g of STATE.groupOrder) if (h2hTrio(ba, g) === h2hTrio(bb, g)) sameG++;
    body.appendChild(el('p', { class: 'muted', style: { textAlign: 'center', margin: '4px 0 12px' } },
      `${lead} Coincidem em ${sameG}/${STATE.groupOrder.length} grupos${ba.champion === bb.champion ? ' e no campeão' : ''}.`));

    const card = el('div', { class: 'card', style: { padding: '4px 0' } });
    card.appendChild(h2hRow('Posição', ra.rank + '.º', rb.rank + '.º', false, h2hWin(ra.rank, rb.rank, false)));
    card.appendChild(h2hRow('Pontos', ra.score.total, rb.score.total, false, h2hWin(ra.score.total, rb.score.total)));
    card.appendChild(h2hRow('Apuramento', '+' + ra.score.qualification, '+' + rb.score.qualification, false, h2hWin(ra.score.qualification, rb.score.qualification)));
    card.appendChild(h2hRow('Posições', '+' + ra.score.position, '+' + rb.score.position, false, h2hWin(ra.score.position, rb.score.position)));
    card.appendChild(h2hRow('Campeão', codeOf(ba.champion), codeOf(bb.champion), ba.champion === bb.champion));
    card.appendChild(h2hRow('Final 4', (ba.final4 || []).map(codeOf).join(' '), (bb.final4 || []).map(codeOf).join(' '), false));
    for (const g of STATE.groupOrder) card.appendChild(h2hRow('Grupo ' + g, h2hTrio(ba, g), h2hTrio(bb, g), h2hTrio(ba, g) === h2hTrio(bb, g)));
    body.appendChild(card);
  }
  paint();
}

/* ---------------- PÁGINA: CARTÃO (partilhável no WhatsApp) ---------------- */
// cartão quadrado 1080×1080 só com formas e texto (sem imagens externas -> canvas não fica "tainted").
// Cores fixas da marca (clara) de propósito: a imagem exportada não deve depender do tema do leitor.
function buildCardNode(player, row, count, bet) {
  const S = 1080, cx = S / 2;
  const F = 'Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  const svg = svgEl('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${S} ${S}`, class: 'card-svg', width: '100%' });
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: S, height: S, fill: '#f6f1e8' }));
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: S, height: 156, fill: '#e5482a' }));
  svg.appendChild(svgEl('text', { x: 60, y: 96, fill: '#fcf3ee', 'font-size': 56, 'font-weight': 700, 'font-family': F }, 'RONI RONI'));
  svg.appendChild(svgEl('text', { x: 62, y: 138, fill: '#fcf3ee', 'font-size': 27, 'font-family': F, opacity: 0.9 }, 'Pool de seleções · 2026'));
  svg.appendChild(svgEl('circle', { cx, cy: 372, r: 96, fill: monoColor(player) }));
  svg.appendChild(svgEl('text', { x: cx, y: 402, 'text-anchor': 'middle', fill: '#fff', 'font-size': 82, 'font-weight': 700, 'font-family': F }, initials(player)));
  svg.appendChild(svgEl('text', { x: cx, y: 552, 'text-anchor': 'middle', fill: '#1b1712', 'font-size': 60, 'font-weight': 700, 'font-family': F }, player));
  svg.appendChild(svgEl('text', { x: cx, y: 792, 'text-anchor': 'middle', fill: '#e5482a', 'font-size': 230, 'font-weight': 700, 'font-family': F }, row.rank + 'º'));
  svg.appendChild(svgEl('text', { x: cx, y: 856, 'text-anchor': 'middle', fill: '#6b6256', 'font-size': 40, 'font-family': F }, `de ${count} · ${row.score.total} pontos`));
  if (bet?.champion) svg.appendChild(svgEl('text', { x: cx, y: 956, 'text-anchor': 'middle', fill: '#1b1712', 'font-size': 36, 'font-family': F }, 'Campeão: ' + bet.champion));
  svg.appendChild(svgEl('text', { x: cx, y: 1028, 'text-anchor': 'middle', fill: '#8a8170', 'font-size': 28, 'font-family': F }, 'Torneio Roni Roni 2026'));
  return svg;
}
async function cardToPng(svgNode, w = 1080, h = 1080) {
  const clone = svgNode.cloneNode(true);
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('falha a desenhar o cartão')); img.src = url; });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}
// cartão da classificação (top 10) para partilhar — SVG retrato 1080×1350, só formas e texto
function buildTableCardNode(lb) {
  const W = 1080, H = 1350, F = 'Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  const svg = svgEl('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W} ${H}`, width: '100%' });
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: '#f6f1e8' }));
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: 170, fill: '#e5482a' }));
  svg.appendChild(svgEl('text', { x: 60, y: 104, fill: '#fcf3ee', 'font-size': 58, 'font-weight': 700, 'font-family': F }, 'RONI RONI'));
  svg.appendChild(svgEl('text', { x: 62, y: 148, fill: '#fcf3ee', 'font-size': 28, 'font-family': F, opacity: 0.9 }, 'Classificação · ' + (STATE.competition?.edition || '')));
  let y = 240;
  lb.slice(0, 10).forEach((r, i, arr) => {
    const nm = r.player.length > 22 ? r.player.slice(0, 21) + '…' : r.player;
    svg.appendChild(svgEl('text', { x: 92, y: y + 34, fill: '#6b6256', 'font-size': 38, 'font-weight': 700, 'font-family': F, 'text-anchor': 'middle' }, r.rank));
    svg.appendChild(svgEl('text', { x: 150, y: y + 34, fill: '#1b1712', 'font-size': 40, 'font-family': F }, nm));
    svg.appendChild(svgEl('text', { x: W - 60, y: y + 34, fill: '#e5482a', 'font-size': 40, 'font-weight': 700, 'font-family': F, 'text-anchor': 'end' }, r.score.total));
    if (i < arr.length - 1) svg.appendChild(svgEl('line', { x1: 60, y1: y + 58, x2: W - 60, y2: y + 58, stroke: '#e7decf', 'stroke-width': 1 }));
    y += 104;
  });
  svg.appendChild(svgEl('text', { x: W / 2, y: H - 40, 'text-anchor': 'middle', fill: '#8a8170', 'font-size': 26, 'font-family': F }, 'Torneio Roni Roni 2026'));
  return svg;
}
async function shareTable(lb) {
  try {
    const blob = await cardToPng(buildTableCardNode(lb), 1080, 1350);
    const file = new File([blob], 'roni-tabela.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Roni Roni', text: 'Classificação do Torneio Roni Roni' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'roni-tabela.png' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (e) { toast(e.message, true); }
}
async function pageCartao() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Cartão'),
    el('p', {}, 'O teu cartão para mandar no grupo do WhatsApp.')));
  MAIN.appendChild(engageNav('cartao'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(4));
  const data = await api('/api/leaderboard');
  clear(host);
  const lb = data.leaderboard;
  const byPlayer = Object.fromEntries(lb.map((r) => [r.player, r]));
  const names = lb.map((r) => r.player).sort((a, b) => a.localeCompare(b, 'pt'));
  const meName = localStorage.getItem('roni-me');
  let me = meName && byPlayer[meName] ? meName : names[0];

  const sel = el('select', { class: 'select', style: { width: '100%' },
    onchange: (e) => { me = e.target.value; localStorage.setItem('roni-me', me); paint(); } },
    ...names.map((n) => el('option', { value: n, selected: n === me }, n)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } }, el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, 'Cartão de quem'), sel)));

  const preview = el('div', { class: 'card-preview' });
  host.append(preview);
  const dl = el('button', { class: 'btn btn-primary', onclick: () => downloadCard() }, icon('arrow'), 'Descarregar PNG');
  const sh = el('button', { class: 'btn btn-ghost', onclick: () => shareCard() }, 'Partilhar');
  host.append(el('div', { class: 'row-actions', style: { marginTop: '12px' } }, sh, dl));

  function paint() { clear(preview); preview.appendChild(buildCardNode(me, byPlayer[me], lb.length, data.bets[me])); }
  async function downloadCard() {
    try {
      const blob = await cardToPng(preview.querySelector('svg'));
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: `roni-${me}.png` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message, true); }
  }
  async function shareCard() {
    try {
      const blob = await cardToPng(preview.querySelector('svg'));
      const file = new File([blob], `roni-${me}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Roni Roni', text: `${me} — ${byPlayer[me].rank}.º no Torneio Roni Roni` });
      } else { toast('Partilha direta indisponível aqui — a descarregar.'); downloadCard(); }
    } catch (e) { /* partilha cancelada pelo utilizador */ }
  }
  paint();
}

/* ---------------- PÁGINA: FOLHA (partilhável por link) ---------------- */
async function pageFolha() {
  const player = decodeURIComponent(location.hash.split('/')[2] || '');
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Folha de ' + (player || 'jogador')),
    el('p', {}, 'A folha e os pontos deste jogador.')));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(4));
  const data = await api('/api/leaderboard');
  clear(host);
  const row = data.leaderboard.find((r) => r.player === player);
  if (!row) { host.appendChild(emptyState('Jogador não encontrado', 'Verifica o nome no link.', 'search')); return; }
  host.appendChild(el('div', { class: 'pot' },
    el('div', { class: 'kv' }, el('b', {}, 'Posição'), el('span', { class: 'v num' }, row.rank + '.º')),
    el('div', { class: 'kv' }, el('b', {}, 'Pontos'), el('span', { class: 'v num' }, row.score.total))));
  host.appendChild(el('button', { class: 'btn btn-ghost', style: { margin: '10px 0' },
    onclick: async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copiado!'); } catch { toast('Copia o link da barra do browser.', true); } } },
    'Copiar link da folha'));
  host.appendChild(sheetDetail(data.bets[player], row.score));
}

/* ---------------- PÁGINA: CONQUISTAS (badges) ---------------- */
// distintivos determinísticos a partir do score + aposta + consenso do grupo (tudo neutro)
function computeBadges(row, bet, ctx) {
  const s = row.score;
  const out = [];
  const add = (emoji, name, desc, earned) => out.push({ emoji, name, desc, earned: !!earned });
  const trio = STATE.groupOrder.some((g) => { const p = s.groups?.[g]?.picks; return p && p.first?.position && p.second?.position && p.third?.position; });
  add('🎯', 'Trio perfeito', 'Acertaste 1.º, 2.º e 3.º de um grupo', trio);
  let any = false, allQ = true;
  for (const g of STATE.groupOrder) { const p = s.groups?.[g]?.picks; if (!p) continue; for (const slot of ['first', 'second']) { if (p[slot]) { any = true; if (!p[slot].qualifies) allQ = false; } } }
  add('✅', 'Faro de apuramento', 'Todos os teus 1.º/2.º apuraram', any && allQ);
  add('🥇', 'Na frente', 'Estás em 1.º lugar', row.rank === 1);
  add('🏅', 'Pódio', 'Estás no top 3', row.rank <= 3);
  add('📈', 'Em ascensão', 'Subiste na última jornada', (row.movement || 0) > 0);
  const backers = ctx.champCounts.get(bet?.champion) || 0;
  add('🦅', 'Contra a corrente', 'O teu campeão foi escolhido por poucos (≤2)', !!bet?.champion && backers <= 2);
  add('🐑', 'Com a maioria', 'Apostaste no campeão mais escolhido', !!bet?.champion && backers === ctx.maxChamp && ctx.maxChamp > 0);
  add('💯', 'Caçador de pontos', '40 pontos ou mais', s.total >= 40);
  add('🎲', 'Aposta única', 'Ninguém escolheu o mesmo campeão que tu', !!bet?.champion && backers === 1);
  return out;
}
// jornadas consecutivas (a contar do fim) em que o jogador esteve no top 3
function podiumStreak(series) {
  if (!series) return 0;
  let s = 0;
  for (let i = series.points.length - 1; i >= 0; i--) { if (series.points[i].rank <= 3) s++; else break; }
  return s;
}
// nível/título do jogador a partir dos pontos (determinístico, neutro)
function playerLevel(total) {
  const tiers = [{ min: 0, name: 'Estreante' }, { min: 20, name: 'Habituado' }, { min: 35, name: 'Veterano' }, { min: 45, name: 'Mestre' }, { min: 55, name: 'Lenda' }];
  let i = 0;
  for (let k = 0; k < tiers.length; k++) if (total >= tiers[k].min) i = k;
  const cur = tiers[i], next = tiers[i + 1];
  const pct = next ? Math.max(0, Math.min(100, Math.round(((total - cur.min) / (next.min - cur.min)) * 100))) : 100;
  return { name: cur.name, level: i + 1, pct, next: next ? next.name : null, toNext: next ? next.min - total : 0 };
}
async function pageConquistas() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Conquistas'),
    el('p', {}, 'Distintivos que ganhas pelas tuas escolhas e pelo teu lugar na tabela.')));
  MAIN.appendChild(engageNav('conquistas'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(4));
  const [data, tl] = await Promise.all([api('/api/leaderboard'), api('/api/timeline').catch(() => null)]);
  clear(host);
  const lb = data.leaderboard;
  const byPlayer = Object.fromEntries(lb.map((r) => [r.player, r]));
  const names = lb.map((r) => r.player).sort((a, b) => a.localeCompare(b, 'pt'));
  const champCounts = new Map();
  for (const p of Object.values(data.bets)) if (p.champion) champCounts.set(p.champion, (champCounts.get(p.champion) || 0) + 1);
  const ctx = { champCounts, maxChamp: Math.max(0, ...champCounts.values()) };
  const meName = localStorage.getItem('roni-me');
  let me = meName && byPlayer[meName] ? meName : names[0];

  const sel = el('select', { class: 'select', style: { width: '100%' },
    onchange: (e) => { me = e.target.value; if (me) localStorage.setItem('roni-me', me); paint(); } },
    ...names.map((n) => el('option', { value: n, selected: n === me }, n)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } }, el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, 'Conquistas de quem'), sel)));
  const body = el('div', { class: 'mt4' });
  host.append(body);

  function paint() {
    clear(body);
    const lvl = playerLevel(byPlayer[me].score.total);
    body.appendChild(el('div', { class: 'card', style: { padding: '14px', marginBottom: '12px' } },
      el('div', { class: 'lvl-top' },
        el('span', { class: 'lvl-name' }, `Nível ${lvl.level} · ${lvl.name}`),
        el('span', { class: 'muted', style: { fontSize: '12px' } }, lvl.next ? `${lvl.toNext} pts para ${lvl.next}` : 'nível máximo')),
      el('div', { class: 'reveal-bar-wrap', style: { marginTop: '8px' } }, el('div', { class: 'reveal-bar', style: { width: lvl.pct + '%' } }))));
    const badges = computeBadges(byPlayer[me], data.bets[me], ctx);
    const earned = badges.filter((b) => b.earned).length;
    const streak = podiumStreak(tl && tl.players.find((p) => p.player === me));
    body.appendChild(el('div', { class: 'pot', style: { marginBottom: '12px' } },
      el('div', { class: 'kv' }, el('b', {}, 'Conquistas'), el('span', { class: 'v num' }, `${earned}/${badges.length}`)),
      streak > 1 ? el('div', { class: 'kv' }, el('b', {}, 'Pódio seguido'), el('span', { class: 'v num' }, `${streak} jornadas`)) : null));
    const grid = el('div', { class: 'badge-grid' });
    for (const b of badges) {
      grid.appendChild(el('div', { class: 'badge-card' + (b.earned ? ' earned' : ' locked') },
        el('div', { class: 'badge-emoji' }, b.emoji),
        el('div', { class: 'badge-name' }, b.name),
        el('div', { class: 'badge-desc' }, b.desc)));
    }
    body.appendChild(grid);
  }
  paint();
}

/* ---------------- PÁGINA: HALL DA FAMA ---------------- */
async function pageHallOfFame() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Hall da Fama'),
    el('p', {}, 'O palmarés do grupo — títulos, pódios e recordes de todas as edições.')));
  MAIN.appendChild(engageNav('halloffame'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(6));
  const [data, tl] = await Promise.all([api('/api/halloffame'), api('/api/timeline').catch(() => null)]);
  clear(host);
  if (!data.table.length) { host.appendChild(emptyState('Ainda sem história', 'Aparece aqui quando houver edições.', 'trophy')); return; }

  let jump = null;
  if (tl) for (const p of tl.players) for (let k = 1; k < p.points.length; k++) { const d = p.points[k].total - p.points[k - 1].total; if (!jump || d > jump.d) jump = { player: p.player, d, md: p.points[k].md }; }
  const rec = data.records.topScore;
  host.appendChild(el('div', { class: 'pot' },
    el('div', { class: 'kv' }, el('b', {}, 'Edições'), el('span', { class: 'v num' }, String(data.editions))),
    rec ? el('div', { class: 'kv' }, el('b', {}, 'Recorde de pontos'), el('span', { class: 'v' }, `${rec.player} · ${rec.total}`)) : null,
    jump && jump.d > 0 ? el('div', { class: 'kv' }, el('b', {}, 'Maior salto'), el('span', { class: 'v' }, `${jump.player} · +${jump.d} (J${jump.md})`)) : null));

  host.appendChild(el('div', { class: 'section-label' }, 'Campeões por edição'));
  const champCard = el('div', { class: 'card' });
  for (const c of data.champions) {
    champCard.appendChild(el('div', { class: 'lb-row', style: { gridTemplateColumns: '1fr auto' } },
      el('div', { class: 'lb-player' }, monogram(c.player),
        el('div', {}, el('div', { class: 'nm' }, '🏆 ' + c.player), el('div', { class: 'sub' }, c.edition))),
      el('span', { class: 'num', style: { color: 'var(--text-soft)' } }, c.total + ' pts')));
  }
  host.appendChild(champCard);

  host.appendChild(el('div', { class: 'section-label' }, 'Tabela de todos os tempos'));
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'hof-head' }, el('span', {}, '#'), el('span', {}, 'Jogador'),
    el('span', { class: 'c' }, '🏆'), el('span', { class: 'c' }, 'Pódios'), el('span', { class: 'c' }, 'Pts')));
  data.table.forEach((p, i) => {
    card.appendChild(el('div', { class: 'hof-row' },
      el('span', { class: 'num' }, i + 1),
      el('div', { class: 'lb-player' }, monogram(p.player),
        el('div', { style: { minWidth: '0' } }, el('div', { class: 'nm' }, p.player),
          el('div', { class: 'sub' }, `${p.editions} edição(ões) · melhor ${p.bestRank}.º`))),
      el('span', { class: 'num c' }, p.titles || '—'),
      el('span', { class: 'num c' }, p.podiums || '—'),
      el('span', { class: 'num c' }, p.points)));
  });
  host.appendChild(card);
}

/* ---------------- PÁGINA: PARTILHAR (cartões story 9:16, tema Roni 26) ---------------- */
const SHARE = { bg: '#0E1116', gold: '#E8B23A', ember: '#E5482A', text: '#F3ECE0', mut: '#9A958A', line: '#262b34' };
const STORY_DIMS = { posicao: [1080, 1920], acerto: [1080, 1920], jogo: [1080, 1920], wrapped: [1080, 1920], sticker: [760, 300] };
// bandeira como SVG inline (mesmo domínio → não "tainta" o canvas ao rasterizar)
const flagCache = {};
async function getFlagEl(name) {
  const code = STATE.teams[name]?.flagFile;
  if (!code) return null;
  if (!(code in flagCache)) {
    try {
      const t = await (await fetch(`flags/${code}.svg`)).text();
      const root = new DOMParser().parseFromString(t, 'image/svg+xml').querySelector('svg');
      if (root && !root.getAttribute('viewBox')) { const w = root.getAttribute('width'), h = root.getAttribute('height'); if (w && h) root.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`); }
      flagCache[code] = root || null;
    } catch { flagCache[code] = null; }
  }
  return flagCache[code] ? flagCache[code].cloneNode(true) : null;
}
function placeFlag(flagEl, x, y, w, h) {
  if (!flagEl) return null;
  flagEl.setAttribute('x', x); flagEl.setAttribute('y', y); flagEl.setAttribute('width', w); flagEl.setAttribute('height', h);
  flagEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return flagEl;
}
// cartão vertical de partilha (export PNG); cores escuras fixas de propósito (imagem independente do tema)
function buildStoryCard(kind, c) {
  const [W, H] = STORY_DIMS[kind];
  const F = 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', cx = W / 2, P = SHARE;
  const txt = (x, y, size, color, content, o = {}) => svgEl('text', { x, y, 'font-family': F, 'font-size': size, fill: color, 'font-weight': o.w || 400, 'text-anchor': o.a || 'start', 'letter-spacing': o.ls || 0 }, content);
  const svg = svgEl('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W} ${H}`, width: '100%', class: 'story-svg' });
  if (kind !== 'sticker') {
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: P.bg }));
    svg.appendChild(txt(70, 132, 46, P.gold, 'RONI RONI', { w: 500, ls: 6 }));
    svg.appendChild(txt(W - 70, 132, 40, P.mut, "'26", { a: 'end', w: 500 }));
    svg.appendChild(svgEl('line', { x1: 70, y1: 168, x2: W - 70, y2: 168, stroke: P.line, 'stroke-width': 2 }));
    svg.appendChild(txt(cx, H - 96, 30, P.mut, c.footer || 'MUNDIAL 2026', { a: 'middle', ls: 5 }));
  }
  if (kind === 'posicao') {
    svg.appendChild(txt(cx, 540, 34, P.mut, 'A MINHA POSIÇÃO', { a: 'middle', ls: 10 }));
    svg.appendChild(txt(cx, 900, 360, P.gold, c.rank + 'º', { a: 'middle', w: 500 }));
    svg.appendChild(txt(cx, 990, 42, P.mut, 'de ' + c.count, { a: 'middle' }));
    svg.appendChild(txt(cx, 1130, 70, P.text, c.player, { a: 'middle', w: 500 }));
    svg.appendChild(txt(cx, 1210, 42, P.ember, (c.movement > 0 ? 'subiu ' + c.movement + ' · ' : '') + c.total + ' pontos', { a: 'middle' }));
    if (c.spark && c.spark.length > 1) {
      const n = c.spark.length, x0 = 220, x1 = W - 220, yt = 1300, yb = 1430, mx = Math.max(...c.spark), mn = Math.min(...c.spark);
      const sx = (i) => x0 + (i / (n - 1)) * (x1 - x0);
      const sy = (v) => mx === mn ? (yt + yb) / 2 : yt + ((v - mn) / (mx - mn)) * (yb - yt);
      svg.appendChild(svgEl('polyline', { points: c.spark.map((v, i) => `${sx(i)},${sy(v)}`).join(' '), fill: 'none', stroke: P.ember, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
  } else if (kind === 'acerto') {
    svg.appendChild(txt(cx, 520, 34, P.mut, 'ACERTO DO DIA', { a: 'middle', ls: 10 }));
    svg.appendChild(svgEl('circle', { cx, cy: 760, r: 130, fill: P.ember }));
    svg.appendChild(svgEl('path', { d: `M ${cx - 58} 760 l 38 44 l 80 -96`, fill: 'none', stroke: P.bg, 'stroke-width': 20, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    svg.appendChild(txt(cx, 1060, 74, P.text, c.label, { a: 'middle', w: 500 }));
    const flA = placeFlag(c.flagEl, cx - 70, 1110, 140, 94); if (flA) svg.appendChild(flA);
    svg.appendChild(txt(cx, 1280, 46, P.mut, c.team, { a: 'middle' }));
    svg.appendChild(txt(cx, 1420, 96, P.gold, '+' + c.pts + ' pts', { a: 'middle', w: 500 }));
    svg.appendChild(txt(cx, 1510, 40, P.mut, c.player, { a: 'middle' }));
  } else if (kind === 'jogo') {
    svg.appendChild(txt(cx, 520, 34, P.mut, 'JOGO DO DIA', { a: 'middle', ls: 10 }));
    const fgA = placeFlag(c.flagAEl, cx - 320, 620, 170, 113); if (fgA) svg.appendChild(fgA);
    const fgB = placeFlag(c.flagBEl, cx + 150, 620, 170, 113); if (fgB) svg.appendChild(fgB);
    svg.appendChild(txt(cx, 850, 116, P.text, `${c.a}  vs  ${c.b}`, { a: 'middle', w: 500 }));
    svg.appendChild(txt(cx, 960, 36, P.mut, 'quem o grupo vê em 1.º do Grupo ' + c.group, { a: 'middle' }));
    const total = (c.na + c.nb) || 1, barW = 840, x0 = cx - barW / 2, y0 = 1030, h = 44, wa = Math.round(barW * c.na / total);
    svg.appendChild(svgEl('rect', { x: x0, y: y0, width: wa, height: h, fill: P.ember, rx: 10 }));
    svg.appendChild(svgEl('rect', { x: x0 + wa, y: y0, width: barW - wa, height: h, fill: P.gold, rx: 10 }));
    svg.appendChild(txt(x0, y0 + 100, 42, P.ember, `${c.na} ${c.a}`, {}));
    svg.appendChild(txt(x0 + barW, y0 + 100, 42, P.gold, `${c.b} ${c.nb}`, { a: 'end' }));
  } else if (kind === 'wrapped') {
    svg.appendChild(txt(cx, 470, 64, P.gold, 'RONI WRAPPED', { a: 'middle', w: 500, ls: 4 }));
    svg.appendChild(txt(cx, 544, 34, P.mut, c.who || '', { a: 'middle' }));
    const wfl = placeFlag(c.wrapFlagEl, cx - 140, 700, 280, 187); if (wfl) svg.appendChild(wfl);
    svg.appendChild(txt(cx, 980, 36, P.mut, c.wrapLabel, { a: 'middle', ls: 4 }));
    const vlen = String(c.wrapValue).length;
    const vs = vlen > 14 ? 76 : vlen > 11 ? 96 : vlen > 7 ? 140 : 210;
    const vcol = c.wrapTone === 'gold' ? P.gold : c.wrapTone === 'ember' ? P.ember : P.text;
    svg.appendChild(txt(cx, 1190, vs, vcol, c.wrapValue, { a: 'middle', w: 500 }));
    if (c.wrapSub) svg.appendChild(txt(cx, 1330, 40, P.mut, c.wrapSub, { a: 'middle', w: 500 }));
  } else if (kind === 'sticker') {
    svg.appendChild(svgEl('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: (H - 16) / 2, fill: P.bg, stroke: P.gold, 'stroke-width': 8 }));
    svg.appendChild(txt(170, H / 2 + 38, 130, P.gold, c.rank + 'º', { a: 'middle', w: 500 }));
    svg.appendChild(txt(330, H / 2 - 18, 54, P.text, 'RONI RONI', { w: 500, ls: 4 }));
    svg.appendChild(txt(330, H / 2 + 50, 36, P.mut, `de ${c.count} · ${c.total} pts`, {}));
  }
  return svg;
}
// story player imersivo (estilo Instagram): barras segmentadas, auto-avanço, tap p/ saltar, hold p/ pausar
function openWrappedPlayer(slides, who) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = 3800;
  // conta para cima o número na revelação do slide (preserva sinal e sufixo: +13, -15, 8º, 5/9)
  function animateValue(node, text) {
    const m = String(text).match(/^([+-]?)(\d+)(.*)$/);
    if (!m || reduce) { node.textContent = text; return; }
    const sign = m[1], target = +m[2], suffix = m[3], t0 = performance.now(), dur = 650;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      node.textContent = sign + Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  let i = 0, held = false, ignoreTap = false, timer = null, holdT = null, startAt = 0, elapsed = 0, finaleDone = false;
  const overlay = el('div', { class: 'wp-overlay' });
  const bars = el('div', { class: 'wp-bars' });
  const fills = slides.map(() => { const f = el('i'); bars.appendChild(el('div', { class: 'wp-seg' }, f)); return f; });
  const stage = el('div', { class: 'wp-stage' });
  const closeBtn = el('button', { class: 'wp-close', 'aria-label': 'Fechar' }, '×');
  const leftZone = el('div', { class: 'wp-tap wp-left' });
  const rightZone = el('div', { class: 'wp-tap wp-right' });
  closeBtn.addEventListener('click', destroy);
  const consume = () => { if (ignoreTap) { ignoreTap = false; return true; } return false; };
  leftZone.addEventListener('click', () => { if (!consume()) go(i - 1); });
  rightZone.addEventListener('click', () => { if (!consume()) go(i + 1); });
  if (!reduce) {
    overlay.addEventListener('pointerdown', () => { holdT = setTimeout(() => { held = true; pause(); }, 180); });
    overlay.addEventListener('pointerup', () => { clearTimeout(holdT); if (held) { ignoreTap = true; held = false; start(); } });
  }
  overlay.append(bars, closeBtn, leftZone, rightZone, stage);
  document.body.appendChild(overlay);
  function render() {
    clear(stage);
    const s = slides[i];
    const vlen = String(s.value).length;
    const vsize = vlen > 14 ? '40px' : vlen > 11 ? '50px' : vlen > 7 ? '68px' : '92px';
    const labelEl = el('div', { class: 'wp-label' }, s.label);
    const valueEl = el('div', { class: 'wp-value', style: { fontSize: vsize, color: s.tone === 'gold' ? '#e8b23a' : s.tone === 'ember' ? '#e5482a' : '#f3ece0' } });
    const card = el('div', { class: 'wp-card' },
      el('div', { class: 'wp-brand' }, 'RONI RONI'),
      el('div', { class: 'wp-who' }, who),
      labelEl,
      valueEl);
    animateValue(valueEl, s.value);
    if (s.sub) card.appendChild(el('div', { class: 'wp-sub' }, s.sub));
    if (s.team) {
      const holder = el('div', { class: 'wp-flag' });
      card.insertBefore(holder, labelEl);
      getFlagEl(s.team).then((fl) => { if (slides[i] === s && fl) holder.appendChild(fl); }).catch(() => {});
    }
    if (i === slides.length - 1) {
      card.appendChild(el('button', { class: 'btn btn-primary', style: { marginTop: '36px' }, onclick: share }, icon('arrow'), 'Partilhar'));
      if (!finaleDone) { finaleDone = true; celebrate(); }
    }
    stage.appendChild(card);
    fills.forEach((f, k) => { f.style.transition = 'none'; f.style.width = k < i ? '100%' : '0%'; });
    void bars.offsetWidth;
    if (!reduce) start();
  }
  function start() {
    const f = fills[i];
    f.style.transition = `width ${Math.max(0, DUR - elapsed)}ms linear`;
    f.style.width = '100%';
    clearTimeout(timer);
    timer = setTimeout(() => go(i + 1), Math.max(0, DUR - elapsed));
    startAt = performance.now();
  }
  function pause() {
    clearTimeout(timer);
    elapsed += performance.now() - startAt;
    const f = fills[i], full = f.parentElement.getBoundingClientRect().width || 1;
    f.style.transition = 'none';
    f.style.width = (f.getBoundingClientRect().width / full * 100) + '%';
  }
  function go(n) { clearTimeout(timer); if (n >= slides.length) return destroy(); i = Math.max(0, n); elapsed = 0; render(); }
  function destroy() { clearTimeout(timer); clearTimeout(holdT); overlay.remove(); }
  async function share() {
    try {
      const sc = { who, wrapLabel: slides[i].label, wrapValue: slides[i].value, wrapSub: slides[i].sub };
      if (slides[i].team) sc.wrapFlagEl = await getFlagEl(slides[i].team);
      const blob = await cardToPng(buildStoryCard('wrapped', sc), 1080, 1920);
      const file = new File([blob], 'roni-wrapped.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Roni Roni' });
      else { const url = URL.createObjectURL(blob); const a = el('a', { href: url, download: 'roni-wrapped.png' }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (e) { toast(e.message, true); }
  }
  render();
}
async function pagePartilhar() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Partilhar'),
    el('p', {}, 'Cartões verticais para stories do Instagram e WhatsApp.')));
  MAIN.appendChild(engageNav('partilhar'));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(4));
  const [data, tl, res] = await Promise.all([api('/api/leaderboard'), api('/api/timeline').catch(() => null), api('/api/results').catch(() => null)]);
  clear(host);
  const lb = data.leaderboard, bets = data.bets;
  const byPlayer = Object.fromEntries(lb.map((r) => [r.player, r]));
  const names = lb.map((r) => r.player).sort((a, b) => a.localeCompare(b, 'pt'));
  const meName = localStorage.getItem('roni-me');
  let me = meName && byPlayer[meName] ? meName : names[0];
  let kind = 'posicao';
  let wrapIdx = 0;
  const champCounts = new Map();
  for (const p of Object.values(bets)) if (p.champion) champCounts.set(p.champion, (champCounts.get(p.champion) || 0) + 1);
  const badgeCtx = { champCounts, maxChamp: Math.max(0, ...champCounts.values()) };

  const consensus = (g, a, b) => {
    const firsts = Object.values(bets).map((x) => x.groups?.[g]?.first);
    return { group: g, a: codeOf(a), b: codeOf(b), aName: a, bName: b, na: firsts.filter((x) => x === a).length, nb: firsts.filter((x) => x === b).length };
  };
  const jogoCtx = () => {
    // próximo jogo por disputar do calendário canónico de cada grupo (J1: 0-1,2-3 · J2: 0-2,3-1 · J3: 0-3,1-2)
    const played = (g, a, b) => (res?.results?.[g] || []).some((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a));
    for (const g of STATE.groupOrder) {
      const t = STATE.groups[g];
      const sched = [[t[0], t[1]], [t[2], t[3]], [t[0], t[2]], [t[3], t[1]], [t[0], t[3]], [t[1], t[2]]];
      for (const [a, b] of sched) if (!played(g, a, b)) return consensus(g, a, b);
    }
    // fallback (tudo jogado): grupo com o 1.º mais dividido
    let best = null;
    for (const g of STATE.groupOrder) {
      const counts = countPicks(Object.values(bets).map((x) => x.groups?.[g]?.first));
      if (counts.length < 2) continue;
      const margin = counts[0].n - counts[1].n;
      if (!best || margin < best.margin) best = { ...consensus(g, counts[0].team, counts[1].team), margin };
    }
    return best || { group: STATE.groupOrder[0], a: '—', b: '—', na: 0, nb: 0 };
  };
  const acertoCtx = (row) => {
    const ord = { first: '1.º', second: '2.º', third: '3.º' };
    for (const g of STATE.groupOrder) {
      const picks = row.score.groups?.[g]?.picks || {};
      for (const slot of ['first', 'second', 'third']) if (picks[slot]?.position) return { label: `${ord[slot]} do Grupo ${g}`, team: picks[slot].team, pts: 1, player: me };
    }
    return null;
  };
  function ctxFor(k) {
    const row = byPlayer[me];
    const series = tl && tl.players.find((p) => p.player === me);
    if (k === 'posicao') return { player: me, rank: row.rank, count: lb.length, total: row.score.total, movement: row.movement || 0, spark: series ? series.points.map((p) => p.rank) : [] };
    if (k === 'acerto') return acertoCtx(row);
    if (k === 'jogo') return jogoCtx();
    if (k === 'wrapped') {
      let jump = 0, jumpMd = 0;
      if (series) for (let i = 1; i < series.points.length; i++) {
        const d = series.points[i].total - series.points[i - 1].total;
        if (d > jump) { jump = d; jumpMd = i + 1; }
      }
      const ranks = series ? series.points.map((p) => p.rank) : [row.rank];
      const bestRank = Math.min(...ranks);
      const climb = ranks[0] - ranks[ranks.length - 1]; // >0 = subiu desde a 1.ª jornada
      const qual = row.score.qualification || 0;
      const pos = row.score.position || 0;
      const earned = computeBadges(row, bets[me], badgeCtx).filter((b) => b.earned).length;
      const champ = bets[me]?.champion;
      const backers = champ ? (champCounts.get(champ) || 0) : 0;
      const slotPt = { first: '1.º', second: '2.º', third: '3.º' };
      const backersFor = (g, slot, team) => Object.values(bets).filter((b) => b.groups?.[g]?.[slot] === team).length;
      const gp = row.score.groups || {};
      // golpe de génio: o acerto de posição que menos gente partilhou · desastre: o favorito que ficou de fora
      let gem = null, flop = null;
      for (const g of STATE.groupOrder) for (const slot of ['first', 'second', 'third']) {
        const p = gp[g]?.picks?.[slot];
        if (!p) continue;
        const back = backersFor(g, slot, p.team);
        if (p.position && (!gem || back < gem.back)) gem = { g, slot, team: p.team, back };
        if (p.qualifies === false && (!flop || back > flop.back)) flop = { g, slot, team: p.team, back };
      }
      // chip especial (joker de grupo): dobra a posição de um grupo — desperdiçado se saiu em branco
      let joker = null;
      const jg = bets[me]?.groupJoker;
      if (jg && gp[jg]) {
        let jpos = 0;
        for (const slot of ['first', 'second', 'third']) if (gp[jg].picks?.[slot]?.position) jpos++;
        joker = { g: jg, jpos };
      }
      // maior queda de posições numa jornada (o oposto do maior salto)
      let drop = 0, dropMd = 0;
      if (series) for (let i = 1; i < series.points.length; i++) {
        const d = series.points[i].rank - series.points[i - 1].rank; // >0 = caiu lugares
        if (d > drop) { drop = d; dropMd = i + 1; }
      }
      // rival da época: o jogador com quem mais trocaste de lugar ao longo das jornadas (lead changes)
      let rival = null;
      if (tl && series && series.points.length > 1) {
        for (const op of tl.players) {
          if (op.player === me) continue;
          const n = Math.min(series.points.length, op.points.length);
          let flips = 0, prev = 0, gap = 0;
          for (let i = 0; i < n; i++) {
            const s = Math.sign(series.points[i].rank - op.points[i].rank);
            if (s !== 0 && prev !== 0 && s !== prev) flips++;
            if (s !== 0) prev = s;
            gap += Math.abs(series.points[i].rank - op.points[i].rank);
          }
          gap /= n || 1;
          if (!rival || flips > rival.flips || (flips === rival.flips && gap < rival.gap)) rival = { player: op.player, flips, gap };
        }
      }
      // distância ao pódio (só se ainda fora do top 3)
      const podiumGap = (row.rank > 3 && lb[2]) ? (lb[2].score.total - row.score.total) : 0;
      // seleção da sorte: a que mais pontos te deu (apuramento + posição, a dobrar no grupo do joker)
      let lucky = null;
      for (const g of STATE.groupOrder) for (const slot of ['first', 'second', 'third']) {
        const p = gp[g]?.picks?.[slot];
        if (!p) continue;
        const v = (p.credited ? 1 : 0) + (p.position ? (g === jg ? 2 : 1) : 0);
        if (v > 0 && (!lucky || v > lucky.v)) lucky = { team: p.team, v };
      }
      const slides = [
        { wrapLabel: 'MELHOR POSIÇÃO', wrapValue: bestRank + 'º', wrapTone: 'gold', wrapSub: 'de ' + lb.length + ' jogadores' },
        { wrapLabel: 'PONTOS NA ÉPOCA', wrapValue: String(row.score.total), wrapSub: qual + ' apuramentos · ' + pos + ' posições' },
        qual ? { wrapLabel: 'APURAMENTOS CERTOS', wrapValue: String(qual), wrapSub: 'seleções que viste passar' } : null,
        pos ? { wrapLabel: 'POSIÇÕES EXATAS', wrapValue: String(pos), wrapSub: 'no sítio certo da tabela' } : null,
        jump ? { wrapLabel: 'MAIS PONTOS NUMA JORNADA', wrapValue: '+' + jump, wrapTone: 'gold', wrapSub: jumpMd ? 'na jornada ' + jumpMd : 'numa só jornada' } : null,
        drop ? { wrapLabel: 'A MAIOR QUEDA', wrapValue: '-' + drop, wrapTone: 'ember', wrapSub: (drop === 1 ? 'lugar' : 'lugares') + (dropMd ? ' na jornada ' + dropMd : '') } : null,
        (ranks.length > 1 && climb !== 0) ? { wrapLabel: 'DO ARRANQUE ATÉ AGORA', wrapValue: (climb > 0 ? '+' + climb : String(climb)), wrapTone: climb > 0 ? 'gold' : 'ember', wrapSub: (Math.abs(climb) === 1 ? 'posição' : 'posições') + (climb > 0 ? ' que subiste' : ' na tabela') } : null,
        gem ? { wrapLabel: 'GOLPE DE GÉNIO', wrapValue: gem.team, wrapTeam: gem.team, wrapTone: 'gold', wrapSub: gem.back <= 1 ? 'ninguém mais acertou' : 'só tu e mais ' + (gem.back - 1) + ' acertaram' } : null,
        lucky ? { wrapLabel: 'A TUA SELEÇÃO DA SORTE', wrapValue: lucky.team, wrapTeam: lucky.team, wrapSub: 'deu-te ' + lucky.v + (lucky.v === 1 ? ' ponto' : ' pontos') } : null,
        champ ? { wrapLabel: 'O TEU CAMPEÃO', wrapValue: champ, wrapTeam: champ, wrapSub: backers <= 1 ? 'só tu acreditaste' : 'tu e mais ' + (backers - 1) } : null,
        flop ? { wrapLabel: 'DESASTRE DA ÉPOCA', wrapValue: flop.team, wrapTeam: flop.team, wrapTone: 'ember', wrapSub: flop.back > 1 ? flop.back + ' apostaram, ficou de fora' : 'apostaste, ficou de fora' } : null,
        joker ? { wrapLabel: joker.jpos ? 'CHIP A DOBRAR' : 'CHIP DESPERDIÇADO', wrapValue: 'Grupo ' + joker.g, wrapTone: joker.jpos ? 'gold' : 'ember', wrapSub: joker.jpos ? (joker.jpos === 1 ? '1 posição a dobrar' : joker.jpos + ' posições a dobrar') : 'dobraste e saiu em branco' } : null,
        (rival && rival.flips >= 1) ? { wrapLabel: 'RIVAL DA ÉPOCA', wrapValue: rival.player, wrapSub: rival.flips === 1 ? '1 troca de lugar' : rival.flips + ' trocas de lugar' } : null,
        (row.rank > 3 && podiumGap > 0) ? { wrapLabel: 'FALTOU PARA O PÓDIO', wrapValue: '+' + podiumGap, wrapSub: 'pontos para o 3.º lugar' } : null,
        { wrapLabel: 'CONQUISTAS', wrapValue: earned + '/9', wrapSub: 'distintivos ganhos' },
        { wrapLabel: 'A MINHA ÉPOCA', wrapValue: row.rank + 'º', wrapTone: 'gold', wrapSub: row.score.total + ' pts · entre ' + lb.length + ' jogadores' },
      ].filter(Boolean);
      return { who: me, slides, ...slides[Math.min(wrapIdx, slides.length - 1)] };
    }
    if (k === 'sticker') return { rank: row.rank, count: lb.length, total: row.score.total };
    return {};
  }

  const meSel = el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => { me = e.target.value; localStorage.setItem('roni-me', me); paint(); } }, ...names.map((n) => el('option', { value: n, selected: n === me }, n)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } }, el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, 'Cartão de quem'), meSel)));
  const KINDS = [['posicao', 'A minha posição'], ['acerto', 'Acerto do dia'], ['jogo', 'Jogo do dia'], ['wrapped', 'Roni Wrapped'], ['sticker', 'Sticker']];
  const chips = el('div', { class: 'engage-nav', style: { marginTop: '12px' } });
  host.append(chips);
  const preview = el('div', { class: 'story-preview' });
  host.append(preview);
  host.append(el('div', { class: 'row-actions', style: { marginTop: '12px' } },
    el('button', { class: 'btn btn-ghost', onclick: () => shareStory(true) }, 'Partilhar'),
    el('button', { class: 'btn btn-primary', onclick: () => shareStory(false) }, icon('arrow'), 'Descarregar')));

  const withFlags = async (k, c) => {
    if (!c) return c;
    if (k === 'acerto' && c.team) c.flagEl = await getFlagEl(c.team);
    if (k === 'jogo') { c.flagAEl = await getFlagEl(c.aName); c.flagBEl = await getFlagEl(c.bName); }
    if (k === 'wrapped' && c.wrapTeam) c.wrapFlagEl = await getFlagEl(c.wrapTeam);
    return c;
  };
  async function paint() {
    clear(chips);
    for (const [k, label] of KINDS) chips.appendChild(el('button', { class: 'chip-nav' + (k === kind ? ' on' : ''), onclick: () => { kind = k; paint(); } }, label));
    const c = ctxFor(kind);
    if (c) await withFlags(kind, c);
    clear(preview);
    if (!c) { preview.appendChild(emptyState('Ainda sem acertos de posição', 'Aparece quando acertares uma posição exata.', 'search')); return; }
    preview.appendChild(buildStoryCard(kind, c));
    if (kind === 'wrapped' && c.slides) {
      preview.appendChild(el('div', { class: 'wrap-step' },
        el('button', { class: 'btn btn-ghost', 'aria-label': 'Slide anterior', onclick: () => { wrapIdx = (wrapIdx - 1 + c.slides.length) % c.slides.length; paint(); } }, '‹'),
        el('span', { class: 'num' }, `${wrapIdx + 1}/${c.slides.length}`),
        el('button', { class: 'btn btn-ghost', 'aria-label': 'Slide seguinte', onclick: () => { wrapIdx = (wrapIdx + 1) % c.slides.length; paint(); } }, '›')));
      preview.appendChild(el('button', { class: 'btn btn-primary', style: { marginTop: '12px', width: '100%' }, onclick: () => openWrappedPlayer([{ label: 'A TUA ÉPOCA NO', value: 'RONI 26' }, ...c.slides.map((s) => ({ label: s.wrapLabel, value: s.wrapValue, sub: s.wrapSub, team: s.wrapTeam, tone: s.wrapTone }))], me) }, '▶  Ver Roni Wrapped'));
    }
  }
  async function shareStory(share) {
    const c = ctxFor(kind);
    if (!c) return toast('Ainda não há nada para partilhar aqui.', true);
    await withFlags(kind, c);
    const [w, h] = STORY_DIMS[kind];
    try {
      const blob = await cardToPng(buildStoryCard(kind, c), w, h);
      const file = new File([blob], `roni-${kind}.png`, { type: 'image/png' });
      if (share && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'Roni Roni' });
      else { const url = URL.createObjectURL(blob); const a = el('a', { href: url, download: `roni-${kind}.png` }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (e) { toast(e.message, true); }
  }
  paint();
}

/* ---------------- PÁGINA: PRÉMIOS ---------------- */
const PRIZE_MEDAL = ['#F2B441', '#B9B3A6', '#C58A57']; // 1.º 2.º 3.º
async function pagePremios() {
  const comp = STATE.competition || { entry: 0, prizes: [] };
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Prémios'),
    el('p', {}, `Entrada de ${comp.entry}€ por jogador. Quem está a ganhar cada prémio neste momento.`)));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(5));
  const data = await api('/api/leaderboard');
  clear(host);
  const lb = data.leaderboard;

  // Tendência: quem acertou mais vencedores no mata-mata
  let tend = null;
  let maxW = 0;
  for (const r of lb) {
    const w = r.score.correctWinners || 0;
    if (w > maxW) { maxW = w; tend = r; }
  }
  const last = lb[lb.length - 1];
  const pts = (h) => h.score.total + ' pts';
  const totalPrizes = comp.prizes.reduce((s, p) => s + p.value, 0);

  host.appendChild(el('div', { class: 'pot' },
    el('div', { class: 'kv' }, el('b', {}, 'Entrada'), el('span', { class: 'v' }, comp.entry + '€')),
    el('div', { class: 'kv' }, el('b', {}, 'Jogadores'), el('span', { class: 'v num' }, String(lb.length))),
    el('div', { class: 'kv' }, el('b', {}, 'Em prémios'), el('span', { class: 'v' }, totalPrizes + '€'))));
  if (data.provisional) {
    host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '0 0 12px' } },
      'Provisório — quem lidera cada prémio com os resultados de agora.'));
  }

  // resolve o titular de cada prémio a partir do tipo definido na config da competição
  const prizes = comp.prizes.map((p) => {
    if (p.kind === 'rank') return { tag: p.tag, bg: PRIZE_MEDAL[p.rank - 1] || 'var(--pending)', name: p.name, value: p.value + '€', sub: p.sub, holder: lb[p.rank - 1], metric: pts };
    if (p.kind === 'tendencia') return { tag: p.tag, bg: 'var(--brand)', light: true, name: p.name, value: p.value + '€', sub: p.sub, holder: maxW > 0 ? tend : null, metric: () => maxW + ' jogos certos' };
    return { tag: p.tag, bg: 'var(--pending)', light: true, name: p.name, value: p.value + '€', sub: p.sub, holder: last, metric: pts }; // 'last'
  });

  const card = el('div', { class: 'card' });
  for (const p of prizes) {
    const main = el('div', { class: 'prize-main' },
      el('div', { class: 'prize-name' }, p.name),
      p.sub ? el('div', { class: 'prize-sub' }, p.sub) : null);
    if (p.holder) {
      main.appendChild(el('div', { class: 'prize-holder' }, monogram(p.holder.player),
        el('span', { class: 'nm' }, p.holder.player), el('span', { class: 'metric' }, '· ' + p.metric(p.holder))));
    } else {
      main.appendChild(el('div', { class: 'prize-tbd' }, 'Por decidir'));
    }
    card.appendChild(el('div', { class: 'prize' },
      el('div', { class: 'prize-badge num', style: { background: p.bg, color: p.light ? '#fff' : '#1b1712' } }, p.tag),
      main, el('div', { class: 'prize-value' }, p.value)));
  }
  host.appendChild(card);
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '11.5px', marginTop: '12px' } },
    'Tendência e Desculpa exigem ter apostado em todos os jogos.'));
}

/* ---------------- PÁGINA: HISTÓRICO (edições) ---------------- */
async function pageHistorico() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Histórico'),
    el('p', {}, 'As edições do pool. Toca numa para ver a classificação.')));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(skeletonList(3));
  const { activeId, competitions } = await api('/api/competitions');
  clear(host);

  const list = el('div', { class: 'card' });
  for (const c of competitions) {
    list.appendChild(el('button', { class: 'lb-row', style: { gridTemplateColumns: '1fr auto' },
      onclick: () => openEdition(c.id) },
      el('div', { class: 'lb-player' }, el('span', { class: 'mono', style: { background: 'var(--brand)' } }, (c.edition || c.name).slice(0, 2).toUpperCase()),
        el('div', {}, el('div', { class: 'nm' }, c.edition), el('div', { class: 'sub' }, c.id === activeId ? 'Em curso' : 'Terminada'))),
      el('span', { class: 'badge ' + (c.id === activeId ? 'ok' : 'seed') }, c.id === activeId ? 'Ativa' : 'Arquivada')));
  }
  host.appendChild(list);
  const detail = el('div', { class: 'mt6' });
  host.append(detail);

  async function openEdition(id) {
    clear(detail);
    detail.appendChild(skeletonList(5));
    const sum = await api('/api/history/' + encodeURIComponent(id));
    clear(detail);
    detail.appendChild(el('div', { class: 'section-label' }, sum.competition.edition + ' · classificação'));
    const card = el('div', { class: 'card' });
    sum.leaderboard.forEach((r) => {
      card.appendChild(el('div', { class: 'lb-row', style: { gridTemplateColumns: '44px 1fr 64px' } },
        el('div', { class: 'lb-pos' }, medal(r.rank) || el('span', { class: 'lb-rank num' }, r.rank)),
        el('div', { class: 'lb-player' }, monogram(r.player), el('div', {}, el('div', { class: 'nm' }, r.player))),
        el('div', { class: 'lb-pts' }, el('span', { class: 'v num' }, r.score.total))));
    });
    detail.appendChild(card);
  }
  if (competitions.length) openEdition(activeId);
}

// cartão de identidade (token de dispositivo, sem password): reivindicar o nome ou ligar com código
function identityCard(refresh) {
  const card = el('div', { class: 'card', style: { padding: '14px' } });
  if (STATE.identity?.player) {
    card.appendChild(el('div', { class: 'id-row' }, monogram(STATE.identity.player),
      el('div', {}, el('div', { style: { fontWeight: '700' } }, 'És ' + STATE.identity.player),
        el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Identificado neste dispositivo'))));
    if (STATE.identity.code) card.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '10px 0 0' } },
      'Código para ligares outro dispositivo: ', el('b', { class: 'num', style: { color: 'var(--brand)', letterSpacing: '2px' } }, STATE.identity.code)));
    card.appendChild(el('button', { class: 'btn btn-ghost', style: { marginTop: '10px' }, onclick: () => { localStorage.removeItem('roni-token'); STATE.identity = null; refresh(); } }, 'Sair deste dispositivo'));
    return card;
  }
  card.appendChild(el('div', { class: 'section-label', style: { marginTop: 0 } }, 'Sou eu (neste dispositivo)'));
  const claimSel = el('select', { class: 'select', style: { width: '100%' } },
    el('option', { value: '' }, '— escolher o teu nome —'), ...STATE.players.map((p) => el('option', { value: p.player }, p.player)));
  card.appendChild(el('div', { class: 'field' }, el('label', {}, 'Reivindicar o meu nome'), claimSel,
    el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '8px' }, onclick: async () => {
      if (!claimSel.value) return toast('Escolhe o teu nome.', true);
      try {
        const r = await api('/api/identity/claim', { method: 'POST', body: { player: claimSel.value } });
        localStorage.setItem('roni-token', r.token); localStorage.setItem('roni-me', r.player);
        STATE.identity = { player: r.player, code: r.code };
        toast('És ' + r.player + '. Guarda o código ' + r.code); refresh();
      } catch (e) { toast(e.message, true); }
    } }, 'Reivindicar')));
  card.appendChild(el('div', { class: 'section-label' }, 'ou ligar este dispositivo'));
  const linkName = el('select', { class: 'select', style: { width: '100%' } },
    el('option', { value: '' }, '— o teu nome —'), ...STATE.players.map((p) => el('option', { value: p.player }, p.player)));
  const linkCode = el('input', { class: 'input num', placeholder: 'código de 6 dígitos', inputmode: 'numeric', maxlength: '6' });
  card.appendChild(el('div', { class: 'field' }, el('label', {}, 'Já me reivindiquei noutro dispositivo'), linkName, linkCode,
    el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, onclick: async () => {
      try {
        const r = await api('/api/identity/link', { method: 'POST', body: { player: linkName.value, code: linkCode.value } });
        localStorage.setItem('roni-token', r.token); localStorage.setItem('roni-me', r.player);
        STATE.identity = { player: r.player }; toast('Dispositivo ligado a ' + r.player + '.'); refresh();
      } catch (e) { toast(e.message, true); }
    } }, 'Ligar dispositivo')));
  return card;
}

/* ---------------- PÁGINA: PESSOAL (a minha época) ---------------- */
async function pagePessoal() {
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'A minha época'),
    el('p', {}, 'O teu percurso no pool, edição a edição.')));
  const host = el('div', {});
  MAIN.append(host);
  host.appendChild(identityCard(() => render()));
  let me = localStorage.getItem('roni-me') || '';
  const sel = el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => { me = e.target.value; if (me) localStorage.setItem('roni-me', me); load(); } },
    el('option', { value: '' }, '— escolher jogador —'),
    ...STATE.players.map((p) => el('option', { value: p.player, selected: p.player === me }, p.player)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } }, el('div', { class: 'field', style: { margin: 0 } }, el('label', {}, 'Quem és'), sel)));
  const body = el('div', { class: 'mt4' });
  host.append(body);

  async function load() {
    if (!me) { clear(body); body.appendChild(emptyState('Escolhe o teu nome', 'Para veres o teu historial.', 'search')); return; }
    clear(body);
    body.appendChild(skeletonList(3));
    const { editions } = await api('/api/player/' + encodeURIComponent(me));
    clear(body);
    body.appendChild(el('div', { class: 'profile-hd' }, monogram(me),
      el('div', {}, el('div', { class: 'profile-name' }, me), el('div', { class: 'muted', style: { fontSize: '12.5px' } }, editions.length + ' edição(ões)'))));
    if (!editions.length) { body.appendChild(emptyState('Sem participações', 'Ainda não há apostas tuas.', 'search')); return; }
    const best = editions.reduce((b, e) => (e.rank < b.rank ? e : b), editions[0]);
    body.appendChild(el('div', { class: 'pot' },
      el('div', { class: 'kv' }, el('b', {}, 'Edições'), el('span', { class: 'v num' }, String(editions.length))),
      el('div', { class: 'kv' }, el('b', {}, 'Melhor'), el('span', { class: 'v num' }, best.rank + '.º')),
      el('div', { class: 'kv' }, el('b', {}, 'Atual'), el('span', { class: 'v num' }, editions[0].rank + '.º'))));
    const card = el('div', { class: 'card' });
    for (const e of editions) {
      card.appendChild(el('div', { class: 'lb-row', style: { gridTemplateColumns: '1fr auto auto', gap: '12px' } },
        el('div', { class: 'lb-player' }, el('div', {}, el('div', { class: 'nm' }, e.edition), el('div', { class: 'sub' }, e.status === 'active' ? 'Em curso' : 'Terminada'))),
        el('span', { class: 'num', style: { color: e.rank === 1 ? 'var(--gold)' : 'var(--text-soft)' } }, e.rank + '.º de ' + e.players),
        el('span', { class: 'num', style: { fontWeight: '500' } }, e.total + ' pts')));
    }
    body.appendChild(card);
  }
  load();
}

/* ---------------- PÁGINA: APOSTAR (form multi-passo) ---------------- */
function blankDraft() {
  const groups = {};
  for (const g of STATE.groupOrder) groups[g] = { first: null, second: null, third: null };
  return { player: '', pin: '', editing: false, champion: null, final4: [null, null, null, null], groups, markets: {}, groupJoker: null };
}
let draft = null;
let stepIdx = 0;
function formSteps() {
  const steps = ['ident', 'champion', 'final4', ...STATE.groupOrder.map((g) => 'g:' + g)];
  if ((STATE.competition?.format?.bestThirds ?? 8) > 0) steps.push('thirds');
  if (STATE.competition?.markets?.length) steps.push('markets');
  steps.push('review');
  return steps;
}
function countThirds() { return STATE.groupOrder.filter((g) => draft.groups[g].third).length; }

async function pageApostar() {
  // mata-mata tem prioridade quando uma ronda eliminatória está aberta (aposta-se ronda a ronda)
  const koOpen = STATE.koRounds.filter((r) => STATE.windows[r.id]).map((r) => r.id);
  if (koOpen.length) return renderKoBetting(koOpen);
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
  if (step === 'markets') return renderMarkets(body);
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
    draft.markets = { ...(bet.markets || {}) };
    draft.groupJoker = bet.groupJoker || null;
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
  const N = STATE.competition?.format?.bestThirds ?? 8;
  const n = countThirds();
  body.appendChild(stepHeader('Passo final', `${N} melhores 3.os`, `${n}/${N} escolhidos`));
  body.appendChild(el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '16px' } },
    `Escolhe exatamente ${N} seleções que ficam em 3.º e apuram. Toca para escolher o 3.º de cada grupo.`));
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
          else { if (!p.third && countThirds() >= N) return toast(`Já tens ${N} terceiros. Tira um para trocar.`, true); p.third = t; }
          paintForm();
        },
      }, flag(t), ' ', t, active && icon('check')));
    }
    card.appendChild(chips);
    body.appendChild(card);
  }
  body.appendChild(el('div', { style: { height: '12px' } }));
  body.appendChild(navButtons({ onNext: () => { if (countThirds() !== N) return toast(`Escolhe exatamente ${N} (tens ${countThirds()}).`, true); goNext(); },
    nextLabel: 'Rever aposta' }));
}

function renderMarkets(body) {
  const markets = STATE.competition.markets || [];
  body.appendChild(stepHeader('Extras', 'Mercados extra'));
  body.appendChild(el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '16px' } },
    'Apostas opcionais. Cada acerto vale os pontos indicados.'));
  for (const m of markets) {
    body.appendChild(el('div', { class: 'field' },
      el('label', {}, `${m.name} · ${m.points || 0} pts`),
      m.sub ? el('div', { class: 'hint', style: { marginTop: '-4px', marginBottom: '6px' } }, m.sub) : null,
      m.options?.length
        ? el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => { draft.markets[m.id] = e.target.value || undefined; } },
          el('option', { value: '' }, '— escolher —'), ...m.options.map((o) => el('option', { value: o, selected: draft.markets[m.id] === o }, o)))
        : combobox({ value: draft.markets[m.id], options: allTeams(), placeholder: 'Escolher seleção…', onChange: (t) => { draft.markets[m.id] = t; } })));
  }
  body.appendChild(navButtons({ onNext: goNext, nextLabel: 'Rever aposta' }));
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

  const mk = STATE.competition?.markets || [];
  if (mk.length && mk.some((m) => draft.markets[m.id])) {
    body.appendChild(el('div', { class: 'card', style: { padding: '16px', marginTop: '12px' } },
      el('div', { class: 'section-label', style: { marginTop: 0 } }, 'Mercados extra'),
      ...mk.filter((m) => draft.markets[m.id]).map((m) => el('div', { class: 'sheet-line' }, el('span', { class: 'pos' }, m.name), teamChip(draft.markets[m.id])))));
  }

  body.appendChild(el('div', { class: 'card', style: { padding: '16px', marginTop: '12px' } },
    el('div', { class: 'section-label', style: { marginTop: 0 } }, 'Joker de grupo (opcional)'),
    el('p', { class: 'hint', style: { marginTop: '-4px', marginBottom: '8px' } }, 'Duplica os pontos de posição de um grupo à tua escolha.'),
    el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => { draft.groupJoker = e.target.value || null; } },
      el('option', { value: '' }, '— sem joker —'),
      ...STATE.groupOrder.map((g) => el('option', { value: g, selected: draft.groupJoker === g }, 'Grupo ' + g)))));

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
  const N = STATE.competition?.format?.bestThirds ?? 8;
  const n = countThirds();
  if (n !== N) e.push(`Tens ${n} terceiros (precisas de ${N}).`);
  return e;
}
async function submitDraft() {
  const body = {
    player: draft.player.trim(), pin: draft.pin || undefined,
    champion: draft.champion, final4: draft.final4.filter(Boolean), groups: draft.groups, markets: draft.markets, groupJoker: draft.groupJoker || null,
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
  host.appendChild(el('div', { class: 'clinch-legend' },
    el('span', {}, el('span', { class: 'clinch win' }, '1.º'), 'lugar garantido'),
    el('span', {}, el('span', { class: 'clinch ok' }, 'Apurada'), 'top 2 garantido'),
    el('span', {}, el('span', { class: 'clinch out' }, 'Eliminada'), 'fora do top 2')));
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

  await bracketSection(host);
}
function clinchChip(status) {
  if (status === 'winner') return el('span', { class: 'clinch win', title: '1.º lugar garantido' }, '1.º');
  if (status === 'qualified') return el('span', { class: 'clinch ok', title: 'Apuramento garantido (top 2)' }, 'Apurada');
  if (status === 'eliminated') return el('span', { class: 'clinch out', title: 'Já não pode chegar ao top 2' }, 'Eliminada');
  return null;
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
      el('td', { class: 'team-cell' }, el('div', { class: 'tc' }, el('span', { class: 'qbar' }), teamChip(r.team), clinchChip(r.clinch))),
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
        el('div', { class: 'team h' }, el('span', { class: 'nm' }, codeOf(m.home)), flag(m.home)),
        el('span', { class: 'score num' }, `${m.homeGoals} – ${m.awayGoals}`),
        el('div', { class: 'team a' }, flag(m.away), el('span', { class: 'nm' }, codeOf(m.away)))));
    });
  }
  card.appendChild(el('div', { class: 'match-pts' }, `${data.pointsByGroup[g]} pontos de posição distribuídos`));
  return card;
}

/* ---------------- MATA-MATA (bracket + apostas) ---------------- */
const METHOD_LABEL = { TR: 'Tempo regulamentar', PROL: 'Prolongamento', PEN: 'Penáltis' };
const METHOD_SHORT = { TR: 't. reg.', PROL: 'prol.', PEN: 'pen.' };
const METHODS = ['TR', 'PROL', 'PEN'];
function slotTeam(side) { return side.team ? teamChip(side.team) : el('span', { class: 'muted', style: { fontSize: '12px' } }, side.label); }
function slotTeamMini(side, opts) { return side.team ? teamMini(side.team, opts) : el('span', { class: 'muted', style: { fontSize: '11px' } }, side.label); }
function roundLabel(id) { return (STATE.koRounds.find((r) => r.id === id) || {}).label || id; }

function bracketMatchRow(m) {
  const homeWin = m.winner && m.winner === m.home.team;
  const awayWin = m.winner && m.winner === m.away.team;
  const mid = m.played
    ? el('span', { class: 'ko-method' }, m.method ? METHOD_SHORT[m.method] : '✓')
    : el('span', { class: 'ko-score num tbd' }, 'vs');
  return el('div', { class: 'ko-row' },
    el('div', { class: 'ko-team h' + (homeWin ? ' win' : '') }, el('span', { class: 'num jn' }, m.id), slotTeamMini(m.home, { reverse: true })),
    el('div', { class: 'ko-mid' }, mid),
    el('div', { class: 'ko-team a' + (awayWin ? ' win' : '') }, slotTeamMini(m.away)));
}

async function bracketSection(host) {
  host.appendChild(el('div', { class: 'section-label' }, 'Mata-mata · cruzamento'));
  const noteEl = el('p', { class: 'muted', style: { fontSize: '12px', marginTop: '-4px' } }, 'A carregar…');
  host.appendChild(noteEl);
  const data = await api('/api/bracket');
  noteEl.textContent = data.groupStageComplete
    ? 'Fase de grupos terminada — estes são os jogos do mata-mata.'
    : 'Provisório — se a fase de grupos acabasse agora, seriam estes os jogos (8 melhores 3.os incluídos). Atualiza a cada resultado.';
  for (const r of data.rounds) {
    const card = el('div', { class: 'card', style: { padding: '8px 0', marginTop: '8px' } });
    card.appendChild(el('div', { class: 'ko-round' }, r.label, STATE.windows[r.id] ? el('span', { class: 'pill open', style: { marginLeft: '8px' } }, el('span', { class: 'dot' }), 'apostas abertas') : null));
    for (const mid of r.matches) card.appendChild(bracketMatchRow(data.resolved[String(mid)]));
    host.appendChild(card);
  }
}

// ---- apostas de mata-mata ----
let koBet = null; // { player, pin, round, picks:{mid:{winner,method}}, jokers:[mid], resolved }
async function renderKoBetting(openRounds) {
  clear(MAIN);
  MAIN.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Apostas — mata-mata'),
    el('p', {}, 'Escolhe o vencedor e a fase (tempo reg., prolongamento ou penáltis) de cada jogo.')));
  if (!koBet) koBet = { player: '', pin: '', round: openRounds[0], picks: {}, jokers: [], resolved: null };

  // identificação + ronda
  const ctrl = el('div', { class: 'card', style: { padding: '16px' } });
  const sel = el('select', { class: 'select', style: { width: '100%' },
    onchange: (e) => { koBet.player = e.target.value; } },
    el('option', { value: '' }, '— escolher jogador —'),
    ...STATE.players.map((p) => el('option', { value: p.player, selected: koBet.player === p.player }, p.player + (p.hasPin ? ' 🔒' : ''))));
  ctrl.appendChild(el('div', { class: 'field' }, el('label', { for: '' }, 'Jogador'), sel));
  if (openRounds.length > 1) {
    ctrl.appendChild(el('div', { class: 'field' }, el('label', {}, 'Ronda'),
      el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => { koBet.round = e.target.value; koBet.resolved = null; load(); } },
        ...openRounds.map((r) => el('option', { value: r, selected: koBet.round === r }, roundLabel(r))))));
  }
  ctrl.appendChild(el('button', { class: 'btn btn-primary btn-block', onclick: load }, 'Carregar jogos de ' + roundLabel(koBet.round)));
  MAIN.appendChild(ctrl);
  const host = el('div', {});
  MAIN.appendChild(host);
  if (koBet.resolved) paintMatches(host);

  async function load() {
    if (!koBet.player) return toast('Escolhe um jogador.', true);
    try {
      const [bracket, betRes] = await Promise.all([api('/api/bracket'), api('/api/bet/' + encodeURIComponent(koBet.player))]);
      koBet.resolved = bracket.resolved;
      koBet.roundMatches = bracket.rounds.find((r) => r.id === koBet.round).matches.map(String);
      // prefill com a aposta existente
      const bet = betRes.bet;
      if (bet.hasPin && !koBet.pin) { const pin = prompt('Esta aposta tem PIN. Introduz o PIN:'); koBet.pin = (pin || '').replace(/\D/g, ''); }
      koBet.picks = {};
      for (const mid of koBet.roundMatches) if (bet.knockouts[mid]) koBet.picks[mid] = { ...bet.knockouts[mid] };
      koBet.jokers = (bet.jokers || []).map(String);
      paintForm();
    } catch (e) { toast(e.message, true); }
  }
  function paintMatches(h) { clear(h); h.appendChild(matchesCard()); }
  function paintForm() { clear(host); host.appendChild(matchesCard()); }

  function jokerEligible() { return (STATE.koRounds.find((r) => r.id === koBet.round) || {}).joker; }
  function matchesCard() {
    const wrap = el('div', {});
    if (jokerEligible()) {
      wrap.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px' } },
        `Jokers: ${koBet.jokers.length}/2 — duplicam os pontos do jogo (16-avos/8-avos/quartos).`));
    }
    for (const mid of koBet.roundMatches) {
      const m = koBet.resolved[mid];
      const teams = [m.home.team, m.away.team].filter(Boolean);
      const card = el('div', { class: 'card ko-bet', style: { padding: '14px', marginTop: '8px' } });
      card.appendChild(el('div', { class: 'ko-bet-head' }, el('span', { class: 'num jn' }, 'Jogo ' + mid),
        teams.length < 2 ? el('span', { class: 'muted', style: { fontSize: '11.5px' } }, 'aguarda equipas') : null));
      if (teams.length < 2) {
        card.appendChild(el('div', { class: 'ko-row' },
          el('div', { class: 'ko-team h' }, slotTeam(m.home)), el('div', { class: 'ko-mid' }, 'vs'), el('div', { class: 'ko-team a' }, slotTeam(m.away))));
        wrap.appendChild(card);
        continue;
      }
      const pick = koBet.picks[mid] || {};
      // vencedor: dois botões
      const winRow = el('div', { class: 'ko-pick' });
      for (const t of teams) {
        winRow.appendChild(el('button', { type: 'button', class: 'ko-opt' + (pick.winner === t ? ' on' : ''),
          onclick: () => { koBet.picks[mid] = { ...(koBet.picks[mid] || {}), winner: t }; paintForm(); } },
          flag(t), el('span', {}, t)));
      }
      card.appendChild(el('div', { class: 'ko-lbl' }, 'Vencedor'));
      card.appendChild(winRow);
      // fase
      card.appendChild(el('div', { class: 'ko-lbl' }, 'Acaba em'));
      const methRow = el('div', { class: 'ko-seg' });
      for (const meth of METHODS) {
        methRow.appendChild(el('button', { type: 'button', class: 'seg-opt' + (pick.method === meth ? ' on' : ''),
          disabled: !pick.winner,
          onclick: () => { koBet.picks[mid] = { ...(koBet.picks[mid] || {}), method: meth }; paintForm(); } }, METHOD_LABEL[meth]));
      }
      card.appendChild(methRow);
      // joker
      if (jokerEligible()) {
        const on = koBet.jokers.includes(mid);
        card.appendChild(el('button', { type: 'button', class: 'ko-joker' + (on ? ' on' : ''),
          onclick: () => {
            if (on) koBet.jokers = koBet.jokers.filter((x) => x !== mid);
            else { if (!pick.winner) return toast('Aposta no vencedor antes de pôr o joker.', true); if (koBet.jokers.length >= 2) return toast('Já tens 2 jokers.', true); koBet.jokers.push(mid); }
            paintForm();
          } }, '★ Joker' + (on ? ' (x2)' : '')));
      }
      wrap.appendChild(card);
    }
    wrap.appendChild(el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '16px' }, onclick: submitKo }, icon('check'), 'Gravar apostas de ' + roundLabel(koBet.round)));
    return wrap;
  }

  async function submitKo() {
    const picks = {};
    for (const [mid, p] of Object.entries(koBet.picks)) if (p.winner) picks[mid] = p;
    try {
      await api('/api/bet/knockout', { method: 'POST', body: { player: koBet.player, pin: koBet.pin || undefined, round: koBet.round, picks, jokers: koBet.jokers } });
      localStorage.setItem('roni-me', koBet.player);
      toast('Apostas de mata-mata gravadas!');
      navigate('geral');
    } catch (e) { toast((e.data?.errors || [e.message])[0], true); }
  }
}

/* ---------------- PÁGINA: ADMIN ---------------- */
async function adminCompetitions(host) {
  const data = await api('/api/competitions');
  const list = el('div', { class: 'card' });
  for (const c of data.competitions) {
    const isActive = c.id === data.activeId;
    const right = isActive
      ? el('span', { class: 'badge ok' }, 'Ativa')
      : (c.kind === 'archive'
        ? el('span', { class: 'badge seed' }, 'Arquivada')
        : el('button', { class: 'btn btn-ghost', style: { minHeight: '36px', padding: '6px 12px' }, onclick: async () => { try { await api('/api/admin/competition/active', { method: 'POST', body: { id: c.id } }); toast('Ativa: ' + c.edition); render(); } catch (e) { toast(e.message, true); } } }, 'Tornar ativa'));
    list.appendChild(el('div', { class: 'res-row', style: { gridTemplateColumns: '1fr auto' } },
      el('div', {}, el('div', { style: { fontWeight: '700' } }, c.edition), el('div', { class: 'muted', style: { fontSize: '12px' } }, c.id)),
      right));
  }
  host.appendChild(list);

  host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '10px 0 6px' } },
    'Importar edição passada — classificação final, uma linha por jogador: nome, pontos.'));
  const nm = el('input', { class: 'input', placeholder: 'Nome', value: 'Torneio Roni Roni' });
  const ed = el('input', { class: 'input', placeholder: 'Edição (ex.: Euro 2024)' });
  const csv = el('textarea', { class: 'input', rows: '5', placeholder: 'Diogo Saraiva, 84\nManel, 80', style: { resize: 'vertical', fontFamily: 'var(--font-num)' } });
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } },
    el('div', { class: 'field' }, el('label', {}, 'Nome'), nm),
    el('div', { class: 'field' }, el('label', {}, 'Edição'), ed),
    el('div', { class: 'field' }, el('label', {}, 'Classificação (CSV)'), csv),
    el('button', { class: 'btn btn-primary btn-block', onclick: doImport }, icon('plus'), 'Importar edição')));

  // criar competição NOVA (fase de grupos)
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '16px 0 6px' } },
    'Criar competição nova — uma linha por grupo: "A: Equipa1, Equipa2, Equipa3, Equipa4".'));
  const cName = el('input', { class: 'input', placeholder: 'Nome', value: 'Torneio Roni Roni' });
  const cEd = el('input', { class: 'input', placeholder: 'Edição (ex.: Euro 2028)' });
  const cGroups = el('textarea', { class: 'input', rows: '6', placeholder: 'A: Portugal, Espanha, Itália, França\nB: Inglaterra, Alemanha, Croácia, Países Baixos', style: { resize: 'vertical' } });
  const num = (v) => el('input', { class: 'input num', type: 'number', value: String(v) });
  const cQual = num(2); const cThirds = num(0); const cGames = num(3);
  const cQ = num(1); const cP = num(1); const cChamp = num(8); const cF4 = num(3);
  const presets = {
    'Mundial 2026': { qualify: 1, position: 1, champion: 8, final4: 3, bestThirds: 8, qualifiersPerGroup: 2 },
    'Euro (sem 3.os)': { qualify: 1, position: 1, champion: 6, final4: 3, bestThirds: 0, qualifiersPerGroup: 2 },
  };
  const presetSel = el('select', { class: 'select', onchange: (e) => { const p = presets[e.target.value]; if (!p) return; cQ.value = p.qualify; cP.value = p.position; cChamp.value = p.champion; cF4.value = p.final4; cThirds.value = p.bestThirds; cQual.value = p.qualifiersPerGroup; } },
    el('option', { value: '' }, 'Preset de pontuação…'), ...Object.keys(presets).map((k) => el('option', { value: k }, k)));
  host.appendChild(el('div', { class: 'card', style: { padding: '14px' } },
    el('div', { class: 'field' }, el('label', {}, 'Nome'), cName),
    el('div', { class: 'field' }, el('label', {}, 'Edição'), cEd),
    el('div', { class: 'field' }, el('label', {}, 'Grupos e equipas'), cGroups),
    el('div', { class: 'field' }, el('label', {}, 'Preset'), presetSel),
    el('div', { class: 'builder-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Apuram/grupo'), cQual),
      el('div', { class: 'field' }, el('label', {}, 'Melhores 3.os'), cThirds),
      el('div', { class: 'field' }, el('label', {}, 'Jornadas'), cGames)),
    el('div', { class: 'builder-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Apuramento'), cQ),
      el('div', { class: 'field' }, el('label', {}, 'Posição'), cP),
      el('div', { class: 'field' }, el('label', {}, 'Campeão'), cChamp),
      el('div', { class: 'field' }, el('label', {}, 'Final 4'), cF4)),
    el('button', { class: 'btn btn-primary btn-block', onclick: doCreate }, icon('plus'), 'Criar competição')));

  async function doCreate() {
    const groups = {};
    for (const line of cGroups.value.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const g = line.slice(0, i).trim().toUpperCase();
      const teams = line.slice(i + 1).split(',').map((t) => t.trim()).filter(Boolean);
      if (g && teams.length) groups[g] = teams;
    }
    if (!cEd.value.trim()) return toast('Indica a edição.', true);
    if (!Object.keys(groups).length) return toast('Define os grupos (ex.: "A: Eq1, Eq2").', true);
    try {
      const r = await api('/api/admin/create', { method: 'POST', body: {
        name: cName.value, edition: cEd.value, groups,
        format: { qualifiersPerGroup: cQual.value, bestThirds: cThirds.value, groupGames: cGames.value },
        scoring: { qualify: cQ.value, position: cP.value, champion: cChamp.value, final4: cF4.value },
      } });
      toast(`Criada: ${cEd.value} (${r.groups} grupos, ${r.teams} equipas).`);
      render();
    } catch (e) { toast(e.message, true); }
  }

  async function doImport() {
    const rows = csv.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.lastIndexOf(',');
      if (i < 0) return null;
      return { player: l.slice(0, i).trim(), points: Number(l.slice(i + 1).trim()) };
    }).filter((r) => r && r.player && !Number.isNaN(r.points));
    if (!ed.value.trim()) return toast('Indica a edição.', true);
    if (!rows.length) return toast('Cola a classificação (nome, pontos).', true);
    try {
      const r = await api('/api/admin/import', { method: 'POST', body: { name: nm.value, edition: ed.value, rows } });
      toast(`Importado: ${r.players} jogadores em ${ed.value}.`);
      render();
    } catch (e) { toast(e.message, true); }
  }
}

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

  // competições (ativa + arquivadas) + importar edição passada
  host.appendChild(el('div', { class: 'section-label' }, 'Competições'));
  await adminCompetitions(host);

  // janelas de apostas (grupos + cada ronda do mata-mata) — abrem-se ronda a ronda
  host.appendChild(el('div', { class: 'section-label' }, 'Janelas de apostas'));
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '-4px' } }, 'Abre uma ronda de cada vez. Janela fechada = ninguém aposta nessa fase.'));
  const winRow = el('div', { class: 'status-row' });
  const winRounds = [{ id: 'grupos', label: 'Grupos' }, ...STATE.koRounds.map((r) => ({ id: r.id, label: r.label }))];
  for (const r of winRounds) {
    const open = status.windows[r.id];
    winRow.appendChild(el('button', { class: 'win-toggle' + (open ? ' open' : ''), 'aria-pressed': open ? 'true' : 'false',
      onclick: async () => { await api('/api/admin/window', { method: 'POST', body: { round: r.id, open: !open } }); toast(`${r.label}: ${!open ? 'aberta' : 'fechada'}`); render(); } },
      el('span', { class: 'dot' }), r.label, ' · ', open ? 'aberta' : 'fechada'));
  }
  host.appendChild(winRow);

  // estado das submissões
  host.appendChild(el('div', { class: 'section-label' }, `Submissões · ${status.submitted.length} jogadores`));
  const subWrap = el('div', { class: 'status-row' });
  const submittedSet = new Set(status.submitted);
  const all = [...new Set([...status.seedPlayers, ...status.submitted])].sort((a, b) => a.localeCompare(b, 'pt'));
  all.forEach((p) => subWrap.appendChild(el('span', { class: 'who' + (submittedSet.has(p) ? ' done' : ' pending') },
    submittedSet.has(p) ? icon('check') : el('span', { class: 'who-dot' }), el('span', { class: 'who-nm' }, p))));
  host.appendChild(subWrap);

  // editor de resultados
  host.appendChild(el('div', { class: 'section-label' }, 'Editar resultados'));
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '-4px' } }, 'Mete os golos e carrega em Gravar. Cada gravação recalcula a classificação.'));
  const grpSel = el('select', { class: 'select', 'aria-label': 'Escolher grupo', onchange: (e) => paintResEditor(e.target.value) },
    ...STATE.groupOrder.map((g) => el('option', { value: g }, 'Grupo ' + g)));
  const fetchBtn = el('button', { class: 'btn btn-ghost', onclick: doFetch }, icon('refresh'), 'Buscar resultados');
  host.appendChild(el('div', { class: 'toolbar' }, grpSel, fetchBtn));
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '11.5px', marginTop: '-6px' } },
    'Buscar resultados corre o script que importa da fonte (data/results_source.json ou RESULTS_SOURCE_URL).'));
  const resHost = el('div', {});
  host.appendChild(resHost);
  function paintResEditor(g) { clear(resHost); resHost.appendChild(resultEditor(g, results, paintResEditor)); }
  async function doFetch() {
    fetchBtn.disabled = true;
    try {
      const r = await api('/api/admin/fetch', { method: 'POST' });
      const novos = r.imported || 0;
      toast(novos ? `Sincronizado: ${novos} resultado(s) atualizados.` : `Fonte sincronizada · ${r.igual} já estavam certos.`);
      render();
    } catch (e) { toast(e.message, true); fetchBtn.disabled = false; }
  }
  paintResEditor(STATE.groupOrder[0]);

  // editor de resultados do mata-mata
  host.appendChild(el('div', { class: 'section-label' }, 'Resultados do mata-mata'));
  host.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '-4px' } }, 'Define vencedor + fase. "Buscar resultados" também tenta preenchê-los pela ESPN.'));
  const bracket = await api('/api/bracket');
  const koRoundSel = el('select', { class: 'select', 'aria-label': 'Ronda do mata-mata', onchange: (e) => paintKo(e.target.value) },
    ...STATE.koRounds.map((r) => el('option', { value: r.id }, r.label)));
  host.appendChild(el('div', { class: 'toolbar' }, koRoundSel));
  const koHost = el('div', {});
  host.appendChild(koHost);
  function paintKo(rid) {
    clear(koHost);
    const r = bracket.rounds.find((x) => x.id === rid);
    for (const mid of r.matches) koHost.appendChild(koResultEditor(String(mid), bracket.resolved[String(mid)]));
  }
  if (STATE.koRounds.length) paintKo(STATE.koRounds[0].id);
  else koHost.appendChild(el('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Esta competição não tem mata-mata.'));

  // resolução dos mercados extra (vencedor de cada mercado configurado)
  if ((STATE.competition.markets || []).length) {
    host.appendChild(el('div', { class: 'section-label' }, 'Mercados extra · resolução'));
    const mcard = el('div', { class: 'card', style: { padding: '14px' } });
    for (const m of STATE.competition.markets) {
      const cur = (STATE.marketResults || {})[m.id] || null;
      const save = async (winner) => {
        try {
          await api('/api/admin/market', { method: 'POST', body: { id: m.id, winner: winner || null } });
          STATE.marketResults = { ...(STATE.marketResults || {}), [m.id]: winner || undefined };
          toast(winner ? `${m.name}: ${winner}` : `${m.name} por decidir`);
        } catch (e) { toast(e.message, true); }
      };
      const picker = m.options?.length
        ? el('select', { class: 'select', style: { width: '100%' }, onchange: (e) => save(e.target.value) },
          el('option', { value: '' }, '— por decidir —'), ...m.options.map((o) => el('option', { value: o, selected: cur === o }, o)))
        : combobox({ value: cur, options: allTeams(), placeholder: 'Vencedor…', onChange: save });
      mcard.appendChild(el('div', { class: 'field' }, el('label', {}, `${m.name} · ${m.points || 0} pts`), picker));
    }
    host.appendChild(mcard);
  }

  // grelha de apostas
  host.appendChild(el('div', { class: 'section-label' }, 'Apostas de todos'));
  const betsHost = el('div', {});
  host.appendChild(betsHost);
  betsHost.appendChild(el('p', { class: 'muted' }, 'A carregar apostas…'));
  const { bets } = await api('/api/bets');
  clear(betsHost);
  betsHost.appendChild(betsGrid(bets));
}

function resultEditor(g, results, repaint) {
  const existing = results.results[g] || (results.results[g] = []);
  const teams = STATE.groups[g];
  // calendário canónico de um grupo de 4 (3 jornadas)
  const schedule = [
    [1, teams[0], teams[1]], [1, teams[2], teams[3]],
    [2, teams[0], teams[2]], [2, teams[3], teams[1]],
    [3, teams[0], teams[3]], [3, teams[1], teams[2]],
  ];
  const findExisting = (a, b) => existing.find((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a));
  const card = el('div', { class: 'card res-editor' });
  const rows = [];
  schedule.forEach(([md, a, b]) => {
    const ex = findExisting(a, b);
    const home = ex ? ex.home : a; // mantém a ordem casa/fora já registada
    const away = ex ? ex.away : b;
    const hg = el('input', { class: 'num', type: 'number', min: '0', inputmode: 'numeric', value: ex ? ex.homeGoals : '', 'aria-label': `golos ${home}` });
    const ag = el('input', { class: 'num', type: 'number', min: '0', inputmode: 'numeric', value: ex ? ex.awayGoals : '', 'aria-label': `golos ${away}` });
    rows.push({ md, home, away, hg, ag });
    card.appendChild(el('div', { class: 'res-row' },
      el('div', { class: 'jtag num' }, 'J' + md),
      el('div', { class: 'team h', style: { justifySelf: 'end' } }, el('span', { class: 'nm' }, home), flag(home)),
      el('div', { class: 'gscore' }, hg, el('span', { class: 'muted' }, ':'), ag),
      el('div', { class: 'team a', style: { justifySelf: 'start' } }, flag(away), el('span', { class: 'nm' }, away))));
  });

  const saveBtn = el('button', { class: 'btn btn-primary btn-block', onclick: saveAll }, icon('check'), `Gravar resultados do Grupo ${g}`);
  card.appendChild(el('div', { class: 'res-footer' }, saveBtn));

  async function saveAll() {
    const payload = rows
      .filter((r) => r.hg.value !== '' && r.ag.value !== '')
      .map((r) => ({ group: g, home: r.home, away: r.away, homeGoals: Number(r.hg.value), awayGoals: Number(r.ag.value), matchday: r.md }));
    if (!payload.length) return toast('Mete pelo menos um resultado.', true);
    saveBtn.disabled = true;
    try {
      const res = await api('/api/admin/results', { method: 'POST', body: { results: payload } });
      // mantém os dados locais em sincronia (upsert por par de equipas)
      for (const p of payload) {
        const idx = existing.findIndex((m) => (m.home === p.home && m.away === p.away) || (m.home === p.away && m.away === p.home));
        const m = { home: p.home, away: p.away, homeGoals: p.homeGoals, awayGoals: p.awayGoals, matchday: p.matchday };
        if (idx >= 0) existing[idx] = m; else existing.push(m);
      }
      toast(`${res.saved} resultado(s) gravado(s) no Grupo ${g}. Classificação recalculada.`);
      repaint(g);
    } catch (e) { toast(e.message, true); saveBtn.disabled = false; }
  }
  return card;
}

function koResultEditor(mid, m) {
  const teams = [m.home.team, m.away.team].filter(Boolean);
  const card = el('div', { class: 'card', style: { padding: '14px', marginTop: '8px' } });
  card.appendChild(el('div', { class: 'ko-bet-head' }, el('span', { class: 'num jn' }, 'Jogo ' + mid),
    el('span', { class: 'muted', style: { fontSize: '11.5px' } }, roundLabel(m.round))));
  card.appendChild(el('div', { class: 'ko-row' },
    el('div', { class: 'ko-team h' }, slotTeam(m.home)), el('div', { class: 'ko-mid' }, 'vs'), el('div', { class: 'ko-team a' }, slotTeam(m.away))));
  if (teams.length < 2) { card.appendChild(el('p', { class: 'muted', style: { fontSize: '12px', margin: '6px 0 0' } }, 'Aguarda os emparelhamentos (fim dos grupos).')); return card; }

  const state = { winner: m.winner || null, method: m.method || null };
  const winWrap = el('div', { class: 'ko-pick' });
  const methWrap = el('div', { class: 'ko-seg' });
  const repaint = () => {
    clear(winWrap);
    for (const t of teams) winWrap.appendChild(el('button', { type: 'button', class: 'ko-opt' + (state.winner === t ? ' on' : ''), onclick: () => { state.winner = t; repaint(); } }, flag(t), el('span', {}, t)));
    clear(methWrap);
    for (const meth of METHODS) methWrap.appendChild(el('button', { type: 'button', class: 'seg-opt' + (state.method === meth ? ' on' : ''), onclick: () => { state.method = meth; repaint(); } }, METHOD_LABEL[meth]));
  };
  repaint();
  card.appendChild(el('div', { class: 'ko-lbl' }, 'Vencedor'));
  card.appendChild(winWrap);
  card.appendChild(el('div', { class: 'ko-lbl' }, 'Acaba em'));
  card.appendChild(methWrap);
  card.appendChild(el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '12px' }, onclick: save }, icon('check'), 'Gravar jogo ' + mid));

  async function save() {
    if (!state.winner) return toast('Escolhe o vencedor.', true);
    try {
      await api('/api/admin/knockout', { method: 'POST', body: { match: mid, home: m.home.team, away: m.away.team, homeGoals: null, awayGoals: null, winner: state.winner, method: state.method } });
      toast(`Jogo ${mid} gravado.`);
      render();
    } catch (e) { toast(e.message, true); }
  }
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
// modo alto contraste (acessibilidade) — reforça texto e contornos
function applyContrast(on) {
  document.documentElement.dataset.hc = on ? '1' : '';
  localStorage.setItem('roni-hc', on ? '1' : '0');
  $('#contrast-toggle')?.setAttribute('aria-pressed', on ? 'true' : 'false');
}
$('#contrast-toggle')?.addEventListener('click', () => applyContrast(document.documentElement.dataset.hc !== '1'));

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
  applyTheme(localStorage.getItem('roni-theme') || 'dark');
  applyContrast(localStorage.getItem('roni-hc') === '1');
  try {
    const st = await api('/api/state');
    Object.assign(STATE, st);
    if (localStorage.getItem('roni-token')) {
      try { const id = await api('/api/identity/me'); if (id.player) { STATE.identity = id; localStorage.setItem('roni-me', id.player); } else { localStorage.removeItem('roni-token'); } }
      catch { /* identidade é best-effort */ }
    }
    paintWindowPill();
    if (STATE.competition?.tagline) { const s = $('.brand-name small'); if (s) s.textContent = STATE.competition.tagline; }
  } catch (e) {
    MAIN.appendChild(errorState('Não foi possível ligar ao servidor.', boot));
    return;
  }
  window.addEventListener('hashchange', () => { if (currentRoute() !== 'apostar') { draft = null; stepIdx = 0; } render(); });
  if (!location.hash) navigate('geral');
  render();
}
boot();
