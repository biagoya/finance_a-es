const COLORS = ["#2f5bd3", "#e07b00", "#12805c", "#b0379a", "#c2362f"];
let data;
let chart;

const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`);
const cls = (v) => (v == null ? "" : v >= 0 ? "up" : "down");
const fmtMoney = (v, currency) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
const fmtVol = (v) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

// Retorno entre o último fechamento e o de `days` pregões atrás (0 = histórico inteiro).
function returnOver(history, days) {
  if (history.length < 2) return null;
  const start = days && history.length > days ? history[history.length - 1 - days] : history[0];
  return history.at(-1).close / start.close - 1;
}

function renderCards() {
  document.getElementById("cards").innerHTML = data.quotes
    .map((q, i) => {
      const day = q.previousClose ? q.price / q.previousClose - 1 : null;
      return `<div class="card" style="--c:${COLORS[i % COLORS.length]}">
        <div class="sym">${q.label}</div>
        <div class="name">${q.symbol} · ${q.name}</div>
        <div class="price">${fmtMoney(q.price, q.currency)}</div>
        <div class="${cls(day)}">${fmtPct(day)} hoje</div>
      </div>`;
    })
    .join("");
}

function renderTable() {
  document.querySelector("#table tbody").innerHTML = data.quotes
    .map((q, i) => {
      const day = q.previousClose ? q.price / q.previousClose - 1 : null;
      const r = [day, returnOver(q.history, 21), returnOver(q.history, 126), returnOver(q.history, 0)];
      return `<tr>
        <td><span class="dot" style="--c:${COLORS[i % COLORS.length]}"></span>${q.label} <span class="muted">${q.symbol}</span></td>
        <td>${fmtMoney(q.price, q.currency)}</td>
        ${r.map((v) => `<td class="${cls(v)}">${fmtPct(v)}</td>`).join("")}
        <td>${fmtMoney(q.fiftyTwoWeekLow, q.currency)}</td>
        <td>${fmtMoney(q.fiftyTwoWeekHigh, q.currency)}</td>
        <td>${fmtVol(q.volume)}</td>
      </tr>`;
    })
    .join("");
}

// Gráfico normalizado: cada série começa em 100 no início do período escolhido.
function renderChart(days) {
  const datasets = data.quotes.map((q, i) => {
    const h = days && q.history.length > days ? q.history.slice(-days - 1) : q.history;
    const base = h[0]?.close;
    return {
      label: q.label,
      data: h.map((p) => ({ x: p.date, y: (p.close / base) * 100 })),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.15,
    };
  });
  const labels = [...new Set(datasets.flatMap((d) => d.data.map((p) => p.x)))].sort();
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted");

  chart?.destroy();
  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      parsing: { xAxisKey: "x", yAxisKey: "y" },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: muted }, grid: { color: "rgba(127,127,127,0.15)" } },
      },
      plugins: {
        legend: { labels: { color: muted, usePointStyle: true, boxHeight: 6 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}` } },
      },
    },
  });
}

document.getElementById("periods").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || !data) return;
  document.querySelectorAll("#periods button").forEach((b) => b.classList.toggle("active", b === btn));
  renderChart(Number(btn.dataset.days));
});

fetch("data/quotes.json", { cache: "no-store" })
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((json) => {
    data = json;
    document.getElementById("updated").textContent =
      `Atualizado em ${new Date(data.updatedAt).toLocaleString("pt-BR")}` +
      (data.errors?.length ? ` · falhas: ${data.errors.join("; ")}` : "");
    renderCards();
    renderTable();
    renderChart(0);
  })
  .catch((err) => {
    document.getElementById("updated").textContent =
      `Sem dados ainda (${err.message}). Rode "node scripts/fetch-quotes.mjs" ou o workflow "Atualizar cotações".`;
  });
