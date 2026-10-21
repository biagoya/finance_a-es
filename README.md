# finance_a-es

Página estática que compara 5 ações usando dados do Yahoo Finance.

## Como funciona

O Yahoo Finance não tem API oficial e bloqueia chamadas feitas direto do navegador (CORS).
Por isso, os dados são buscados por um script Node e salvos em `data/quotes.json`.
A página (`index.html`) só lê esse arquivo.

```
tickers.json ──> scripts/fetch-quotes.mjs ──> data/quotes.json ──> index.html
                 (GitHub Actions, de hora em hora no pregão)
```

## Escolher as ações

Edite `tickers.json`. Use o código do Yahoo: ações da B3 terminam em `.SA` (ex.: `PETR4.SA`).
Ações americanas usam o código puro (ex.: `AAPL`).

## Rodar localmente

```bash
node scripts/fetch-quotes.mjs      # Node 18+; gera data/quotes.json
python3 -m http.server 8000        # abra http://localhost:8000
```

## Publicar no GitHub Pages

1. Settings → Pages → Source: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
2. Actions → "Atualizar cotações" → *Run workflow* para gerar os primeiros dados.

O workflow roda sozinho nos dias úteis e faz commit de `data/quotes.json`.

> Dados com possível atraso. Não é recomendação de investimento.
