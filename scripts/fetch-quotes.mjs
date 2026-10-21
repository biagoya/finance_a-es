// Busca cotações no Yahoo Finance (endpoint não oficial v8/chart) e grava data/quotes.json.
// Uso: node scripts/fetch-quotes.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("../tickers.json", import.meta.url), "utf8"));
const range = config.range ?? "1y";

async function fetchTicker({ symbol, label }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: ${json.chart?.error?.description ?? "sem dados"}`);

  const { meta, timestamp = [] } = result;
  const closes = result.indicators.quote[0].close;
  // Remove dias sem fechamento (feriados, falhas do Yahoo).
  const history = timestamp
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((p) => p.close != null);

  return {
    symbol,
    label: label ?? meta.longName ?? symbol,
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

const settled = await Promise.allSettled(config.tickers.map(fetchTicker));
const quotes = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
const errors = settled.filter((s) => s.status === "rejected").map((s) => s.reason.message);
errors.forEach((e) => console.error("Erro:", e));

if (quotes.length === 0) {
  console.error("Nenhuma cotação obtida; data/quotes.json não foi alterado.");
  process.exit(1);
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/quotes.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), range, quotes, errors }, null, 2) + "\n",
);
console.log(`OK: ${quotes.length} ações salvas em data/quotes.json`);
