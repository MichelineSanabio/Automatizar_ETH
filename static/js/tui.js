/**
 * tui.js - Lógica em Tempo Real do Terminal Quant Institucional (TUI)
 * Conexão com a API /api/quant/state, atualização a cada 1.5s,
 * renderização de tabelas, cartões, barras visuais e logs em tempo real.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Inicializa ícones Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Elementos do DOM
  const pillEthPrice = document.getElementById("pillEthPrice");
  const pillBtcPrice = document.getElementById("pillBtcPrice");
  const pillEthBtc = document.getElementById("pillEthBtc");
  const pillUsdtBrl = document.getElementById("pillUsdtBrl");

  const valFundingRate = document.getElementById("valFundingRate");
  const valFundingAnn = document.getElementById("valFundingAnn");
  const valOpenInterest = document.getElementById("valOpenInterest");
  const valLongShort = document.getElementById("valLongShort");
  const valSp500 = document.getElementById("valSp500");
  const valDxy = document.getElementById("valDxy");
  const valGold = document.getElementById("valGold");
  const valOil = document.getElementById("valOil");
  const valWeb3Status = document.getElementById("valWeb3Status");
  const valTelegramStatus = document.getElementById("valTelegramStatus");

  async function fetchTelegramStatus() {
    if (!valTelegramStatus) return;
    try {
      const res = await fetch("/api/quant/telegram/status");
      if (res.ok) {
        const json = await res.json();
        const d = json.data || {};
        if (d.configured) {
          valTelegramStatus.textContent = `● Ativo (Chat: ${d.masked_chat_id})`;
          valTelegramStatus.className = "macro-value status-ok";
        } else {
          valTelegramStatus.textContent = `○ Standby (Configure no .env)`;
          valTelegramStatus.className = "macro-value";
        }
      }
    } catch (e) {}
  }

  // Bloco 2: Altseason
  const altseasonScoreVal = document.getElementById("altseasonScoreVal");
  const altseasonStageBadge = document.getElementById("altseasonStageBadge");
  const altseasonAsciiBar = document.getElementById("altseasonAsciiBar");
  const altseasonProgressFill = document.getElementById("altseasonProgressFill");
  const altEthBtcRatio = document.getElementById("altEthBtcRatio");
  const altEthBtcStatus = document.getElementById("altEthBtcStatus");
  const altBtcDominance = document.getElementById("altBtcDominance");
  const altTop50Outperforming = document.getElementById("altTop50Outperforming");
  const altCycleSummary = document.getElementById("altCycleSummary");

  // Bloco 1: Descida
  const activeFactorsCounter = document.getElementById("activeFactorsCounter");
  const tbodyDownFactors = document.getElementById("tbodyDownFactors");
  const ordersProbContainer = document.getElementById("ordersProbContainer");

  // Bloco 3: Pivô de Alta
  const pivotStatusBanner = document.getElementById("pivotStatusBanner");
  const pivotStatusText = document.getElementById("pivotStatusText");
  const pivotStatusDetail = document.getElementById("pivotStatusDetail");
  const pivotConditionsCounter = document.getElementById("pivotConditionsCounter");
  const tbodyPivotConditions = document.getElementById("tbodyPivotConditions");
  const tbodyDynamicEntries = document.getElementById("tbodyDynamicEntries");
  const targetsContainer = document.getElementById("targetsContainer");

  // Logs
  const logsConsoleWindow = document.getElementById("logsConsoleWindow");
  const logUpdateCount = document.getElementById("logUpdateCount");
  const btnClearLogs = document.getElementById("btnClearLogs");

  // Modal Console
  const btnToggleTerminalView = document.getElementById("btnToggleTerminalView");
  const terminalModalOverlay = document.getElementById("terminalModalOverlay");
  const btnCloseTerminalModal = document.getElementById("btnCloseTerminalModal");
  const richConsoleOutput = document.getElementById("richConsoleOutput");
  const btnRefreshConsole = document.getElementById("btnRefreshConsole");

  let latestState = null;
  let logHistorySet = new Set();
  let pollInterval = null;

  // Formatação auxiliar
  const fmtUsd = (val) => (typeof val === "number" ? "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "$0.00");
  const fmtBrl = (val) => (typeof val === "number" ? "R$ " + val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "R$ 0,00");
  const fmtPct = (val) => (typeof val === "number" ? val.toFixed(2) + "%" : "0.00%");

  /**
   * Busca estado do servidor
   */
  async function fetchQuantState() {
    try {
      const res = await fetch("/api/quant/state");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status === "success" && json.data) {
        latestState = json.data;
        renderState(latestState);
      }
    } catch (err) {
      console.warn("[TUI] Erro ao buscar estado quantitativo:", err);
    }
  }

  /**
   * Renderiza todos os painéis com o novo estado
   */
  function renderState(state) {
    const prices = state.prices || {};
    const fut = state.futures || {};
    const macro = state.macro || {};
    const alt = state.altseason || {};
    const downFactors = state.down_factors || [];
    const orders = state.order_probabilities || [];
    const pivot = state.pivot_and_entries || {};
    const logs = state.logs || [];
    const web3 = state.web3 || {};

    // 1. Tickers no Header
    if (pillEthPrice) pillEthPrice.textContent = fmtUsd(prices.eth);
    if (pillBtcPrice) pillBtcPrice.textContent = fmtUsd(prices.btc);
    if (pillEthBtc) pillEthBtc.textContent = (prices.ethbtc || 0).toFixed(5);
    if (pillUsdtBrl) pillUsdtBrl.textContent = fmtBrl(prices.usdtbrl);

    // 2. Faixa Macro e Futuros
    if (valFundingRate) {
      const fr = (fut.funding_rate || 0) * 100;
      valFundingRate.textContent = (fr >= 0 ? "+" : "") + fr.toFixed(4) + "%";
      valFundingRate.style.color = fr >= 0 ? "var(--accent-green-bright)" : "var(--accent-red-bright)";
    }
    if (valFundingAnn) {
      valFundingAnn.textContent = `(${((fut.funding_rate_annualized || 0)).toFixed(1)}% a.a)`;
    }
    if (valOpenInterest) {
      valOpenInterest.textContent = `${Math.round(fut.open_interest_eth || 0).toLocaleString()} ETH`;
    }
    if (valLongShort) {
      valLongShort.textContent = `${(fut.long_short_ratio || 1.0).toFixed(2)} (L: ${(fut.long_pct || 50).toFixed(1)}% / S: ${(fut.short_pct || 50).toFixed(1)}%)`;
    }
    if (valSp500) valSp500.textContent = (macro.sp500 || 0).toLocaleString();
    if (valDxy) valDxy.textContent = (macro.dxy || 0).toFixed(2);
    if (valGold) valGold.textContent = fmtUsd(macro.gold);
    if (valOil) valOil.textContent = fmtUsd(macro.oil_wti);

    if (valWeb3Status) {
      if (web3.connected) {
        valWeb3Status.textContent = `● Conectado (${web3.latest_block ? 'Bloco #' + web3.latest_block : 'Infura/RPC'})`;
        valWeb3Status.className = "macro-value status-ok";
      } else {
        valWeb3Status.textContent = `○ Standby (${web3.note || 'Public RPC'})`;
        valWeb3Status.className = "macro-value";
      }
    }

    // 3. Bloco 2: Termômetro de Altseason
    if (altseasonScoreVal) altseasonScoreVal.textContent = `${(alt.index_pct || 0).toFixed(1)}%`;
    if (altseasonStageBadge) {
      altseasonStageBadge.textContent = alt.stage || "Neutro";
      altseasonStageBadge.style.color = alt.color || "var(--accent-yellow)";
      altseasonStageBadge.style.borderColor = alt.color || "var(--accent-yellow)";
    }
    if (altseasonAsciiBar) altseasonAsciiBar.textContent = `[${alt.unicode_bar || "░░░░░░░░░░░░░░░░░░░░"}] ${(alt.index_pct || 0).toFixed(1)}%`;
    if (altseasonProgressFill) altseasonProgressFill.style.width = `${Math.min(100, Math.max(0, alt.index_pct || 0))}%`;

    if (altEthBtcRatio) altEthBtcRatio.textContent = `${(prices.ethbtc || 0).toFixed(5)} BTC`;
    if (altEthBtcStatus) altEthBtcStatus.textContent = alt.ethbtc_status || "";
    if (altBtcDominance) altBtcDominance.textContent = `${alt.btc_dominance || 56.5}%`;
    if (altTop50Outperforming) altTop50Outperforming.textContent = `${alt.alt_vs_btc_outperforming || 16} / 50`;
    if (altCycleSummary) altCycleSummary.textContent = alt.desc || "Monitorando paridade ETH/BTC";

    // 4. Bloco 1A: Checklist dos Fatores da Descida
    const activeCount = downFactors.filter(f => f.active).length;
    if (activeFactorsCounter) activeFactorsCounter.textContent = `${activeCount}/${downFactors.length} Ativos`;

    if (tbodyDownFactors) {
      tbodyDownFactors.innerHTML = downFactors.map(f => {
        const badge = f.active
          ? `<span class="status-badge-active">✔ ATIVO</span>`
          : `<span class="status-badge-inactive">✖ DESARMADO</span>`;
        return `
          <tr>
            <td style="font-weight: 700; color: #ffffff;">${f.name}</td>
            <td style="color: var(--text-secondary);">${f.detail}</td>
            <td style="text-align: center;">${badge}</td>
          </tr>
        `;
      }).join("");
    }

    // 5. Bloco 1B: Medidor de Probabilidade das 4 Ordens Limite
    if (ordersProbContainer) {
      ordersProbContainer.innerHTML = orders.map(o => {
        const name = o.name || o.label || "Ordem";
        const price = o.price_usdt || o.price || 0;
        const sizeStr = o.size_str || (o.amount_eth ? `${o.amount_eth} ETH ($${(o.total_usdt || 0).toFixed(2)})` : "");
        const prob = typeof o.prob_pct === "number" ? o.prob_pct : (typeof o.probability === "number" ? o.probability : 50);
        const confluence = o.confluence || o.notes || "Suporte técnico institucional";
        const probBar = o.prob_bar || (o.progress_bar ? `[${o.progress_bar}]` : "[████░░░░░░]");
        
        let probClass = "prob-mid";
        let fillGrad = "linear-gradient(90deg, #f59e0b, #fbbf24)";
        let barColor = o.prob_color || "#fbbf24";
        if (prob >= 70) {
          probClass = "prob-high";
          fillGrad = "linear-gradient(90deg, #059669, #10b981)";
          barColor = "#10b981";
        } else if (prob < 40) {
          probClass = "prob-low";
          fillGrad = "linear-gradient(90deg, #dc2626, #ef4444)";
          barColor = "#ef4444";
        }

        return `
          <div class="order-prob-card">
            <div class="order-prob-top">
              <div class="order-title-group">
                <span class="order-id">${name}</span>
                <span class="order-price">${fmtUsd(price)}</span>
                <span class="order-size">(${sizeStr})</span>
              </div>
              <div class="order-prob-badge ${probClass}">
                ${prob.toFixed(1)}% PROB
              </div>
            </div>
            <div class="order-bar-row">
              <span class="order-ascii-bar" style="color: ${barColor};">${probBar}</span>
              <div class="order-prog-track">
                <div class="order-prog-fill" style="width: ${prob}%; background: ${fillGrad};"></div>
              </div>
            </div>
            <div class="order-confluence">
              <strong>Confluência:</strong> ${confluence}
            </div>
          </div>
        `;
      }).join("");
    }

    // 6. Bloco 3: Pivô de Alta & Recálculo Fibonacci
    const isPivot = pivot.pivot_confirmed || false;
    if (pivotStatusBanner) {
      if (isPivot) {
        pivotStatusBanner.className = "pivot-status-banner banner-active-pivot";
        if (pivotStatusText) pivotStatusText.textContent = "[ALERTA: PIVÔ DE ALTA CONFIRMADO - DESARMANDO ORDENS NA BASE]";
        if (pivotStatusDetail) pivotStatusDetail.textContent = "Estrutura de baixa rompida. Ativando compras dinâmicas em Pullback e Golden Pocket.";
      } else {
        pivotStatusBanner.className = "pivot-status-banner";
        if (pivotStatusText) pivotStatusText.textContent = "[MODO VIGENTE: CORREÇÃO / DESCIDA ATIVA]";
        if (pivotStatusDetail) pivotStatusDetail.textContent = "Ordens limite na base permanecem ativas e válidas para captura de liquidez institucional.";
      }
    }

    const conditions = pivot.conditions || [];
    const metCount = conditions.filter(c => c.met).length;
    if (pivotConditionsCounter) pivotConditionsCounter.textContent = `${metCount}/${conditions.length} Rompidos`;

    if (tbodyPivotConditions) {
      tbodyPivotConditions.innerHTML = conditions.map(c => `
        <tr>
          <td style="color: #ffffff;">${c.trigger}</td>
          <td style="text-align: center; color: var(--accent-gold); font-weight: 700;">${c.key_level}</td>
          <td style="text-align: center; color: var(--text-secondary);">${c.current_value}</td>
          <td style="text-align: center;">
            <span class="${c.met ? 'status-badge-active' : 'status-badge-inactive'}">
              ${c.met ? 'ROMPIDO' : 'NÃO ROMPIDO'}
            </span>
          </td>
        </tr>
      `).join("");
    }

    const dynEntries = pivot.dynamic_entries || [];
    if (tbodyDynamicEntries) {
      tbodyDynamicEntries.innerHTML = dynEntries.map(e => `
        <tr>
          <td style="font-weight: 700; color: #ffffff;">${e.level}</td>
          <td style="text-align: right; color: var(--accent-gold); font-weight: 800;">${fmtUsd(e.price_usdt)}</td>
          <td style="text-align: center; color: var(--accent-cyan);">${e.capital_alloc}</td>
          <td style="color: var(--text-secondary);">${e.description}</td>
        </tr>
      `).join("");
    }

    const targets = pivot.targets || [];
    if (targetsContainer) {
      targetsContainer.innerHTML = targets.map(t => `
        <div class="target-card">
          <span class="target-lbl">${t.target}</span>
          <span class="target-price">${fmtUsd(t.price_usdt)}</span>
          <span class="target-exp">${t.expansion}</span>
          <span class="target-exit">Venda Parcial: ${t.exit_pct}</span>
        </div>
      `).join("");
    }

    // 7. Janela de Logs
    if (logsConsoleWindow && logs.length > 0) {
      let appendedNew = false;
      logs.forEach(item => {
        const key = `${item.time}|${item.level}|${item.msg}`;
        if (!logHistorySet.has(key)) {
          logHistorySet.add(key);
          appendedNew = true;

          const row = document.createElement("div");
          row.className = "log-row";
          row.innerHTML = `
            <span class="log-time">[${item.time}]</span>
            <span class="log-tag log-tag-${item.level}">[${item.level}]</span>
            <span class="log-msg">${item.msg}</span>
          `;
          logsConsoleWindow.appendChild(row);
        }
      });

      if (appendedNew) {
        logsConsoleWindow.scrollTop = logsConsoleWindow.scrollHeight;
        if (logUpdateCount) logUpdateCount.textContent = `${logHistorySet.size} eventos`;
      }
    }

    // Atualiza ícones Lucide recém-injetados se houver
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Limpar logs na tela
  if (btnClearLogs) {
    btnClearLogs.addEventListener("click", () => {
      if (logsConsoleWindow) logsConsoleWindow.innerHTML = "";
      logHistorySet.clear();
      if (logUpdateCount) logUpdateCount.textContent = "0 eventos";
    });
  }

  /**
   * Gera o buffer de texto ASCII/Unicode idêntico ao console Rich
   */
  function generateRichConsoleBuffer(state) {
    if (!state) return "Nenhum dado recebido do motor quantitativo.";

    const p = state.prices || {};
    const f = state.futures || {};
    const alt = state.altseason || {};
    const pivot = state.pivot_and_entries || {};
    const factors = state.down_factors || [];
    const orders = state.order_probabilities || [];
    const entries = pivot.dynamic_entries || [];
    const targets = pivot.targets || [];

    const lines = [];
    lines.push("┌────────────────────────────────────────────────────────────────────────────────────────┐");
    lines.push("│                      ◆ QUANT TERMINAL INSTITUCIONAL - RICH VIEW ◆                      │");
    lines.push("│                          BINANCE FUTURES & ON-CHAIN ENGINE                             │");
    lines.push("├────────────────────────────────────────────────────────────────────────────────────────┤");
    lines.push(`│ ETH: $${(p.eth||0).toFixed(2).padEnd(9)} BTC: $${(p.btc||0).toFixed(2).padEnd(10)} ETH/BTC: ${(p.ethbtc||0).toFixed(5).padEnd(9)} USDT/BRL: R$${(p.usdtbrl||0).toFixed(2).padEnd(6)} │`);
    lines.push(`│ Funding 8h: ${((f.funding_rate||0)*100).toFixed(4)}% | OI: ${Math.round(f.open_interest_eth||0)} ETH | L/S: ${(f.long_short_ratio||1).toFixed(2)} (L: ${(f.long_pct||50).toFixed(1)}% / S: ${(f.short_pct||50).toFixed(1)}%)       │`);
    lines.push("├────────────────────────────────────────────────────────────────────────────────────────┤");
    lines.push(`│ BLOCO 2: TERMÔMETRO ALTSEASON: [${alt.unicode_bar||'████░░░░░░'}] ${(alt.index_pct||0).toFixed(1)}% (${alt.stage||'Neutro'})`);
    lines.push(`│ Paridade ETH/BTC: ${alt.ethbtc_status||'Abaixo da resistência'} | BTC.D: ${alt.btc_dominance||56.5}% | Alts: ${alt.alt_vs_btc_outperforming||16}/50`);
    lines.push("├────────────────────────────────────────────────────────────────────────────────────────┤");
    lines.push("│ BLOCO 1: FATORES DA DESCIDA                     │ BLOCO 3: PIVÔ DE ALTA & FIBONACCI    │");
    lines.push("├─────────────────────────────────────────────────┼──────────────────────────────────────┤");

    const maxRows = Math.max(factors.length, 5);
    for (let i = 0; i < maxRows; i++) {
      const fact = factors[i];
      let left = " ".padEnd(47);
      if (fact) {
        const st = fact.active ? "[✔ ATIVO]    " : "[✖ DESARMADO]";
        const nameTrunc = fact.name.substring(0, 31).padEnd(31);
        left = `${nameTrunc} ${st}`;
      }

      let right = " ".padEnd(36);
      if (i === 0) {
        right = pivot.pivot_confirmed ? "[ALERTA: PIVÔ DE ALTA CONFIRMADO]   " : "[MODO VIGENTE: CORREÇÃO / DESCIDA]  ";
      } else if (i === 1) {
        right = `Pullback 0.382: $${(entries[0]?.price_usdt||0).toFixed(2).padEnd(20)}`;
      } else if (i === 2) {
        right = `Golden Pocket : $${(entries[1]?.price_usdt||0).toFixed(2).padEnd(20)}`;
      } else if (i === 3) {
        right = `Reteste 2.720 : $${(entries[2]?.price_usdt||0).toFixed(2).padEnd(20)}`;
      } else if (i === 4) {
        right = `Alvo 1 Fibo   : $${(targets[0]?.price_usdt||4200).toFixed(2).padEnd(20)}`;
      }

      lines.push(`│ ${left} │ ${right} │`);
    }

    lines.push("├─────────────────────────────────────────────────┴──────────────────────────────────────┤");
    lines.push("│ MEDIDOR DE PROBABILIDADE DAS ORDENS LIMITE:                                           │");
    orders.forEach(o => {
      const name = o.name || o.label || "Ordem";
      const price = o.price_usdt || o.price || 0;
      const sizeStr = o.size_str || (o.amount_eth ? `${o.amount_eth} ETH` : "");
      const prob = typeof o.prob_pct === "number" ? o.prob_pct : (typeof o.probability === "number" ? o.probability : 50);
      const probBar = o.prob_bar || (o.progress_bar ? `[${o.progress_bar}]` : "[████░░░░░░]");
      const confluence = (o.confluence || o.notes || "Suporte").substring(0, 27);
      const pStr = `${name} ($${price.toFixed(2)}) ${sizeStr}`.padEnd(32);
      const bStr = `${probBar} ${prob.toFixed(1)}%`.padEnd(25);
      lines.push(`│ • ${pStr} ${bStr} ${confluence} │`);
    });
    lines.push("└────────────────────────────────────────────────────────────────────────────────────────┘");

    return lines.join("\n");
  }

  // Abertura / Fechamento do Modal Terminal
  if (btnToggleTerminalView) {
    btnToggleTerminalView.addEventListener("click", () => {
      if (terminalModalOverlay) {
        terminalModalOverlay.style.display = "flex";
        if (richConsoleOutput) {
          richConsoleOutput.textContent = generateRichConsoleBuffer(latestState);
        }
      }
    });
  }

  if (btnCloseTerminalModal) {
    btnCloseTerminalModal.addEventListener("click", () => {
      if (terminalModalOverlay) terminalModalOverlay.style.display = "none";
    });
  }

  if (btnRefreshConsole) {
    btnRefreshConsole.addEventListener("click", () => {
      if (richConsoleOutput) {
        richConsoleOutput.textContent = generateRichConsoleBuffer(latestState);
      }
    });
  }

  // Fecha modal ao clicar fora
  window.addEventListener("click", (e) => {
    if (e.target === terminalModalOverlay) {
      terminalModalOverlay.style.display = "none";
    }
  });

  // Polling inicial e loop de 1.5s
  fetchQuantState();
  pollInterval = setInterval(fetchQuantState, 1500);

  // Status do Telegram
  fetchTelegramStatus();
  setInterval(fetchTelegramStatus, 15000);
});
