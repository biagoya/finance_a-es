# finance_a-es

Painel estático (GitHub Pages) que compara 5 ações usando dados do Yahoo Finance.

O painel (`index.html`, arquivo único) mostra:

- cards com preço, variação do dia, retorno em 12 meses, dividend yield e minigráfico;
- gráfico de desempenho relativo (base 100) em 1M, 3M, 6M e 1A;
- destaques: maior alta, maior dividend yield, menor P/L, maior ROE, menor volatilidade e maior potencial;
- tabela de desempenho e risco (retornos, volatilidade anual, queda máxima, faixa de 52 semanas, volume);
- tabela de fundamentos (valor de mercado, P/L, P/VP, EV/EBITDA, DY, ROE, margem, dívida/PL, beta,
  recomendação dos analistas, preço-alvo e potencial), ordenável por qualquer coluna;
- gráfico de barras para comparar qualquer indicador;
- perfil de cada empresa (setor, indústria, funcionários, descrição e indicadores extras).

## Como funciona

O Yahoo Finance não tem API oficial e bloqueia chamadas feitas direto do navegador (CORS).
Por isso, os dados são buscados por um script Node e salvos em `data/quotes.json`.
Cotações vêm do endpoint `v8/chart`; fundamentos vêm do `v10/quoteSummary`, que exige uma sessão
(cookie + crumb) que o script obtém sozinho. Se os fundamentos falharem, as cotações continuam funcionando.
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
