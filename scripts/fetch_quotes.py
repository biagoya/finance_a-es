"""Busca cotações e fundamentos no Yahoo Finance (via yfinance) e grava data/quotes.json.

Uso: python scripts/fetch_quotes.py

O yfinance imita a conexão de um navegador e gerencia a sessão (cookie + crumb)
com o Yahoo, o que evita os bloqueios (HTTP 429) que o Yahoo aplica a servidores
como os do GitHub Actions.
"""

import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
IN_ACTIONS = os.environ.get("GITHUB_ACTIONS") == "true"


def clean(value):
    """Converte tipos numpy e NaN/infinito em valores aceitos pelo JSON."""
    if value is None:
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def ratio(value):
    """Dividend yield às vezes vem em % (5.2) em vez de fração (0.052)."""
    return value / 100 if value is not None and value > 1 else value


def fetch_ticker(symbol, label, period, errors):
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval="1d", auto_adjust=False).dropna(subset=["Close"])
    if hist.empty:
        raise RuntimeError(f"{symbol}: sem histórico de preços")
    history = [
        {"date": idx.strftime("%Y-%m-%d"), "close": round(float(close), 4)} for idx, close in hist["Close"].items()
    ]
    closes = [p["close"] for p in history]

    try:
        info = ticker.info or {}
    except Exception as e:  # O histórico já basta para o painel funcionar.
        errors.append(f"{symbol} (fundamentos): {e}")
        info = {}

    def get(key):
        return clean(info.get(key))

    last = hist.iloc[-1]
    quote = {
        "symbol": symbol,
        "label": label or get("shortName") or symbol,
        "name": get("longName") or get("shortName") or symbol,
        "currency": get("currency") or "BRL",
        "exchange": get("fullExchangeName") or get("exchange"),
        "price": get("regularMarketPrice") or get("currentPrice") or closes[-1],
        "previousClose": closes[-2] if len(closes) > 1 else get("previousClose"),
        "dayHigh": get("dayHigh") or clean(last["High"]),
        "dayLow": get("dayLow") or clean(last["Low"]),
        "volume": get("regularMarketVolume") or get("volume") or clean(last["Volume"]),
        "fiftyTwoWeekHigh": get("fiftyTwoWeekHigh") or max(closes),
        "fiftyTwoWeekLow": get("fiftyTwoWeekLow") or min(closes),
        "marketTime": hist.index[-1].to_pydatetime().astimezone(timezone.utc).isoformat(),
        "history": history,
        "fundamentals": None,
    }

    if info:
        quote["fundamentals"] = {
            "marketCap": get("marketCap"),
            "trailingPE": get("trailingPE"),
            "forwardPE": get("forwardPE"),
            "priceToBook": get("priceToBook"),
            "evToEbitda": get("enterpriseToEbitda"),
            "eps": get("trailingEps") or get("epsTrailingTwelveMonths"),
            "dividendYield": ratio(get("dividendYield") or get("trailingAnnualDividendYield")),
            "beta": get("beta"),
            "roe": get("returnOnEquity"),
            "profitMargin": get("profitMargins"),
            "ebitdaMargin": get("ebitdaMargins"),
            "revenueGrowth": get("revenueGrowth"),
            "debtToEquity": get("debtToEquity"),
            "totalRevenue": get("totalRevenue"),
            "targetMeanPrice": get("targetMeanPrice"),
            "recommendation": get("recommendationKey"),
            "analysts": get("numberOfAnalystOpinions"),
            "sector": get("sector"),
            "industry": get("industry"),
            "employees": get("fullTimeEmployees"),
            "website": get("website"),
            "summary": get("longBusinessSummary"),
        }
    return quote


def main():
    config = json.loads((ROOT / "tickers.json").read_text(encoding="utf-8"))
    period = config.get("range", "1y")
    quotes, errors = [], []

    for i, item in enumerate(config["tickers"]):
        if i:
            time.sleep(1)  # Espaça as requisições para não ser limitado pelo Yahoo.
        try:
            quotes.append(fetch_ticker(item["symbol"], item.get("label"), period, errors))
        except Exception as e:
            msg = str(e)
            errors.append(msg if msg.startswith(item["symbol"]) else f"{item['symbol']}: {msg}")

    # No GitHub Actions, "::warning::" vira um aviso visível na página da execução.
    prefix = "::warning::" if IN_ACTIONS else "Erro: "
    for e in errors:
        print(prefix + e, file=sys.stderr)

    if not quotes:
        print(
            ("::error::" if IN_ACTIONS else "") + "Nenhuma cotação obtida; data/quotes.json não foi alterado.",
            file=sys.stderr,
        )
        sys.exit(1)

    out = ROOT / "data" / "quotes.json"
    out.parent.mkdir(exist_ok=True)
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "range": period,
        "quotes": quotes,
        "errors": errors,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {len(quotes)} ações salvas em data/quotes.json")


if __name__ == "__main__":
    main()
