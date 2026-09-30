/**
 * Binance Market Terminal - UI Event Listeners & Interactions
 * Gerencia a troca de pares (ETH, BTC, SOL), intervalos de candles,
 * toggles de indicadores técnicos, abas laterais e filtros de baleias.
 */

// User Event Listeners Setup
function setupEventListeners() {
  if (typeof initOrderBookControls === 'function') {
    initOrderBookControls();
  }

  // Symbol Switcher Tabs (ETH/USDT, BTC/USDT, ETH/BTC, SOL/USDT)
  const symbolTabs = document.getElementById('symbolTabs');
  if (symbolTabs) {
    symbolTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.symbol-btn');
      if (!btn || btn.classList.contains('active')) return;

      symbolTabs.querySelectorAll('.symbol-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentSymbol = (btn.dataset.symbol || '').toUpperCase();
      window.isInitialChartLoaded = false;
      if (typeof resetTapeStats === 'function') resetTapeStats();
      if (typeof saveLayoutImmediate === 'function') {
        saveLayoutImmediate();
      }
      if (typeof loadSymbolData === 'function') {
        loadSymbolData(currentSymbol, currentInterval);
      }
    });
  }

  // Interval Switcher (1m, 5m, 15m, 1h, 4h, 1D, 1S)
  const intervalSelector = document.getElementById('intervalSelector');
  if (intervalSelector) {
    intervalSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.interval-btn');
      if (!btn || btn.classList.contains('active')) return;

      intervalSelector.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentInterval = (btn.dataset.interval || '').toLowerCase();
      window.isInitialChartLoaded = false;
      // Salva imediatamente no localStorage e /api/settings antes do carregamento de dados
      if (typeof saveLayoutImmediate === 'function') {
        saveLayoutImmediate();
      }
      if (typeof loadSymbolData === 'function') {
        loadSymbolData(currentSymbol, currentInterval);
      }
    });
  }

  // Indicator Toggles: EMA 20
  const toggleEma20 = document.getElementById('toggleEma20');
  if (toggleEma20) {
    toggleEma20.addEventListener('click', function () {
      showEma20 = !showEma20;
      this.classList.toggle('active', showEma20);
      if (typeof updateIndicatorsData === 'function') updateIndicatorsData();
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Indicator Toggles: EMA 50
  const toggleEma50 = document.getElementById('toggleEma50');
  if (toggleEma50) {
    toggleEma50.addEventListener('click', function () {
      showEma50 = !showEma50;
      this.classList.toggle('active', showEma50);
      if (typeof updateIndicatorsData === 'function') updateIndicatorsData();
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Indicator Toggles: Bollinger Bands
  const toggleBands = document.getElementById('toggleBands');
  if (toggleBands) {
    toggleBands.addEventListener('click', function () {
      showBands = !showBands;
      this.classList.toggle('active', showBands);
      if (typeof updateIndicatorsData === 'function') updateIndicatorsData();
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Indicator Toggles: RSI (14)
  const toggleRsi = document.getElementById('toggleRsi');
  if (toggleRsi) {
    toggleRsi.addEventListener('click', function () {
      showRsi = !showRsi;
      this.classList.toggle('active', showRsi);
      const legRsi = document.getElementById('legendRsi') || el.legendRsi;
      if (legRsi) legRsi.style.display = showRsi ? 'inline' : 'none';
      if (typeof updateIndicatorsData === 'function') updateIndicatorsData();
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Tornar os itens da Legenda clicáveis para alternar EMA 20, EMA 50 e RSI diretamente
  const legendEma20 = document.getElementById('legendEma20');
  if (legendEma20 && toggleEma20) {
    legendEma20.addEventListener('click', () => toggleEma20.click());
  }
  const legendEma50 = document.getElementById('legendEma50');
  if (legendEma50 && toggleEma50) {
    legendEma50.addEventListener('click', () => toggleEma50.click());
  }
  const legendRsiEl = document.getElementById('legendRsi');
  if (legendRsiEl && toggleRsi) {
    legendRsiEl.addEventListener('click', () => toggleRsi.click());
  }

  // Indicator Toggles: MACD (12, 26, 9)
  const toggleMacd = document.getElementById('toggleMacd');
  if (toggleMacd) {
    toggleMacd.addEventListener('click', function () {
      if (typeof setMacdVisibility === 'function') {
        setMacdVisibility(!showMacd);
      }
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Interactive Indicator Tooltips
  if (typeof bindIndicatorTooltips === 'function') {
    bindIndicatorTooltips();
  }

  // Side Panel Tabs (Orderbook, Trades, Whales, Metrics, API)
  const sideTabs = document.querySelectorAll('.side-tab');
  sideTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sideTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const paneId = tab.dataset.tab === 'orderbook' ? 'paneOrderBook'
        : tab.dataset.tab === 'trades' ? 'paneTrades'
        : tab.dataset.tab === 'whales' ? 'paneWhales'
        : tab.dataset.tab === 'metrics' ? 'paneMetrics'
        : tab.dataset.tab === 'quantmacro' ? 'paneQuantMacro'
        : 'paneAPI';
      const targetPane = document.getElementById(paneId);
      if (targetPane) targetPane.classList.add('active');

      if (tab.dataset.tab === 'orderbook' && typeof setMainView === 'function') {
        setMainView('orderbook');
      }
      if (tab.dataset.tab === 'whales' && typeof rawWhalesData !== 'undefined' && rawWhalesData.length === 0) {
        if (typeof loadWhalesData === 'function') loadWhalesData();
      }
      if (tab.dataset.tab === 'metrics' && typeof updateMetricsPanel === 'function') {
        updateMetricsPanel();
      }
      if (tab.dataset.tab === 'quantmacro' && typeof updateQuantMacroPanel === 'function') {
        updateQuantMacroPanel();
      }
      if (tab.dataset.tab === 'api' && typeof updateApiPanel === 'function') {
        updateApiPanel();
      }
      if (typeof saveLayoutImmediate === 'function') {
        saveLayoutImmediate();
      }
    });
  });

  // Whale Subview Switcher (Holders vs Live Orders)
  if (el.subviewHolders && el.subviewOrders) {
    el.subviewHolders.addEventListener('click', () => {
      el.subviewHolders.classList.add('active');
      el.subviewOrders.classList.remove('active');
      if (el.contentWhaleHolders) el.contentWhaleHolders.style.display = 'flex';
      if (el.contentWhaleOrders) el.contentWhaleOrders.style.display = 'none';
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
    el.subviewOrders.addEventListener('click', () => {
      el.subviewOrders.classList.add('active');
      el.subviewHolders.classList.remove('active');
      if (el.contentWhaleOrders) el.contentWhaleOrders.style.display = 'flex';
      if (el.contentWhaleHolders) el.contentWhaleHolders.style.display = 'none';
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Whale Refresh Button
  if (el.btnRefreshWhales) {
    el.btnRefreshWhales.addEventListener('click', () => {
      if (typeof loadWhalesData === 'function') loadWhalesData(true);
    });
  }

  // Whale Category Filter Pills
  if (el.whaleCategoryFilters) {
    el.whaleCategoryFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;
      el.whaleCategoryFilters.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentWhaleCategory = btn.dataset.cat;
      if (typeof renderWhalesList === 'function') renderWhalesList();
    });
  }

  // Whale Search Input
  if (el.whaleSearchInput) {
    el.whaleSearchInput.addEventListener('input', (e) => {
      whaleSearchQuery = e.target.value.toLowerCase().trim();
      if (typeof renderWhalesList === 'function') renderWhalesList();
    });
  }

  // Whale Only Checkbox in Trades
  if (el.toggleWhalesOnly) {
    el.toggleWhalesOnly.addEventListener('change', () => {
      if (el.tradesList) el.tradesList.innerHTML = '';
    });
  }

  // Refresh Button REST
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      if (typeof loadSymbolData === 'function') {
        loadSymbolData(currentSymbol, currentInterval);
      }
    });
  }

  // Export CSV Button
  const btnExportCSV = document.getElementById('btnExportCSV');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      if (typeof exportToCSV === 'function') exportToCSV();
    });
  }

  // View Switcher (Chart vs Livro Binance vs Expanded Tape vs Liquidez vs Data Análise)
  if (el.btnViewChart) el.btnViewChart.addEventListener('click', () => setMainView('chart'));
  if (el.btnViewOrderBook) el.btnViewOrderBook.addEventListener('click', () => setMainView('orderbook'));
  if (el.btnViewTape) el.btnViewTape.addEventListener('click', () => setMainView('tape'));
  if (el.btnViewLiquidity) el.btnViewLiquidity.addEventListener('click', () => setMainView('liquidity'));
  if (el.btnViewDataAnalysis) el.btnViewDataAnalysis.addEventListener('click', () => setMainView('data-analysis'));

  // Tape Reading Controls
  if (el.btnPauseTape && typeof togglePauseTape === 'function') {
    el.btnPauseTape.addEventListener('click', togglePauseTape);
  }
  if (el.btnClearTape && typeof clearTape === 'function') {
    el.btnClearTape.addEventListener('click', clearTape);
  }

  // Tape Size Filters
  if (el.tapeSizeFilters) {
    el.tapeSizeFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tape-pill');
      if (!btn) return;
      el.tapeSizeFilters.querySelectorAll('.tape-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tapeState.sizeFilter = btn.dataset.size;
      if (typeof renderFilteredTapeList === 'function') renderFilteredTapeList();
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }

  // Tape Side Filters
  if (el.tapeSideFilters) {
    el.tapeSideFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.tape-pill');
      if (!btn) return;
      el.tapeSideFilters.querySelectorAll('.tape-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tapeState.sideFilter = btn.dataset.side;
      if (typeof renderFilteredTapeList === 'function') renderFilteredTapeList();
      if (typeof saveLayoutImmediate === 'function') saveLayoutImmediate();
    });
  }
}
