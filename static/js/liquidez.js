/**
 * Monitor de Liquidez & Caça de Stops (Sweep Hunter)
 * Atualiza métricas, termômetro de prontidão e os 5 pilares em tempo real.
 */

document.addEventListener("DOMContentLoaded", () => {
  const state = {
    timeframe: "1h",
    targetHigh: 2530.0,
    targetLow: 2480.0,
    refreshIntervalSec: 15,
    timerId: null,
    loading: false
  };

  // Elementos do DOM
  const timeframeSelect = document.getElementById("timeframeSelect");
  const targetHighInput = document.getElementById("targetHighInput");
  const targetLowInput = document.getElementById("targetLowInput");
  const refreshIntervalSelect = document.getElementById("refreshIntervalSelect");
  const btnRecalc = document.getElementById("btnRecalc");
  const lastUpdatedEl = document.getElementById("lastUpdated");

  // Event Listeners
  btnRecalc.addEventListener("click", () => fetchLiquidityStatus());

  timeframeSelect.addEventListener("change", (e) => {
    state.timeframe = e.target.value;
    fetchLiquidityStatus();
  });

  targetHighInput.addEventListener("change", (e) => {
    state.targetHigh = parseFloat(e.target.value) || 2530.0;
    fetchLiquidityStatus();
  });

  targetLowInput.addEventListener("change", (e) => {
    state.targetLow = parseFloat(e.target.value) || 2480.0;
    fetchLiquidityStatus();
  });

  refreshIntervalSelect.addEventListener("change", (e) => {
    state.refreshIntervalSec = parseInt(e.target.value, 10);
    resetAutoRefresh();
  });

  function resetAutoRefresh() {
    if (state.timerId) clearInterval(state.timerId);
    if (state.refreshIntervalSec > 0) {
      state.timerId = setInterval(() => {
        fetchLiquidityStatus(true);
      }, state.refreshIntervalSec * 1000);
    }
  }

  async function fetchLiquidityStatus(silent = false) {
    if (state.loading) return;
    state.loading = true;

    try {
      const params = new URLSearchParams({
        timeframe: state.timeframe,
        target_high: state.targetHigh,
        target_low: state.targetLow
      });

      const res = await fetch(`/api/liquidity/status?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha na requisição");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Dados não retornados");
      }

      renderDashboard(data);
      if (lastUpdatedEl) {
        const d = new Date();
        const timeStr = typeof formatBrasiliaTime === 'function'
          ? formatBrasiliaTime(d)
          : d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false });
        lastUpdatedEl.textContent = `Atualizado às ${timeStr}`;
      }
    } catch (err) {
      console.error("[!] Erro ao buscar liquidez:", err);
      if (!silent) alert("Erro ao carregar monitor de liquidez: " + err.message);
    } finally {
      state.loading = false;
    }
  }

  function renderDashboard(data) {
    const r = data.readiness_summary;

    // 1. Gauge de Prontidão Circular
    const gaugeCircle = document.getElementById("gaugeCircle");
    const gaugeVal = document.getElementById("gaugeVal");
    const gaugeStatusBadge = document.getElementById("gaugeStatusBadge");

    if (gaugeCircle && gaugeVal) {
      const prob = r.overall_event_probability;
      gaugeVal.textContent = `${prob}%`;

      const deg = (prob / 100) * 360;
      gaugeCircle.style.setProperty("--gauge-deg", `${deg}deg`);
      gaugeCircle.style.setProperty("--gauge-color", r.status_color);

      gaugeStatusBadge.textContent = r.status_level;
      gaugeStatusBadge.style.backgroundColor = r.status_color + "22";
      gaugeStatusBadge.style.color = r.status_color;
      gaugeStatusBadge.style.border = `1px solid ${r.status_color}55`;
    }

    // 2. Preço e Distância
    const liveEthPrice = document.getElementById("liveEthPrice");
    const targetBadge = document.getElementById("targetBadge");
    const distTargetVal = document.getElementById("distTargetVal");
    const proxFill = document.getElementById("proxFill");
    const proxPctLabel = document.getElementById("proxPctLabel");
    const recentHighLabel = document.getElementById("recentHighLabel");
    const targetHighLabel = document.getElementById("targetHighLabel");

    if (liveEthPrice) liveEthPrice.textContent = `$${data.eth_price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (targetBadge) targetBadge.textContent = `Alvo: ${data.target_range}`;
    if (distTargetVal) {
      distTargetVal.textContent = `${data.distance_to_target_pct} (${data.distance_to_target_usd > 0 ? '+' : ''}$${data.distance_to_target_usd} USDT)`;
      distTargetVal.style.color = data.distance_to_target_usd <= 0 ? "var(--red)" : "var(--binance-yellow)";
    }

    if (proxFill) proxFill.style.width = `${r.price_proximity}%`;
    if (proxPctLabel) proxPctLabel.textContent = `${r.price_proximity}%`;
    if (recentHighLabel) recentHighLabel.textContent = `Topo 60c: $${data.recent_high_60}`;
    if (targetHighLabel) targetHighLabel.textContent = `Alvo: $${data.target_high}`;

    // 3. Breakdown das Probabilidades
    const techBarFill = document.getElementById("techBarFill");
    const techValLabel = document.getElementById("techValLabel");
    const proxBarFill = document.getElementById("proxBarFill");
    const proxValLabel = document.getElementById("proxValLabel");

    if (techBarFill) techBarFill.style.width = `${r.technical_alignment}%`;
    if (techValLabel) techValLabel.textContent = `${r.technical_alignment_str} (Peso 60%)`;
    if (proxBarFill) proxBarFill.style.width = `${r.price_proximity}%`;
    if (proxValLabel) proxValLabel.textContent = `${r.price_proximity_str} (Peso 40%)`;

    // 4. Grid dos 5 Indicadores
    const indicatorsGrid = document.getElementById("indicatorsGrid");
    if (indicatorsGrid) {
      indicatorsGrid.innerHTML = data.weights_table.map(ind => {
        return `
          <div class="indicator-card ${ind.active ? 'active-bear' : ''}">
            <div class="indicator-card-header">
              <span class="indicator-card-title">${ind.name}</span>
              <span class="indicator-weight-badge">Peso: ${ind.weight_max}%</span>
            </div>

            <div class="indicator-status-row">
              <span class="indicator-status-badge ${ind.active ? 'active' : 'inactive'}">
                <i data-lucide="${ind.active ? 'check-circle' : 'circle'}"></i>
                <span>${ind.active ? 'CONFLUÊNCIA ATIVA' : 'INATIVO'}</span>
              </span>
              <span class="indicator-val-str">${ind.value_str}</span>
            </div>

            <div class="indicator-card-desc">${ind.description}</div>
          </div>
        `;
      }).join("");
    }

    // 5. Contexto Multiativo
    const btcPriceEl = document.getElementById("btcPriceVal");
    const ethbtcRatioEl = document.getElementById("ethbtcRatioVal");
    if (btcPriceEl) btcPriceEl.textContent = `$${data.btc_price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (ethbtcRatioEl) ethbtcRatioEl.textContent = data.ethbtc_ratio.toFixed(5);

    if (window.refreshIcons) {
      window.refreshIcons();
    } else if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Inicializar
  fetchLiquidityStatus();
  resetAutoRefresh();
});
