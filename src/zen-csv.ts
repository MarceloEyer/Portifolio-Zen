import rawDefaultCsv from '../public/data/zen54_backtest.csv?raw';

export interface AssetMeta {
  key: string;
  label: string;
  shortLabel: string;
  macro: 'Ações Globais' | 'Renda Fixa BR' | 'Reservas USD/EUR' | 'Cripto';
  currency: 'BRL (Local)' | 'USD / Global' | 'EUR';
  defaultWeight: number;
}

export interface MonthlyRow {
  mes: string;
  year: string;
  monthNum: number;
  assets: Record<string, number>;
  ibov: number;
  zen54: number;
  global50: number;
  zen54Cum: number;
  global50Cum: number;
  cdiCum: number;
  ibovCum: number;
  wrld11Cum: number;
}

export interface SeriesStats {
  key: string;
  label: string;
  cum: number;
  cagr: number;
  vol: number;
  maxDd: number;
  peakMonth: string;
  troughMonth: string;
  recoveryMonths: number | null;
  recoveredMonth: string | null;
  sharpeCdi: number;
  sortinoCdi: number;
}

export interface AnnualPoint {
  periodKey: string;
  label: string;
  zen54: number;
  global50: number;
  cdi: number;
  ibov: number;
  wrld11: number;
}

export interface MacroContributionYear {
  year: string;
  label: string;
  global: number;
  rfBr: number;
  fxReserves: number;
  crypto: number;
  totalPp: number;
  partial: boolean;
}

export interface AssetExtreme {
  key: string;
  label: string;
  weight: number;
  minMonth: string;
  minVal: number;
  maxMonth: string;
  maxVal: number;
  cum: number;
  span: number;
}

export interface ZenParsedData {
  assetsMeta: AssetMeta[];
  weights: Record<string, number>;
  months: MonthlyRow[];
  yearsList: string[];
  stats: Record<string, SeriesStats>;
  annuals: AnnualPoint[];
  last12m: { zen54: number; global50: number; cdi: number; ibov: number; wrld11: number };
  macroYears: MacroContributionYear[];
  assetExtremes: AssetExtreme[];
  consistency: {
    total: number;
    positive: number;
    beatCdi: number;
    beatIbov: number;
    beatGlobal50: number;
  };
  periodoNota: string;
  metodos: string[];
  cuidados: string[];
  fontes: Array<{ label: string; url: string }>;
}

export const DEFAULT_CSV_TEXT = rawDefaultCsv;

export const ASSETS_META: AssetMeta[] = [
  { key: 'global_wrld11', label: 'Ações Globais (WRLD11 / VT / MUND11)', shortLabel: 'Global WRLD11', macro: 'Ações Globais', currency: 'USD / Global', defaultWeight: 47 },
  { key: 'cdi_di', label: 'CDI / Caixa Pós-fixado', shortLabel: 'CDI / DI', macro: 'Renda Fixa BR', currency: 'BRL (Local)', defaultWeight: 25 },
  { key: 'ipca_curto_b5p211', label: 'IPCA+ Curto (B5P211)', shortLabel: 'IPCA+ Curto', macro: 'Renda Fixa BR', currency: 'BRL (Local)', defaultWeight: 10 },
  { key: 'prefix_fixa11', label: 'Prefixado BR (FIXA11)', shortLabel: 'Prefixado', macro: 'Renda Fixa BR', currency: 'BRL (Local)', defaultWeight: 5 },
  { key: 'ipca_intermediario_proxy', label: 'IPCA+ Intermediário (Proxy 50/50)', shortLabel: 'IPCA+ Interm.', macro: 'Renda Fixa BR', currency: 'BRL (Local)', defaultWeight: 3 },
  { key: 'usd_curto_bshv39', label: 'Reserva USD Curto (BSHV39)', shortLabel: 'USD BSHV39', macro: 'Reservas USD/EUR', currency: 'USD / Global', defaultWeight: 3 },
  { key: 'cripto_hash11', label: 'Criptoativos (HASH11)', shortLabel: 'Cripto HASH11', macro: 'Cripto', currency: 'USD / Global', defaultWeight: 3 },
  { key: 'ipca_longo_b5mb11', label: 'IPCA+ Longo (B5MB11)', shortLabel: 'IPCA+ Longo', macro: 'Renda Fixa BR', currency: 'BRL (Local)', defaultWeight: 2 },
  { key: 'eur_cambio_trendeuro', label: 'Reserva Euro (Trend Euro)', shortLabel: 'EUR Câmbio', macro: 'Reservas USD/EUR', currency: 'EUR', defaultWeight: 2 }
];

export function parseCsvLine(line: string, sep = ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toNum(v: string | undefined): number {
  if (!v) return NaN;
  const cleaned = v.trim().replace(',', '.');
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function calcSeriesStats(
  key: string,
  label: string,
  months: string[],
  rets: number[],
  cdiRets: number[],
  kpiOverride?: Partial<SeriesStats>
): SeriesStats {
  const n = rets.length;
  let wealth = 1;
  let peak = 1;
  let peakIdx = 0;
  let activePeakIdx = 0;
  let maxDd = 0;
  let ddPeakIdx = 0;
  let ddTroughIdx = 0;

  const wealthArr: number[] = [];
  for (let i = 0; i < n; i++) {
    wealth *= 1 + rets[i];
    wealthArr.push(wealth);
    if (wealth >= peak) {
      peak = wealth;
      activePeakIdx = i;
    }
    const dd = wealth / peak - 1;
    if (dd < maxDd) {
      maxDd = dd;
      ddPeakIdx = activePeakIdx;
      ddTroughIdx = i;
    }
  }

  let recoveryMonths: number | null = null;
  let recoveredMonth: string | null = null;
  if (maxDd < -1e-9) {
    const peakWealth = wealthArr[ddPeakIdx];
    for (let j = ddTroughIdx + 1; j < n; j++) {
      if (wealthArr[j] >= peakWealth - 1e-12) {
        recoveryMonths = j - ddPeakIdx;
        recoveredMonth = months[j];
        break;
      }
    }
  } else {
    recoveryMonths = 0;
  }

  const cum = Number.isFinite(kpiOverride?.cum) ? (kpiOverride!.cum as number) : wealth - 1;
  const cagr = Number.isFinite(kpiOverride?.cagr)
    ? (kpiOverride!.cagr as number)
    : n > 0
      ? Math.pow(1 + cum, 12 / n) - 1
      : 0;

  const mean = n > 0 ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (n - 1) : 0;
  const vol = Number.isFinite(kpiOverride?.vol)
    ? (kpiOverride!.vol as number)
    : Math.sqrt(variance) * Math.sqrt(12);

  const excess = rets.map((r, i) => r - (cdiRets[i] || 0));
  const meanEx = n > 0 ? excess.reduce((a, b) => a + b, 0) / n : 0;
  const sharpeComputed = vol > 1e-9 ? (meanEx * 12) / vol : 0;
  const downSq = excess.reduce((a, ex) => a + (ex < 0 ? ex * ex : 0), 0) / Math.max(1, n);
  const downDev = Math.sqrt(downSq);
  const sortinoComputed = downDev > 1e-9 ? (meanEx / downDev) * Math.sqrt(12) : 0;

  void peakIdx;

  return {
    key,
    label,
    cum,
    cagr,
    vol,
    maxDd: Number.isFinite(kpiOverride?.maxDd) ? (kpiOverride!.maxDd as number) : maxDd,
    peakMonth: months[ddPeakIdx] || '',
    troughMonth: months[ddTroughIdx] || '',
    recoveryMonths,
    recoveredMonth,
    sharpeCdi: Number.isFinite(kpiOverride?.sharpeCdi) ? (kpiOverride!.sharpeCdi as number) : sharpeComputed,
    sortinoCdi: Number.isFinite(kpiOverride?.sortinoCdi) ? (kpiOverride!.sortinoCdi as number) : sortinoComputed
  };
}

export function parseZenCsv(rawText: string): ZenParsedData {
  const clean = rawText.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) throw new Error('Arquivo CSV vazio ou inválido.');

  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const colIdx = (name: string) => header.indexOf(name);

  const weights: Record<string, number> = {};
  ASSETS_META.forEach(a => { weights[a.key] = a.defaultWeight; });

  const rawMonths: MonthlyRow[] = [];
  const kpiOverrides: Record<string, Partial<SeriesStats>> = {};
  const annualMap = new Map<string, AnnualPoint>();
  const metodos: string[] = [];
  const cuidados: string[] = [];
  const fontes: Array<{ label: string; url: string }> = [];
  let periodoNota = '';

  const wCol = colIdx('peso_pct');
  const mesCol = colIdx('mes');
  const tipoCol = colIdx('tipo_registro');
  const descCol = colIdx('descricao');
  const valCol = colIdx('valor');
  const fonteCol = colIdx('fonte');

  // First pass to collect PESO_ALVO and metadata before calculating fallback monthly portfolio returns
  const parsedRows = lines.slice(1).map(l => parseCsvLine(l));

  for (const cols of parsedRows) {
    const tipo = (cols[tipoCol] || '').trim();
    if (tipo === 'PESO_ALVO') {
      const k = (cols[descCol] || '').trim();
      const w = toNum(cols[wCol]);
      if (k && Number.isFinite(w)) weights[k] = w;
    }
  }

  let runZen = 1;
  let runG50 = 1;
  let runCdi = 1;
  let runIbov = 1;
  let runWrld = 1;

  for (const cols of parsedRows) {
    const tipo = (cols[tipoCol] || '').trim();
    const mes = (cols[mesCol] || '').trim();
    const desc = (cols[descCol] || '').trim();
    const val = toNum(cols[valCol]);

    if (tipo === 'RETORNO_MENSAL' && mes) {
      const assets: Record<string, number> = {};
      for (const a of ASSETS_META) {
        const idx = colIdx(a.key);
        const r = idx >= 0 ? toNum(cols[idx]) : NaN;
        assets[a.key] = Number.isFinite(r) ? r : 0;
      }
      const ibovIdx = colIdx('ibov_bova11');
      const ibov = ibovIdx >= 0 && Number.isFinite(toNum(cols[ibovIdx])) ? toNum(cols[ibovIdx]) : 0;

      const zenCsvVal = toNum(cols[colIdx('zen54_retorno_mensal_proxy')]);
      const zenCalc = ASSETS_META.reduce((acc, a) => acc + (weights[a.key] / 100) * (assets[a.key] || 0), 0);
      const zen54 = Number.isFinite(zenCsvVal) ? zenCsvVal : zenCalc;

      const g50CsvVal = toNum(cols[colIdx('global50_cdi50')]);
      const global50 = Number.isFinite(g50CsvVal)
        ? g50CsvVal
        : 0.5 * (assets.global_wrld11 || 0) + 0.5 * (assets.cdi_di || 0);

      runZen *= 1 + zen54;
      runG50 *= 1 + global50;
      runCdi *= 1 + (assets.cdi_di || 0);
      runIbov *= 1 + ibov;
      runWrld *= 1 + (assets.global_wrld11 || 0);

      const cZen = toNum(cols[colIdx('zen54_retorno_mensal_proxy_acumulado')]);
      const cG50 = toNum(cols[colIdx('global50_cdi50_acumulado')]);
      const cCdi = toNum(cols[colIdx('cdi_di_acumulado')]);
      const cIbov = toNum(cols[colIdx('ibov_bova11_acumulado')]);
      const cWrld = toNum(cols[colIdx('global_wrld11_acumulado')]);

      const [yrStr, moStr] = mes.split('-');
      rawMonths.push({
        mes,
        year: yrStr || mes.slice(0, 4),
        monthNum: parseInt(moStr || '1', 10),
        assets,
        ibov,
        zen54,
        global50,
        zen54Cum: Number.isFinite(cZen) ? cZen : runZen - 1,
        global50Cum: Number.isFinite(cG50) ? cG50 : runG50 - 1,
        cdiCum: Number.isFinite(cCdi) ? cCdi : runCdi - 1,
        ibovCum: Number.isFinite(cIbov) ? cIbov : runIbov - 1,
        wrld11Cum: Number.isFinite(cWrld) ? cWrld : runWrld - 1
      });
    } else if (tipo === 'KPI_PRELIMINAR' && desc.includes(':')) {
      const [sKey, metric] = desc.split(':');
      if (!kpiOverrides[sKey]) kpiOverrides[sKey] = {};
      if (Number.isFinite(val)) {
        if (metric === 'retorno_acumulado') kpiOverrides[sKey].cum = val;
        else if (metric === 'cagr') kpiOverrides[sKey].cagr = val;
        else if (metric === 'volatilidade_anual') kpiOverrides[sKey].vol = val;
        else if (metric === 'drawdown_max_fechamento_mensal') kpiOverrides[sKey].maxDd = val;
        else if (metric === 'sharpe_excesso_cdi') kpiOverrides[sKey].sharpeCdi = val;
        else if (metric === 'sortino_excesso_cdi') kpiOverrides[sKey].sortinoCdi = val;
      }
    } else if (tipo === 'RETORNO_ANUAL' && mes && Number.isFinite(val)) {
      if (!annualMap.has(mes)) {
        annualMap.set(mes, {
          periodKey: mes,
          label: mes === '2026_JAN_SET' ? '2026 (Jan–Set)' : mes,
          zen54: 0,
          global50: 0,
          cdi: 0,
          ibov: 0,
          wrld11: 0
        });
      }
      const pt = annualMap.get(mes)!;
      if (desc === 'zen54_retorno_mensal_proxy') pt.zen54 = val;
      else if (desc === 'global50_cdi50') pt.global50 = val;
      else if (desc === 'cdi_di') pt.cdi = val;
      else if (desc === 'ibov_bova11') pt.ibov = val;
      else if (desc === 'global_wrld11') pt.wrld11 = val;
    } else if (tipo === 'PERIODO' && desc) {
      periodoNota = desc;
    } else if (tipo === 'METODO' && desc) {
      metodos.push(desc);
    } else if (tipo === 'CUIDADO' && desc) {
      cuidados.push(desc);
    } else if (tipo === 'FONTE' && desc) {
      const url = (cols[fonteCol] || '').trim();
      if (url) fontes.push({ label: desc, url });
    }
  }

  rawMonths.sort((a, b) => a.mes.localeCompare(b.mes));
  if (rawMonths.length === 0) throw new Error('Nenhuma linha RETORNO_MENSAL encontrada no CSV.');

  const monthsIds = rawMonths.map(m => m.mes);
  const cdiRets = rawMonths.map(m => m.assets.cdi_di || 0);

  // Use KPI overrides only if monthly count matches canonical 33 or CSV had explicit KPI rows and user didn't add extra months
  const canUseOverrides = Object.keys(kpiOverrides).length > 0 && rawMonths.length === 33;
  const ov = (k: string) => (canUseOverrides ? kpiOverrides[k] : undefined);

  const stats: Record<string, SeriesStats> = {
    zen54: calcSeriesStats('zen54', 'Zen 5.4 (Proxy)', monthsIds, rawMonths.map(m => m.zen54), cdiRets, ov('zen54_retorno_mensal_proxy')),
    global50: calcSeriesStats('global50', 'Global 50% / CDI 50%', monthsIds, rawMonths.map(m => m.global50), cdiRets, ov('global50_cdi50')),
    wrld11: calcSeriesStats('wrld11', 'Global WRLD11 (BRL)', monthsIds, rawMonths.map(m => m.assets.global_wrld11 || 0), cdiRets, ov('global_wrld11')),
    ibov: calcSeriesStats('ibov', 'Ibovespa (BOVA11)', monthsIds, rawMonths.map(m => m.ibov), cdiRets, ov('ibov_bova11')),
    cdi: calcSeriesStats('cdi', 'CDI / DI', monthsIds, cdiRets, cdiRets, ov('cdi_di'))
  };

  const yearsList = Array.from(new Set(rawMonths.map(m => m.year))).sort();

  // Build annuals dynamically from monthly rows if RETORNO_ANUAL missing or extra months added
  const compound = (arr: number[]) => arr.reduce((a, r) => a * (1 + r), 1) - 1;
  const annuals: AnnualPoint[] = yearsList.map(yr => {
    const ms = rawMonths.filter(m => m.year === yr);
    const existing = annualMap.get(yr) || (yr === '2026' && ms.length === 9 ? annualMap.get('2026_JAN_SET') : undefined);
    if (existing && ms.length <= 12 && canUseOverrides) return existing;
    const isPartial = ms.length < 12;
    return {
      periodKey: yr,
      label: isPartial ? `${yr} (${ms.length}m)` : yr,
      zen54: compound(ms.map(m => m.zen54)),
      global50: compound(ms.map(m => m.global50)),
      cdi: compound(ms.map(m => m.assets.cdi_di || 0)),
      ibov: compound(ms.map(m => m.ibov)),
      wrld11: compound(ms.map(m => m.assets.global_wrld11 || 0))
    };
  });

  const last12 = rawMonths.slice(-12);
  const last12m = {
    zen54: compound(last12.map(m => m.zen54)),
    global50: compound(last12.map(m => m.global50)),
    cdi: compound(last12.map(m => m.assets.cdi_di || 0)),
    ibov: compound(last12.map(m => m.ibov)),
    wrld11: compound(last12.map(m => m.assets.global_wrld11 || 0))
  };

  // Weighted macroclass sum of monthly contributions (in percentage points) per year
  const macroYears: MacroContributionYear[] = yearsList.map(yr => {
    const ms = rawMonths.filter(m => m.year === yr);
    let global = 0;
    let rfBr = 0;
    let fxReserves = 0;
    let crypto = 0;
    ms.forEach(m => {
      ASSETS_META.forEach(a => {
        const contribPp = (weights[a.key] / 100) * (m.assets[a.key] || 0) * 100;
        if (a.macro === 'Ações Globais') global += contribPp;
        else if (a.macro === 'Renda Fixa BR') rfBr += contribPp;
        else if (a.macro === 'Reservas USD/EUR') fxReserves += contribPp;
        else crypto += contribPp;
      });
    });
    const partial = ms.length < 12;
    return {
      year: yr,
      label: partial ? `${yr} (${ms.length}m)` : yr,
      global,
      rfBr,
      fxReserves,
      crypto,
      totalPp: global + rfBr + fxReserves + crypto,
      partial
    };
  });

  // Extremes per instrument + Zen 5.4 + Ibovespa
  const buildExtreme = (key: string, label: string, weight: number, getter: (m: MonthlyRow) => number): AssetExtreme => {
    let minVal = Infinity;
    let maxVal = -Infinity;
    let minMonth = '';
    let maxMonth = '';
    let w = 1;
    rawMonths.forEach(m => {
      const r = getter(m);
      w *= 1 + r;
      if (r < minVal) { minVal = r; minMonth = m.mes; }
      if (r > maxVal) { maxVal = r; maxMonth = m.mes; }
    });
    return {
      key,
      label,
      weight,
      minMonth,
      minVal: minVal * 100,
      maxMonth,
      maxVal: maxVal * 100,
      cum: (w - 1) * 100,
      span: (maxVal - minVal) * 100
    };
  };

  const assetExtremes: AssetExtreme[] = [
    buildExtreme('zen54', 'Carteira Zen 5.4 (Total)', 100, m => m.zen54),
    ...ASSETS_META.map(a => buildExtreme(a.key, `${a.shortLabel} (${weights[a.key]}%)`, weights[a.key], m => m.assets[a.key] || 0)),
    buildExtreme('ibov', 'Ibovespa BOVA11 (Bench)', 0, m => m.ibov)
  ];

  const consistency = {
    total: rawMonths.length,
    positive: rawMonths.filter(m => m.zen54 > 0).length,
    beatCdi: rawMonths.filter(m => m.zen54 > (m.assets.cdi_di || 0)).length,
    beatIbov: rawMonths.filter(m => m.zen54 > m.ibov).length,
    beatGlobal50: rawMonths.filter(m => m.zen54 > m.global50).length
  };

  return {
    assetsMeta: ASSETS_META,
    weights,
    months: rawMonths,
    yearsList,
    stats,
    annuals,
    last12m,
    macroYears,
    assetExtremes,
    consistency,
    periodoNota: periodoNota || `${rawMonths[0].mes} a ${rawMonths[rawMonths.length - 1].mes}; ${rawMonths.length} meses`,
    metodos,
    cuidados,
    fontes
  };
}
