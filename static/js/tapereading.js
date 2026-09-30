/**
 * Binance Market Terminal - Expanded Tape Reading & Time & Sales Pro
 */

// Tape Reading State
const tapeState = {
  activeView: 'chart',
  paused: false,
  queue: [],
  recentTrades: [],
  sizeFilter: 'all',
  sideFilter: 'all',
  buyVolume: 0,
  buyUsd: 0,
  sellVolume: 0,
  sellUsd: 0,
  maxBuyQty: 0,
  maxBuyPrice: 0,
  maxSellQty: 0,
  maxSellPrice: 0,
  timestamps: [],
  maxDomRows: 150,
};

// Switch between Chart, Order Book Lado a Lado, and Expanded Tape Reading View
function setMainView(view) {
  tapeState.activeView = view;

  // 1. Update Tab Buttons
  if (el.btnViewChart) el.btnViewChart.classList.toggle('active', view === 'chart');
  if (el.btnViewOrderBook) el.btnViewOrderBook.classList.toggle('active', view === 'orderbook');
  if (el.btnViewTape) el.btnViewTape.classList.toggle('active', view === 'tape');
  if (el.btnViewLiquidity) el.btnViewLiquidity.classList.toggle('active', view === 'liquidity');
  if (el.btnViewDataAnalysis) el.btnViewDataAnalysis.classList.toggle('active', view === 'data-analysis');

  // 2. Toggle Subviews
  if (el.chartMainView) {
    el.chartMainView.style.display = view === 'chart' ? 'flex' : 'none';
    el.chartMainView.classList.toggle('active', view === 'chart');
  }
  if (el.orderBookMainView) {
    el.orderBookMainView.style.display = view === 'orderbook' ? 'flex' : 'none';
    el.orderBookMainView.classList.toggle('active', view === 'orderbook');
  }
  if (el.tapeReadingMainView) {
    el.tapeReadingMainView.style.display = view === 'tape' ? 'flex' : 'none';
    el.tapeReadingMainView.classList.toggle('active', view === 'tape');
  }
  if (el.liquidityMainView) {
    el.liquidityMainView.style.display = view === 'liquidity' ? 'flex' : 'none';
    el.liquidityMainView.classList.toggle('active', view === 'liquidity');
    if (view === 'liquidity' && el.iframeLiquidity && (!el.iframeLiquidity.src || el.iframeLiquidity.src === 'about:blank' || el.iframeLiquidity.src === window.location.href)) {
      el.iframeLiquidity.src = '/liquidez';
    }
  }
  if (el.dataAnalysisMainView) {
    el.dataAnalysisMainView.style.display = view === 'data-analysis' ? 'flex' : 'none';
    el.dataAnalysisMainView.classList.toggle('active', view === 'data-analysis');
    if (view === 'data-analysis' && el.iframeDataAnalysis && (!el.iframeDataAnalysis.src || el.iframeDataAnalysis.src === 'about:blank' || el.iframeDataAnalysis.src === window.location.href)) {
      el.iframeDataAnalysis.src = '/data-analise';
    }
  }

  // 3. Toolbar Controls (Indicators and Intervals only relevant in Chart view)
  if (el.chartControlsGroup) {
    el.chartControlsGroup.style.display = view === 'chart' ? 'inline-flex' : 'none';
  }
  if (el.chartLegend) {
    el.chartLegend.style.display = view === 'chart' ? 'inline-flex' : 'none';
  }

  // 4. View-specific hooks
  if (view === 'chart') {
    if (tvChart && el.tvChartContainer) {
      tvChart.applyOptions({
        width: el.tvChartContainer.clientWidth,
        height: el.tvChartContainer.clientHeight,
      });
    }
  } else if (view === 'orderbook') {
    if (lastRawDepth) {
      renderOrderBook(lastRawDepth);
    }
    if (binanceActiveSubtab === 'depth' && typeof drawBinanceDepthChart === 'function') {
      setTimeout(() => drawBinanceDepthChart(), 50);
    } else if (binanceActiveSubtab === 'trades' && typeof renderBinanceTradesTab === 'function') {
      renderBinanceTradesTab();
    }
  }

  if (window.lucide) {
    try { lucide.createIcons(); } catch (e) {}
  }

  if (typeof saveLayoutDebounced === 'function') {
    saveLayoutDebounced();
  }
}

// Classify Order Size Tier
function getTradeTier(qty, price, symbol) {
  const isEth = symbol.startsWith('ETH');
  const usdValue = qty * price;

  if ((isEth && qty >= 10.0) || (!isEth && qty >= 0.5) || usdValue >= 25000.0) {
    const isMega = usdValue >= 100000.0 || (isEth && qty >= 50.0);
    return {
      id: 'whale',
      label: isMega ? '🐋 MEGA BALEIA' : '🐋 BALEIA',
      cssClass: isMega ? 'mega-whale' : 'whale',
      isWhale: true,
      isMegaWhale: isMega,
    };
  }
  if ((isEth && qty >= 5.0) || (!isEth && qty >= 0.25) || usdValue >= 12000.0) {
    return { id: 'shark', label: '🐬 TUBARÃO', cssClass: 'shark', isWhale: false, isMegaWhale: false };
  }
  if ((isEth && qty >= 1.0) || (!isEth && qty >= 0.05) || usdValue >= 2500.0) {
    return { id: 'medium', label: '🐟 MÉDIO', cssClass: 'medium', isWhale: false, isMegaWhale: false };
  }
  return { id: 'retail', label: '🦐 VAREJO', cssClass: 'retail', isWhale: false, isMegaWhale: false };
}

// Process Real-time Trade into Tape Reading Metrics
function processTapeReadingTrade(trade) {
  const price = parseFloat(trade.p);
  const qty = parseFloat(trade.q);
  const timeMs = trade.T || Date.now();
  const tradeId = trade.t || trade.a || Math.floor(Math.random() * 1000000);
  const isBuyerMaker = trade.m; // true = taker sell, false = taker buy
  const side = isBuyerMaker ? 'sell' : 'buy';
  const totalUSD = price * qty;
  const tier = getTradeTier(qty, price, currentSymbol);

  // Format millisecond time (HH:MM:SS.mmm)
  const dateObj = new Date(timeMs);
  const timeFormatted = dateObj.toTimeString().slice(0, 8) + '.' + String(dateObj.getMilliseconds()).padStart(3, '0');

  // 1. Update Aggression & Tape Metrics
  if (side === 'buy') {
    tapeState.buyVolume += qty;
    tapeState.buyUsd += totalUSD;
    if (qty > tapeState.maxBuyQty) {
      tapeState.maxBuyQty = qty;
      tapeState.maxBuyPrice = price;
    }
  } else {
    tapeState.sellVolume += qty;
    tapeState.sellUsd += totalUSD;
    if (qty > tapeState.maxSellQty) {
      tapeState.maxSellQty = qty;
      tapeState.maxSellPrice = price;
    }
  }

  // 2. Speed calculation (rolling window of 3 seconds)
  const now = Date.now();
  tapeState.timestamps.push(now);
  const cutoff = now - 3000;
  while (tapeState.timestamps.length > 0 && tapeState.timestamps[0] < cutoff) {
    tapeState.timestamps.shift();
  }
  const currentSpeed = (tapeState.timestamps.length / 3).toFixed(1);

  // 3. Update Dashboard DOM
  updateTapeDashboardUI(currentSpeed);

  // 4. Construct Item
  const tradeItem = {
    id: tradeId,
    timeFormatted,
    timeMs,
    side,
    price,
    qty,
    totalUSD,
    tier,
    symbol: currentSymbol,
  };

  tapeState.recentTrades.unshift(tradeItem);
  if (tapeState.recentTrades.length > 250) {
    tapeState.recentTrades.pop();
  }

  // 5. Handle Pause / Render
  if (tapeState.paused) {
    tapeState.queue.push(tradeItem);
    if (el.txtPauseTape) {
      el.txtPauseTape.textContent = `Pausado (${tapeState.queue.length} novos)`;
    }
    return;
  }

  // Render to DOM if matches current filters
  if (matchesTapeFilter(tradeItem)) {
    renderTapeRow(tradeItem, true);
  }
}

// Update Tape Header Dashboard UI
function updateTapeDashboardUI(speed) {
  const baseAsset = currentSymbol.slice(0, 3);
  const buyVol = tapeState.buyVolume;
  const sellVol = tapeState.sellVolume;
  const totalVol = buyVol + sellVol;
  const delta = buyVol - sellVol;
  const buyRatio = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
  const sellRatio = totalVol > 0 ? (sellVol / totalVol) * 100 : 50;

  if (el.tapeBuyVol) el.tapeBuyVol.textContent = `${buyVol.toFixed(2)} ${baseAsset}`;
  if (el.tapeBuyUsd) el.tapeBuyUsd.textContent = `$${formatCompactNumber(tapeState.buyUsd)}`;
  if (el.tapeSellVol) el.tapeSellVol.textContent = `${sellVol.toFixed(2)} ${baseAsset}`;
  if (el.tapeSellUsd) el.tapeSellUsd.textContent = `$${formatCompactNumber(tapeState.sellUsd)}`;

  if (el.tapeDeltaVol) {
    const prefix = delta >= 0 ? '+' : '';
    el.tapeDeltaVol.textContent = `${prefix}${delta.toFixed(2)} ${baseAsset}`;
    el.tapeDeltaVol.className = `tape-metric-val font-mono ${delta >= 0 ? 'green' : 'red'}`;
  }

  if (el.aggressionFillBuy && el.aggressionFillSell) {
    el.aggressionFillBuy.style.width = `${buyRatio.toFixed(1)}%`;
    el.aggressionFillBuy.textContent = buyRatio > 15 ? `${buyRatio.toFixed(0)}%` : '';
    el.aggressionFillSell.style.width = `${sellRatio.toFixed(1)}%`;
    el.aggressionFillSell.textContent = sellRatio > 15 ? `${sellRatio.toFixed(0)}%` : '';
  }

  if (el.tapeSpeed) {
    el.tapeSpeed.textContent = `${speed} trades/s`;
  }

  if (el.tapeMaxBuy) {
    el.tapeMaxBuy.textContent = tapeState.maxBuyQty > 0
      ? `Maior C: ${tapeState.maxBuyQty.toFixed(2)} @ $${formatPrice(tapeState.maxBuyPrice)}`
      : 'Maior C: ---';
  }
  if (el.tapeMaxSell) {
    el.tapeMaxSell.textContent = tapeState.maxSellQty > 0
      ? `Maior V: ${tapeState.maxSellQty.toFixed(2)} @ $${formatPrice(tapeState.maxSellPrice)}`
      : 'Maior V: ---';
  }
}

// Filter predicate
function matchesTapeFilter(trade) {
  // Side Filter
  if (tapeState.sideFilter !== 'all' && trade.side !== tapeState.sideFilter) {
    return false;
  }
  // Size Filter
  if (tapeState.sizeFilter !== 'all' && trade.tier.id !== tapeState.sizeFilter) {
    return false;
  }
  return true;
}

// Render single row into Tape Table
function renderTapeRow(trade, prepend = true) {
  if (!el.tapeTableBody) return;

  const emptyMsg = el.tapeTableBody.querySelector('.tape-empty-msg');
  if (emptyMsg) emptyMsg.remove();

  const row = document.createElement('div');
  const isMega = trade.tier.isMegaWhale;
  const isWhale = trade.tier.isWhale;
  const rowClass = `tape-row ${trade.side} ${isMega ? 'mega-whale-row' : isWhale ? 'whale-row' : ''}`;
  row.className = rowClass;

  const sideTag = trade.side === 'buy'
    ? `<span class="tape-tag-buy">🟢 COMPRA</span>`
    : `<span class="tape-tag-sell">🔴 VENDA</span>`;

  row.innerHTML = `
    <span>${trade.timeFormatted}</span>
    <span>${sideTag}</span>
    <span>${formatPrice(trade.price)}</span>
    <span>${trade.qty.toFixed(4)}</span>
    <span>$${formatCompactNumber(trade.totalUSD)}</span>
    <span><span class="tier-badge ${trade.tier.cssClass}">${trade.tier.label}</span></span>
    <span>#${trade.id}</span>
  `;

  if (prepend) {
    el.tapeTableBody.prepend(row);
    if (el.tapeTableBody.children.length > tapeState.maxDomRows) {
      el.tapeTableBody.removeChild(el.tapeTableBody.lastChild);
    }
  } else {
    el.tapeTableBody.appendChild(row);
  }
}

// Re-render filtered list from memory
function renderFilteredTapeList() {
  if (!el.tapeTableBody) return;
  el.tapeTableBody.innerHTML = '';

  const filtered = tapeState.recentTrades.filter(matchesTapeFilter);
  if (filtered.length === 0) {
    el.tapeTableBody.innerHTML = `
      <div class="tape-empty-msg">
        <span>Nenhuma negociação recente corresponde aos filtros selecionados.</span>
      </div>
    `;
    return;
  }

  filtered.slice(0, tapeState.maxDomRows).forEach(trade => {
    renderTapeRow(trade, false);
  });
}

// Pause/Resume Stream
function togglePauseTape() {
  tapeState.paused = !tapeState.paused;
  if (el.btnPauseTape) {
    el.btnPauseTape.classList.toggle('paused', tapeState.paused);
  }
  if (tapeState.paused) {
    if (el.btnPauseTape) {
      el.btnPauseTape.innerHTML = `<i data-lucide="play"></i> <span id="txtPauseTape">Retomar Fluxo</span>`;
      if (window.lucide) lucide.createIcons();
    }
  } else {
    if (el.btnPauseTape) {
      el.btnPauseTape.innerHTML = `<i data-lucide="pause"></i> <span id="txtPauseTape">Pausar Fluxo</span>`;
      if (window.lucide) lucide.createIcons();
    }
    // Flush buffered queue
    tapeState.queue = [];
    renderFilteredTapeList();
  }
}

// Clear Tape Data
function clearTape() {
  tapeState.recentTrades = [];
  tapeState.queue = [];
  tapeState.buyVolume = 0;
  tapeState.buyUsd = 0;
  tapeState.sellVolume = 0;
  tapeState.sellUsd = 0;
  tapeState.maxBuyQty = 0;
  tapeState.maxBuyPrice = 0;
  tapeState.maxSellQty = 0;
  tapeState.maxSellPrice = 0;
  tapeState.timestamps = [];

  if (el.tapeTableBody) {
    el.tapeTableBody.innerHTML = `
      <div class="tape-empty-msg">
        <span>⚡ Fita limpa. Aguardando novas execuções da Binance...</span>
      </div>
    `;
  }
  updateTapeDashboardUI('0.0');
}

// Reset stats on symbol change
function resetTapeStats() {
  clearTape();
}

// Seed initial trades from REST API
function seedTapeFromRest(trades) {
  trades.forEach(t => {
    processTapeReadingTrade({
      p: t.price,
      q: t.qty,
      T: t.time,
      m: t.isBuyerMaker,
      t: t.id,
    });
  });
}
