export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function fmt(val: number, dec = 0): string {
  const safe = Object.is(val, -0) ? 0 : val;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  }).format(safe);
}

export function fmtPct(fraction: number, dec = 1, signed = true): string {
  const pct = fraction * 100;
  const absStr = fmt(Math.abs(pct), dec);
  if (!signed) return `${pct < 0 ? '−' : ''}${absStr} %`;
  if (pct > 0.0001) return `+${absStr} %`;
  if (pct < -0.0001) return `−${absStr} %`;
  return `0${dec > 0 ? ',' + '0'.repeat(dec) : ''} %`;
}

export function fmtSignedNum(val: number, dec = 1, suffix = ' %'): string {
  const absStr = fmt(Math.abs(val), dec);
  if (val > 0.0001) return `+${absStr}${suffix}`;
  if (val < -0.0001) return `−${absStr}${suffix}`;
  return `${fmt(0, dec)}${suffix}`;
}

export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | null | undefined> = {},
  children: Array<Node | string | null | undefined> | Node | string = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k === 'class') node.className = String(v);
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child !== null && child !== undefined) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | null | undefined> = {},
  children: Array<SVGElement | null | undefined> | SVGElement = []
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 'text') node.textContent = String(v);
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child !== null && child !== undefined) node.appendChild(child);
  }
  return node;
}

export interface TooltipInfo {
  cat: string;
  val: string;
  sub?: string;
}

export interface TooltipController {
  show: (owner: Element | null, data: TooltipInfo, pointerEvent?: PointerEvent | MouseEvent) => void;
  hide: () => void;
}

export function initTooltip(): TooltipController {
  const tt = document.getElementById('tt')!;
  const ttCat = document.getElementById('ttCat')!;
  const ttVal = document.getElementById('ttVal')!;
  const ttSub = document.getElementById('ttSub')!;
  const live = document.getElementById('liveRegion')!;
  let activeOwner: Element | null = null;

  function clampPosition(x: number, y: number) {
    const pad = 12;
    const rect = tt.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - pad;
    const maxY = window.innerHeight - rect.height - pad;
    return {
      x: Math.max(pad, Math.min(x, maxX)),
      y: Math.max(48, Math.min(y, maxY))
    };
  }

  function show(owner: Element | null, data: TooltipInfo, pointerEvent?: PointerEvent | MouseEvent) {
    if (activeOwner && activeOwner !== owner) {
      activeOwner.removeAttribute('aria-describedby');
    }
    activeOwner = owner;
    ttCat.textContent = data.cat || '';
    ttVal.textContent = data.val || '';
    ttSub.textContent = data.sub || '';
    tt.hidden = false;
    tt.classList.add('is-visible');
    if (owner) owner.setAttribute('aria-describedby', 'tt');
    live.textContent = [data.cat, data.val, data.sub].filter(Boolean).join('. ');

    let x: number;
    let y: number;
    if (pointerEvent && typeof pointerEvent.clientX === 'number') {
      x = pointerEvent.clientX + 16;
      y = pointerEvent.clientY + 16;
      const rect = tt.getBoundingClientRect();
      if (x + rect.width > window.innerWidth - 12) x = pointerEvent.clientX - rect.width - 16;
      if (y + rect.height > window.innerHeight - 12) y = pointerEvent.clientY - rect.height - 16;
    } else if (owner) {
      const or = owner.getBoundingClientRect();
      const tr = tt.getBoundingClientRect();
      x = or.left + or.width / 2 - tr.width / 2;
      y = or.top - tr.height - 10;
      if (y < 48) y = or.bottom + 10;
    } else {
      x = 16;
      y = 56;
    }
    const pos = clampPosition(x, y);
    tt.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
  }

  function hide() {
    if (activeOwner) {
      activeOwner.removeAttribute('aria-describedby');
      activeOwner = null;
    }
    tt.classList.remove('is-visible');
    tt.hidden = true;
  }

  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    if (activeOwner && e.target instanceof Node && !activeOwner.contains(e.target) && !tt.contains(e.target)) {
      hide();
    }
  });

  return { show, hide };
}

export interface FigureCol {
  label: string;
  num: boolean;
}

export function renderFigureCaption(
  targetId: string,
  opts: {
    fig: string;
    caption: string;
    source?: string;
    cols: FigureCol[];
    rows?: string[][];
    getRows?: () => string[][];
  }
) {
  const host = document.getElementById(targetId);
  if (!host) return { refreshTable: () => {} };
  const tblId = `${targetId}-tbl`;
  const btn = el('button', {
    type: 'button',
    class: 'fig-table-btn',
    'aria-expanded': 'false',
    'aria-controls': tblId,
    text: 'Ver tabela de dados ↓'
  });
  const wrap = el('div', { class: 'fig-table-wrap', id: tblId, hidden: '' });

  function buildTable() {
    wrap.innerHTML = '';
    const rows = opts.getRows ? opts.getRows() : opts.rows || [];
    const thead = el(
      'thead',
      {},
      el(
        'tr',
        {},
        opts.cols.map(c => el('th', { class: c.num ? 'is-num' : '', scope: 'col', text: c.label }))
      )
    );
    const tbody = el(
      'tbody',
      {},
      rows.map(r =>
        el(
          'tr',
          {},
          r.map((cell, idx) =>
            el('td', { class: opts.cols[idx]?.num ? 'is-num' : '', text: String(cell) })
          )
        )
      )
    );
    wrap.appendChild(el('table', { class: 'data-table' }, [thead, tbody]));
  }

  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    if (!open) buildTable();
    btn.setAttribute('aria-expanded', String(!open));
    btn.textContent = open ? 'Ver tabela de dados ↓' : 'Ocultar tabela ↑';
    wrap.hidden = open;
  });

  const cap = el('div', { class: 'fig-caption' }, [
    el('div', { class: 'fig-meta' }, [
      el('span', { class: 'micro-upper', text: opts.fig }),
      el('span', { class: 'fig-text', text: opts.caption }),
      el('span', { class: 'mono-meta', text: opts.source || 'Fonte: zen54_backtest.csv · ETFs Brasil' })
    ]),
    btn
  ]);
  host.innerHTML = '';
  host.appendChild(cap);
  host.appendChild(wrap);
  return {
    refreshTable: () => {
      if (btn.getAttribute('aria-expanded') === 'true') buildTable();
    }
  };
}

export function renderRotatedBars(
  container: HTMLElement,
  data: { labels: string[]; colors: string[]; onColors?: string[]; values: number[] },
  opts: {
    maxVal?: number;
    compact?: boolean;
    ariaLabel?: string;
    tooltip: TooltipController;
    getTooltip?: (idx: number, val: number) => TooltipInfo;
    formatVal?: (val: number) => string;
  }
) {
  const maxVal = opts.maxVal || Math.max(10, ...data.values.map(v => Math.abs(v)));
  const formatStr = opts.formatVal || ((v: number) => `${fmt(v, 1)}%`);
  let currentVals = [...data.values];
  let revealed = REDUCED_MOTION;

  const wrap = el('div', { class: 'rot-bars-wrap' });
  const stage = el('div', {
    class: `rot-bars-stage ${opts.compact ? 'rot-bars-stage--outlook' : ''}`,
    role: 'group',
    'aria-label': opts.ariaLabel || 'Gráfico de barras comparativas'
  });
  const labelsRow = el('div', { class: 'rot-bars-labels' });

  const barRefs = data.labels.map((label, idx) => {
    const val = currentVals[idx];
    const delayMs = REDUCED_MOTION ? 0 : idx * 60;
    const fill = el('div', {
      class: 'rot-bar-fill',
      style: `background:${data.colors[idx]};transition-delay:${delayMs}ms;`
    });
    const anchor = el('div', {
      class: 'rot-num-anchor',
      style: `transition-delay:${REDUCED_MOTION ? 0 : idx * 60 + 280}ms;`
    });
    const txt = formatStr(val);
    const numText = el('span', { class: 'rot-num-text is-active', text: txt });
    anchor.appendChild(numText);

    const onColor = data.onColors?.[idx] || 'var(--ink)';
    const anchorIn = el('div', {
      class: 'rot-num-anchor',
      style: `transition-delay:${REDUCED_MOTION ? 0 : idx * 60 + 280}ms;`
    });
    const numTextIn = el('span', {
      class: 'rot-num-text is-active',
      style: `color:${onColor};`,
      text: txt
    });
    anchorIn.appendChild(numTextIn);
    const clipLayer = el(
      'div',
      {
        class: 'rot-bar-clip',
        'aria-hidden': 'true',
        style: `transition-delay:${delayMs}ms;`
      },
      anchorIn
    );

    const btn = el(
      'button',
      {
        type: 'button',
        class: 'rot-bar-btn',
        'aria-label': `${label}: ${txt}`
      },
      [fill, anchor, clipLayer]
    );

    const showTip = (e?: PointerEvent) => {
      const info = opts.getTooltip
        ? opts.getTooltip(idx, currentVals[idx])
        : { cat: label, val: formatStr(currentVals[idx]), sub: '' };
      opts.tooltip.show(btn, info, e);
    };
    btn.addEventListener('pointerenter', showTip);
    btn.addEventListener('pointermove', showTip);
    btn.addEventListener('pointerleave', opts.tooltip.hide);
    btn.addEventListener('focus', () => showTip());
    btn.addEventListener('blur', opts.tooltip.hide);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        barRefs[(idx + 1) % barRefs.length].btn.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        barRefs[(idx - 1 + barRefs.length) % barRefs.length].btn.focus();
      }
    });

    stage.appendChild(btn);
    labelsRow.appendChild(el('span', { class: 'rot-bar-label', text: label }));
    return { btn, fill, anchor, numText, anchorIn, numTextIn, onColor, label };
  });

  wrap.appendChild(stage);
  wrap.appendChild(labelsRow);
  container.innerHTML = '';
  container.appendChild(wrap);

  function applyHeights() {
    barRefs.forEach((ref, idx) => {
      const ratio = revealed ? Math.max(0.02, Math.min(1, Math.max(0, currentVals[idx]) / maxVal)) : 0;
      const rStr = ratio.toFixed(4);
      ref.fill.style.transform = `scaleY(${rStr})`;
      ref.btn.style.setProperty('--bar-ratio', rStr);
    });
  }

  function swapNum(anchor: HTMLElement, curEl: HTMLElement, newStr: string, extraStyle: string): HTMLElement {
    if (REDUCED_MOTION) {
      curEl.textContent = newStr;
      return curEl;
    }
    curEl.classList.remove('is-active');
    curEl.classList.add('is-exiting');
    const fresh = el('span', {
      class: 'rot-num-text is-entering',
      style: extraStyle || null,
      text: newStr
    });
    anchor.appendChild(fresh);
    void fresh.offsetWidth;
    fresh.classList.remove('is-entering');
    fresh.classList.add('is-active');
    window.setTimeout(() => {
      if (curEl.parentNode === anchor) curEl.remove();
    }, 620);
    return fresh;
  }

  function update(newVals: number[]) {
    currentVals = [...newVals];
    applyHeights();
    barRefs.forEach((ref, idx) => {
      const newStr = formatStr(currentVals[idx]);
      ref.btn.setAttribute('aria-label', `${ref.label}: ${newStr}`);
      if (ref.numText.textContent === newStr) return;
      ref.numText = swapNum(ref.anchor, ref.numText, newStr, '');
      ref.numTextIn = swapNum(ref.anchorIn, ref.numTextIn, newStr, `color:${ref.onColor};`);
    });
  }

  applyHeights();

  return {
    reveal: () => {
      revealed = true;
      applyHeights();
    },
    update
  };
}

export const SECTIONS_META = [
  { id: 's01', num: '01', short: 'Visão Geral', folioL: '002', folioR: '003' },
  { id: 's02', num: '02', short: 'Composição', folioL: '004', folioR: '005' },
  { id: 's03', num: '03', short: '2024 vs 2025', folioL: '006', folioR: '007' },
  { id: 's04', num: '04', short: 'Janelas KPI', folioL: '008', folioR: '009' },
  { id: 's05', num: '05', short: 'Evolução', folioL: '010', folioR: '011' },
  { id: 's06', num: '06', short: 'Contribuição', folioL: '012', folioR: '013' },
  { id: 's07', num: '07', short: 'Matriz Mensal', folioL: '014', folioR: '015' },
  { id: 's08', num: '08', short: 'Consistência', folioL: '016', folioR: '017' },
  { id: 's09', num: '09', short: 'Beta & R²', folioL: '018', folioR: '019' },
  { id: 's10', num: '10', short: 'Série e CSV', folioL: '020', folioR: '021' }
];

export function initPager() {
  const links = Array.from(document.querySelectorAll('.pager-link'));
  const circle = document.getElementById('pagerCircle');
  const folioL = document.getElementById('bandFolioLeft')!;
  const folioR = document.getElementById('bandFolioRight')!;
  const bandTitle = document.getElementById('bandTitle')!;
  const mobileNum = document.getElementById('pagerMobileNum')!;
  const toggleBtn = document.getElementById('pagerToggle')!;
  const dropdown = document.getElementById('pagerMenu')!;
  const dropdownList = document.getElementById('pagerDropdownList')!;
  const prevBtn = document.getElementById('pagerPrev')!;
  const nextBtn = document.getElementById('pagerNext')!;
  const sections = SECTIONS_META.map(s => document.getElementById(s.id)!);
  let activeIdx = 0;

  dropdownList.innerHTML = '';
  SECTIONS_META.forEach((s, idx) => {
    const a = el('a', { href: `#${s.id}`, 'data-msec': idx }, [
      el('span', { class: 'num', text: s.num }),
      el('span', { text: s.short })
    ]);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      closeDropdown();
      jumpTo(idx);
    });
    dropdownList.appendChild(el('li', {}, a));
  });

  function updateCircle(idx: number) {
    if (!links[idx] || !circle) return;
    circle.style.transform = `translate3d(${idx * 24 + 2}px, 0, 0)`;
  }

  function setActive(idx: number, updateHash = true) {
    if (idx < 0 || idx >= SECTIONS_META.length) return;
    const changed = idx !== activeIdx;
    activeIdx = idx;
    const sec = SECTIONS_META[idx];
    links.forEach((a, i) => {
      if (i === idx) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    dropdownList.querySelectorAll('a').forEach((a, i) => {
      if (i === idx) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    updateCircle(idx);
    folioL.textContent = sec.folioL;
    folioR.textContent = sec.folioR;
    mobileNum.textContent = sec.num;
    if (changed) {
      if (REDUCED_MOTION) bandTitle.textContent = sec.short;
      else {
        bandTitle.classList.add('is-fading');
        window.setTimeout(() => {
          bandTitle.textContent = sec.short;
          bandTitle.classList.remove('is-fading');
        }, 90);
      }
    }
    if (updateHash && window.location.hash !== `#${sec.id}`) {
      try { history.replaceState(null, '', `#${sec.id}`); } catch (_) {}
    }
  }

  function jumpTo(idx: number) {
    if (idx < 0 || idx >= sections.length) return;
    const secEl = sections[idx];
    const heading = secEl.querySelector<HTMLElement>('h1, h2');
    secEl.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
    if (heading) {
      window.setTimeout(() => heading.focus({ preventScroll: true }), REDUCED_MOTION ? 0 : 350);
    }
  }

  function openDropdown() {
    dropdown.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown(returnFocus = false) {
    if (dropdown.hidden) return;
    dropdown.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggleBtn.focus();
  }

  links.forEach((a, idx) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      jumpTo(idx);
    });
  });

  toggleBtn.addEventListener('click', () => {
    if (toggleBtn.getAttribute('aria-expanded') === 'true') closeDropdown();
    else openDropdown();
  });
  prevBtn.addEventListener('click', () => jumpTo(Math.max(0, activeIdx - 1)));
  nextBtn.addEventListener('click', () => jumpTo(Math.min(sections.length - 1, activeIdx + 1)));

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-sec-index') || '', 10);
          if (!Number.isNaN(idx)) setActive(idx, true);
        }
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
  );
  sections.forEach(s => io.observe(s));
  setActive(0, false);

  return {
    getActive: () => activeIdx,
    jumpTo,
    closeDropdown,
    isDropdownOpen: () => !dropdown.hidden
  };
}

const THEMES = [
  { id: 'lavender-press', name: 'Lavender Press', desc: 'Edição principal: cabeçalho violeta, papel lilás e sinal vermelhão.' },
  { id: 'newsprint', name: 'Jornal Clássico', desc: 'Papel quente não revestido, cabeçalho preto, azul cobalto e tijolo.' },
  { id: 'night-edition', name: 'Edição Noturna', desc: 'Páginas em carvão com cabeçalho âmbar para leitura com pouca luz.' },
  { id: 'gazette-mono', name: 'Gazeta Mono', desc: 'Preto no branco; tons de cinza carregam os dados com alto contraste.' },
  { id: 'swiss-poster', name: 'Cartaz Suíço', desc: 'Estilo internacional em vermelho e preto com contraponto cobalto.' },
  { id: 'forest-ochre', name: 'Floresta & Ocre', desc: 'Verdes editoriais, ocre e ferrugem sobre papel aveia.' },
  { id: 'riso-pastel', name: 'Riso Pastel', desc: 'Risografia em duas cores: rosa vivo e azul médio sobre creme.' }
];

export function initThemePanel(pager: ReturnType<typeof initPager>, tooltip: TooltipController) {
  const STORAGE_KEY = 'folio.theme.v1';
  const DEFAULT_THEME = 'lavender-press';
  const panel = document.getElementById('themePanel') as HTMLDialogElement;
  const inner = document.getElementById('themePanelInner')!;
  const btn = document.getElementById('themePanelBtn')!;
  const closeBtn = document.getElementById('themePanelClose')!;
  const list = document.getElementById('themeList')!;
  const resetBtn = document.getElementById('themeReset') as HTMLButtonElement;
  const storageNote = document.getElementById('themeStorageNote');
  const statusEl = document.getElementById('themeStatus')!;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  let storageOk = true;
  try {
    localStorage.setItem('folio.theme.test', '1');
    localStorage.removeItem('folio.theme.test');
  } catch (_) {
    storageOk = false;
  }
  if (!storageOk && storageNote) {
    storageNote.textContent = 'Não salvo: armazenamento indisponível';
  }

  THEMES.forEach((t) => {
    const radio = el('input', { type: 'radio', name: 'theme', value: t.id, class: 'theme-radio' });
    const swatch = el('span', { class: 'theme-swatch', 'data-swatch': t.id, 'aria-hidden': 'true' }, [
      el('span', { class: 'sw-band' }),
      el('span', { class: 'sw-mid' }, [
        el('span', { class: 'sw-line' }),
        el('span', { class: 'sw-bars' }, [el('i'), el('i'), el('i')])
      ]),
      el('span', { class: 'sw-ramp' }, [el('i'), el('i'), el('i'), el('i'), el('i'), el('i')])
    ]);
    const body = el('span', { class: 'theme-opt-body' }, [
      swatch,
      el('span', { class: 'theme-opt-text' }, [
        el('span', { class: 'theme-opt-name', text: t.name }),
        el('span', { class: 'theme-opt-desc', text: t.desc })
      ]),
      el('span', { class: 'theme-opt-mark', 'aria-hidden': 'true' })
    ]);
    list.appendChild(el('label', { class: 'theme-opt' }, [radio, body]));
  });

  const radios = Array.from(list.querySelectorAll<HTMLInputElement>('.theme-radio'));
  let persistTimer: number | undefined;
  let fadeTimer: number | undefined;
  let lastFocus: HTMLElement | null = null;
  let closing = false;

  function syncThemeColorMeta() {
    if (!themeMeta) return;
    const bandColor = getComputedStyle(document.documentElement).getPropertyValue('--band').trim();
    if (bandColor) themeMeta.setAttribute('content', bandColor);
  }

  function applyTheme(id: string, opts: { announce?: boolean; persist?: boolean; remove?: boolean; immediate?: boolean } = {}) {
    const themeObj = THEMES.find(t => t.id === id) || THEMES[0];
    const safeId = themeObj.id;
    document.documentElement.dataset.theme = safeId;
    radios.forEach(r => { r.checked = r.value === safeId; });
    const isDefault = safeId === DEFAULT_THEME;
    resetBtn.disabled = isDefault;
    resetBtn.setAttribute('aria-disabled', String(isDefault));
    syncThemeColorMeta();

    if (opts.announce !== false) statusEl.textContent = `Tema: ${themeObj.name}`;
    document.dispatchEvent(new CustomEvent('folio:themechange', { detail: { id: safeId } }));

    if (opts.persist !== false && storageOk) {
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(() => {
        try {
          if (opts.remove) localStorage.removeItem(STORAGE_KEY);
          else localStorage.setItem(STORAGE_KEY, safeId);
        } catch (_) {
          storageOk = false;
          if (storageNote) storageNote.textContent = 'Não salvo: armazenamento indisponível';
        }
      }, opts.immediate ? 0 : 150);
    }
  }

  function switchTheme(id: string, opts: { force?: boolean; announce?: boolean; persist?: boolean; remove?: boolean; immediate?: boolean } = {}) {
    const current = document.documentElement.dataset.theme || DEFAULT_THEME;
    if (current === id && !opts.force) return;
    if (REDUCED_MOTION) {
      applyTheme(id, opts);
      return;
    }
    if (typeof document.startViewTransition === 'function') {
      try {
        document.startViewTransition(() => applyTheme(id, opts));
        return;
      } catch (_) {}
    }
    window.clearTimeout(fadeTimer);
    document.documentElement.classList.add('theme-fading');
    applyTheme(id, opts);
    fadeTimer = window.setTimeout(() => document.documentElement.classList.remove('theme-fading'), 450);
  }

  radios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) switchTheme(r.value, { persist: true, announce: true });
    });
  });

  resetBtn.addEventListener('click', () => {
    switchTheme(DEFAULT_THEME, { persist: true, remove: true, immediate: true, announce: true });
  });

  function openPanel() {
    if (panel.open) return;
    closing = false;
    if (pager.isDropdownOpen()) pager.closeDropdown(false);
    tooltip.hide();
    const ae = document.activeElement;
    lastFocus = ae instanceof HTMLElement && ae !== document.body && ae !== document.documentElement ? ae : btn;
    document.documentElement.classList.add('panel-open');
    panel.showModal();
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      panel.classList.add('is-open');
      const checked = panel.querySelector<HTMLElement>('.theme-radio:checked') || radios[0];
      if (checked) checked.focus({ preventScroll: true });
    });
  }

  function finishClose() {
    if (!panel.open) return;
    panel.close();
    btn.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('panel-open');
    closing = false;
    const target = lastFocus && lastFocus !== document.body && document.contains(lastFocus) ? lastFocus : btn;
    target.focus();
  }

  function closePanel() {
    if (!panel.open || closing) return;
    closing = true;
    panel.classList.remove('is-open');
    let done = false;
    const onDone = (e?: Event) => {
      if (e && e.target !== panel) return;
      if (done) return;
      done = true;
      panel.removeEventListener('transitionend', onDone);
      finishClose();
    };
    panel.addEventListener('transitionend', onDone);
    window.setTimeout(() => {
      if (!done) {
        done = true;
        panel.removeEventListener('transitionend', onDone);
        finishClose();
      }
    }, REDUCED_MOTION ? 140 : 300);
  }

  btn.addEventListener('click', () => (panel.open ? closePanel() : openPanel()));
  closeBtn.addEventListener('click', closePanel);
  panel.addEventListener('cancel', (e) => {
    e.preventDefault();
    closePanel();
  });
  panel.addEventListener('click', (e) => {
    if (e.target !== panel) return;
    const rect = inner.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      closePanel();
    }
  });

  const bandEl = document.querySelector('.band');
  const bandInner = document.querySelector('.band-inner');
  function fitBand() {
    if (!bandEl || !bandInner) return;
    bandEl.classList.remove('band--hide-label', 'band--hide-folio');
    const vw = window.innerWidth;
    if (vw >= 768 && vw <= 1023) {
      if (bandInner.scrollWidth > bandInner.clientWidth) bandEl.classList.add('band--hide-label');
      if (bandInner.scrollWidth > bandInner.clientWidth) bandEl.classList.add('band--hide-folio');
    }
  }
  if (bandInner) {
    new ResizeObserver(() => requestAnimationFrame(fitBand)).observe(bandInner);
    window.addEventListener('resize', () => requestAnimationFrame(fitBand), { passive: true });
    fitBand();
  }

  const initial = document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  applyTheme(initial, { persist: false, announce: false });

  return {
    isOpen: () => panel.open,
    open: openPanel,
    close: closePanel
  };
}

export function initShortcuts(pager: ReturnType<typeof initPager>, themePanel: ReturnType<typeof initThemePanel>, tooltip: TooltipController) {
  const gridOverlay = document.getElementById('gridOverlay');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      tooltip.hide();
      if (pager.isDropdownOpen()) pager.closeDropdown(true);
      return;
    }
    if (themePanel.isOpen()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = e.key.toLowerCase();
    if (key === 'j') {
      e.preventDefault();
      pager.jumpTo(Math.min(SECTIONS_META.length - 1, pager.getActive() + 1));
    } else if (key === 'k') {
      e.preventDefault();
      pager.jumpTo(Math.max(0, pager.getActive() - 1));
    } else if (key === 'g' && gridOverlay) {
      e.preventDefault();
      gridOverlay.classList.toggle('is-on');
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const idx = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
      pager.jumpTo(idx);
    }
  });
}
