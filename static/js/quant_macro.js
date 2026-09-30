/**
 * quant_macro.js - Lógica em Tempo Real do Radar On-Chain & Valuation Macro
 * Atualiza o painel da barra lateral e os indicadores de Topo Institucional
 * integrados à rota /api/quant/macro-summary.
 */

(function () {
  let isUpdating = false;
  let pollTimer = null;

  function fmtUsd(val) {
    if (typeof val !== "number" || isNaN(val)) return "$0.00";
    return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(val) {
    if (typeof val !== "number" || isNaN(val)) return "0.00%";
    return (val > 0 ? "+" : "") + val.toFixed(2) + "%";
  }

  async function updateQuantMacroPanel() {
    if (isUpdating) return;
    isUpdating = true;

    try {
      const res = await fetch("/api/quant/macro-summary");
      if (!res.ok) return;

      const json = await res.json();
      if (json.status !== "success" || !json.data) return;

      const data = json.data;

      // 1. Preço Spot ETH e Ordem Limite mais próxima
      const elEthPrice = document.getElementById("qmEthPrice");
      if (elEthPrice && data.eth_price_usd) {
        elEthPrice.textContent = fmtUsd(data.eth_price_usd);
      }

      const ord = data.ordem_mais_proxima || {};
      const elNearestBadge = document.getElementById("qmNearestOrderBadge");
      const elNearestPrice = document.getElementById("qmNearestOrderPrice");
      const elNearestDist = document.getElementById("qmNearestOrderDist");
      const elNearestDistPct = document.getElementById("qmNearestOrderDistPct");

      if (elNearestBadge) {
        elNearestBadge.textContent = ord.rotulo ? `${ord.rotulo.split("(")[0].trim()}` : "Ordem A-D";
      }
      if (elNearestPrice && ord.preco_usdt) {
        elNearestPrice.textContent = fmtUsd(ord.preco_usdt);
      }
      if (elNearestDist && typeof ord.distancia_usd === "number") {
        elNearestDist.textContent = (ord.distancia_usd > 0 ? "+" : "") + fmtUsd(ord.distancia_usd).replace("$", "$ ");
        elNearestDist.style.color = Math.abs(ord.distancia_pct || 0) <= 1.0 ? "var(--accent-yellow)" : "var(--text-white)";
      }
      if (elNearestDistPct && typeof ord.distancia_pct === "number") {
        elNearestDistPct.textContent = fmtPct(ord.distancia_pct);
        elNearestDistPct.style.color = Math.abs(ord.distancia_pct) <= 1.0 ? "var(--accent-yellow)" : "var(--accent-green)";
      }

      // 2. Radar On-Chain
      const net = data.net_issuance || {};
      const elNet = document.getElementById("qmNetIssuance");
      if (elNet && typeof net.net_diaria_eth === "number") {
        elNet.textContent = `${net.net_diaria_eth > 0 ? "+" : ""}${net.net_diaria_eth.toFixed(1)} ETH/d`;
        elNet.style.color = net.is_deflationary ? "var(--green)" : "var(--accent-yellow)";
      }

      const blob = data.blob_saturation || {};
      const elBlob = document.getElementById("qmBlobSat");
      if (elBlob && typeof blob.saturation_target_pct === "number") {
        elBlob.textContent = `${blob.saturation_target_pct.toFixed(1)}% [${blob.semaforo || '🟢'}]`;
      }

      const stk = data.staking_ratio || {};
      const elStk = document.getElementById("qmStakingRatio");
      if (elStk && typeof stk.ratio === "number") {
        elStk.textContent = `${stk.ratio.toFixed(2)}x [${stk.semaforo || '🟢'}]`;
      }

      const tvl = data.tvl_total_usd || 0;
      const elTvl = document.getElementById("qmTotalTvl");
      if (elTvl && tvl > 0) {
        elTvl.textContent = `$${(tvl / 1e9).toFixed(2)}B`;
      }

      // 3. Valuation de Topo
      const valBase = data.valuation_base || {};
      const elVFaixa = document.getElementById("qmValuationFaixa");
      const elVPonto = document.getElementById("qmValuationPonto");
      const elVUpside = document.getElementById("qmValuationUpside");

      if (elVFaixa && valBase.faixa_str) elVFaixa.textContent = valBase.faixa_str;
      if (elVPonto && valBase.ponto_central_str) elVPonto.textContent = valBase.ponto_central_str;
      if (elVUpside && valBase.upside_str) elVUpside.textContent = valBase.upside_str;

      // 4. Semáforos Institucionais de Topo
      const semaforos = data.semaforos_topo || {};
      const listContainer = document.getElementById("qmSemaforosList");
      if (listContainer) {
        const labels = {
          net_issuance: "Net Issuance (Queima EIP-1559)",
          blob_saturation: "Saturação Blobs (EIP-4844)",
          staking_exchanges: "Staking vs Corretoras",
          tvl: "TVL Consolidado (L1+L2)",
          mvrv_zscore: "MVRV Z-Score de Topo"
        };

        const rows = [];
        for (const [key, s] of Object.entries(semaforos)) {
          const lbl = labels[key] || key;
          const prog = (s.progresso_pct || 0).toFixed(1);
          const emoji = s.emoji || "🟢";
          const semTexto = s.semaforo || "NEUTRO";

          rows.push(`
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 4px; padding: 6px 8px; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 600; color: var(--text-white);">${lbl}</span>
                <span>${emoji} <strong style="font-size: 10px;">${semTexto}</strong></span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="flex: 1; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                  <div style="width: ${Math.min(100, Math.max(0, prog))}%; height: 100%; background: ${emoji === '🔴' ? 'var(--red)' : (emoji === '🟡' ? 'var(--accent-yellow)' : 'var(--green)')};"></div>
                </div>
                <span class="font-mono" style="font-size: 10px; color: var(--text-dim); min-width: 32px; text-align: right;">${prog}%</span>
              </div>
            </div>
          `);
        }
        listContainer.innerHTML = rows.join("");
      }

      if (window.refreshIcons) window.refreshIcons();
    } catch (err) {
      console.warn("[QuantMacro] Erro ao carregar resumo macro:", err);
    } finally {
      isUpdating = false;
    }
  }

  window.updateQuantMacroPanel = updateQuantMacroPanel;

  // Iniciar após carregamento do DOM
  document.addEventListener("DOMContentLoaded", () => {
    updateQuantMacroPanel();
    pollTimer = setInterval(updateQuantMacroPanel, 4000);
  });
})();
