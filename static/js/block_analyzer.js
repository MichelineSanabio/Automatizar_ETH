/**
 * Binance Market Terminal - Order Book Statistical Block Analyzer (Z-Score & Evaporation Risk)
 * Analisa degraus de suporte e resistência do livro de ofertas em tempo real.
 */

document.addEventListener("DOMContentLoaded", () => {
  initBlockAnalyzer();
});

function initBlockAnalyzer() {
  const modalBackdrop = document.getElementById("modalBlockAnalyzerBackdrop");
  const btnOpen = document.getElementById("btnOpenBlockAnalyzer");
  const btnHeader = document.getElementById("btnHeaderBlockAnalyzer");
  const btnClose = document.getElementById("btnCloseBlockAnalyzerModal");
  const btnRun = document.getElementById("btnRunBlockAnalysis");
  const btnCurrentPrice = document.getElementById("btnUseCurrentPrice");

  const symbolSelect = document.getElementById("blockSymbolSelect");
  const targetPriceInput = document.getElementById("blockTargetPriceInput");
  const sideSelect = document.getElementById("blockSideSelect");
  const depthLimitSelect = document.getElementById("blockDepthLimit");

  const loader = document.getElementById("blockAnalyzerLoader");
  const resultContainer = document.getElementById("blockResultContainer");

  // Elementos de exibição de resultado
  const resPrice = document.getElementById("resBlockPrice");
  const resDist = document.getElementById("resBlockDist");
  const resVolume = document.getElementById("resBlockVolume");
  const resUsd = document.getElementById("resBlockUsd");
  const resZScore = document.getElementById("resBlockZScore");
  const resTier = document.getElementById("resBlockTier");
  const resInstitutional = document.getElementById("resBlockInstitutional");
  const resRisk = document.getElementById("resBlockRisk");

  const distMean = document.getElementById("distMeanVol");
  const distStd = document.getElementById("distStdDev");
  const distTotal = document.getElementById("distTotalLevels");
  const topWallsBody = document.getElementById("topWallsTableBody");

  // Abrir Modal
  function openModal() {
    if (!modalBackdrop) return;
    modalBackdrop.style.display = "flex";
    if (typeof lucide !== "undefined") lucide.createIcons();

    // Sincronizar par com o par atualmente selecionado no terminal
    if (symbolSelect && typeof currentSymbol !== "undefined" && currentSymbol) {
      symbolSelect.value = currentSymbol;
    }

    // Se o preço alvo estiver vazio ou for o padrão, sugere o preço atual aproximado ou 2660
    if (targetPriceInput && (!targetPriceInput.value || targetPriceInput.value === "2660.0")) {
      if (typeof lastPrice !== "undefined" && lastPrice > 0) {
        // Se estiver em BTC, sugere um suporte próximo do BTC
        if (currentSymbol && currentSymbol.includes("BTC")) {
          targetPriceInput.value = (Math.floor(lastPrice / 100) * 100).toFixed(2);
        } else {
          targetPriceInput.value = "2660.0";
        }
      }
    }

    runAnalysis();
  }

  // Fechar Modal
  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.style.display = "none";
  }

  if (btnOpen) btnOpen.addEventListener("click", openModal);
  if (btnHeader) btnHeader.addEventListener("click", openModal);
  if (btnClose) btnClose.addEventListener("click", closeModal);

  // Fechar ao clicar fora ou ESC
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalBackdrop && modalBackdrop.style.display === "flex") {
      closeModal();
    }
  });

  // Preencher Cotação Atual
  if (btnCurrentPrice) {
    btnCurrentPrice.addEventListener("click", () => {
      if (typeof lastPrice !== "undefined" && lastPrice > 0) {
        targetPriceInput.value = lastPrice.toFixed(2);
      }
    });
  }

  // Submeter Análise
  if (btnRun) {
    btnRun.addEventListener("click", runAnalysis);
  }

  if (targetPriceInput) {
    targetPriceInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runAnalysis();
    });
  }

  async function runAnalysis() {
    const symbol = symbolSelect ? symbolSelect.value : (currentSymbol || "ETHUSDT");
    const targetPrice = targetPriceInput ? parseFloat(targetPriceInput.value) : 2660.0;
    const side = sideSelect ? sideSelect.value : "auto";
    const limit = depthLimitSelect ? parseInt(depthLimitSelect.value, 10) : 1000;

    if (loader) loader.style.display = "flex";
    if (resultContainer) resultContainer.style.display = "none";

    try {
      const params = new URLSearchParams({
        symbol: symbol,
        side: side,
        limit: limit
      });

      if (!isNaN(targetPrice)) {
        params.append("target_price", targetPrice);
      }

      const res = await fetch(`/api/orderbook/analyze-block?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      renderResults(data);
    } catch (err) {
      console.error("[BlockAnalyzer] Erro ao analisar degrau:", err);
      alert("Erro ao consultar livro de ofertas: " + err.message);
    } finally {
      if (loader) loader.style.display = "none";
    }
  }

  function renderResults(data) {
    if (!resultContainer) return;
    resultContainer.style.display = "block";

    const baseAsset = data.symbol.replace("USDT", "");
    const bloco = data.bloco;
    const stats = data.estatisticas_livro || {};

    // 1. Preço e Distância
    if (bloco && bloco.encontrado) {
      resPrice.textContent = `$${bloco.preco.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      const distSign = bloco.distancia_preco >= 0 ? "+" : "";
      resDist.textContent = `Distância: ${distSign}$${bloco.distancia_preco.toFixed(2)} do topo (${data.lado_analisado})`;

      // 2. Volume e USD
      resVolume.textContent = `${bloco.volume_moeda.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${baseAsset}`;
      resUsd.textContent = `$${bloco.valor_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;

      // 3. Z-Score e Tier
      const z = bloco.desvios_acima_da_media;
      const zPrefix = z >= 0 ? "+" : "";
      resZScore.textContent = `${zPrefix}${z.toFixed(2)}σ`;
      resTier.textContent = bloco.classificacao_tier || "Regular";

      // Cores dinâmicas para Z-Score
      if (z >= 3.0) {
        resZScore.style.color = "#00d2ff"; // Ciano neon para anomalia crítica
      } else if (z >= 2.0) {
        resZScore.style.color = "#0ecb81"; // Verde positivo
      } else if (z >= 1.0) {
        resZScore.style.color = "#f0b90b"; // Amarelo
      } else {
        resZScore.style.color = "#848e9c"; // Neutro
      }

      // 4. Presença Institucional
      if (bloco.presenca_institucional_inferida) {
        resInstitutional.innerHTML = `<span style="color: #0ecb81;">SIM (Baleia / Bloco Detectado)</span>`;
      } else {
        resInstitutional.innerHTML = `<span style="color: #848e9c;">NÃO (Fluxo de Varejo Normal)</span>`;
      }
      resInstitutional.nextElementSibling.textContent = z >= 3.0 ? "Anomalia estatística acima de 3 sigmas" : "Volume dentro dos parâmetros regulares";

      // 5. Risco de Evaporação (Spoofing)
      resRisk.textContent = bloco.risco_de_evaporacao;
      if (bloco.risco_de_evaporacao.includes("ALTO")) {
        resRisk.style.color = "#f6465d"; // Vermelho alerta
      } else if (bloco.risco_de_evaporacao.includes("MÉDIO")) {
        resRisk.style.color = "#f0b90b"; // Amarelo
      } else {
        resRisk.style.color = "#0ecb81"; // Verde estável
      }
    } else {
      resPrice.textContent = `$${(data.target_price || 0).toFixed(2)}`;
      resDist.textContent = bloco ? bloco.mensagem : "Não encontrado";
      resVolume.textContent = "0.00";
      resUsd.textContent = "$0.00 USD";
      resZScore.textContent = "0.00σ";
      resZScore.style.color = "#848e9c";
      resTier.textContent = "Fora do livro visível";
      resInstitutional.innerHTML = `<span style="color: #848e9c;">Não visível no topo</span>`;
      resRisk.textContent = "INDEFINIDO";
      resRisk.style.color = "#848e9c";
    }

    // 6. Distribuição do Livro
    if (distMean) distMean.textContent = `${stats.media_volume || 0} ${baseAsset}`;
    if (distStd) distStd.textContent = `${stats.desvio_padrao || 0} ${baseAsset}`;
    if (distTotal) distTotal.textContent = `${stats.total_degraus_analisados || 0} níveis`;

    // 7. Tabela de Maiores Paredes no Livro
    if (topWallsBody) {
      topWallsBody.innerHTML = "";
      const walls = data.top_paredes_institucionais || [];

      if (walls.length === 0) {
        topWallsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 12px;">Nenhuma parede anômala (>1.5σ) detectada no momento.</td></tr>`;
      } else {
        walls.forEach(w => {
          const tr = document.createElement("tr");
          const isHighRisk = w.risco_evaporacao.includes("ALTO");
          tr.innerHTML = `
            <td><strong style="color: var(--binance-yellow);">$${w.preco.toFixed(2)}</strong></td>
            <td>${w.volume.toFixed(2)} ${baseAsset}</td>
            <td style="color: #00d2ff;">$${w.valor_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
            <td><span class="zscore-tag ${w.z_score >= 3.0 ? 'z-whale' : 'z-mod'}">+${w.z_score.toFixed(2)}σ</span></td>
            <td><span class="risk-badge ${isHighRisk ? 'risk-high' : 'risk-med'}">${w.risco_evaporacao}</span></td>
            <td>
              <button type="button" class="btn-inspect-wall" data-price="${w.preco}" title="Inspecionar este preço detalhadamente">
                Inspecionar
              </button>
            </td>
          `;

          const inspectBtn = tr.querySelector(".btn-inspect-wall");
          if (inspectBtn) {
            inspectBtn.addEventListener("click", () => {
              if (targetPriceInput) targetPriceInput.value = w.preco.toFixed(2);
              runAnalysis();
            });
          }

          topWallsBody.appendChild(tr);
        });
      }
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
  }
}
