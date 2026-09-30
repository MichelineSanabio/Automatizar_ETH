/**
 * Binance Market Terminal - Manual Trade Orders & Position Tracker Engine
 * Registra ordens limit/market manuais, plota linhas coloridas no gráfico,
 * verifica execução condicional ao toque de preço e calcula PnL apenas de ordens executadas.
 */

// Default Registered User Buy Orders (Todas iniciam PENDING aguardando o preço do gráfico atingir)
const DEFAULT_USER_ORDERS = [
  { id: 'ord_buy_1', side: 'BUY', amount: 0.2662, price: 2530.0, total: 673.486, date: '2026-09-29 21:00', status: 'PENDING', notes: 'Ordem de Compra Limit (0,2662 ETH @ $2530)' },
  { id: 'ord_buy_2', side: 'BUY', amount: 0.1557, price: 2585.0, total: 402.4845, date: '2026-09-29 21:15', status: 'PENDING', notes: 'Ordem de Compra Limit (0,1557 ETH @ $2585)' },
  { id: 'ord_buy_3', side: 'BUY', amount: 0.3188, price: 2480.0, total: 790.624, date: '2026-09-29 21:30', status: 'PENDING', notes: 'Ordem de Compra Limit (0,3188 ETH @ $2480)' },
  { id: 'ord_buy_4', side: 'BUY', amount: 0.9570, price: 2530.0, total: 2421.21, date: '2026-09-29 21:45', status: 'PENDING', notes: 'Ordem de Compra Limit (0,9570 ETH @ $2530)' },
];

// Global State
let userTradeOrders = [];
let userChartOrderLines = new Map();
let userBreakevenLine = null;
let showChartOrders = true;
let showChartBreakeven = true;
let selectedOrderSide = 'BUY'; // 'BUY' ou 'SELL'

/**
 * Utilitário de formatação de quantidade ETH
 */
function formatEthQty(num) {
  const val = parseFloat(num);
  if (isNaN(val)) return '0.0000';
  return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/**
 * Exibe notificação flutuante de execução de ordem
 */
function showOrderExecutionToast(msg) {
  let toast = document.getElementById('orderExecutionToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'orderExecutionToast';
    toast.className = 'order-execution-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i data-lucide="check-circle" style="vertical-align: middle; margin-right: 6px; color: #0ecb81;"></i> <span>${msg}</span>`;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  if (window.lucide) { try { lucide.createIcons(); } catch(e){} }
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 400);
  }, 5000);
}

/**
 * Calcula métricas da carteira / posição em tempo real.
 * REGRA: Apenas ordens com status 'FILLED' (executadas quando o preço atinge)
 * entram no cálculo da Posição, Custo, Preço Médio e PnL!
 */
function calculatePositionSummary() {
  const buys = userTradeOrders.filter(o => o.side === 'BUY' && o.status === 'FILLED');
  const sells = userTradeOrders.filter(o => o.side === 'SELL' && o.status === 'FILLED');
  const pendingOrders = userTradeOrders.filter(o => o.status !== 'FILLED');

  const totalBuyEth = buys.reduce((acc, o) => acc + (parseFloat(o.amount) || 0), 0);
  const totalBuyCost = buys.reduce((acc, o) => acc + ((parseFloat(o.amount) || 0) * (parseFloat(o.price) || 0)), 0);

  const totalSellEth = sells.reduce((acc, o) => acc + (parseFloat(o.amount) || 0), 0);
  const totalSellRevenue = sells.reduce((acc, o) => acc + ((parseFloat(o.amount) || 0) * (parseFloat(o.price) || 0)), 0);

  const netEth = Math.max(0, totalBuyEth - totalSellEth);
  const avgBuyPrice = totalBuyEth > 0 ? (totalBuyCost / totalBuyEth) : 0;

  const curPrice = (typeof lastPrice === 'number' && lastPrice > 0) ? lastPrice : (avgBuyPrice || 2500);
  const curPositionValue = netEth * curPrice;

  // PnL Não Realizado da posição restante
  const unrealizedPnlUsdt = (netEth > 0 && avgBuyPrice > 0) ? ((curPrice - avgBuyPrice) * netEth) : 0;
  const unrealizedPnlPercent = (netEth > 0 && avgBuyPrice > 0) ? (((curPrice - avgBuyPrice) / avgBuyPrice) * 100) : 0;

  // PnL Realizado de vendas
  let realizedPnlUsdt = 0;
  if (totalSellEth > 0 && avgBuyPrice > 0) {
    realizedPnlUsdt = totalSellRevenue - (totalSellEth * avgBuyPrice);
  }

  return {
    totalBuyEth,
    totalBuyCost,
    totalSellEth,
    totalSellRevenue,
    netEth,
    avgBuyPrice,
    curPrice,
    curPositionValue,
    unrealizedPnlUsdt,
    unrealizedPnlPercent,
    realizedPnlUsdt,
    orderCount: userTradeOrders.length,
    filledCount: buys.length + sells.length,
    pendingCount: pendingOrders.length,
    pendingOrders
  };
}

/**
 * Verifica em tempo real se o preço de mercado atingiu alguma ordem pendente.
 * Se atingir, executa a ordem imediatamente!
 */
function checkPendingOrdersExecution(currentPrice) {
  if (!currentPrice || currentPrice <= 0 || !Array.isArray(userTradeOrders)) return;

  let anyExecuted = false;

  userTradeOrders.forEach(order => {
    if (order.status === 'FILLED') return;

    const orderPrice = parseFloat(order.price);
    const isBuy = order.side === 'BUY';

    // REGRA DE EXECUÇÃO:
    // COMPRA: executa se o mercado caiu até a ordem (currentPrice <= orderPrice)
    // VENDA: executa se o mercado subiu até a ordem (currentPrice >= orderPrice)
    const triggered = isBuy ? (currentPrice <= orderPrice) : (currentPrice >= orderPrice);

    if (triggered) {
      order.status = 'FILLED';
      order.executedAt = new Date().toISOString();
      order.executedPrice = currentPrice;
      anyExecuted = true;

      const sideName = isBuy ? 'COMPRA' : 'VENDA';
      showOrderExecutionToast(`🎯 ORDEM DE ${sideName} EXECUTADA! ${formatEthQty(order.amount)} ETH @ $${formatPrice(orderPrice)} atingido pelo mercado.`);
      console.log(`[Orders Engine] Ordem ${order.id} executada a $${currentPrice}!`);
    }
  });

  if (anyExecuted) {
    persistUserOrders();
    renderOrderLinesOnChart();
    renderOrdersListInModal();
    updatePositionPnLUI();
  }
}

/**
 * Atualiza o painel rápido na barra de ferramentas e os dados do modal
 */
function updatePositionPnLUI(livePrice = null) {
  if (livePrice && livePrice > 0) {
    lastPrice = livePrice;
    checkPendingOrdersExecution(livePrice);
  }

  const s = calculatePositionSummary();

  // 1. Atualizar todos os badges de contagem de ordens
  const badges = [
    document.getElementById('ordersCountBadge'),
    document.getElementById('ordersNavBadge'),
    document.getElementById('ordersHeaderBadge'),
    document.getElementById('modalOrdersCount')
  ];
  badges.forEach(badge => {
    if (badge) {
      badge.textContent = s.orderCount;
      badge.style.display = s.orderCount > 0 ? 'inline-block' : 'none';
    }
  });

  // 2. Atualizar Pill Resumo na Barra Superior
  const pillPill = document.getElementById('ordersQuickSummaryPill');
  if (pillPill) {
    if (s.orderCount === 0) {
      pillPill.style.display = 'none';
    } else {
      pillPill.style.display = 'inline-flex';

      if (s.filledCount === 0 && s.pendingCount > 0) {
        // Todas as ordens estão aguardando o preço no gráfico
        pillPill.innerHTML = `
          <span class="pill-label">Ordens:</span>
          <strong class="pill-eth font-mono" style="color: #00e676;">${s.pendingCount} Pendentes</strong>
          <span class="pill-sep">•</span>
          <span class="pill-label">Status:</span>
          <strong class="pill-pm font-mono" style="color: #f0b90b;">Aguardando Preço no Gráfico</strong>
        `;
      } else {
        // Há ordens executadas
        const sign = s.unrealizedPnlUsdt >= 0 ? '+' : '';
        const pnlFormatted = `${sign}$${formatPrice(Math.abs(s.unrealizedPnlUsdt))} (${sign}${s.unrealizedPnlPercent.toFixed(2)}%)`;
        const pnlColorClass = s.unrealizedPnlUsdt >= 0 ? 'green' : 'red';

        pillPill.innerHTML = `
          <span class="pill-label">Posição:</span>
          <strong class="pill-eth font-mono" id="pillHoldingsEth">${formatEthQty(s.netEth)} ETH</strong>
          <span class="pill-sep">•</span>
          <span class="pill-label">PM:</span>
          <strong class="pill-pm font-mono" id="pillAvgPrice">$${formatPrice(s.avgBuyPrice)}</strong>
          <span class="pill-sep">•</span>
          <span class="pill-label">PnL:</span>
          <strong class="pill-pnl font-mono ${pnlColorClass}" id="pillPnlText">${pnlFormatted}</strong>
          ${s.pendingCount > 0 ? `<span class="pill-sep">•</span><small style="color:#00e676; font-size:10px;">(${s.pendingCount} pendentes)</small>` : ''}
        `;
      }
    }
  }

  // 3. Atualizar Cards dentro do Modal
  const mEth = document.getElementById('modalEthHoldings');
  const mAvg = document.getElementById('modalAvgPrice');
  const mCost = document.getElementById('modalTotalCost');
  const mVal = document.getElementById('modalCurrentValue');
  const mPnl = document.getElementById('modalUnrealizedPnl');

  if (s.filledCount === 0 && s.pendingCount > 0) {
    // Modo Aguardando Execução
    if (mEth) mEth.textContent = `0.0000 ETH (${s.pendingCount} Pendentes)`;
    if (mAvg) mAvg.textContent = `$0.00 (Aguardando Toque)`;
    if (mCost) mCost.textContent = `$0.00`;
    if (mVal) mVal.textContent = `$0.00`;
    if (mPnl) {
      mPnl.textContent = `$0.00 (0.00%)`;
      mPnl.className = 'metric-value';
    }
  } else {
    // Modo com Posição Executada
    if (mEth) mEth.textContent = `${formatEthQty(s.netEth)} ETH`;
    if (mAvg) mAvg.textContent = s.avgBuyPrice > 0 ? `$${formatPrice(s.avgBuyPrice)}` : '$0.00';
    if (mCost) mCost.textContent = `$${formatPrice(s.totalBuyCost)}`;
    if (mVal) mVal.textContent = `$${formatPrice(s.curPositionValue)}`;

    if (mPnl) {
      if (s.netEth > 0 && s.avgBuyPrice > 0) {
        const sign = s.unrealizedPnlUsdt >= 0 ? '+' : '';
        mPnl.textContent = `${sign}$${formatPrice(Math.abs(s.unrealizedPnlUsdt))} (${sign}${s.unrealizedPnlPercent.toFixed(2)}%)`;
        mPnl.className = 'metric-value ' + (s.unrealizedPnlUsdt >= 0 ? 'green' : 'red');
      } else {
        mPnl.textContent = '$0.00 (0.00%)';
        mPnl.className = 'metric-value';
      }
    }
  }
}

/**
 * Plota as linhas de ordens de compra/venda e o Preço Médio no gráfico do TradingView.
 * - Ordens de COMPRA PENDENTES: Verde Neon (#00e676) tracejado, destacando que aguarda o preço.
 * - Ordens de COMPRA EXECUTADAS: Verde sólido (#0ecb81).
 * - Ordens de VENDA PENDENTES: Vermelho tracejado (#ff5252).
 * - Preço Médio (🎯 PM): Dourado (#f0b90b) pontilhado (apenas se houver ETH executado!).
 */
function renderOrderLinesOnChart() {
  if (!candleSeries) return;

  // Garantir que ordens estejam carregadas
  if (!Array.isArray(userTradeOrders) || userTradeOrders.length === 0) {
    try {
      const cached = localStorage.getItem('binance_user_orders');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          userTradeOrders = parsed;
        }
      }
    } catch(e) {}

    if (!Array.isArray(userTradeOrders) || userTradeOrders.length === 0) {
      userTradeOrders = [...DEFAULT_USER_ORDERS];
      try {
        localStorage.setItem('binance_user_orders', JSON.stringify(userTradeOrders));
      } catch (e) {}
    }
  }

  // 1. Limpar linhas anteriores de ordens
  userChartOrderLines.forEach(line => {
    try { candleSeries.removePriceLine(line); } catch (e) {}
  });
  userChartOrderLines.clear();

  // 2. Limpar linha de Preço Médio anterior
  if (userBreakevenLine) {
    try { candleSeries.removePriceLine(userBreakevenLine); } catch (e) {}
    userBreakevenLine = null;
  }

  const s = calculatePositionSummary();

  const dashedStyle = (typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Dashed !== undefined)
    ? LightweightCharts.LineStyle.Dashed : 2;
  const solidStyle = (typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Solid !== undefined)
    ? LightweightCharts.LineStyle.Solid : 0;

  // 3. Desenhar ordens individuais se habilitado
  if (showChartOrders) {
    userTradeOrders.forEach(order => {
      const isBuy = order.side === 'BUY';
      const isFilled = order.status === 'FILLED';

      // Cores: Verde Neon brilhante (#00e676) para Compra Pendente (diferente da linha de preço atual!)
      let color;
      let lineStyle;
      let statusLabel;

      if (isBuy) {
        if (isFilled) {
          color = '#0ecb81'; // Verde Binance Executado
          lineStyle = solidStyle;
          statusLabel = '✅ COMPRA EXEC';
        } else {
          color = '#00e676'; // Verde Neon brilhante Pendente (fácil distinção visual)
          lineStyle = dashedStyle; // Tracejado = Aguardando Toque
          statusLabel = '🟢 COMPRA PENDENTE';
        }
      } else {
        if (isFilled) {
          color = '#f6465d'; // Vermelho Executado
          lineStyle = solidStyle;
          statusLabel = '✅ VENDA EXEC';
        } else {
          color = '#ff5252'; // Vermelho vivo tracejado
          lineStyle = dashedStyle;
          statusLabel = '🔴 VENDA PENDENTE';
        }
      }

      try {
        const line = candleSeries.createPriceLine({
          price: parseFloat(order.price),
          color: color,
          lineWidth: isFilled ? 1 : 2,
          lineStyle: lineStyle,
          axisLabelVisible: true,
          title: `[${statusLabel}] ${formatEthQty(order.amount)} ETH @ $${formatPrice(order.price)}`,
        });
        userChartOrderLines.set(order.id, line);
      } catch (e) {
        console.warn('Erro ao plotar linha de ordem no gráfico:', e);
      }
    });
  }

  // 4. Desenhar linha de Preço Médio (Breakeven) APENAS se houver ETH executado em carteira
  if (showChartBreakeven && s.netEth > 0 && s.avgBuyPrice > 0) {
    try {
      userBreakevenLine = candleSeries.createPriceLine({
        price: parseFloat(s.avgBuyPrice),
        color: '#f0b90b', // Amarelo Binance Gold
        lineWidth: 2,
        lineStyle: dashedStyle,
        axisLabelVisible: true,
        title: `🎯 PM: $${formatPrice(s.avgBuyPrice)} (${formatEthQty(s.netEth)} ETH Executados)`,
      });
    } catch (e) {
      console.warn('Erro ao plotar linha de Preço Médio no gráfico:', e);
    }
  }

  console.log(`[Orders] Plotadas ${userChartOrderLines.size} ordens no gráfico.`);
  updatePositionPnLUI();
}

/**
 * Salva as ordens tanto no localStorage quanto no terminal_layout.json
 */
function persistUserOrders() {
  try {
    localStorage.setItem('binance_user_orders', JSON.stringify(userTradeOrders));
  } catch (e) {
    console.warn('[Orders] Falha ao gravar ordens no localStorage:', e);
  }

  if (typeof saveLayoutDebounced === 'function') {
    saveLayoutDebounced();
  } else {
    try {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: userTradeOrders })
      }).catch(err => console.warn('[Orders] Erro sync API:', err));
    } catch (e) {}
  }
}

/**
 * Alterna manualmente o status de uma ordem entre PENDING e FILLED
 */
function toggleOrderStatus(id) {
  const order = userTradeOrders.find(o => o.id === id);
  if (!order) return;

  if (order.status === 'FILLED') {
    order.status = 'PENDING';
    delete order.executedAt;
    delete order.executedPrice;
  } else {
    order.status = 'FILLED';
    order.executedAt = new Date().toISOString();
    order.executedPrice = order.price;
  }

  persistUserOrders();
  renderOrderLinesOnChart();
  renderOrdersListInModal();
  updatePositionPnLUI();
}

/**
 * Adiciona uma nova ordem manual
 */
function addUserTradeOrder(side, amount, price, notes = '', date = null, status = 'PENDING') {
  const numAmount = parseFloat(amount);
  const numPrice = parseFloat(price);

  if (isNaN(numAmount) || numAmount <= 0) {
    alert('Por favor, informe uma quantidade de ETH válida (maior que 0).');
    return null;
  }

  if (isNaN(numPrice) || numPrice <= 0) {
    alert('Por favor, informe um preço de execução USDT válido (maior que 0).');
    return null;
  }

  const now = new Date();
  const dateStr = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const curPrice = (typeof lastPrice === 'number' && lastPrice > 0) ? lastPrice : 0;
  let finalStatus = status;

  // Se o preço atual de mercado já atingiu a ordem no momento do cadastro:
  if (curPrice > 0 && finalStatus === 'PENDING') {
    const isBuy = side === 'BUY';
    const isImmediate = isBuy ? (curPrice <= numPrice) : (curPrice >= numPrice);
    if (isImmediate) {
      finalStatus = 'FILLED';
    }
  }

  const order = {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    side: side === 'SELL' ? 'SELL' : 'BUY',
    amount: numAmount,
    price: numPrice,
    total: numAmount * numPrice,
    date: dateStr,
    status: finalStatus,
    notes: notes || `${side === 'BUY' ? 'Compra' : 'Venda'} ${finalStatus === 'PENDING' ? 'Limit Pendente' : 'Executada'} de ${formatEthQty(numAmount)} ETH`
  };

  userTradeOrders.push(order);

  renderOrderLinesOnChart();
  renderOrdersListInModal();
  updatePositionPnLUI();
  persistUserOrders();

  if (finalStatus === 'PENDING') {
    showOrderExecutionToast(`🟢 Ordem ${side === 'BUY' ? 'COMPRA' : 'VENDA'} Pendente registrada! Linha traçada no gráfico em $${formatPrice(numPrice)}.`);
  }

  return order;
}

/**
 * Exclui uma ordem individual
 */
function removeUserTradeOrder(id) {
  const line = userChartOrderLines.get(id);
  if (line && candleSeries) {
    try { candleSeries.removePriceLine(line); } catch (e) {}
  }
  userChartOrderLines.delete(id);

  userTradeOrders = userTradeOrders.filter(o => o.id !== id);

  renderOrderLinesOnChart();
  renderOrdersListInModal();
  updatePositionPnLUI();
  persistUserOrders();
}

/**
 * Exclui todas as ordens
 */
function clearAllUserTradeOrders() {
  userChartOrderLines.forEach(line => {
    if (candleSeries) {
      try { candleSeries.removePriceLine(line); } catch (e) {}
    }
  });
  userChartOrderLines.clear();

  if (userBreakevenLine && candleSeries) {
    try { candleSeries.removePriceLine(userBreakevenLine); } catch (e) {}
    userBreakevenLine = null;
  }

  userTradeOrders = [];

  renderOrderLinesOnChart();
  renderOrdersListInModal();
  updatePositionPnLUI();
  persistUserOrders();
}

/**
 * Renderiza a lista de ordens cadastradas dentro do Modal
 */
function renderOrdersListInModal() {
  const container = document.getElementById('ordersListContainer');
  const countEl = document.getElementById('modalOrdersCount');
  if (!container) return;

  if (countEl) countEl.textContent = userTradeOrders.length;

  if (userTradeOrders.length === 0) {
    container.innerHTML = `
      <div class="markings-empty-state">
        <i data-lucide="wallet"></i>
        <span>Nenhuma ordem de compra ou venda cadastrada.</span>
        <small>Adicione suas ordens acima para registrar no gráfico e calcular seus lucros.</small>
      </div>
    `;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
    return;
  }

  container.innerHTML = '';
  // Ordenar as mais recentes primeiro
  const sorted = [...userTradeOrders].reverse();

  sorted.forEach(ord => {
    const isBuy = ord.side === 'BUY';
    const isFilled = ord.status === 'FILLED';
    const row = document.createElement('div');
    row.className = `order-row-item ${isBuy ? 'order-side-buy' : 'order-side-sell'}`;

    const totalVal = (parseFloat(ord.amount) * parseFloat(ord.price)) || 0;

    row.innerHTML = `
      <div class="order-col-side">
        <span class="order-side-badge ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'COMPRA' : 'VENDA'}</span>
        <div style="margin-top: 4px;">
          <span class="order-status-badge ${isFilled ? 'filled' : 'pending'}">
            ${isFilled ? '✅ Executada' : '⏳ Aguardando'}
          </span>
        </div>
      </div>
      <div class="order-col-details">
        <div class="order-main-info">
          <strong class="order-amount font-mono">${formatEthQty(ord.amount)} ETH</strong>
          <span class="order-at">@</span>
          <span class="order-price font-mono">$${formatPrice(ord.price)}</span>
        </div>
        <div class="order-sub-info">
          <span class="order-total font-mono">Total: $${formatPrice(totalVal)} USDT</span>
          <span class="order-sep">•</span>
          <span class="order-date">${ord.date || 'Data não inf.'}</span>
          ${ord.notes ? `<span class="order-notes">(${ord.notes})</span>` : ''}
        </div>
      </div>
      <div class="order-col-action" style="display: flex; align-items: center;">
        <button class="order-btn-toggle-status ${isFilled ? 'is-filled' : ''}" data-id="${ord.id}" title="${isFilled ? 'Voltar para Aguardando Preço (Pendente)' : 'Simular execução imediata da ordem'}">
          <i data-lucide="${isFilled ? 'rotate-ccw' : 'check'}"></i>
          <span>${isFilled ? 'Tornar Pendente' : 'Executar Já'}</span>
        </button>
        <button class="order-btn-delete" data-id="${ord.id}" title="Excluir esta ordem">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    container.appendChild(row);
  });

  if (window.lucide) {
    try { lucide.createIcons(); } catch (e) {}
  }
}

/**
 * Abre o Modal de Gerenciamento de Ordens e Posição
 */
function openOrdersModal() {
  const modal = document.getElementById('modalOrdersBackdrop');
  const inputPrice = document.getElementById('inputOrderPrice');
  const inputAmount = document.getElementById('inputOrderAmount');
  const inputDate = document.getElementById('inputOrderDate');

  if (!modal) return;

  // Preencher preço atual se o campo estiver vazio
  if (inputPrice && (!inputPrice.value || parseFloat(inputPrice.value) <= 0)) {
    if (typeof lastPrice === 'number' && lastPrice > 0) {
      inputPrice.value = lastPrice.toFixed(2);
    }
  }

  // Preencher data/hora atual se vazio
  if (inputDate && !inputDate.value) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    inputDate.value = dateStr;
  }

  calculateOrderTotalPreview();
  renderOrdersListInModal();
  updatePositionPnLUI();

  modal.style.display = 'flex';
  if (inputAmount) inputAmount.focus();
}

/**
 * Fecha o Modal de Gerenciamento de Ordens
 */
function closeOrdersModal() {
  const modal = document.getElementById('modalOrdersBackdrop');
  if (modal) modal.style.display = 'none';
}

/**
 * Atualiza o preview do valor total (Qtd * Preço)
 */
function calculateOrderTotalPreview() {
  const inputAmount = document.getElementById('inputOrderAmount');
  const inputPrice = document.getElementById('inputOrderPrice');
  const previewEl = document.getElementById('orderTotalPreview');

  if (!previewEl) return;

  const amt = parseFloat(inputAmount ? inputAmount.value : 0) || 0;
  const prc = parseFloat(inputPrice ? inputPrice.value : 0) || 0;
  const total = amt * prc;

  previewEl.textContent = `$${formatPrice(total)} USDT`;
}

/**
 * Inicialização dos Event Listeners do Módulo de Ordens
 */
function initOrdersUI() {
  const btnOpen = document.getElementById('btnOpenOrdersTracker');
  const pillQuick = document.getElementById('ordersQuickSummaryPill');
  const btnClose = document.getElementById('btnCloseOrdersModal');
  const modal = document.getElementById('modalOrdersBackdrop');
  const btnConfirm = document.getElementById('btnConfirmAddOrder');
  const btnUseLive = document.getElementById('btnOrderUseLivePrice');
  const btnClearAll = document.getElementById('btnClearAllOrders');
  const listContainer = document.getElementById('ordersListContainer');

  const btnSideBuy = document.getElementById('btnSideBuy');
  const btnSideSell = document.getElementById('btnSideSell');
  const inputAmount = document.getElementById('inputOrderAmount');
  const inputPrice = document.getElementById('inputOrderPrice');

  const chkShowOrders = document.getElementById('chkShowOrdersOnChart');
  const chkShowBreakeven = document.getElementById('chkShowBreakevenOnChart');

  // 1. Abrir Modal
  const openButtons = [
    btnOpen,
    document.getElementById('btnOpenOrdersTrackerNav'),
    document.getElementById('btnHeaderOrders'),
    pillQuick
  ];
  openButtons.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', openOrdersModal);
    }
  });

  // 2. Fechar Modal
  if (btnClose) {
    btnClose.addEventListener('click', closeOrdersModal);
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeOrdersModal();
    });
  }

  // 3. Alternar Lado (COMPRA / VENDA)
  if (btnSideBuy && btnSideSell) {
    btnSideBuy.addEventListener('click', () => {
      selectedOrderSide = 'BUY';
      btnSideBuy.classList.add('active');
      btnSideSell.classList.remove('active');
      if (btnConfirm) {
        btnConfirm.className = 'btn btn-primary btn-add-order btn-buy';
        btnConfirm.innerHTML = '<i data-lucide="plus"></i> <span>Registrar Compra</span>';
        if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
      }
    });

    btnSideSell.addEventListener('click', () => {
      selectedOrderSide = 'SELL';
      btnSideSell.classList.add('active');
      btnSideBuy.classList.remove('active');
      if (btnConfirm) {
        btnConfirm.className = 'btn btn-danger btn-add-order btn-sell';
        btnConfirm.innerHTML = '<i data-lucide="arrow-down-circle"></i> <span>Registrar Venda</span>';
        if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
      }
    });
  }

  // 4. Preview do Total em tempo real ao digitar
  if (inputAmount) {
    inputAmount.addEventListener('input', calculateOrderTotalPreview);
  }
  if (inputPrice) {
    inputPrice.addEventListener('input', calculateOrderTotalPreview);
  }

  // 5. Botão "Preço Atual"
  if (btnUseLive) {
    btnUseLive.addEventListener('click', () => {
      if (inputPrice && typeof lastPrice === 'number' && lastPrice > 0) {
        inputPrice.value = lastPrice.toFixed(2);
        calculateOrderTotalPreview();
      }
    });
  }

  // 6. Botão "Confirmar Registro"
  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      const amtVal = inputAmount ? parseFloat(inputAmount.value) : 0;
      const prcVal = inputPrice ? parseFloat(inputPrice.value) : 0;
      const inputNotes = document.getElementById('inputOrderNotes');
      const inputDate = document.getElementById('inputOrderDate');

      if (isNaN(amtVal) || amtVal <= 0) {
        alert('Por favor, informe a quantidade de ETH.');
        if (inputAmount) inputAmount.focus();
        return;
      }

      if (isNaN(prcVal) || prcVal <= 0) {
        alert('Por favor, informe o preço em USDT.');
        if (inputPrice) inputPrice.focus();
        return;
      }

      const notes = inputNotes ? inputNotes.value.trim() : '';
      let dateStr = null;
      if (inputDate && inputDate.value) {
        dateStr = inputDate.value.replace('T', ' ');
      }

      addUserTradeOrder(selectedOrderSide, amtVal, prcVal, notes, dateStr, 'PENDING');

      // Limpar campos
      if (inputAmount) inputAmount.value = '';
      if (inputNotes) inputNotes.value = '';
      calculateOrderTotalPreview();
    });
  }

  // 7. Ações na lista de ordens (Excluir e Alternar Status)
  if (listContainer) {
    listContainer.addEventListener('click', (e) => {
      // Excluir
      const btnDel = e.target.closest('.order-btn-delete');
      if (btnDel) {
        const id = btnDel.dataset.id;
        if (id && confirm('Deseja excluir esta ordem do histórico e do gráfico?')) {
          removeUserTradeOrder(id);
        }
        return;
      }

      // Alternar Status (Pendente <-> Executada)
      const btnToggle = e.target.closest('.order-btn-toggle-status');
      if (btnToggle) {
        const id = btnToggle.dataset.id;
        if (id) {
          toggleOrderStatus(id);
        }
      }
    });
  }

  // 8. Botão "Limpar Todas"
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      if (userTradeOrders.length === 0) return;
      if (confirm('Tem certeza que deseja apagar todas as ordens salvas? Seus cálculos de carteira serão zerados.')) {
        clearAllUserTradeOrders();
      }
    });
  }

  // 9. Toggles de Visibilidade no Gráfico
  if (chkShowOrders) {
    chkShowOrders.addEventListener('change', (e) => {
      showChartOrders = e.target.checked;
      renderOrderLinesOnChart();
    });
  }
  if (chkShowBreakeven) {
    chkShowBreakeven.addEventListener('change', (e) => {
      showChartBreakeven = e.target.checked;
      renderOrderLinesOnChart();
    });
  }

  // 10. Atualizar PnL e dados iniciais
  updatePositionPnLUI();
}

// Inicializar na carga da página
document.addEventListener('DOMContentLoaded', () => {
  try {
    const local = localStorage.getItem('binance_user_orders');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        userTradeOrders = parsed;
      }
    }
  } catch (e) {}

  if (!Array.isArray(userTradeOrders) || userTradeOrders.length === 0) {
    userTradeOrders = [...DEFAULT_USER_ORDERS];
    try {
      localStorage.setItem('binance_user_orders', JSON.stringify(userTradeOrders));
    } catch (e) {}
  }

  initOrdersUI();
});
