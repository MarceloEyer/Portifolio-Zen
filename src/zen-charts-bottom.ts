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

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function renderMacroColumns(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const host = document.getElementById('chart06')!;
  const legendHost = document.getElementById('volumeLegend')!;
  legendHost.innerHTML = '';

  const series = [
    { key: 'global', label: 'Ações Globais (47%)', color: 'var(--violet)' },
    { key: 'rfBr', label: 'Renda Fixa BR (45%)', color: 'var(--vermilion)' },
    { key: 'fxReserves', label: 'Reservas USD/EUR (5%)', color: 'var(--magenta)' },
    { key: 'crypto', label: 'Cripto HASH11 (3%)', color: 'var(--ink)' }
  ] as const;

  type SeriesKey = (typeof series)[number]['key'];
  const years = data.macroYears;
  const activeKeys = new Set<SeriesKey>(series.map((s) => s.key));
  let mode: 'abs' | 'share' = 'abs';
  let stepHighlight = 0;
  let revealed = REDUCED_MOTION;

  series.forEach((s) => {
    const chip = el('button', { type: 'button', class: 'legend-chip', 'aria-pressed': 'true', 'data-series': s.key }, [
      el('span', { class: 'legend-swatch', style: `background:${s.color};` }),
      el('span', { text: s.label })
    ]);
    chip.addEventListener(
      'click',
      () => {
        if (activeKeys.has(s.key) && activeKeys.size === 1) return;
        if (activeKeys.has(s.key)) activeKeys.delete(s.key);
        else activeKeys.add(s.key);
        chip.setAttribute('aria-pressed', String(activeKeys.has(s.key)));
        layout();
        capApi.refreshTable();
      },
      { signal }
    );
    legendHost.appendChild(chip);
  });

  const svgEl = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'volTitle volDesc'
  });
  svgEl.appendChild(svg('title', { id: 'volTitle', text: 'Contribuição anual por macroclasse da Zen 5.4' }));
  svgEl.appendChild(
    svg('desc', { id: 'volDesc', text: 'Colunas empilhadas de contribuição ponderada em pontos percentuais por macroclasse.' })
  );

  const defs = svg('defs');
  series.forEach((s) => {
    const pat = svg('pattern', {
      id: `hatch-vol-${s.key}`,
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)'
    });
    pat.appendChild(svg('rect', { width: 6, height: 6, fill: 'var(--paper)' }));
    pat.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: s.color, 'stroke-width': 2 }));
    defs.appendChild(pat);
  });
  const patNeut = svg('pattern', {
    id: 'hatch-vol-neutral',
    width: 6,
    height: 6,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)'
  });
  patNeut.appendChild(svg('rect', { width: 6, height: 6, fill: 'var(--paper)' }));
  patNeut.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--neutral-data)', 'stroke-width': 2 }));
  defs.appendChild(patNeut);

  svgEl.appendChild(defs);
  const gridG = svg('g');
  const colsG = svg('g');
  const crosshair = svg('line', {
    y1: 24,
    y2: 316,
    stroke: 'var(--ink)',
    'stroke-width': 1,
    'stroke-dasharray': '3 3',
    style: 'opacity:0;pointer-events:none;'
  });
  svgEl.appendChild(gridG);
  svgEl.appendChild(colsG);
  svgEl.appendChild(crosshair);
  host.innerHTML = '';
  host.appendChild(svgEl);

  const capApi = renderFigureCaption('cap06', {
    fig: 'FIG. 06',
    caption: 'Contribuição bruta aproximada por macroclasse (soma ponderada dos retornos mensais em p.p.). Períodos parciais aparecem hachurados.',
    cols: [
      { label: 'Ano', num: false },
      ...series.map((s) => ({ label: s.label, num: true })),
      { label: 'Soma Bruta (pp)', num: true }
    ],
    getRows: () =>
      years.map((yr) => {
        const sum = series.filter((s) => activeKeys.has(s.key)).reduce((a, s) => a + yr[s.key], 0);
        return [
          yr.label,
          ...series.map((s) => (activeKeys.has(s.key) ? fmtSignedNum(yr[s.key], 1, ' pp') : '—')),
          fmtSignedNum(sum, 1, ' pp')
        ];
      })
  });

  function isSeriesHighlighted(key: SeriesKey) {
    if (stepHighlight === 0) return key === 'global';
    if (stepHighlight === 1) return key === 'rfBr';
    return true;
  }

  let colHits: SVGRectElement[] = [];

  function layout() {
    const w = Math.max(280, host.clientWidth || 540);
    const h = 350;
    const padL = 52;
    const padR = 16;
    const padT = 32;
    const padB = 46;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    gridG.innerHTML = '';
    colsG.innerHTML = '';
    colHits = [];
    crosshair.setAttribute('y1', String(padT));
    crosshair.setAttribute('y2', String(padT + plotH));

    let minY = 0;
    let maxY = 100;
    if (mode === 'abs') {
      const posMaxes = years.map((yr) =>
        series.filter((s) => activeKeys.has(s.key) && yr[s.key] > 0).reduce((a, s) => a + yr[s.key], 0)
      );
      const negMins = years.map((yr) =>
        series.filter((s) => activeKeys.has(s.key) && yr[s.key] < 0).reduce((a, s) => a + yr[s.key], 0)
      );
      maxY = Math.max(10, Math.ceil(Math.max(...posMaxes, 10) / 5) * 5);
      minY = Math.min(0, Math.floor(Math.min(...negMins, 0) / 5) * 5);
    }

    const yScale = scaleLinear(minY, maxY, padT + plotH, padT);
    const ticks = mode === 'share' ? [0, 25, 50, 75, 100] : [minY, 0, Math.round(maxY / 2), maxY].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

    ticks.forEach((t) => {
      const y = yScale(t);
      gridG.appendChild(
        svg('line', {
          x1: padL,
          y1: y,
          x2: w - padR,
          y2: y,
          stroke: t === 0 ? 'var(--ink)' : 'var(--rule)',
          'stroke-width': t === 0 ? 1.5 : 1
        })
      );
      gridG.appendChild(
        svg('text', {
          x: padL - 8,
          y: y + 4,
          'text-anchor': 'end',
          class: 'svg-micro',
          text: mode === 'share' ? `${t}%` : `${t} pp`
        })
      );
    });

    const slotW = plotW / years.length;
    const barW = Math.max(36, Math.min(72, slotW * 0.56));
    const zeroY = yScale(0);

    years.forEach((yr, idx) => {
      const cx = padL + slotW * idx + slotW / 2;
      const x = cx - barW / 2;
      const activeNet = series.filter((s) => activeKeys.has(s.key)).reduce((a, s) => a + yr[s.key], 0);
      const absTotal = series.filter((s) => activeKeys.has(s.key)).reduce((a, s) => a + Math.abs(yr[s.key]), 0) || 1;

      const colGroup = svg('g', {
        style: `transform-origin:${cx}px ${zeroY}px;transform:scaleY(${revealed ? 1 : 0});transition:transform var(--d-3) var(--ease-out);transition-delay:${REDUCED_MOTION ? 0 : idx * 65}ms;`
      });

      let posAcc = 0;
      let negAcc = 0;

      series.forEach((s) => {
        if (!activeKeys.has(s.key)) return;
        const raw = yr[s.key];
        if (Math.abs(raw) < 0.01) return;
        const val = mode === 'share' ? (Math.abs(raw) / absTotal) * 100 : raw;
        const hi = isSeriesHighlighted(s.key);
        const fill = yr.partial
          ? hi
            ? `url(#hatch-vol-${s.key})`
            : 'url(#hatch-vol-neutral)'
          : hi
            ? s.color
            : 'var(--neutral-data)';

        let yTop: number;
        let yBot: number;
        if (mode === 'share' || val >= 0) {
          yTop = yScale(posAcc + Math.abs(val));
          yBot = yScale(posAcc);
          posAcc += Math.abs(val);
        } else {
          yTop = yScale(negAcc);
          yBot = yScale(negAcc + val);
          negAcc += val;
        }
        colGroup.appendChild(
          svg('rect', {
            x,
            y: yTop,
            width: barW,
            height: Math.max(1, yBot - yTop),
            fill,
            stroke: yr.partial ? (hi ? s.color : 'var(--neutral-data)') : 'none',
            'stroke-width': yr.partial ? 1 : 0
          })
        );
      });

      colsG.appendChild(colGroup);

      const topVal = mode === 'share' ? 100 : posAcc;
      colsG.appendChild(
        svg('text', {
          x: cx,
          y: yScale(topVal) - 8,
          'text-anchor': 'middle',
          class: 'svg-label',
          style: 'font-size:12px;',
          text: mode === 'share' ? '100%' : fmtSignedNum(activeNet, 1, ' pp')
        })
      );

      colsG.appendChild(svg('text', { x: cx, y: padT + plotH + 18, 'text-anchor': 'middle', class: 'svg-micro', text: yr.label }));
      if (yr.partial) {
        colsG.appendChild(svg('text', { x: cx, y: padT + plotH + 32, 'text-anchor': 'middle', class: 'svg-micro', style: 'fill:var(--violet-ink);', text: 'parcial' }));
      }

      const hit = svg('rect', {
        x: padL + slotW * idx,
        y: padT,
        width: slotW,
        height: plotH,
        fill: 'transparent',
        tabindex: 0,
        role: 'img',
        'aria-label': `${yr.label}: soma ponderada ${fmtSignedNum(activeNet, 1, ' pp')}`,
        style: 'cursor:pointer;'
      });
      const info = {
        cat: `${yr.label}${yr.partial ? ' (parcial)' : ''}`,
        val: `Soma bruta ${fmtSignedNum(activeNet, 1, ' pp')}`,
        sub: series.filter((s) => activeKeys.has(s.key)).map((s) => `${s.label.split(' (')[0]}: ${fmtSignedNum(yr[s.key], 1, ' pp')}`).join(' | ')
      };
      hit.addEventListener(
        'pointerenter',
        (e) => {
          crosshair.setAttribute('x1', String(cx));
          crosshair.setAttribute('x2', String(cx));
          crosshair.style.opacity = '1';
          tooltip.show(hit, info, e);
        },
        { signal }
      );
      hit.addEventListener('pointermove', (e) => tooltip.show(hit, info, e), { signal });
      hit.addEventListener(
        'pointerleave',
        () => {
          crosshair.style.opacity = '0';
          tooltip.hide();
        },
        { signal }
      );
      hit.addEventListener(
        'focus',
        () => {
          crosshair.setAttribute('x1', String(cx));
          crosshair.setAttribute('x2', String(cx));
          crosshair.style.opacity = '1';
          tooltip.show(hit, info);
        },
        { signal }
      );
      hit.addEventListener(
        'blur',
        () => {
          crosshair.style.opacity = '0';
          tooltip.hide();
        },
        { signal }
      );
      hit.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            colHits[(idx + 1) % colHits.length].focus();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            colHits[(idx - 1 + colHits.length) % colHits.length].focus();
          }
        },
        { signal }
      );
      colsG.appendChild(hit);
      colHits.push(hit);
    });
  }

  document.querySelectorAll('[data-vol-mode]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-vol-mode') === 'abs'));
    btn.addEventListener(
      'click',
      () => {
        mode = btn.getAttribute('data-vol-mode') as typeof mode;
        document.querySelectorAll('[data-vol-mode]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        layout();
      },
      { signal }
    );
  });

  const stepBtns = Array.from(document.querySelectorAll<HTMLElement>('.scrolly-step'));
  const mobileTabs = Array.from(document.querySelectorAll<HTMLElement>('[data-step-tab]'));

  function setStep(idx: number) {
    stepHighlight = idx;
    stepBtns.forEach((b, i) => {
      b.classList.toggle('is-active', i === idx);
      b.setAttribute('aria-pressed', String(i === idx));
    });
    mobileTabs.forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
    layout();
  }

  stepBtns.forEach((b, i) => {
    b.addEventListener(
      'click',
      () => {
        setStep(i);
        if (window.innerWidth >= 1024) {
          b.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
        }
      },
      { signal }
    );
  });
  mobileTabs.forEach((b, i) => b.addEventListener('click', () => setStep(i), { signal }));

  const stepIO = new IntersectionObserver(
    (entries) => {
      if (window.innerWidth < 768) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-step') || '', 10);
          if (!Number.isNaN(idx)) setStep(idx);
        }
      });
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );
  stepBtns.forEach((b) => stepIO.observe(b));
  cleanups.push(() => stepIO.disconnect());

  const ro = new ResizeObserver(() => requestAnimationFrame(layout));
  ro.observe(host);
  cleanups.push(() => ro.disconnect());
  layout();

  return {
    reveal: () => {
      revealed = true;
      layout();
    }
  };
}

export function renderMonthlyHeatmap(data: ZenParsedData, tooltip: TooltipController, signal: AbortSignal) {
  const host = document.getElementById('chart07')!;
  const slider = document.getElementById('hmThreshold') as HTMLInputElement;
  const threshValEl = document.getElementById('hmThresholdVal')!;
  const liveCount = document.getElementById('hmLiveCount')!;

  let seriesKey: 'zen54' | 'global50' | 'wrld11' | 'ibov' | 'cdi' = 'zen54';
  let threshold = -10;
  slider.value = '-10';
  threshValEl.textContent = fmt(-10, 1);

  const seriesMeta = {
    zen54: { label: 'Carteira Zen 5.4', getter: (m: ZenParsedData['months'][0]) => m.zen54 * 100 },
    global50: { label: 'Global 50% / CDI 50%', getter: (m: ZenParsedData['months'][0]) => m.global50 * 100 },
    wrld11: { label: 'Global WRLD11', getter: (m: ZenParsedData['months'][0]) => (m.assets.global_wrld11 || 0) * 100 },
    ibov: { label: 'Ibovespa (BOVA11)', getter: (m: ZenParsedData['months'][0]) => m.ibov * 100 },
    cdi: { label: 'CDI / DI', getter: (m: ZenParsedData['months'][0]) => (m.assets.cdi_di || 0) * 100 }
  };

  function binStyle(pct: number) {
    if (pct < -2.0) return { bg: 'var(--vermilion)', fg: 'var(--on-vermilion)' };
    if (pct < 0) return { bg: 'var(--vermilion-tint)', fg: 'var(--ink)' };
    if (pct < 1.0) return { bg: 'var(--violet-100)', fg: 'var(--ink)' };
    if (pct < 2.5) return { bg: 'var(--violet-300)', fg: 'var(--ink)' };
    if (pct < 4.0) return { bg: 'var(--violet-500)', fg: 'var(--white)' };
    return { bg: 'var(--violet-600)', fg: 'var(--white)' };
  }

  function buildYearRows() {
    const getter = seriesMeta[seriesKey].getter;
    return data.yearsList.map((yr) => {
      const cells: Array<number | null> = new Array(12).fill(null);
      let wealth = 1;
      data.months
        .filter((m) => m.year === yr)
        .forEach((m) => {
          const pct = getter(m);
          cells[m.monthNum - 1] = pct;
          wealth *= 1 + pct / 100;
        });
      return { yr, cells, annual: (wealth - 1) * 100 };
    });
  }

  const capApi = renderFigureCaption('cap07', {
    fig: 'FIG. 07',
    caption: 'Matriz mensal calendário estilo lâmina de fundo. Alterne a série acima ou filtre meses pelo controle deslizante.',
    cols: [{ label: 'Ano', num: false }, ...MONTH_NAMES.map((m) => ({ label: m, num: true })), { label: 'Ano Composto', num: true }],
    getRows: () =>
      buildYearRows().map((r) => [
        r.yr,
        ...r.cells.map((v) => (v === null ? '—' : fmtSignedNum(v, 2, '%'))),
        fmtSignedNum(r.annual, 2, '%')
      ])
  });

  function draw() {
    const rows = buildYearRows();
    const scrollWrap = el('div', { class: 'heatmap-scroll' });
    const table = el('table', {
      class: 'heatmap-table',
      role: 'grid',
      'aria-label': `Matriz mensal de retornos: ${seriesMeta[seriesKey].label}`
    });

    const thead = el(
      'thead',
      {},
      el('tr', {}, [
        el('th', { class: 'hm-sector-col', scope: 'col', text: 'Ano' }),
        ...MONTH_NAMES.map((m) => el('th', { scope: 'col', text: m })),
        el('th', { scope: 'col', class: 'hm-global-col', text: 'Ano' })
      ])
    );

    const cellMatrix: Array<Array<HTMLButtonElement | null>> = [];
    const tbody = el(
      'tbody',
      {},
      rows.map((r, rIdx) => {
        const rowBtns: Array<HTMLButtonElement | null> = [];
        const tr = el('tr', {}, [
          el('th', { scope: 'row', class: 'hm-row-label', text: r.yr }),
          ...r.cells.map((v, cIdx) => {
            if (v === null) {
              rowBtns.push(null);
              return el('td', {}, el('span', { class: 'hm-cell-empty', text: '—', 'aria-hidden': 'true' }));
            }
            const st = binStyle(v);
            const btn = el('button', {
              type: 'button',
              class: `hm-cell-btn${v < threshold ? ' is-below' : ''}`,
              'data-val': String(v),
              style: `background:${st.bg};color:${st.fg};`,
              tabindex: rIdx === 0 && cIdx === 0 ? '0' : '-1',
              'aria-label': `${MONTH_NAMES[cIdx]} de ${r.yr} (${seriesMeta[seriesKey].label}): ${fmtSignedNum(v, 2)}`,
              text: `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 1)}`
            });
            const info = {
              cat: `${MONTH_NAMES[cIdx]} ${r.yr} · ${seriesMeta[seriesKey].label}`,
              val: fmtSignedNum(v, 2),
              sub: `Fechamento composto de ${r.yr}: ${fmtSignedNum(r.annual, 2)}`
            };
            btn.addEventListener('pointerenter', (e) => tooltip.show(btn, info, e), { signal });
            btn.addEventListener('pointermove', (e) => tooltip.show(btn, info, e), { signal });
            btn.addEventListener('pointerleave', tooltip.hide, { signal });
            btn.addEventListener('focus', () => tooltip.show(btn, info), { signal });
            btn.addEventListener('blur', tooltip.hide, { signal });
            btn.addEventListener(
              'keydown',
              (e) => {
                let nr = rIdx;
                let nc = cIdx;
                if (e.key === 'ArrowRight') nc = Math.min(11, cIdx + 1);
                else if (e.key === 'ArrowLeft') nc = Math.max(0, cIdx - 1);
                else if (e.key === 'ArrowDown') nr = Math.min(rows.length - 1, rIdx + 1);
                else if (e.key === 'ArrowUp') nr = Math.max(0, rIdx - 1);
                else return;
                const cand = cellMatrix[nr]?.[nc];
                if (!cand) return;
                e.preventDefault();
                btn.setAttribute('tabindex', '-1');
                cand.setAttribute('tabindex', '0');
                cand.focus();
              },
              { signal }
            );
            rowBtns.push(btn);
            return el('td', {}, btn);
          }),
          el(
            'td',
            {
              class: 'hm-global-col is-num',
              style: `font-weight:600;color:${r.annual >= 0 ? 'var(--violet-ink)' : 'var(--vermilion-ink)'};`,
              text: fmtSignedNum(r.annual, 1)
            }
          )
        ]);
        cellMatrix.push(rowBtns);
        return tr;
      })
    );

    table.appendChild(thead);
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    host.innerHTML = '';
    host.appendChild(scrollWrap);
    host.appendChild(el('p', { class: 'mono-meta hm-mobile-cue', text: 'Deslize lateralmente para ver os 12 meses →' }));
    updateThresholdCount();
  }

  function updateThresholdCount() {
    let count = 0;
    const btns = host.querySelectorAll<HTMLButtonElement>('.hm-cell-btn');
    btns.forEach((b) => {
      const val = parseFloat(b.getAttribute('data-val') || '0');
      const pass = val >= threshold;
      b.classList.toggle('is-below', !pass);
      if (pass) count++;
    });
    liveCount.textContent = `${count} de ${btns.length} meses`;
  }

  slider.addEventListener(
    'input',
    () => {
      threshold = parseFloat(slider.value);
      threshValEl.textContent = `${threshold < 0 ? '−' : ''}${fmt(Math.abs(threshold), 1)}`;
      updateThresholdCount();
    },
    { signal }
  );

  document.querySelectorAll('[data-hm-series]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-hm-series') === 'zen54'));
    btn.addEventListener(
      'click',
      () => {
        seriesKey = btn.getAttribute('data-hm-series') as typeof seriesKey;
        document.querySelectorAll('[data-hm-series]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        draw();
        capApi.refreshTable();
      },
      { signal }
    );
  });

  draw();
}

export function renderConsistencyWaffle(data: ZenParsedData, tooltip: TooltipController, signal: AbortSignal) {
  const host = document.getElementById('chart08a')!;
  const statHost = document.getElementById('waffleRotStat')!;
  const statTextEl = document.getElementById('waffleStatText')!;
  const total = data.consistency.total;

  const modes: Record<string, { winCount: number; desc: string }> = {
    Positivos: {
      winCount: data.consistency.positive,
      desc: `% dos ${total} meses encerraram no campo positivo para a Zen 5.4`
    },
    'Vs CDI': {
      winCount: data.consistency.beatCdi,
      desc: `% dos ${total} meses a Zen 5.4 superou o CDI mensal`
    },
    'Vs Ibov': {
      winCount: data.consistency.beatIbov,
      desc: `% dos ${total} meses a Zen 5.4 bateu o Ibovespa`
    },
    'Vs Global50': {
      winCount: data.consistency.beatGlobal50,
      desc: `% dos ${total} meses a Zen 5.4 superou a carteira 50/50`
    }
  };

  let segment = 'Positivos';
  let statControl: { anchor: HTMLElement; numText: HTMLElement } | null = null;

  function renderStat(val: number) {
    if (!statControl) {
      const anchor = el('div', { class: 'rot-num-anchor' });
      const numText = el('span', { class: 'rot-num-text is-active', text: String(val) });
      anchor.appendChild(numText);
      statHost.innerHTML = '';
      statHost.appendChild(anchor);
      statControl = { anchor, numText };
    } else {
      const newStr = String(val);
      if (statControl.numText.textContent === newStr) return;
      if (REDUCED_MOTION) {
        statControl.numText.textContent = newStr;
        return;
      }
      const oldEl = statControl.numText;
      oldEl.classList.remove('is-active');
      oldEl.classList.add('is-exiting');
      const fresh = el('span', { class: 'rot-num-text is-entering', text: newStr });
      statControl.anchor.appendChild(fresh);
      void fresh.offsetWidth;
      fresh.classList.remove('is-entering');
      fresh.classList.add('is-active');
      statControl.numText = fresh;
      window.setTimeout(() => {
        if (oldEl.parentNode === statControl?.anchor) oldEl.remove();
      }, 620);
    }
  }

  const svgEl = svg('svg', {
    style: 'width:100%;max-width:250px;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'waffleTitle waffleDesc'
  });
  svgEl.appendChild(svg('title', { id: 'waffleTitle', text: 'Waffle de consistência mensal 10x10' }));
  svgEl.appendChild(svg('desc', { id: 'waffleDesc', text: 'Proporção de meses positivos ou vencedores da Zen 5.4 em 100 blocos equivalentes.' }));

  const cellsG = svg('g');
  const hitG = svg('g');
  svgEl.appendChild(cellsG);
  svgEl.appendChild(hitG);
  const legendDiv = el('div', { class: 'hm-ramp' });
  host.innerHTML = '';
  host.appendChild(svgEl);
  host.appendChild(legendDiv);

  const cellSize = 20;
  const gap = 4;
  const step = cellSize + gap;
  const gridSize = 10 * step - gap;
  svgEl.setAttribute('viewBox', `0 0 ${gridSize} ${gridSize}`);

  const cells: SVGRectElement[] = [];
  for (let c = 0; c < 10; c++) {
    for (let r = 0; r < 10; r++) {
      const rect = svg('rect', {
        x: c * step,
        y: (9 - r) * step,
        width: cellSize,
        height: cellSize,
        fill: 'none',
        stroke: 'var(--ink-3)',
        'stroke-width': 1,
        style: 'transition:fill 120ms linear, stroke 120ms linear;'
      });
      cellsG.appendChild(rect);
      cells.push(rect);
    }
  }

  const capApi = renderFigureCaption('cap08a', {
    fig: 'FIG. 08A',
    caption: 'Frequência mensal de consistência da Carteira Zen 5.4 convertida para escala de 100 blocos.',
    cols: [
      { label: 'Critério', num: false },
      { label: 'Meses Vencedores', num: true },
      { label: 'Taxa (%)', num: true }
    ],
    rows: Object.entries(modes).map(([k, m]) => [k, `${m.winCount} / ${total}`, `${fmt((m.winCount / total) * 100, 1)} %`])
  });

  function applySegment(animateSeq = false) {
    const m = modes[segment];
    const pctRound = Math.round((m.winCount / total) * 100);
    renderStat(pctRound);
    statTextEl.textContent = m.desc;

    cells.forEach((rect, idx) => {
      const delay = animateSeq && !REDUCED_MOTION ? idx * 5 : 0;
      const run = () => {
        if (idx < pctRound) {
          rect.setAttribute('fill', 'var(--violet)');
          rect.setAttribute('stroke', 'var(--violet)');
        } else {
          rect.setAttribute('fill', 'var(--paper)');
          rect.setAttribute('stroke', 'var(--ink-3)');
        }
      };
      if (delay > 0) window.setTimeout(run, delay);
      else run();
    });

    hitG.innerHTML = '';
    const summaryHit = svg('rect', {
      x: 0,
      y: 0,
      width: gridSize,
      height: gridSize,
      fill: 'transparent',
      tabindex: 0,
      role: 'img',
      'aria-label': `${segment}: ${m.winCount} de ${total} meses (${pctRound}%)`,
      style: 'cursor:pointer;'
    });
    const info = {
      cat: `Consistência · ${segment}`,
      val: `${pctRound} % (${m.winCount}/${total})`,
      sub: `${total - m.winCount} meses abaixo do critério`
    };
    summaryHit.addEventListener('pointerenter', (e) => tooltip.show(summaryHit, info, e), { signal });
    summaryHit.addEventListener('pointermove', (e) => tooltip.show(summaryHit, info, e), { signal });
    summaryHit.addEventListener('pointerleave', tooltip.hide, { signal });
    summaryHit.addEventListener('focus', () => tooltip.show(summaryHit, info), { signal });
    summaryHit.addEventListener('blur', tooltip.hide, { signal });
    hitG.appendChild(summaryHit);

    legendDiv.innerHTML = '';
    legendDiv.appendChild(
      el('span', { class: 'hm-ramp-item' }, [
        el('span', { class: 'hm-ramp-box', style: 'background:var(--violet);border:1px solid var(--violet);width:12px;height:12px;' }),
        document.createTextNode(`Favorável ${m.winCount} meses`)
      ])
    );
    legendDiv.appendChild(
      el('span', { class: 'hm-ramp-item' }, [
        el('span', { class: 'hm-ramp-box', style: 'background:var(--paper);border:1px solid var(--ink-3);width:12px;height:12px;' }),
        document.createTextNode(`Demais ${total - m.winCount} meses`)
      ])
    );
  }

  document.querySelectorAll('[data-waffle-seg]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-waffle-seg') === 'Positivos'));
    btn.addEventListener(
      'click',
      () => {
        segment = btn.getAttribute('data-waffle-seg') || 'Positivos';
        document.querySelectorAll('[data-waffle-seg]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        applySegment(true);
        capApi.refreshTable();
      },
      { signal }
    );
  });

  applySegment(false);
}

export function renderAssetSpreadBars(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const host = document.getElementById('chart08b')!;
  let sortMode: 'original' | 'spread' = 'original';
  let revealed = REDUCED_MOTION;

  const svgEl = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'likertTitle likertDesc'
  });
  svgEl.appendChild(svg('title', { id: 'likertTitle', text: 'Amplitude mensal por instrumento da Zen 5.4' }));
  svgEl.appendChild(svg('desc', { id: 'likertDesc', text: 'Barras divergentes do pior ao melhor mês para cada instrumento.' }));

  const rowsG = svg('g');
  svgEl.appendChild(rowsG);
  const legendDiv = el('div', { class: 'hm-ramp', style: 'margin-top:0;margin-bottom:var(--s-3);' }, [
    el('span', { class: 'hm-ramp-item' }, [el('span', { class: 'hm-ramp-box', style: 'background:var(--vermilion);' }), document.createTextNode('Pior mês (%)')]),
    el('span', { class: 'hm-ramp-item' }, [el('span', { class: 'hm-ramp-box', style: 'background:var(--violet);' }), document.createTextNode('Melhor mês (%)')])
  ]);
  host.innerHTML = '';
  host.appendChild(legendDiv);
  host.appendChild(svgEl);

  function getSorted() {
    const list = [...data.assetExtremes];
    if (sortMode === 'spread') list.sort((a, b) => a.span - b.span);
    return list;
  }

  const capApi = renderFigureCaption('cap08b', {
    fig: 'FIG. 08B',
    caption: 'Pior mês, melhor mês e retorno composto individual dos 9 instrumentos, Zen 5.4 e Ibovespa.',
    cols: [
      { label: 'Instrumento / Índice', num: false },
      { label: 'Pior Mês', num: true },
      { label: 'Melhor Mês', num: true },
      { label: 'Acumulado', num: true }
    ],
    getRows: () =>
      getSorted().map((d) => [
        d.label,
        `${fmtSignedNum(d.minVal, 1)} (${d.minMonth})`,
        `${fmtSignedNum(d.maxVal, 1)} (${d.maxMonth})`,
        fmtSignedNum(d.cum, 1)
      ])
  });

  const maxAbs = Math.max(
    10,
    ...data.assetExtremes.map((a) => Math.max(Math.abs(a.minVal), Math.abs(a.maxVal)))
  );

  function layout() {
    const w = Math.max(280, host.clientWidth || 540);
    const isCompact = w < 460;
    const rows = getSorted();
    const labelW = isCompact ? 0 : 176;
    const sidePad = 48;
    const chartL = labelW + sidePad;
    const chartR = w - sidePad;
    const chartW = Math.max(120, chartR - chartL);
    const cx = chartL + chartW / 2;
    const pxPerPct = (chartW / 2) / (Math.ceil(maxAbs / 5) * 5);
    const rH = isCompact ? 46 : 30;
    const totalH = rows.length * rH + 14;

    svgEl.setAttribute('viewBox', `0 0 ${w} ${totalH}`);
    rowsG.innerHTML = '';

    rows.forEach((row, rIdx) => {
      const yTop = rIdx * rH + 4;
      const barY = isCompact ? yTop + 18 : yTop + 4;
      const barH = 18;

      rowsG.appendChild(
        svg('text', {
          x: 0,
          y: isCompact ? yTop + 12 : barY + 13,
          class: 'svg-label',
          style: `font-size:12px;${row.key === 'zen54' ? 'font-weight:600;fill:var(--violet-ink);' : ''}`,
          text: row.label
        })
      );

      const negW = Math.max(0, -row.minVal) * pxPerPct;
      const posW = Math.max(0, row.maxVal) * pxPerPct;
      const group = svg('g', {
        style: `transform-origin:${cx}px ${barY + barH / 2}px;transform:scaleX(${revealed ? 1 : 0});transition:transform var(--d-3) var(--ease-out);transition-delay:${REDUCED_MOTION ? 0 : rIdx * 35}ms;`
      });

      if (negW > 0) {
        group.appendChild(svg('rect', { x: cx - negW, y: barY, width: negW, height: barH, fill: 'var(--vermilion)' }));
      }
      if (posW > 0) {
        const posX = row.minVal > 0 ? cx + row.minVal * pxPerPct : cx;
        const wAdj = row.minVal > 0 ? (row.maxVal - row.minVal) * pxPerPct : posW;
        group.appendChild(svg('rect', { x: posX, y: barY, width: Math.max(2, wAdj), height: barH, fill: 'var(--violet)' }));
      }

      const hit = svg('rect', {
        x: chartL - 20,
        y: barY - 2,
        width: chartW + 40,
        height: barH + 4,
        fill: 'transparent',
        tabindex: 0,
        role: 'img',
        'aria-label': `${row.label}: pior mês ${fmtSignedNum(row.minVal, 1)} em ${row.minMonth}, melhor mês ${fmtSignedNum(row.maxVal, 1)} em ${row.maxMonth}`,
        style: 'cursor:pointer;'
      });
      const info = {
        cat: row.label,
        val: `${fmtSignedNum(row.minVal, 1)} a ${fmtSignedNum(row.maxVal, 1)}`,
        sub: `Pior em ${row.minMonth} · Melhor em ${row.maxMonth} · Acumulado ${fmtSignedNum(row.cum, 1)}`
      };
      hit.addEventListener('pointerenter', (e) => tooltip.show(hit, info, e), { signal });
      hit.addEventListener('pointermove', (e) => tooltip.show(hit, info, e), { signal });
      hit.addEventListener('pointerleave', tooltip.hide, { signal });
      hit.addEventListener('focus', () => tooltip.show(hit, info), { signal });
      hit.addEventListener('blur', tooltip.hide, { signal });

      rowsG.appendChild(group);
      rowsG.appendChild(svg('line', { x1: cx, x2: cx, y1: barY - 2, y2: barY + barH + 2, stroke: 'var(--ink)', 'stroke-width': 1.5, style: 'pointer-events:none;' }));
      rowsG.appendChild(svg('text', { x: cx - negW - 5, y: barY + 13, 'text-anchor': 'end', class: 'svg-micro', style: 'fill:var(--vermilion-ink);', text: fmtSignedNum(row.minVal, 1, '%') }));
      rowsG.appendChild(svg('text', { x: cx + posW + 5, y: barY + 13, 'text-anchor': 'start', class: 'svg-micro', style: 'fill:var(--violet-ink);', text: fmtSignedNum(row.maxVal, 1, '%') }));
      rowsG.appendChild(hit);
    });
  }

  document.querySelectorAll('[data-likert-sort]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-likert-sort') === 'original'));
    btn.addEventListener(
      'click',
      () => {
        sortMode = btn.getAttribute('data-likert-sort') as typeof sortMode;
        document.querySelectorAll('[data-likert-sort]').forEach((b) =>
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
    reveal: () => {
      revealed = true;
      layout();
    }
  };
}

export function renderScatterOLS(
  data: ZenParsedData,
  tooltip: TooltipController,
  signal: AbortSignal,
  cleanups: Array<() => void>
) {
  const host = document.getElementById('chart09')!;
  const chipsHost = document.getElementById('scatterSectors')!;
  const minSlider = document.getElementById('scatterMinScore') as HTMLInputElement;
  const minValEl = document.getElementById('scatterMinVal')!;
  const trendToggle = document.getElementById('scatterTrendToggle') as HTMLInputElement;
  const slopeReadout = document.getElementById('scatterSlopeReadout')!;
  const r2Readout = document.getElementById('scatterR2Readout')!;
  const dynamicSlopeSpan = document.querySelector('[data-slope]');

  let benchKey: 'wrld11' | 'ibov' | 'global50' = 'wrld11';
  const activeYears = new Set(data.yearsList);
  let minBench = -10;
  let showTrend = true;
  minSlider.value = '-10';
  minValEl.textContent = '−10';

  const yearSpec = data.yearsList.map((yr, idx) => ({
    name: yr,
    color: idx === 0 ? 'var(--violet)' : idx === 1 ? 'var(--vermilion)' : 'var(--magenta)',
    shape: idx === 0 ? 'circle' : idx === 1 ? 'square' : 'triangle'
  }));
  const yearMap = Object.fromEntries(yearSpec.map((s) => [s.name, s]));

  chipsHost.innerHTML = '';
  yearSpec.forEach((s) => {
    const chip = el('button', { type: 'button', class: 'seg-btn', 'aria-pressed': 'true' }, [
      el('span', { class: 'legend-swatch', style: `background:${s.color};border-radius:${s.shape === 'circle' ? '50%' : '0'};` }),
      el('span', { text: s.name })
    ]);
    chip.addEventListener(
      'click',
      () => {
        if (activeYears.has(s.name) && activeYears.size === 1) return;
        if (activeYears.has(s.name)) activeYears.delete(s.name);
        else activeYears.add(s.name);
        chip.setAttribute('aria-pressed', String(activeYears.has(s.name)));
        layout();
        capApi.refreshTable();
      },
      { signal }
    );
    chipsHost.appendChild(chip);
  });

  const benchNames = { wrld11: 'WRLD11 (Global BRL)', ibov: 'Ibovespa (BOVA11)', global50: 'Global 50/50' };
  const getBenchX = (m: ZenParsedData['months'][0]) =>
    benchKey === 'wrld11' ? (m.assets.global_wrld11 || 0) * 100 : benchKey === 'ibov' ? m.ibov * 100 : m.global50 * 100;

  const svgEl = svg('svg', {
    style: 'width:100%;height:auto;display:block;overflow:visible;',
    role: 'group',
    'aria-labelledby': 'scatTitle scatDesc'
  });
  svgEl.appendChild(svg('title', { id: 'scatTitle', text: 'Dispersão mensal Zen 5.4 vs Benchmark' }));
  svgEl.appendChild(svg('desc', { id: 'scatDesc', text: 'Gráfico de dispersão com cálculo ao vivo de Beta (OLS) e R².' }));

  const gridG = svg('g');
  const trendLine = svg('line', { stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', style: 'transition:opacity 180ms;' });
  const ptsG = svg('g');
  svgEl.appendChild(gridG);
  svgEl.appendChild(trendLine);
  svgEl.appendChild(ptsG);
  host.innerHTML = '';
  host.appendChild(svgEl);

  const isVisible = (m: ZenParsedData['months'][0]) => activeYears.has(m.year) && getBenchX(m) >= minBench;

  const capApi = renderFigureCaption('cap09', {
    fig: 'FIG. 09',
    caption: 'Retornos mensais (%) da Zen 5.4 (eixo Y) contra o benchmark selecionado (eixo X) com regressão OLS em tempo real.',
    cols: [
      { label: 'Mês', num: false },
      { label: 'Ano', num: false },
      { label: 'Benchmark (%)', num: true },
      { label: 'Zen 5.4 (%)', num: true }
    ],
    getRows: () =>
      data.months.filter(isVisible).map((m) => [m.mes, m.year, fmtSignedNum(getBenchX(m), 2), fmtSignedNum(m.zen54 * 100, 2)])
  });

  function computeOLS(pts: Array<{ x: number; y: number }>) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    pts.forEach((p) => {
      sx += p.x;
      sy += p.y;
      sxx += p.x * p.x;
      sxy += p.x * p.y;
    });
    const mx = sx / n;
    const my = sy / n;
    const den = sxx - n * mx * mx;
    if (Math.abs(den) < 1e-9) return null;
    const slope = (sxy - n * mx * my) / den;
    const intercept = my - slope * mx;
    let ssRes = 0;
    let ssTot = 0;
    pts.forEach((p) => {
      const pred = slope * p.x + intercept;
      ssRes += (p.y - pred) ** 2;
      ssTot += (p.y - my) ** 2;
    });
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
    return { slope, intercept, r2 };
  }

  function shapeNode(shape: string, cx: number, cy: number, color: string, active: boolean) {
    const fill = active ? color : 'var(--neutral-data)';
    if (shape === 'circle') return svg('circle', { cx, cy, r: 5, fill });
    if (shape === 'square') return svg('rect', { x: cx - 5, y: cy - 5, width: 10, height: 10, fill });
    return svg('polygon', { points: `${cx},${cy - 6} ${cx + 5.5},${cy + 4.5} ${cx - 5.5},${cy + 4.5}`, fill });
  }

  function layout() {
    const w = Math.max(280, host.clientWidth || 540);
    const h = 360;
    const padL = 48;
    const padR = 18;
    const padT = 22;
    const padB = 42;

    const allPts = data.months.map((m) => ({ m, x: getBenchX(m), y: m.zen54 * 100 }));
    const xMin = Math.min(-8, Math.floor(Math.min(...allPts.map((p) => p.x)) / 2) * 2);
    const xMax = Math.max(10, Math.ceil(Math.max(...allPts.map((p) => p.x)) / 2) * 2);
    const yMin = Math.min(-4, Math.floor(Math.min(...allPts.map((p) => p.y)) / 2) * 2);
    const yMax = Math.max(6, Math.ceil(Math.max(...allPts.map((p) => p.y)) / 2) * 2);

    const xScale = scaleLinear(xMin, xMax, padL, w - padR);
    const yScale = scaleLinear(yMin, yMax, h - padB, padT);

    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    gridG.innerHTML = '';
    ptsG.innerHTML = '';

    for (let tick = yMin; tick <= yMax; tick += 2) {
      const y = yScale(tick);
      gridG.appendChild(
        svg('line', { x1: padL, y1: y, x2: w - padR, y2: y, stroke: tick === 0 ? 'var(--ink)' : 'var(--rule)', 'stroke-width': tick === 0 ? 1.5 : 1 })
      );
      gridG.appendChild(svg('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'svg-micro', text: `${tick}%` }));
    }

    const xStep = xMax - xMin > 18 ? 4 : 2;
    for (let tick = xMin; tick <= xMax; tick += xStep) {
      const x = xScale(tick);
      gridG.appendChild(
        svg('line', { x1: x, y1: padT, x2: x, y2: h - padB, stroke: tick === 0 ? 'var(--ink)' : 'var(--rule)', 'stroke-width': tick === 0 ? 1.5 : 1 })
      );
      gridG.appendChild(svg('text', { x, y: h - 22, 'text-anchor': 'middle', class: 'svg-micro', text: `${tick}%` }));
    }

    gridG.appendChild(svg('text', { x: padL, y: 12, class: 'svg-micro', text: 'Zen 5.4 mensal (%)' }));
    gridG.appendChild(svg('text', { x: w - padR, y: h - 4, 'text-anchor': 'end', class: 'svg-micro', text: `${benchNames[benchKey]} mensal (%) →` }));

    const visPts = allPts.filter((p) => isVisible(p.m));
    const ols = computeOLS(visPts);

    if (ols && showTrend) {
      const x0 = Math.min(...visPts.map((p) => p.x));
      const x1 = Math.max(...visPts.map((p) => p.x));
      trendLine.setAttribute('x1', String(xScale(x0)));
      trendLine.setAttribute('y1', String(yScale(ols.slope * x0 + ols.intercept)));
      trendLine.setAttribute('x2', String(xScale(x1)));
      trendLine.setAttribute('y2', String(yScale(ols.slope * x1 + ols.intercept)));
      trendLine.style.opacity = '1';
    } else {
      trendLine.style.opacity = '0';
    }

    if (ols) {
      slopeReadout.textContent = `${fmt(ols.slope, 2)}x`;
      r2Readout.textContent = `R² ${fmt(ols.r2, 2)}`;
      if (dynamicSlopeSpan) dynamicSlopeSpan.textContent = `${fmt(ols.slope, 2)} %`;
    } else {
      slopeReadout.textContent = 'Pontos insuficientes';
      r2Readout.textContent = 'R² —';
    }

    allPts.forEach((p) => {
      const cx = xScale(p.x);
      const cy = yScale(p.y);
      const active = isVisible(p.m);
      const spec = yearMap[p.m.year] || yearSpec[0];

      const g = svg('g', {
        style: `opacity:${active ? 1 : 0.25};cursor:pointer;`,
        tabindex: active ? 0 : -1,
        role: 'img',
        'aria-label': `${p.m.mes}: Zen 5.4 ${fmtSignedNum(p.y, 2)}, ${benchNames[benchKey]} ${fmtSignedNum(p.x, 2)}`
      });
      g.appendChild(svg('circle', { cx, cy, r: 12, fill: 'transparent' }));
      g.appendChild(shapeNode(spec.shape, cx, cy, spec.color, active));

      const info = {
        cat: `${p.m.mes} (${p.m.year})`,
        val: `Zen ${fmtSignedNum(p.y, 2)}`,
        sub: `${benchNames[benchKey]}: ${fmtSignedNum(p.x, 2)}${active ? '' : ' (filtrado)'}`
      };
      g.addEventListener('pointerenter', (e) => tooltip.show(g, info, e), { signal });
      g.addEventListener('pointermove', (e) => tooltip.show(g, info, e), { signal });
      g.addEventListener('pointerleave', tooltip.hide, { signal });
      g.addEventListener('focus', () => tooltip.show(g, info), { signal });
      g.addEventListener('blur', tooltip.hide, { signal });
      ptsG.appendChild(g);
    });
  }

  document.querySelectorAll('[data-scatter-bench]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-scatter-bench') === 'wrld11'));
    btn.addEventListener(
      'click',
      () => {
        benchKey = btn.getAttribute('data-scatter-bench') as typeof benchKey;
        document.querySelectorAll('[data-scatter-bench]').forEach((b) =>
          b.setAttribute('aria-pressed', String(b === btn))
        );
        layout();
        capApi.refreshTable();
      },
      { signal }
    );
  });

  minSlider.addEventListener(
    'input',
    () => {
      minBench = parseInt(minSlider.value, 10);
      minValEl.textContent = `${minBench < 0 ? '−' : ''}${Math.abs(minBench)}`;
      layout();
      capApi.refreshTable();
    },
    { signal }
  );

  trendToggle.addEventListener(
    'change',
    () => {
      showTrend = trendToggle.checked;
      layout();
    },
    { signal }
  );

  const ro = new ResizeObserver(() => requestAnimationFrame(layout));
  ro.observe(host);
  cleanups.push(() => ro.disconnect());
  layout();
}

export function initCagrBars(data: ZenParsedData, tooltip: TooltipController) {
  const host = document.getElementById('chart10a')!;
  const vals = [data.stats.zen54.cagr * 100, data.stats.global50.cagr * 100, data.stats.cdi.cagr * 100];
  const labels = ['Zen 5.4', 'Global 50/50', 'CDI'];
  const maxVal = Math.max(20, ...vals);

  const bars = renderRotatedBars(
    host,
    {
      labels,
      colors: ['var(--violet)', 'var(--vermilion)', 'var(--magenta)'],
      onColors: ['var(--on-violet)', 'var(--on-vermilion)', 'var(--on-magenta)'],
      values: vals
    },
    {
      maxVal,
      compact: true,
      tooltip,
      ariaLabel: 'CAGR anualizado comparado',
      formatVal: (v) => `${fmt(v, 1)}%`,
      getTooltip: (idx, val) => ({
        cat: `CAGR Anualizado · ${labels[idx]}`,
        val: `${fmt(val, 2)} % a.a.`,
        sub: `${data.months.length} meses (${data.months[0].mes} a ${data.months[data.months.length - 1].mes})`
      })
    }
  );

  renderFigureCaption('cap10a', {
    fig: 'FIG. 10A',
    caption: 'Retorno composto anualizado (CAGR a.a.) no período completo alinhado.',
    cols: [
      { label: 'Estratégia', num: false },
      { label: 'CAGR a.a.', num: true },
      { label: 'Vol. Anual', num: true }
    ],
    rows: [
      ['Zen 5.4 (Proxy)', fmtPct(data.stats.zen54.cagr, 2, false), fmtPct(data.stats.zen54.vol, 2, false)],
      ['Global 50/50', fmtPct(data.stats.global50.cagr, 2, false), fmtPct(data.stats.global50.vol, 2, false)],
      ['CDI / DI', fmtPct(data.stats.cdi.cagr, 2, false), fmtPct(data.stats.cdi.vol, 2, false)]
    ]
  });

  return bars;
}

export function renderMonthlyTable(data: ZenParsedData, signal: AbortSignal) {
  const host = document.getElementById('chart10b')!;
  const searchInput = document.getElementById('marketSearch') as HTMLInputElement;
  const countEl = document.getElementById('marketCount')!;
  const csvBtn = document.getElementById('downloadCsvBtn')!;

  type MonthlySortCol = 'mes' | 'zen54' | 'global50' | 'wrld11' | 'cdi' | 'ibov' | 'zen54Cum';
  let searchQuery = '';
  let yearFilter = 'All';
  let sortCol: MonthlySortCol = 'mes';
  let sortDir: 'asc' | 'desc' = 'desc';
  let debounceTimer: number | undefined;

  const cols: Array<{ key: MonthlySortCol | 'spark'; label: string; num: boolean; nosort?: boolean }> = [
    { key: 'mes', label: 'Mês', num: false },
    { key: 'zen54', label: 'Zen 5.4 (%)', num: true },
    { key: 'global50', label: 'Global 50/50', num: true },
    { key: 'wrld11', label: 'WRLD11 (%)', num: true },
    { key: 'cdi', label: 'CDI (%)', num: true },
    { key: 'ibov', label: 'Ibovespa (%)', num: true },
    { key: 'zen54Cum', label: 'Zen Acum.', num: true },
    { key: 'spark', label: 'Curva até o mês', num: false, nosort: true }
  ];

  function getFilteredSorted() {
    const q = searchQuery.trim().toLowerCase();
    return data.months
      .filter((m) => yearFilter === 'All' || m.year === yearFilter)
      .filter((m) => !q || m.mes.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortCol === 'mes') {
          const cmp = a.mes.localeCompare(b.mes);
          return sortDir === 'asc' ? cmp : -cmp;
        }
        const getVal = (m: ZenParsedData['months'][0]) => {
          if (sortCol === 'zen54') return m.zen54;
          if (sortCol === 'global50') return m.global50;
          if (sortCol === 'wrld11') return m.assets.global_wrld11 || 0;
          if (sortCol === 'cdi') return m.assets.cdi_di || 0;
          if (sortCol === 'ibov') return m.ibov;
          return m.zen54Cum;
        };
        const cmp = getVal(a) - getVal(b);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }

  function makeSparkline(upToMes: string) {
    const idx = data.months.findIndex((m) => m.mes === upToMes);
    const slice = data.months.slice(0, Math.max(2, idx + 1)).map((m) => m.zen54Cum * 100);
    const w = 92;
    const h = 24;
    const pad = 3;
    const maxV = Math.max(5, ...data.months.map((m) => m.zen54Cum * 100));
    const minV = Math.min(0, ...data.months.map((m) => m.zen54Cum * 100));
    const xS = scaleLinear(0, Math.max(1, data.months.length - 1), pad, w - pad - 3);
    const yS = scaleLinear(minV, maxV, h - pad, pad);
    const pts = slice.map((v, i) => `${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(' ');
    return svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true', style: 'display:block;' }, [
      svg('polyline', { fill: 'none', stroke: 'var(--violet)', 'stroke-width': 1.5, points: pts }),
      svg('circle', { cx: xS(slice.length - 1), cy: yS(slice[slice.length - 1]), r: 2.5, fill: 'var(--violet)' })
    ]);
  }

  function draw() {
    const rows = getFilteredSorted();
    countEl.textContent = `Exibindo ${rows.length} de ${data.months.length} meses`;

    if (rows.length === 0) {
      const empty = el('div', { class: 'empty-state' }, [
        el('span', { text: `Nenhum mês encontrado para "${searchQuery.trim() || yearFilter}".` }),
        el('button', { type: 'button', class: 'fig-table-btn', text: 'Limpar filtros' })
      ]);
      empty.querySelector('button')!.addEventListener(
        'click',
        () => {
          searchQuery = '';
          searchInput.value = '';
          yearFilter = 'All';
          document.querySelectorAll('[data-mregion]').forEach((b) =>
            b.setAttribute('aria-pressed', String(b.getAttribute('data-mregion') === 'All'))
          );
          draw();
        },
        { signal }
      );
      host.innerHTML = '';
      host.appendChild(empty);
      return;
    }

    const scrollRegion = el('div', { class: 'market-table-scroll', tabindex: 0, role: 'region', 'aria-label': 'Série histórica mensal Zen 5.4' });
    const thead = el(
      'thead',
      {},
      el(
        'tr',
        {},
        cols.map((c) => {
          if (c.nosort) return el('th', { scope: 'col', text: c.label });
          const sorted = sortCol === c.key;
          const ariaSort = sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
          const btn = el('button', {
            type: 'button',
            class: 'sort-btn',
            html: `${c.label} <span aria-hidden="true">${sorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>`
          });
          btn.addEventListener(
            'click',
            () => {
              const ck = c.key as typeof sortCol;
              if (sortCol === ck) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
              else {
                sortCol = ck;
                sortDir = 'desc';
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
      rows.map((m) =>
        el('tr', {}, [
          el('td', { style: 'font-weight:500;', text: m.mes }),
          el('td', {
            class: 'is-num',
            style: `font-weight:500;color:${m.zen54 >= 0 ? 'var(--violet-ink)' : 'var(--vermilion-ink)'};`,
            text: fmtPct(m.zen54, 2)
          }),
          el('td', { class: 'is-num', text: fmtPct(m.global50, 2) }),
          el('td', { class: 'is-num', text: fmtPct(m.assets.global_wrld11 || 0, 1) }),
          el('td', { class: 'is-num', text: fmtPct(m.assets.cdi_di || 0, 1) }),
          el('td', {
            class: 'is-num',
            style: m.ibov < 0 ? 'color:var(--vermilion-ink);' : undefined,
            text: fmtPct(m.ibov, 1)
          }),
          el('td', { class: 'is-num', style: 'font-weight:500;', text: fmtPct(m.zen54Cum, 2) }),
          el('td', {}, makeSparkline(m.mes))
        ])
      )
    );

    scrollRegion.appendChild(el('table', { class: 'data-table' }, [thead, tbody]));
    host.innerHTML = '';
    host.appendChild(scrollRegion);
  }

  searchInput.addEventListener(
    'input',
    () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        searchQuery = searchInput.value;
        draw();
      }, 120);
    },
    { signal }
  );

  // Sync year filter buttons dynamically if extra years exist in uploaded CSV
  const filterGroup = document.getElementById('marketRegionFilters');
  if (filterGroup) {
    filterGroup.innerHTML = '';
    ['All', ...data.yearsList].forEach((yr) => {
      const b = el('button', {
        type: 'button',
        class: 'seg-btn',
        'data-mregion': yr,
        'aria-pressed': String(yr === 'All'),
        text: yr === 'All' ? 'Todos' : yr
      });
      b.addEventListener(
        'click',
        () => {
          yearFilter = yr;
          filterGroup.querySelectorAll('[data-mregion]').forEach((x) =>
            x.setAttribute('aria-pressed', String(x === b))
          );
          draw();
        },
        { signal }
      );
      filterGroup.appendChild(b);
    });
  }

  csvBtn.addEventListener(
    'click',
    () => {
      const rows = getFilteredSorted();
      const header = ['mes', 'zen54_mensal', 'global50_cdi50', 'global_wrld11', 'cdi_di', 'ibov_bova11', 'zen54_acumulado'];
      const lines = [header.join(';')].concat(
        rows.map((m) =>
          [
            m.mes,
            m.zen54.toFixed(6),
            m.global50.toFixed(6),
            (m.assets.global_wrld11 || 0).toFixed(6),
            (m.assets.cdi_di || 0).toFixed(6),
            m.ibov.toFixed(6),
            m.zen54Cum.toFixed(6)
          ].join(';')
        )
      );
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'carteira-zen-54-serie.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    { signal }
  );

  draw();
}
