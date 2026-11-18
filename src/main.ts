import { DEFAULT_CSV_TEXT, type ZenParsedData, parseZenCsv } from './zen-csv';
import {
  REDUCED_MOTION,
  el,
  fmt,
  fmtPct,
  fmtSignedNum,
  initPager,
  initShortcuts,
  initThemePanel,
  initTooltip
} from './zen-dom';
import {
  initWindowBars,
  renderBenchTable,
  renderDumbbell,
  renderMatrix,
  renderStackBar,
  renderTrajectory
} from './zen-charts-top';
import {
  initCagrBars,
  renderAssetSpreadBars,
  renderConsistencyWaffle,
  renderMacroColumns,
  renderMonthlyHeatmap,
  renderMonthlyTable,
  renderScatterOLS
} from './zen-charts-bottom';

function populateHeroAndColophon(data: ZenParsedData) {
  const zen = data.stats.zen54;
  const cdi = data.stats.cdi;
  const ibov = data.stats.ibov;
  const n = data.months.length;
  const firstMes = data.months[0].mes;
  const lastMes = data.months[n - 1].mes;

  const metaTag = document.getElementById('heroMetaTag');
  if (metaTag) {
    metaTag.textContent = `Backtest Preliminar (Proxy) · ${firstMes}–${lastMes} (${n} meses) · 9 Instrumentos · Rebalanceamento Mensal`;
  }

  const diffCdiPp = (zen.cum - cdi.cum) * 100;
  const volRedPct = ibov.vol > 0 ? Math.round((1 - zen.vol / ibov.vol) * 100) : 0;
  const recTxt = zen.recoveryMonths === null ? 'em recuperação' : `recuperado em ${zen.recoveryMonths} meses`;

  const setTxt = (id: string, txt: string) => {
    const node = document.getElementById(id);
    if (node) node.textContent = txt;
  };

  setTxt('kpiCumVal', fmtPct(zen.cum, 1));
  setTxt('kpiCumCap', `retorno acumulado Zen 5.4 (proxy) em ${n} meses alinhados`);
  setTxt('kpiCumDelta', `${diffCdiPp >= 0 ? '↑' : '↓'} ${fmtSignedNum(diffCdiPp, 1, ' pp')} vs. CDI`);

  setTxt('kpiCagrVal', fmtPct(zen.cagr, 1, false));
  setTxt('kpiCagrCap', `CAGR anualizado com volatilidade anual de ${fmtPct(zen.vol, 2, false)}`);
  setTxt('kpiVolDelta', `Volatilidade ${volRedPct} % menor que o Ibov`);

  setTxt('kpiDdVal', fmtPct(zen.maxDd, 1, true));
  setTxt('kpiDdCap', `drawdown máximo em fechamento mensal (${recTxt})`);
  setTxt('kpiDdDelta', `Ibovespa caiu ${fmtPct(ibov.maxDd, 1, true)} no período`);

  setTxt('kpiSortinoVal', fmt(zen.sortinoCdi, 2));
  setTxt('kpiSortinoCap', `índice de Sortino sobre excesso do CDI (Sharpe: ${fmt(zen.sharpeCdi, 2)})`);

  // Consistency strip in section 08
  const winPct = Math.round((data.consistency.positive / data.consistency.total) * 100);
  setTxt('statWinMonths', `${winPct} %`);
  const stripParent = document.getElementById('statWinMonths')?.nextElementSibling;
  if (stripParent) {
    stripParent.textContent = `dos meses no positivo (${data.consistency.positive} de ${data.consistency.total} meses)`;
  }
  setTxt('statSharpeBox', fmt(zen.sharpeCdi, 2));
  setTxt('statRecBox', zen.recoveryMonths === null ? '—' : `${zen.recoveryMonths} m`);

  // Colophon metadata from CSV
  setTxt('colophonPeriodo', `Período: ${data.periodoNota}.`);

  const metList = document.getElementById('colophonMetodoList');
  if (metList) {
    metList.innerHTML = '';
    data.metodos.forEach((m) => metList.appendChild(el('li', { text: m })));
  }

  const cuiList = document.getElementById('colophonCuidadoList');
  if (cuiList) {
    cuiList.innerHTML = '';
    data.cuidados.forEach((c) => cuiList.appendChild(el('li', { text: c })));
  }

  const fontesEl = document.getElementById('colophonFontesLinks');
  if (fontesEl && data.fontes.length > 0) {
    fontesEl.innerHTML = '';
    fontesEl.appendChild(document.createTextNode('Fontes primárias do CSV: '));
    data.fontes.forEach((f, idx) => {
      if (idx > 0) fontesEl.appendChild(document.createTextNode(' · '));
      fontesEl.appendChild(
        el('a', {
          href: f.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: 'text-decoration:underline;color:var(--ink-2);',
          text: f.label
        })
      );
    });
    fontesEl.appendChild(document.createTextNode('. Material de pesquisa pessoal — não constitui recomendação de investimento.'));
  }
}

function boot() {
  const tooltip = initTooltip();
  const pager = initPager();
  const themePanel = initThemePanel(pager, tooltip);
  initShortcuts(pager, themePanel, tooltip);

  let activeAbort: AbortController | null = null;
  let activeCleanups: Array<() => void> = [];
  let onTrajScroll: ((secEl: HTMLElement) => void) | null = null;

  // Single global scroll loop for progress bar & trajectory line scrub
  const progressBar = document.getElementById('scrollProgress');
  const sec05 = document.getElementById('s05');
  let ticking = false;
  function scrollFrame() {
    ticking = false;
    if (progressBar) {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      progressBar.style.transform = `scaleX(${p.toFixed(4)})`;
    }
    if (onTrajScroll && sec05) onTrajScroll(sec05);
  }
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(scrollFrame);
      }
    },
    { passive: true }
  );

  function mountDashboard(data: ZenParsedData, sourceLabel: string, isCustom: boolean) {
    if (activeAbort) activeAbort.abort();
    activeCleanups.forEach((fn) => fn());
    activeAbort = new AbortController();
    activeCleanups = [];
    const { signal } = activeAbort;

    populateHeroAndColophon(data);

    const matrixApi = renderMatrix(data, tooltip, signal, activeCleanups);
    const stackApi = renderStackBar(data, tooltip, signal, activeCleanups);
    renderBenchTable(data, signal);
    const dumbbellApi = renderDumbbell(data, tooltip, signal, activeCleanups);
    const windowApi = initWindowBars(data, tooltip, signal);
    const trajApi = renderTrajectory(data, tooltip, signal, activeCleanups);
    onTrajScroll = trajApi.onScroll;
    const macroApi = renderMacroColumns(data, tooltip, signal, activeCleanups);
    renderMonthlyHeatmap(data, tooltip, signal);
    renderConsistencyWaffle(data, tooltip, signal);
    const spreadApi = renderAssetSpreadBars(data, tooltip, signal, activeCleanups);
    renderScatterOLS(data, tooltip, signal, activeCleanups);
    const cagrApi = initCagrBars(data, tooltip);
    renderMonthlyTable(data, signal);

    const callbacks: Record<string, () => void> = {
      s01: () => matrixApi.reveal(),
      s02: () => stackApi.reveal(),
      s03: () => dumbbellApi.reveal(),
      s04: () => windowApi.reveal(),
      s06: () => macroApi.reveal(),
      s08: () => spreadApi.reveal(),
      s10: () => cagrApi.reveal()
    };

    const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (REDUCED_MOTION) {
      revealEls.forEach((sec) => sec.classList.add('is-in'));
      Object.values(callbacks).forEach((fn) => fn());
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const sec = entry.target as HTMLElement;
            sec.classList.add('is-in');
            io.unobserve(sec);
            callbacks[sec.id]?.();
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
      );
      revealEls.forEach((s) => {
        if (s.classList.contains('is-in')) callbacks[s.id]?.();
        else io.observe(s);
      });
      activeCleanups.push(() => io.disconnect());
    }

    const statusEl = document.getElementById('csvSourceStatus');
    const resetBtn = document.getElementById('csvResetBtn') as HTMLButtonElement | null;
    if (statusEl) {
      statusEl.textContent = `Fonte ativa: ${sourceLabel} (${data.months.length} meses)`;
    }
    if (resetBtn) {
      resetBtn.disabled = !isCustom;
    }

    scrollFrame();
  }

  // Initial zero-latency mount from bundled CSV
  const initialData = parseZenCsv(DEFAULT_CSV_TEXT);
  mountDashboard(initialData, 'zen54_backtest.csv', false);

  // Also check if public/data/zen54_backtest.csv differs at runtime (e.g. edited after build)
  fetch('./data/zen54_backtest.csv', { cache: 'no-store' })
    .then((res) => (res.ok ? res.text() : null))
    .then((txt) => {
      if (txt && txt.trim() !== DEFAULT_CSV_TEXT.trim()) {
        const updated = parseZenCsv(txt);
        mountDashboard(updated, 'zen54_backtest.csv (atualizado)', false);
      }
    })
    .catch(() => {});

  // Wire local CSV upload and restore inside Painel
  const uploadInput = document.getElementById('csvUploadInput') as HTMLInputElement | null;
  const resetBtn = document.getElementById('csvResetBtn') as HTMLButtonElement | null;
  const statusEl = document.getElementById('csvSourceStatus');

  if (uploadInput) {
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseZenCsv(text);
        mountDashboard(parsed, file.name, true);
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `Erro ao ler ${file.name}: ${err instanceof Error ? err.message : 'formato inválido'}`;
        }
      } finally {
        uploadInput.value = '';
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      mountDashboard(parseZenCsv(DEFAULT_CSV_TEXT), 'zen54_backtest.csv', false);
    });
  }
}

boot();
