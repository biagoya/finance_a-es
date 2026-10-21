// Busca cotações e fundamentos no Yahoo Finance (endpoints não oficiais) e grava data/quotes.json.
// Uso: node scripts/fetch-quotes.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile";

const config = JSON.parse(await readFile(new URL("../tickers.json", import.meta.url), "utf8"));
const range = config.range ?? "1y";
const errors = [];

// O endpoint de fundamentos (quoteSummary) exige cookie + "crumb" de uma sessão do Yahoo.
async function getSession() {
  try {
    const r1 = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
    const cookie = r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error("Yahoo não devolveu cookie");
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, cookie } });
    const crumb = (await r2.text()).trim();
    if (!r2.ok || !crumb || crumb.includes("<")) throw new Error(`crumb HTTP ${r2.status}`);
    return { cookie, crumb };
  } catch (e) {
    errors.push(`fundamentos indisponíveis (${e.message})`);
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tenta até 3 vezes, alternando entre query1 e query2, quando o Yahoo limita (429) ou falha (5xx).
async function getJson(url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = attempt % 2 ? url.replace("//query1.", "//query2.") : url;
    try {
      const res = await fetch(target, { headers: { ...UA, ...headers } });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastError = new Error(e.cause?.message ?? e.message);
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw lastError;
}

async function fetchChart(symbol) {
  const json = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
  );
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(json.chart?.error?.description ?? "sem dados");

  const { meta, timestamp = [] } = result;
  const closes = result.indicators.quote[0].close;
  // Remove dias sem fechamento (feriados, falhas do Yahoo).
  const history = timestamp
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((p) => p.close != null);

  return {
    name: meta.longName ?? meta.shortName ?? symbol,
    currency: meta.currency,
    exchange: meta.fullExchangeName ?? meta.exchangeName,
    price: meta.regularMarketPrice,
    previousClose: history.at(-2)?.close ?? meta.chartPreviousClose,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    volume: meta.regularMarketVolume,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    marketTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    history,
  };
}

// Campos do quoteSummary vêm como { raw, fmt }; guardamos só o valor bruto.
const raw = (v) => (v && typeof v === "object" ? (v.raw ?? null) : (v ?? null));
// Dividend yield às vezes vem em % (5.2) em vez de fração (0.052).
const ratio = (v) => (v != null && v > 1 ? v / 100 : v);

async function fetchFundamentals(symbol, session) {
  const json = await getJson(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
      `?modules=${MODULES}&crumb=${encodeURIComponent(session.crumb)}`,
    { cookie: session.cookie },
  );
  const r = json.quoteSummary?.result?.[0];
  if (!r) throw new Error(json.quoteSummary?.error?.description ?? "sem dados");
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const fd = r.financialData ?? {};
  const ap = r.assetProfile ?? {};

  return {
    marketCap: raw(sd.marketCap) ?? raw(r.price?.marketCap),
    trailingPE: raw(sd.trailingPE),
    forwardPE: raw(sd.forwardPE),
    priceToBook: raw(ks.priceToBook),
    evToEbitda: raw(ks.enterpriseToEbitda),
    eps: raw(ks.trailingEps),
    dividendYield: ratio(raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield)),
    beta: raw(sd.beta) ?? raw(ks.beta),
    roe: raw(fd.returnOnEquity),
    profitMargin: raw(fd.profitMargins),
    ebitdaMargin: raw(fd.ebitdaMargins),
    revenueGrowth: raw(fd.revenueGrowth),
    debtToEquity: raw(fd.debtToEquity),
    totalRevenue: raw(fd.totalRevenue),
    targetMeanPrice: raw(fd.targetMeanPrice),
    recommendation: fd.recommendationKey ?? null,
    analysts: raw(fd.numberOfAnalystOpinions),
    sector: ap.sector ?? null,
    industry: ap.industry ?? null,
    employees: ap.fullTimeEmployees ?? null,
    website: ap.website ?? null,
    summary: ap.longBusinessSummary ?? null,
  };
}

const session = await getSession();

const settled = await Promise.allSettled(
  config.tickers.map(async ({ symbol, label }) => {
    const chart = await fetchChart(symbol).catch((e) => {
      throw new Error(`${symbol}: ${e.message}`);
    });
    let fundamentals = null;
    if (session) {
      fundamentals = await fetchFundamentals(symbol, session).catch((e) => {
        errors.push(`${symbol} (fundamentos): ${e.message}`);
        return null;
      });
    }
    return { symbol, label: label ?? chart.name, ...chart, fundamentals };
  }),
);
const quotes = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
settled.filter((s) => s.status === "rejected").forEach((s) => errors.push(s.reason.message));
// No GitHub Actions, "::warning::" vira um aviso visível na página da execução.
const prefix = process.env.GITHUB_ACTIONS ? "::warning::" : "Erro: ";
errors.forEach((e) => console.error(prefix + e));

if (quotes.length === 0) {
  console.error(`${process.env.GITHUB_ACTIONS ? "::error::" : ""}Nenhuma cotação obtida; data/quotes.json não foi alterado.`);
  process.exit(1);
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/quotes.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), range, quotes, errors }, null, 2) + "\n",
);
console.log(`OK: ${quotes.length} ações salvas em data/quotes.json`);
