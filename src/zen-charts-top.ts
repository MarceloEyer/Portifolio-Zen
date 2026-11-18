import type { ZenParsedData } from './zen-csv';
import {
  REDUCED_MOTION,
  type TooltipController,
  el,
  fmt,
  fmtPct,
  fmtSignedNum,
  renderFigureCaption,
  renderRotatedBars,
  scaleLinear,
  svg
} from './zen-dom';

const PALETTE = ['var(--violet)', 'var(--vermilion)', 'var(--magenta)', 'var(--ink)', 'var(--neutral-data)'];

const MACRO_ORDER = [
  { name: 'Ações Globais', color: 'var(--violet)', text: 'var(--on-violet)' },
  { name: 'Renda Fixa BR', color: 'var(--vermilion)', text: 'var(--on-vermilion)' },
  { name: 'Reservas USD/EUR', color: 'var(--magenta)', text: 'var(--on-magenta)' },
  { name: 'Cripto', color: 'var(--ink)', text: 'var(--paper)' }
];

export function renderMatrix(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const host = document.getElementById('chart01')!;
  let mode: 'all' | 'macro' | 'currency' | 'assets' = 'all';
  let highlightMacro: string | null = null;
  const total = 100;

  const macroTotals = MACRO_ORDER.map((m) => ({
    name: m.name,
    count: Math.round(
      data.assetsMeta
        .filter((a) => a.macro === m.name)
        .reduce((acc, a) => acc + (data.weights[a.key] || 0), 0)
    )
  }));

  const currencyTotals = [
    {
      name: 'BRL (Local BR)',
      count: Math.round(
        data.assetsMeta
          .filter((a) => a.currency === 'BRL (Local)')
          .reduce((acc, a) => acc + (data.weights[a.key] || 0), 0)
      )
    },
    {
      name: 'USD / Global',
      count: Math.round(
        data.assetsMeta
          .filter((a) => a.currency === 'USD / Global')
          .reduce((acc, a) => acc + (data.weights[a.key] || 0), 0)
      )
    },
    {
      name: 'EUR (Reserva)',
      count: Math.round(
        data.assetsMeta
          .filter((a) => a.currency === 'EUR')
          .reduce((acc, a) => acc + (data.weights[a.key] || 0), 0)
      )
    }
  ];

  const assetsGroups = data.assetsMeta.map((a) => ({
    name: a.shortLabel,
    count: Math.round(data.weights[a.key] || 0)
  }));

  const groupings = {
    macro: macroTotals,
    currency: currencyTotals,
    assets: assetsGroups
  };

  const svgEl = svg('svg', {
    class: 'matrix-svg',
    role: 'group',
    'aria-labelledby': 'matrixTitle matrixDesc'
  });
  svgEl.appendChild(svg('title', { id: 'matrixTitle', text: 'Matriz de alocação Zen 5.4: 100 quadrados de 1 % cada' }));
  svgEl.appendChild(
    svg('desc', {
      id: 'matrixDesc',
      text: 'Matriz unitária interativa dos 100 % da Carteira Zen 5.4 agrupáveis por macroclasse, exposição cambial ou 9 instrumentos.'
    })
  );

  const labelsLayer = svg('g', { class: 'matrix-labels' });
  const squaresLayer = svg('g', { class: 'matrix-squares' });
  const hitLayer = svg('g', { class: 'matrix-hits' });
  svgEl.appendChild(labelsLayer);
  svgEl.appendChild(squaresLayer);
  svgEl.appendChild(hitLayer);
  host.innerHTML = '';
  host.appendChild(svgEl);

  const rects: SVGRectElement[] = [];
  for (let i = 0; i < total; i++) {
    const r = svg('rect', { class: 'matrix-sq', width: 8, height: 8, 'aria-hidden': 'true' });
    squaresLayer.appendChild(r);
    rects.push(r);
  }

  const capApi = renderFigureCaption('cap01', {
    fig: 'FIG. 01',
    caption: 'Matriz unitária dos 100 % da Carteira Zen 5.4 (1 quadrado = 1 % do patrimônio); alterne o agrupamento acima.',
    source: 'Fonte: Política oficial Zen 5.4 (PESO_ALVO em zen54_backtest.csv)',
    cols: [
      { label: 'Bloco / Ativo', num: false },
      { label: 'Quadrados (1%)', num: true },
      { label: 'Peso Alvo (%)', num: true }
    ],
    getRows: () => {
      if (mode === 'all') return [['Carteira Zen 5.4 completa', '100', '100,0 %']];
      return groupings[mode].map((g) => [g.name, String(g.count), `${fmt(g.count, 1)} %`]);
    }
  });

  function layout() {
    const w = Math.max(260, host.clientWidth || 500);
    const gap = w < 440 ? 3 : 4;
    const allCols = w >= 520 ? 20 : w >= 380 ? 15 : 10;
    const sq = (w - (allCols - 1) * gap) / allCols;
    const step = sq + gap;

    labelsLayer.innerHTML = '';
    hitLayer.innerHTML = '';

    if (mode === 'all') {
      const cols = allCols;
      const rows = Math.ceil(total / cols);
      const h = rows * step - gap;
      svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const maxDiag = cols + rows - 2 || 1;
      for (let i = 0; i < total; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const node = rects[i];
        node.setAttribute('width', sq.toFixed(2));
        node.setAttribute('height', sq.toFixed(2));
        node.setAttribute('fill', 'var(--violet)');
        node.style.transform = `translate3d(${(c * step).toFixed(2)}px, ${(r * step).toFixed(2)}px, 0)`;
        node.style.transitionDelay = REDUCED_MOTION ? '0ms' : `${Math.round(((c + r) / maxDiag) * 700)}ms`;
      }
      const hit = svg('rect', {
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: 'transparent',
        tabindex: 0,
        role: 'img',
        class: 'matrix-group-hit',
        'aria-label': 'Carteira Zen 5.4 completa: 100 % alocados em 9 instrumentos'
      });
      const info = {
        cat: 'Carteira Zen 5.4',
        val: '100 % alocados',
        sub: '47 % Global · 45 % RF Brasil · 5 % USD/EUR · 3 % Cripto'
      };
      hit.addEventListener('pointerenter', (e) => tooltip.show(hit, info, e), { signal });
      hit.addEventListener('pointermove', (e) => tooltip.show(hit, info, e), { signal });
      hit.addEventListener('pointerleave', tooltip.hide, { signal });
      hit.addEventListener('focus', () => tooltip.show(hit, info), { signal });
      hit.addEventListener('blur', tooltip.hide, { signal });
      hitLayer.appendChild(hit);
      return;
    }

    const groups = groupings[mode];
    const twoCol = w >= 480;
    const colGap = 24;
    const blockW = twoCol ? (w - colGap) / 2 : w;
    const blockCols = mode === 'assets' ? 10 : Math.max(8, Math.floor((blockW + gap) / step));
    const bSq = Math.min(22, (blockW - (blockCols - 1) * gap) / blockCols);
    const bStep = bSq + gap;

    let idxCursor = 0;
    let rowY = 0;
    const rowStride = twoCol ? 2 : 1;

    for (let rowIdx = 0; rowIdx < groups.length; rowIdx += rowStride) {
      const rowGroups = groups.slice(rowIdx, rowIdx + rowStride);
      let maxRowH = 0;

      rowGroups.forEach((grp, colPos) => {
        const gIdx = rowIdx + colPos;
        const color = PALETTE[gIdx % PALETTE.length];
        const baseX = twoCol ? colPos * (blockW + colGap) : 0;

        labelsLayer.appendChild(
          svg('text', {
            x: baseX,
            y: rowY + 13,
            class: 'svg-label',
            text: `${grp.name} · ${grp.count}%`
          })
        );

        const gridTop = rowY + 22;
        const rows = Math.max(1, Math.ceil(grp.count / blockCols));
        const blockH = rows * bStep - gap;
        if (blockH > maxRowH) maxRowH = blockH;
        const isDim = Boolean(highlightMacro && mode === 'macro' && highlightMacro !== grp.name);

        for (let j = 0; j < grp.count; j++) {
          const node = rects[idxCursor + j];
          if (!node) continue;
          const c = j % blockCols;
          const r = Math.floor(j / blockCols);
          node.setAttribute('width', bSq.toFixed(2));
          node.setAttribute('height', bSq.toFixed(2));
          node.setAttribute('fill', isDim ? 'var(--neutral-data)' : color);
          node.style.transform = `translate3d(${(baseX + c * bStep).toFixed(2)}px, ${(gridTop + r * bStep).toFixed(2)}px, 0)`;
          const delay = REDUCED_MOTION ? 0 : Math.min(550, Math.round(((idxCursor + j) / total) * 480));
          node.style.transitionDelay = `${delay}ms`;
        }

        const hit = svg('rect', {
          x: baseX,
          y: gridTop,
          width: blockW,
          height: Math.max(18, blockH),
          fill: 'transparent',
          tabindex: 0,
          role: 'img',
          class: 'matrix-group-hit',
          'aria-label': `${grp.name}: ${grp.count} por cento da carteira`
        });
        const info = {
          cat: mode === 'macro' ? 'Macroclasse' : mode === 'currency' ? 'Exposição cambial' : 'Instrumento',
          val: `${grp.count} %`,
          sub: grp.name
        };
        hit.addEventListener('pointerenter', (e) => tooltip.show(hit, info, e), { signal });
        hit.addEventListener('pointermove', (e) => tooltip.show(hit, info, e), { signal });
        hit.addEventListener('pointerleave', tooltip.hide, { signal });
        hit.addEventListener('focus', () => tooltip.show(hit, info), { signal });
        hit.addEventListener('blur', tooltip.hide, { signal });
        hitLayer.appendChild(hit);

        idxCursor += grp.count;
      });

      rowY += 22 + maxRowH + 18;
    }

    svgEl.setAttribute('viewBox', `0 0 ${w} ${Math.max(100, rowY - 10)}`);
  }

  document.querySelectorAll('[data-matrix-mode]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-matrix-mode') === 'all'));
    btn.addEventListener(
      'click',
      () => {
        mode = btn.getAttribute('data-matrix-mode') as typeof mode;
        document.querySelectorAll('[data-matrix-mode]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        layout();
        capApi.refreshTable();
      },
      { signal }
    );
  });

  const ro = new ResizeObserver(() => requestAnimationFrame(layout));
  ro.observe(host);
  cleanups.push(() => ro.disconnect());
  layout();

  return {
    reveal: () => svgEl.classList.add('is-revealed'),
    highlightMacro: (macro: string | null) => {
      highlightMacro = macro;
      if (mode === 'macro') layout();
    }
  };
}

export function renderStackBar(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const host = document.getElementById('chart02a')!;
  const items = MACRO_ORDER.map((m) => ({
    name: m.name,
    value: Math.round(
      data.assetsMeta
        .filter((a) => a.macro === m.name)
        .reduce((acc, a) => acc + (data.weights[a.key] || 0), 0)
    ),
    color: m.color,
    text: m.text
  }));

  const svgEl = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'stackTitle stackDesc'
  });
  svgEl.appendChild(svg('title', { id: 'stackTitle', text: 'Alocação 100% empilhada da Zen 5.4' }));
  svgEl.appendChild(
    svg('desc', {
      id: 'stackDesc',
      text: items.map((i) => `${i.name} ${i.value}%`).join(', ')
    })
  );
  const gBars = svg('g');
  svgEl.appendChild(gBars);
  const legendDiv = el('div', { class: 'hm-ramp', style: 'margin-top:var(--s-3);', hidden: '' });
  host.innerHTML = '';
  host.appendChild(svgEl);
  host.appendChild(legendDiv);

  renderFigureCaption('cap02a', {
    fig: 'FIG. 02A',
    caption: 'Distribuição estratégica 5.4 por macroclasse somando 100 %.',
    cols: [
      { label: 'Macroclasse', num: false },
      { label: 'Peso Alvo (%)', num: true }
    ],
    rows: items.map((i) => [i.name, `${i.value} %`])
  });

  let revealed = REDUCED_MOTION;

  function layout() {
    const w = Math.max(260, host.clientWidth || 500);
    const compact = w < 440;
    const h = compact ? 48 : 112;
    const barTop = compact ? 0 : 52;
    const barH = 48;
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    gBars.innerHTML = '';

    const innerG = svg('g', {
      style: `transform-origin:0 ${barTop + barH / 2}px;transform:scaleX(${revealed ? 1 : 0});transition:transform var(--d-3) var(--ease-out);`
    });

    let x = 0;
    items.forEach((seg, idx) => {
      const segW = (seg.value / 100) * w;
      const r = svg('rect', {
        x,
        y: barTop,
        width: segW,
        height: barH,
        fill: seg.color,
        tabindex: 0,
        role: 'img',
        'aria-label': `${seg.name}: ${seg.value} por cento da carteira`,
        style: 'cursor:pointer;'
      });
      const info = { cat: 'Macroclasse Zen 5.4', val: `${seg.value} %`, sub: seg.name };
      r.addEventListener('pointerenter', (e) => tooltip.show(r, info, e), { signal });
      r.addEventListener('pointermove', (e) => tooltip.show(r, info, e), { signal });
      r.addEventListener('pointerleave', tooltip.hide, { signal });
      r.addEventListener('focus', () => tooltip.show(r, info), { signal });
      r.addEventListener('blur', tooltip.hide, { signal });
      innerG.appendChild(r);

      if (segW >= (compact ? 26 : 42)) {
        innerG.appendChild(
          svg('text', {
            x: x + (compact ? 4 : 8),
            y: barTop + 30,
            style: `fill:${seg.text};font-size:${compact ? 11.5 : 13}px;font-weight:500;pointer-events:none;`,
            text: compact ? `${seg.value}%` : `${seg.value} %`
          })
        );
      }

      if (!compact) {
        const cx = x + segW / 2;
        const stagger = idx === 3 ? 14 : idx === 2 ? 28 : 26;
        const anchor = idx >= 2 ? 'end' : idx === 0 ? 'start' : 'middle';
        const lx = idx === 0 ? x : idx >= 2 ? Math.min(w, x + segW) : cx;
        innerG.appendChild(svg('line', { x1: cx, y1: barTop, x2: cx, y2: stagger + 4, stroke: 'var(--ink-3)', 'stroke-width': 1 }));
        innerG.appendChild(
          svg('text', {
            x: lx,
            y: stagger,
            'text-anchor': anchor,
            class: 'svg-micro',
            text: segW >= 54 ? seg.name : `${seg.name} ${seg.value}%`
          })
        );
      }
      x += segW;
    });

    gBars.appendChild(innerG);

    if (compact) {
      legendDiv.hidden = false;
      legendDiv.innerHTML = '';
      items.forEach((seg) => {
        legendDiv.appendChild(
          el('span', { class: 'hm-ramp-item' }, [
            el('span', { class: 'hm-ramp-box', style: `background:${seg.color};width:10px;height:10px;` }),
            document.createTextNode(`${seg.name} ${seg.value}%`)
          ])
        );
      });
    } else {
      legendDiv.hidden = true;
      legendDiv.innerHTML = '';
    }
  }

  const ro = new ResizeObserver(() => requestAnimationFrame(layout));
  ro.observe(host);
  cleanups.push(() => ro.disconnect());
  layout();

  return {
    reveal: () => {
      revealed = true;
      const g = gBars.firstChild as SVGGElement | null;
      if (g) g.style.transform = 'scaleX(1)';
    }
  };
}

export function renderBenchTable(data: ZenParsedData, signal: AbortSignal) {
  const host = document.getElementById('chart02b')!;
  type BenchSortCol = 'label' | 'cum' | 'cagr' | 'vol' | 'maxDd' | 'rec';
  let sortCol: BenchSortCol = 'cagr';
  let sortDir: 'asc' | 'desc' = 'desc';

  const rowsData = [
    data.stats.zen54,
    data.stats.global50,
    data.stats.wrld11,
    data.stats.ibov,
    data.stats.cdi
  ].map((s) => ({
    ...s,
    rec: s.recoveryMonths === null ? 999 : s.recoveryMonths
  }));

  const maxCum = Math.max(0.05, ...rowsData.map((r) => Math.abs(r.cum)));

  const cols: Array<{ key: BenchSortCol; label: string; num: boolean }> = [
    { key: 'label', label: 'Portfólio / Benchmark', num: false },
    { key: 'cum', label: 'Acumulado', num: true },
    { key: 'cagr', label: 'CAGR a.a.', num: true },
    { key: 'vol', label: 'Vol. Anual', num: true },
    { key: 'maxDd', label: 'Drawdown Máx.', num: true },
    { key: 'rec', label: 'Recup.', num: true }
  ];

  function draw() {
    const sorted = [...rowsData].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, 'pt-BR') : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const thead = el(
      'thead',
      {},
      el(
        'tr',
        {},
        cols.map((c) => {
          const isSorted = sortCol === c.key;
          const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
          const btn = el('button', {
            type: 'button',
            class: 'sort-btn',
            html: `${c.label} <span aria-hidden="true">${isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>`
          });
          btn.addEventListener(
            'click',
            () => {
              if (sortCol === c.key) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
              else {
                sortCol = c.key;
                sortDir = c.key === 'label' || c.key === 'vol' || c.key === 'rec' ? 'asc' : 'desc';
              }
              draw();
            },
            { signal }
          );
          return el('th', { class: c.num ? 'is-num' : '', scope: 'col', 'aria-sort': ariaSort }, btn);
        })
      )
    );

    const tbody = el(
      'tbody',
      {},
      sorted.map((r) => {
        const isZen = r.key === 'zen54';
        const recTxt = r.recoveryMonths === null ? 'Em recup.' : r.recoveryMonths === 0 ? '0 m' : `${r.recoveryMonths} m`;
        return el('tr', { style: isZen ? 'background:var(--violet-tint);font-weight:500;' : undefined }, [
          el('td', { text: r.label }),
          el(
            'td',
            { class: 'is-num' },
            el('span', { class: 'inline-bar-cell' }, [
              el(
                'span',
                { class: 'inline-bar-track', 'aria-hidden': 'true' },
                el('span', { class: 'inline-bar-fill', style: `width:${Math.min(100, (Math.max(0, r.cum) / maxCum) * 100)}%` })
              ),
              el('span', { text: fmtPct(r.cum, 1) })
            ])
          ),
          el('td', { class: 'is-num', text: fmtPct(r.cagr, 1, false) }),
          el('td', { class: 'is-num', text: fmtPct(r.vol, 1, false) }),
          el('td', { class: 'is-num', style: r.maxDd < -0.05 ? 'color:var(--vermilion-ink);' : undefined, text: fmtPct(r.maxDd, 1, true) }),
          el('td', { class: 'is-num', text: recTxt })
        ]);
      })
    );

    host.innerHTML = '';
    host.appendChild(el('div', { class: 'table-scroll' }, el('table', { class: 'data-table' }, [thead, tbody])));
  }

  draw();
  const capHost = document.getElementById('cap02b')!;
  capHost.innerHTML = '';
  capHost.appendChild(
    el(
      'div',
      { class: 'fig-caption' },
      el('div', { class: 'fig-meta' }, [
        el('span', { class: 'micro-upper', text: 'FIG. 02B' }),
        el('span', {
          class: 'fig-text',
          text: `Indicadores preliminares nos ${data.months.length} meses alinhados (${data.months[0].mes} a ${data.months[data.months.length - 1].mes}). Clique nos cabeçalhos para ordenar.`
        }),
        el('span', { class: 'mono-meta', text: 'Fonte: zen54_backtest.csv (séries mensais arredondadas)' })
      ])
    )
  );
}

export function renderDumbbell(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const host = document.getElementById('chart03')!;
  let sortBy: 'y2025' | 'delta' | 'y2024' = 'y2025';
  let revealed = REDUCED_MOTION;

  const y2024 = data.annuals.find((a) => a.periodKey === '2024') || data.annuals[0];
  const y2025 = data.annuals.find((a) => a.periodKey === '2025') || data.annuals[1] || y2024;
  const compoundYr = (yr: string, getter: (m: ZenParsedData['months'][0]) => number) => {
    const ms = data.months.filter((m) => m.year === yr);
    if (ms.length === 0) return 0;
    return (ms.reduce((acc, m) => acc * (1 + getter(m)), 1) - 1) * 100;
  };

  const items = [
    { item: 'Carteira Zen 5.4 (Proxy)', y2024: y2024.zen54 * 100, y2025: y2025.zen54 * 100 },
    { item: 'Global 50% / CDI 50%', y2024: y2024.global50 * 100, y2025: y2025.global50 * 100 },
    { item: 'Ações Globais (WRLD11)', y2024: y2024.wrld11 * 100, y2025: y2025.wrld11 * 100 },
    { item: 'Ibovespa (BOVA11)', y2024: y2024.ibov * 100, y2025: y2025.ibov * 100 },
    { item: 'CDI / DI (Pós-fixado)', y2024: y2024.cdi * 100, y2025: y2025.cdi * 100 },
    { item: 'IPCA+ Curto (B5P211)', y2024: compoundYr('2024', m => m.assets.ipca_curto_b5p211 || 0), y2025: compoundYr('2025', m => m.assets.ipca_curto_b5p211 || 0) },
    { item: 'Prefixado BR (FIXA11)', y2024: compoundYr('2024', m => m.assets.prefix_fixa11 || 0), y2025: compoundYr('2025', m => m.assets.prefix_fixa11 || 0) },
    { item: 'Reserva USD (BSHV39)', y2024: compoundYr('2024', m => m.assets.usd_curto_bshv39 || 0), y2025: compoundYr('2025', m => m.assets.usd_curto_bshv39 || 0) }
  ];

  const allVals = items.flatMap((d) => [d.y2024, d.y2025, 0]);
  const minDomain = Math.floor(Math.min(...allVals) / 10) * 10;
  const maxDomain = Math.ceil(Math.max(...allVals) / 10) * 10;

  const svgEl = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'dumbTitle dumbDesc'
  });
  svgEl.appendChild(svg('title', { id: 'dumbTitle', text: 'Retorno anual em 2024 contra 2025' }));
  svgEl.appendChild(svg('desc', { id: 'dumbDesc', text: 'Gráfico de halteres comparando o retorno anual fechado de 2024 e 2025.' }));
  const gridG = svg('g');
  const rowsG = svg('g');
  svgEl.appendChild(gridG);
  svgEl.appendChild(rowsG);
  host.innerHTML = '';
  host.appendChild(svgEl);

  function getSorted() {
    return [...items].sort((a, b) => {
      if (sortBy === 'y2025') return b.y2025 - a.y2025;
      if (sortBy === 'y2024') return b.y2024 - a.y2024;
      return Math.abs(b.y2025 - b.y2024) - Math.abs(a.y2025 - a.y2024);
    });
  }

  const capApi = renderFigureCaption('cap03', {
    fig: 'FIG. 03',
    caption: 'Comparativo anual fechado de 2024 (círculo vazado) vs. 2025 (ponto preenchido) com ordenação dinâmica.',
    cols: [
      { label: 'Ativo / Portfólio', num: false },
      { label: '2024 (%)', num: true },
      { label: '2025 (%)', num: true },
      { label: 'Virada (pp)', num: true }
    ],
    getRows: () =>
      getSorted().map((d) => {
        const diff = d.y2025 - d.y2024;
        return [d.item, fmtSignedNum(d.y2024, 1), fmtSignedNum(d.y2025, 1), fmtSignedNum(diff, 1, ' pp')];
      })
  });

  const rowEls = new Map<string, {
    g: SVGGElement;
    hit: SVGRectElement;
    label: SVGTextElement;
    line: SVGLineElement;
    dot24: SVGCircleElement;
    dot25: SVGCircleElement;
    deltaTxt: SVGTextElement;
  }>();
  const rowH = 44;
  const topPad = 30;

  function buildOnce() {
    rowsG.innerHTML = '';
    rowEls.clear();
    items.forEach((d, idx) => {
      const diff = d.y2025 - d.y2024;
      const g = svg('g', {
        tabindex: 0,
        role: 'img',
        'aria-label': `${d.item}: 2024 ${fmtSignedNum(d.y2024, 1)}, 2025 ${fmtSignedNum(d.y2025, 1)}`,
        style: 'cursor:pointer;transition:transform var(--d-3) var(--ease-in-out);'
      });
      const hit = svg('rect', { x: 0, y: 0, height: rowH, fill: 'transparent' });
      const label = svg('text', {
        x: 0,
        y: 26,
        class: 'svg-label',
        style: d.item.startsWith('Carteira Zen') ? 'font-weight:600;fill:var(--violet-ink);' : null,
        text: d.item
      });
      const line = svg('line', {
        y1: 22,
        y2: 22,
        stroke: d.y2025 >= d.y2024 ? 'var(--violet)' : 'var(--vermilion)',
        'stroke-width': 2.5,
        style: `transition:transform var(--d-3) var(--ease-out);transition-delay:${REDUCED_MOTION ? 0 : idx * 55 + 100}ms;`
      });
      const dot24 = svg('circle', {
        cy: 22,
        r: 5,
        fill: 'var(--paper)',
        stroke: 'var(--ink)',
        'stroke-width': 2,
        style: `transition:opacity var(--d-2) var(--ease-out);transition-delay:${REDUCED_MOTION ? 0 : idx * 55}ms;`
      });
      const dot25 = svg('circle', {
        cy: 22,
        r: 6,
        fill: 'var(--violet)',
        style: `transition:opacity var(--d-2) var(--ease-out);transition-delay:${REDUCED_MOTION ? 0 : idx * 55 + 280}ms;`
      });
      const deltaTxt = svg('text', {
        y: 26,
        'text-anchor': 'end',
        style: `font-size:12.5px;font-weight:500;fill:${diff >= 0 ? 'var(--violet-ink)' : 'var(--vermilion-ink)'};`,
        text: fmtSignedNum(diff, 1, ' pp')
      });

      const info = {
        cat: d.item,
        val: `${fmtSignedNum(d.y2024, 1)} → ${fmtSignedNum(d.y2025, 1)}`,
        sub: `Diferença 2025 vs. 2024: ${fmtSignedNum(diff, 1, ' pp')}`
      };
      g.addEventListener('pointerenter', (e) => tooltip.show(g, info, e), { signal });
      g.addEventListener('pointermove', (e) => tooltip.show(g, info, e), { signal });
      g.addEventListener('pointerleave', tooltip.hide, { signal });
      g.addEventListener('focus', () => tooltip.show(g, info), { signal });
      g.addEventListener('blur', tooltip.hide, { signal });

      g.appendChild(hit);
      g.appendChild(label);
      g.appendChild(line);
      g.appendChild(dot24);
      g.appendChild(dot25);
      g.appendChild(deltaTxt);
      rowsG.appendChild(g);
      rowEls.set(d.item, { g, hit, label, line, dot24, dot25, deltaTxt });
    });
  }

  function layout() {
    const w = Math.max(280, host.clientWidth || 540);
    const stacked = w < 480;
    const rH = stacked ? 58 : rowH;
    const tPad = stacked ? 28 : topPad;
    const labelW = stacked ? 0 : 196;
    const deltaW = stacked ? 0 : 70;
    const plotL = stacked ? 12 : labelW;
    const plotR = stacked ? w - 12 : w - deltaW;
    const xScale = scaleLinear(minDomain, maxDomain, plotL, plotR);
    const h = tPad + items.length * rH + 34;
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);

    gridG.innerHTML = '';
    gridG.appendChild(svg('circle', { cx: plotL + 5, cy: 10, r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 2 }));
    gridG.appendChild(svg('text', { x: plotL + 14, y: 14, class: 'svg-micro', text: '2024' }));
    gridG.appendChild(svg('circle', { cx: plotL + 64, cy: 10, r: 5, fill: 'var(--violet)' }));
    gridG.appendChild(svg('text', { x: plotL + 74, y: 14, class: 'svg-micro', text: '2025' }));

    for (let tick = minDomain; tick <= maxDomain; tick += 10) {
      const x = xScale(tick);
      gridG.appendChild(
        svg('line', {
          x1: x,
          y1: tPad,
          x2: x,
          y2: h - 24,
          stroke: tick === 0 ? 'var(--ink)' : 'var(--rule)',
          'stroke-width': tick === 0 ? 1.5 : 1
        })
      );
      if (tick % 20 === 0 || tick === 0) {
        gridG.appendChild(
          svg('text', { x, y: h - 6, 'text-anchor': 'middle', class: 'svg-micro', text: `${tick}%` })
        );
      }
    }

    getSorted().forEach((d, rank) => {
      const refs = rowEls.get(d.item)!;
      const y = tPad + rank * rH;
      const trackY = stacked ? 38 : 22;
      const textY = stacked ? 15 : 26;
      refs.g.style.transform = `translate3d(0, ${y}px, 0)`;
      refs.hit.setAttribute('width', String(w));
      refs.hit.setAttribute('height', String(rH));
      refs.label.setAttribute('y', String(textY));

      const x1 = xScale(d.y2024);
      const x2 = xScale(d.y2025);
      refs.line.setAttribute('x1', String(x1));
      refs.line.setAttribute('x2', String(x2));
      refs.line.setAttribute('y1', String(trackY));
      refs.line.setAttribute('y2', String(trackY));
      refs.line.style.transformOrigin = `${x1}px ${trackY}px`;
      refs.line.style.transform = revealed ? 'scaleX(1)' : 'scaleX(0)';
      refs.dot24.setAttribute('cx', String(x1));
      refs.dot24.setAttribute('cy', String(trackY));
      refs.dot24.style.opacity = revealed ? '1' : '0';
      refs.dot25.setAttribute('cx', String(x2));
      refs.dot25.setAttribute('cy', String(trackY));
      refs.dot25.style.opacity = revealed ? '1' : '0';
      refs.deltaTxt.setAttribute('x', String(w));
      refs.deltaTxt.setAttribute('y', String(textY));
    });
  }

  buildOnce();
  const ro = new ResizeObserver(() => requestAnimationFrame(layout));
  ro.observe(host);
  cleanups.push(() => ro.disconnect());
  layout();

  document.querySelectorAll('[data-dumb-sort]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-dumb-sort') === 'y2025'));
    btn.addEventListener(
      'click',
      () => {
        sortBy = btn.getAttribute('data-dumb-sort') as typeof sortBy;
        document.querySelectorAll('[data-dumb-sort]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        layout();
        capApi.refreshTable();
      },
      { signal }
    );
  });

  return {
    reveal: () => {
      revealed = true;
      layout();
    }
  };
}

export function initWindowBars(data: ZenParsedData, tooltip: TooltipController, signal: AbortSignal) {
  const host = document.getElementById('chart04')!;
  const live = document.getElementById('limitsLive')!;

  const a24 = data.annuals.find((a) => a.periodKey === '2024') || data.annuals[0];
  const a25 = data.annuals.find((a) => a.periodKey === '2025') || data.annuals[1] || a24;
  const a26 = data.annuals.find((a) => a.periodKey.startsWith('2026')) || data.annuals[data.annuals.length - 1];

  const windows: Record<string, { title: string; values: number[] }> = {
    total: {
      title: `Período Total (${data.months.length} meses)`,
      values: [data.stats.zen54.cum * 100, data.stats.global50.cum * 100, data.stats.cdi.cum * 100]
    },
    y2024: {
      title: 'Ano 2024 fechado',
      values: [a24.zen54 * 100, a24.global50 * 100, a24.cdi * 100]
    },
    y2025: {
      title: 'Ano 2025 fechado',
      values: [a25.zen54 * 100, a25.global50 * 100, a25.cdi * 100]
    },
    y2026: {
      title: a26.label,
      values: [a26.zen54 * 100, a26.global50 * 100, a26.cdi * 100]
    },
    l12m: {
      title: 'Últimos 12 meses móveis',
      values: [data.last12m.zen54 * 100, data.last12m.global50 * 100, data.last12m.cdi * 100]
    }
  };

  let curKey = 'total';
  const labels = ['Zen 5.4', 'Global 50/50', 'CDI'];
  const maxVal = Math.max(20, ...Object.values(windows).flatMap((w) => w.values));

  const bars = renderRotatedBars(
    host,
    {
      labels,
      colors: ['var(--violet)', 'var(--vermilion)', 'var(--magenta)'],
      onColors: ['var(--on-violet)', 'var(--on-vermilion)', 'var(--on-magenta)'],
      values: windows[curKey].values
    },
    {
      maxVal,
      tooltip,
      ariaLabel: 'Comparativo de retorno por janela temporal',
      formatVal: (v) => `${fmt(v, 1)}%`,
      getTooltip: (idx, val) => {
        const cdiVal = windows[curKey].values[2];
        const diff = val - cdiVal;
        return {
          cat: `${windows[curKey].title} · ${labels[idx]}`,
          val: `${fmt(val, 1)} %`,
          sub: idx === 2 ? 'Referência de taxa livre de risco BR' : `${fmtSignedNum(diff, 1, ' pp')} em relação ao CDI`
        };
      }
    }
  );

  const capApi = renderFigureCaption('cap04', {
    fig: 'FIG. 04',
    caption: 'Retorno composto (%) da Zen 5.4, carteira simples 50/50 e CDI em cinco janelas do backtest.',
    cols: [
      { label: 'Recorte', num: false },
      { label: 'Zen 5.4', num: true },
      { label: 'Global 50/50', num: true },
      { label: 'CDI', num: true }
    ],
    getRows: () =>
      Object.values(windows).map((w) => [
        w.title,
        fmtSignedNum(w.values[0], 1),
        fmtSignedNum(w.values[1], 1),
        fmtSignedNum(w.values[2], 1)
      ])
  });

  const leadKicker = document.getElementById('limitsLeadKicker');
  const leadNum = document.getElementById('limitsLeadNum');
  const leadCap = document.getElementById('limitsLeadCap');

  function syncLead(key: string) {
    const w = windows[key];
    const [z, g, c] = w.values;
    live.textContent = `${w.title}: Zen 5.4 ${fmt(z, 1)} %, Global 50/50 ${fmt(g, 1)} %, CDI ${fmt(c, 1)} %.`;
    if (leadKicker && leadNum && leadCap) {
      leadKicker.textContent = `Zen 5.4 vs. Benchmarks · ${w.title}`;
      leadNum.textContent = fmtSignedNum(z, 1);
      leadCap.textContent = `na Zen 5.4 em ${w.title.toLowerCase()}, contra ${fmtSignedNum(g, 1)} da carteira 50/50 e ${fmtSignedNum(c, 1)} do CDI.`;
    }
  }
  syncLead('total');

  document.querySelectorAll('[data-limit-region]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-limit-region') === 'total'));
    btn.addEventListener(
      'click',
      () => {
        curKey = btn.getAttribute('data-limit-region') || 'total';
        document.querySelectorAll('[data-limit-region]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        bars.update(windows[curKey].values);
        syncLead(curKey);
        capApi.refreshTable();
      },
      { signal }
    );
  });

  return bars;
}

export function renderTrajectory(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const lineHost = document.getElementById('chart05a')!;
  const tlHost = document.getElementById('chart05b')!;
  const detailBox = document.getElementById('timelineDetail')!;

  const months = data.months;
  const n = months.length;

  // Pick genuine milestone indices dynamically from the parsed series
  const peakIdx = months.reduce((best, m, i) => (m.zen54Cum > months[best].zen54Cum ? i : best), 0);
  const worstMonthIdx = months.reduce((best, m, i) => (m.zen54 < months[best].zen54 ? i : best), 0);
  const bestMonthIdx = months.reduce((best, m, i) => (m.zen54 > months[best].zen54 ? i : best), 0);
  const idxMid = Math.min(n - 1, Math.floor(n * 0.35));
  const idxRec = Math.min(n - 1, months.findIndex((m) => m.mes === data.stats.zen54.recoveredMonth));

  const milestones = [
    {
      idx: 0,
      date: months[0].mes,
      short: 'Início',
      title: `Abertura da série alinhada (${months[0].mes})`,
      summary: `Início do backtest preliminar com os 9 instrumentos alinhados e rebalanceamento mensal. No primeiro mês, a Zen 5.4 rendeu ${fmtPct(months[0].zen54, 2)}.`,
      why: 'Garante janela idêntica para comparar Zen 5.4, Global 50/50, CDI, WRLD11 e Ibovespa sem viés de sobrevivência.'
    },
    {
      idx: Math.min(n - 1, 5),
      date: months[Math.min(n - 1, 5)].mes,
      short: 'Impulso 2024',
      title: `Expansão cambial e global (${months[Math.min(n - 1, 5)].mes})`,
      summary: `Acumulado da Zen 5.4 alcança ${fmtPct(months[Math.min(n - 1, 5)].zen54Cum, 1)} enquanto o Ibovespa operava em terreno negativo (${fmtPct(months[Math.min(n - 1, 5)].ibovCum, 1)}).`,
      why: 'Ilustra o papel dos 47 % em ações globais + 5 % em reservas cambiais protegendo o investidor brasileiro em ciclos locais fracos.'
    },
    {
      idx: bestMonthIdx,
      date: months[bestMonthIdx].mes,
      short: 'Melhor mês',
      title: `Maior alta mensal registrada (${months[bestMonthIdx].mes})`,
      summary: `Retorno mensal de ${fmtPct(months[bestMonthIdx].zen54, 2)}, impulsionado pela combinação de ações globais (${fmtPct(months[bestMonthIdx].assets.global_wrld11 || 0, 1)}) e criptoativos (${fmtPct(months[bestMonthIdx].assets.cripto_hash11 || 0, 1)}).`,
      why: 'Os 3 % em HASH11 contribuem positivamente nos ralis sem dominar a volatilidade total da carteira.'
    },
    {
      idx: worstMonthIdx,
      date: months[worstMonthIdx].mes,
      short: 'Vale DD',
      title: `Maior estresse mensal (${months[worstMonthIdx].mes})`,
      summary: `Recuo mensal de ${fmtPct(months[worstMonthIdx].zen54, 2)} levando o drawdown máximo acumulado a ${fmtPct(data.stats.zen54.maxDd, 2)} — menos da metade da queda máxima do Ibovespa (${fmtPct(data.stats.ibov.maxDd, 1)}).`,
      why: 'Os 45 % em renda fixa brasileira (CDI, IPCA+ e prefixados) amorteceram fortemente o recuo de WRLD11.'
    },
    {
      idx: idxRec >= 0 ? idxRec : idxMid,
      date: months[idxRec >= 0 ? idxRec : idxMid].mes,
      short: 'Recuperação',
      title: `Retomada de topo histórico (${months[idxRec >= 0 ? idxRec : idxMid].mes})`,
      summary: data.stats.zen54.recoveryMonths !== null
        ? `Carteira recuperou o pico anterior em apenas ${data.stats.zen54.recoveryMonths} meses após o topo de ${data.stats.zen54.peakMonth}.`
        : `Trajetória em fase de recuperação gradual após o pico de ${data.stats.zen54.peakMonth}.`,
      why: 'Drawdowns rasos exigem ganhos modestos para voltar ao zero a zero, preservando o efeito dos juros compostos.'
    },
    {
      idx: peakIdx === n - 1 ? n - 1 : n - 1,
      date: months[n - 1].mes,
      short: 'Fechamento',
      title: `Fechamento do recorte (${months[n - 1].mes})`,
      summary: `Acumulado final de ${fmtPct(months[n - 1].zen54Cum, 2)} (CAGR ${fmtPct(data.stats.zen54.cagr, 2, false)}) contra ${fmtPct(months[n - 1].cdiCum, 2)} do CDI e ${fmtPct(months[n - 1].ibovCum, 2)} do Ibovespa.`,
      why: 'Série pronta para receber novos meses continuamente via arquivo public/data/zen54_backtest.csv.'
    }
  ];

  // Deduplicate identical idx markers cleanly while keeping order
  const uniqueMilestones = milestones.filter((m, i, arr) => arr.findIndex((x) => x.idx === m.idx) === i);
  let activeEventIdx = Math.min(3, uniqueMilestones.length - 1);

  const lineSvg = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'regTitle regDesc'
  });
  lineSvg.appendChild(svg('title', { id: 'regTitle', text: 'Evolução acumulada da Carteira Zen 5.4' }));
  lineSvg.appendChild(svg('desc', { id: 'regDesc', text: 'Curva de retorno acumulado comparando Zen 5.4, CDI e Ibovespa mês a mês.' }));
  const gridG = svg('g');
  const pathG = svg('g');
  const marksG = svg('g');
  lineSvg.appendChild(gridG);
  lineSvg.appendChild(pathG);
  lineSvg.appendChild(marksG);
  lineHost.innerHTML = '';
  lineHost.appendChild(lineSvg);

  const tlSvg = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-label': 'Marcos históricos do backtest'
  });
  const tlMobileList = el('div', { class: 'tl-mobile-list', role: 'group', 'aria-label': 'Marcos históricos', hidden: '' });
  tlHost.innerHTML = '';
  tlHost.appendChild(tlSvg);
  tlHost.appendChild(tlMobileList);

  let zenPathEl: SVGPathElement | null = null;
  let zenPathLen = 1;
  let markerEls: Array<{ sq: SVGRectElement; lbl: SVGTextElement | null; frac: number }> = [];
  let tlButtons: SVGGElement[] = [];
  let tlMobileButtons: HTMLButtonElement[] = [];
  let scrollProgress = REDUCED_MOTION ? 1 : 0;

  function updateDraw() {
    if (!zenPathEl) return;
    const p = REDUCED_MOTION ? 1 : scrollProgress;
    zenPathEl.style.strokeDashoffset = String(zenPathLen * (1 - p));
    markerEls.forEach(({ sq, lbl, frac }) => {
      const vis = p >= frac - 0.04 ? '1' : '0';
      sq.style.opacity = vis;
      if (lbl) lbl.style.opacity = vis;
    });
  }

  function renderDetail(idx: number) {
    activeEventIdx = idx;
    const ev = uniqueMilestones[idx];
    detailBox.innerHTML = '';
    detailBox.appendChild(el('div', { class: 'timeline-detail-date', text: ev.date }));
    detailBox.appendChild(el('h3', { class: 'timeline-detail-title', text: ev.title }));
    detailBox.appendChild(el('p', { class: 'timeline-detail-body', text: ev.summary }));
    detailBox.appendChild(
      el('p', { class: 'timeline-detail-why' }, [
        el('strong', { text: 'Leitura estratégica: ' }),
        document.createTextNode(ev.why)
      ])
    );

    tlButtons.forEach((btn, i) => {
      const isAct = i === idx;
      btn.setAttribute('tabindex', isAct ? '0' : '-1');
      btn.setAttribute('aria-pressed', String(isAct));
      const r = btn.querySelector('rect[fill]:not([fill="transparent"])');
      if (r) r.setAttribute('fill', isAct ? 'var(--vermilion)' : 'var(--ink)');
    });
    tlMobileButtons.forEach((btn, i) => btn.setAttribute('aria-pressed', String(i === idx)));
  }

  function layout() {
    const w = Math.max(280, lineHost.clientWidth || 540);
    const h = 270;
    const padL = 44;
    const padR = w < 420 ? 54 : 64;
    const padT = 26;
    const padB = 34;

    const allCum = months.flatMap((m) => [m.zen54Cum * 100, m.cdiCum * 100, m.ibovCum * 100, 0]);
    const yMin = Math.floor(Math.min(...allCum) / 10) * 10;
    const yMax = Math.ceil(Math.max(...allCum) / 10) * 10;

    const xScale = scaleLinear(0, Math.max(1, n - 1), padL, w - padR);
    const yScale = scaleLinear(yMin, yMax, h - padB, padT);

    lineSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    gridG.innerHTML = '';
    pathG.innerHTML = '';
    marksG.innerHTML = '';
    markerEls = [];

    // Legend row at top left
    gridG.appendChild(svg('line', { x1: padL, y1: 10, x2: padL + 16, y2: 10, stroke: 'var(--violet)', 'stroke-width': 2.5 }));
    gridG.appendChild(svg('text', { x: padL + 22, y: 14, class: 'svg-micro', text: 'Zen 5.4' }));
    gridG.appendChild(svg('line', { x1: padL + 84, y1: 10, x2: padL + 100, y2: 10, stroke: 'var(--vermilion)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    gridG.appendChild(svg('text', { x: padL + 106, y: 14, class: 'svg-micro', text: 'CDI' }));
    gridG.appendChild(svg('line', { x1: padL + 144, y1: 10, x2: padL + 160, y2: 10, stroke: 'var(--ink-3)', 'stroke-width': 1.5 }));
    gridG.appendChild(svg('text', { x: padL + 166, y: 14, class: 'svg-micro', text: 'Ibovespa' }));

    for (let tick = yMin; tick <= yMax; tick += 15) {
      const y = yScale(tick);
      gridG.appendChild(
        svg('line', {
          x1: padL,
          y1: y,
          x2: w - padR,
          y2: y,
          stroke: tick === 0 ? 'var(--ink)' : 'var(--rule)',
          'stroke-width': tick === 0 ? 1.5 : 1
        })
      );
      gridG.appendChild(svg('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'svg-micro', text: `${tick}%` }));
    }

    const ibovD = months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(m.ibovCum * 100).toFixed(1)}`).join(' ');
    const cdiD = months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(m.cdiCum * 100).toFixed(1)}`).join(' ');
    const zenD = months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(m.zen54Cum * 100).toFixed(1)}`).join(' ');

    pathG.appendChild(svg('path', { d: ibovD, fill: 'none', stroke: 'var(--ink-3)', 'stroke-width': 1.5, opacity: 0.75 }));
    pathG.appendChild(svg('path', { d: cdiD, fill: 'none', stroke: 'var(--vermilion)', 'stroke-width': 1.75, 'stroke-dasharray': '4 3' }));

    zenPathEl = svg('path', { d: zenD, fill: 'none', stroke: 'var(--violet)', 'stroke-width': 2.5 });
    pathG.appendChild(zenPathEl);
    zenPathLen = zenPathEl.getTotalLength() || 1;
    zenPathEl.style.strokeDasharray = String(zenPathLen);

    // X-axis year ticks
    months.forEach((m, i) => {
      if (i === 0 || m.monthNum === 1 || i === n - 1) {
        if (i === n - 1 && m.monthNum <= 2) return;
        gridG.appendChild(
          svg('text', { x: xScale(i), y: h - 10, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', class: 'svg-micro', text: m.mes })
        );
      }
      if (i % 3 === 0 || i === n - 1) {
        const px = xScale(i);
        const py = yScale(m.zen54Cum * 100);
        const sq = svg('rect', {
          x: px - 3,
          y: py - 3,
          width: 6,
          height: 6,
          fill: 'var(--violet)',
          tabindex: 0,
          role: 'img',
          'aria-label': `${m.mes}: Zen 5.4 acumulado ${fmtPct(m.zen54Cum, 1)}`,
          style: 'cursor:pointer;transition:opacity 180ms var(--ease-out);'
        });
        const info = {
          cat: `${m.mes} · Acumulado`,
          val: `Zen ${fmtPct(m.zen54Cum, 1)}`,
          sub: `CDI ${fmtPct(m.cdiCum, 1)} · Ibov ${fmtPct(m.ibovCum, 1)}`
        };
        sq.addEventListener('pointerenter', (e) => tooltip.show(sq, info, e), { signal });
        sq.addEventListener('pointermove', (e) => tooltip.show(sq, info, e), { signal });
        sq.addEventListener('pointerleave', tooltip.hide, { signal });
        sq.addEventListener('focus', () => tooltip.show(sq, info), { signal });
        sq.addEventListener('blur', tooltip.hide, { signal });
        marksG.appendChild(sq);

        let lbl: SVGTextElement | null = null;
        if (i === n - 1) {
          lbl = svg('text', {
            x: px + 8,
            y: py + 5,
            style: `font-size:${w < 400 ? 15 : 18}px;font-weight:600;fill:var(--violet-ink);transition:opacity 200ms;`,
            text: fmtPct(m.zen54Cum, 1)
          });
          marksG.appendChild(lbl);
        }
        markerEls.push({ sq, lbl, frac: i / Math.max(1, n - 1) });
      }
    });

    // Timeline markers below
    const compactTl = w < 540;
    tlSvg.innerHTML = '';
    tlButtons = [];
    tlMobileList.innerHTML = '';
    tlMobileButtons = [];

    if (compactTl) {
      tlSvg.setAttribute('viewBox', `0 0 ${w} 34`);
      tlSvg.appendChild(svg('line', { x1: padL, y1: 16, x2: w - padR, y2: 16, stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      uniqueMilestones.forEach((ev, idx) => {
        const x = xScale(ev.idx);
        const gBtn = svg('g', {
          role: 'button',
          tabindex: idx === activeEventIdx ? 0 : -1,
          'aria-pressed': String(idx === activeEventIdx),
          'aria-label': `${ev.date}: ${ev.title}`,
          style: 'cursor:pointer;'
        });
        gBtn.appendChild(svg('rect', { x: x - 10, y: 4, width: 20, height: 24, fill: 'transparent' }));
        gBtn.appendChild(svg('rect', { x: x - 5, y: 11, width: 10, height: 10, fill: idx === activeEventIdx ? 'var(--vermilion)' : 'var(--ink)' }));
        gBtn.addEventListener('click', () => renderDetail(idx), { signal });
        gBtn.addEventListener('focus', () => renderDetail(idx), { signal });
        tlSvg.appendChild(gBtn);
        tlButtons.push(gBtn);

        const mBtn = el('button', { type: 'button', class: 'tl-mobile-btn', 'aria-pressed': String(idx === activeEventIdx) }, [
          el('span', { class: 'tl-mobile-sq', 'aria-hidden': 'true' }),
          el('span', { class: 'tl-mobile-date', text: ev.date }),
          el('span', { class: 'tl-mobile-title', text: ev.short })
        ]);
        mBtn.addEventListener('click', () => renderDetail(idx), { signal });
        tlMobileList.appendChild(mBtn);
        tlMobileButtons.push(mBtn);
      });
      tlMobileList.hidden = false;
    } else {
      tlMobileList.hidden = true;
      tlSvg.setAttribute('viewBox', `0 0 ${w} 138`);
      tlSvg.appendChild(svg('line', { x1: padL, y1: 18, x2: w - padR, y2: 18, stroke: 'var(--ink)', 'stroke-width': 1.5 }));

      uniqueMilestones.forEach((ev, idx) => {
        const x = xScale(ev.idx);
        const stack = idx % 2;
        const tickY = 18 + stack * 48;
        if (stack > 0) tlSvg.appendChild(svg('line', { x1: x, y1: 18, x2: x, y2: tickY, stroke: 'var(--rule)', 'stroke-width': 1 }));

        const gBtn = svg('g', {
          role: 'button',
          tabindex: idx === activeEventIdx ? 0 : -1,
          'aria-pressed': String(idx === activeEventIdx),
          'aria-label': `${ev.date}: ${ev.title}`,
          style: 'cursor:pointer;'
        });
        gBtn.appendChild(svg('rect', { x: x - 12, y: tickY - 12, width: 24, height: 24, fill: 'transparent' }));
        gBtn.appendChild(svg('rect', { x: x - 6, y: tickY - 6, width: 12, height: 12, fill: idx === activeEventIdx ? 'var(--vermilion)' : 'var(--ink)' }));

        const anchor = ev.idx >= n - 3 ? 'end' : ev.idx <= 2 ? 'start' : 'middle';
        const tx = anchor === 'start' ? x - 4 : anchor === 'end' ? x + 4 : x;
        gBtn.appendChild(svg('text', { x: tx, y: tickY + 20, 'text-anchor': anchor, class: 'svg-micro', text: ev.date }));
        gBtn.appendChild(svg('text', { x: tx, y: tickY + 34, 'text-anchor': anchor, style: 'font-size:11px;font-weight:500;fill:var(--ink);', text: ev.short }));

        gBtn.addEventListener('click', () => renderDetail(idx), { signal });
        gBtn.addEventListener('focus', () => renderDetail(idx), { signal });
        gBtn.addEventListener(
          'keydown',
          (e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              const next = (idx + 1) % tlButtons.length;
              renderDetail(next);
              tlButtons[next].focus();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const prev = (idx - 1 + tlButtons.length) % tlButtons.length;
              renderDetail(prev);
              tlButtons[prev].focus();
            }
          },
          { signal }
        );
        tlSvg.appendChild(gBtn);
        tlButtons.push(gBtn);
      });
    }

    updateDraw();
  }

  renderFigureCaption('cap05', {
    fig: 'FIG. 05',
    caption: 'Retorno acumulado composto (%) mês a mês: Zen 5.4, CDI e Ibovespa com marcos clicáveis.',
    cols: [
      { label: 'Mês', num: false },
      { label: 'Zen 5.4 Acum.', num: true },
      { label: 'CDI Acum.', num: true },
      { label: 'Ibovespa Acum.', num: true }
    ],
    rows: months.map((m) => [m.mes, fmtPct(m.zen54Cum, 2), fmtPct(m.cdiCum, 2), fmtPct(m.ibovCum, 2)])
  });

  const ro = new ResizeObserver(() => requestAnimationFrame(layout));
  ro.observe(lineHost);
  cleanups.push(() => ro.disconnect());
  layout();
  renderDetail(activeEventIdx);

  return {
    onScroll: (secEl: HTMLElement) => {
      if (REDUCED_MOTION) return;
      const r = secEl.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const start = vh * 0.85;
      const end = vh * 0.35;
      const next = Math.max(0, Math.min(1, (start - r.top) / (start - end)));
      if (Math.abs(next - scrollProgress) > 0.004) {
        scrollProgress = next;
        updateDraw();
      }
    }
  };
}
