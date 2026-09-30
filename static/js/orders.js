/**
 * Binance Market Terminal - Manual Trade Orders & Position Tracker
 * Registra ordens de compra/venda manuais, plota linhas no gráfico,
 * calcula preço médio (PM), custo total e lucros (PnL) em tempo real.
 */

// Default Registered User Buy Orders
const DEFAULT_USER_ORDERS = [
  { id: 'ord_buy_1', side: 'BUY', amount: 0.2662, price: 2530.0, total: 673.486, date: '2026-09-29 21:00', notes: 'Ordem de compra 1' },
  { id: 'ord_buy_2', side: 'BUY', amount: 0.1557, price: 2585.0, total: 402.4845, date: '2026-09-29 21:15', notes: 'Ordem de compra 2' },
  { id: 'ord_buy_3', side: 'BUY', amount: 0.3188, price: 2480.0, total: 790.624, date: '2026-09-29 21:30', notes: 'Ordem de compra 3' },
  { id: 'ord_buy_4', side: 'BUY', amount: 0.9570, price: 2530.0, total: 2421.21, date: '2026-09-29 21:45', notes: 'Ordem de compra 4' },
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
 * Calcula métricas da carteira / posição em tempo real
 */
function calculatePositionSummary() {
  const buys = userTradeOrders.filter(o => o.side === 'BUY');
  const sells = userTradeOrders.filter(o => o.side === 'SELL');

  const totalBuyEth = buys.reduce((acc, o) => acc + (parseFloat(o.amount) || 0), 0);
  const totalBuyCost = buys.reduce((acc, o) => acc + ((parseFloat(o.amount) || 0) * (parseFloat(o.price) || 0)), 0);

  const totalSellEth = sells.reduce((acc, o) => acc + (parseFloat(o.amount) || 0), 0);
  const totalSellRevenue = sells.reduce((acc, o) => acc + ((parseFloat(o.amount) || 0) * (parseFloat(o.price) || 0)), 0);

  const netEth = Math.max(0, totalBuyEth - totalSellEth);
  const avgBuyPrice = totalBuyEth > 0 ? (totalBuyCost / totalBuyEth) : 0;

  const curPrice = (typeof lastPrice === 'number' && lastPrice > 0) ? lastPrice : (avgBuyPrice || 2500);
  const curPositionValue = netEth * curPrice;

  // PnL Não Realizado da posição restante
  const unrealizedPnlUsdt = avgBuyPrice > 0 ? ((curPrice - avgBuyPrice) * netEth) : 0;
  const unrealizedPnlPercent = avgBuyPrice > 0 ? (((curPrice - avgBuyPrice) / avgBuyPrice) * 100) : 0;

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
    orderCount: userTradeOrders.length
  };
}

/**
 * Atualiza o painel rápido na barra de ferramentas e os dados do modal
 */
function updatePositionPnLUI(livePrice = null) {
  if (livePrice && livePrice > 0) {
    lastPrice = livePrice;
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

  // 2. Atualizar Pill Resumo no Toolbar
  const pillEth = document.getElementById('pillHoldingsEth');
  const pillPm = document.getElementById('pillAvgPrice');
  const pillPnl = document.getElementById('pillPnlText');
  const pillPill = document.getElementById('ordersQuickSummaryPill');

  if (pillEth) {
    pillEth.textContent = s.netEth > 0 ? `${formatEthQty(s.netEth)} ETH` : '0 ETH';
  }

  if (pillPm) {
    pillPm.textContent = s.avgBuyPrice > 0 ? `$${formatPrice(s.avgBuyPrice)}` : '$---';
  }

  if (pillPnl) {
    if (s.netEth > 0 && s.avgBuyPrice > 0) {
      const sign = s.unrealizedPnlUsdt >= 0 ? '+' : '';
      const pnlFormatted = `${sign}$${formatPrice(Math.abs(s.unrealizedPnlUsdt))} (${sign}${s.unrealizedPnlPercent.toFixed(2)}%)`;
      pillPnl.textContent = pnlFormatted;
      pillPnl.classList.remove('green', 'red');
      pillPnl.classList.add(s.unrealizedPnlUsdt >= 0 ? 'green' : 'red');
    } else {
      pillPnl.textContent = '$0.00 (0.00%)';
      pillPnl.classList.remove('green', 'red');
    }
  }

  if (pillPill) {
    pillPill.style.display = s.orderCount > 0 ? 'inline-flex' : 'none';
  }

  // 3. Atualizar Cards dentro do Modal (se estiver aberto ou existirem)
  const mEth = document.getElementById('modalEthHoldings');
  const mAvg = document.getElementById('modalAvgPrice');
  const mCost = document.getElementById('modalTotalCost');
  const mVal = document.getElementById('modalCurrentValue');
  const mPnl = document.getElementById('modalUnrealizedPnl');

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

/**
 * Plota as linhas de ordens de compra/venda e o Preço Médio no gráfico do TradingView
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

  // 3. Desenhar ordens individuais se habilitado
  if (showChartOrders) {
    userTradeOrders.forEach(order => {
      const isBuy = order.side === 'BUY';
      const color = isBuy ? '#0ecb81' : '#f6465d';
      const sideText = isBuy ? 'COMPRA' : 'VENDA';
      const solidStyle = (typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Solid !== undefined)
        ? LightweightCharts.LineStyle.Solid : 0;

      try {
        const line = candleSeries.createPriceLine({
          price: parseFloat(order.price),
          color: color,
          lineWidth: 2,
          lineStyle: solidStyle,
          axisLabelVisible: true,
          title: `[${sideText}] ${formatEthQty(order.amount)} ETH @ $${formatPrice(order.price)}`,
        });
        userChartOrderLines.set(order.id, line);
      } catch (e) {
        console.warn('Erro ao plotar linha de ordem no gráfico:', e);
      }
    });
  }

  // 4. Desenhar linha de Preço Médio (Breakeven) se houver ETH em carteira
  if (showChartBreakeven && s.netEth > 0 && s.avgBuyPrice > 0) {
    const dashedStyle = (typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Dashed !== undefined)
      ? LightweightCharts.LineStyle.Dashed : 2;

    try {
      userBreakevenLine = candleSeries.createPriceLine({
        price: parseFloat(s.avgBuyPrice),
        color: '#f0b90b', // Amarelo Binance Gold
        lineWidth: 2,
        lineStyle: dashedStyle,
        axisLabelVisible: true,
        title: `🎯 PM: $${formatPrice(s.avgBuyPrice)} (${formatEthQty(s.netEth)} ETH)`,
      });
    } catch (e) {
      console.warn('Erro ao plotar linha de Preço Médio no gráfico:', e);
    }
  }

  console.log(`[Orders] Plotadas ${userChartOrderLines.size} ordens e PM no gráfico.`);
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

  // Se a função de salvar layout estiver disponível, sincronizar
  if (typeof saveLayoutDebounced === 'function') {
    saveLayoutDebounced();
  } else {
    // Envio direto para /api/settings
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
 * Adiciona uma nova ordem manual
 */
function addUserTradeOrder(side, amount, price, notes = '', date = null) {
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

  const order = {
    id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    side: side === 'SELL' ? 'SELL' : 'BUY',
    amount: numAmount,
    price: numPrice,
    total: numAmount * numPrice,
    date: dateStr,
    status: 'FILLED',
    notes: notes || `${side === 'BUY' ? 'Compra' : 'Venda'} manual de ${formatEthQty(numAmount)} ETH`
  };

  userTradeOrders.push(order);

  renderOrderLinesOnChart();
  renderOrdersListInModal();
  updatePositionPnLUI();
  persistUserOrders();

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
    const row = document.createElement('div');
    row.className = `order-row-item ${isBuy ? 'order-side-buy' : 'order-side-sell'}`;

    const totalVal = (parseFloat(ord.amount) * parseFloat(ord.price)) || 0;

    row.innerHTML = `
      <div class="order-col-side">
        <span class="order-side-badge ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'COMPRA' : 'VENDA'}</span>
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
      <div class="order-col-action">
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
  const inputNotes = document.getElementById('inputOrderNotes');

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

      addUserTradeOrder(selectedOrderSide, amtVal, prcVal, notes, dateStr);

      // Limpar campos
      if (inputAmount) inputAmount.value = '';
      if (inputNotes) inputNotes.value = '';
      calculateOrderTotalPreview();
    });
  }

  // 7. Excluir ordem individual na lista
  if (listContainer) {
    listContainer.addEventListener('click', (e) => {
      const btnDel = e.target.closest('.order-btn-delete');
      if (!btnDel) return;
      const id = btnDel.dataset.id;
      if (id && confirm('Deseja excluir esta ordem do histórico e do gráfico?')) {
        removeUserTradeOrder(id);
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
  // Tentar carregar ordens do cache local de imediato
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
