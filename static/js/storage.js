/**
 * Binance Market Terminal - Persistent Layout & Settings Manager
 * Synchronizes user customizations (charts, spreads, markings, indicators, window positions)
 * with the physical file 'terminal_layout.json' on disk and browser localStorage.
 */

let isRestoringSettings = false;
let isSettingsLoaded = false;
let saveLayoutTimeout = null;

/**
 * Gathers the current state of all terminal modules
 */
function exportCurrentLayoutState() {
  // 1. Chart Settings
  const chartState = {
    symbol: currentSymbol || 'ETHUSDT',
    interval: currentInterval || '15m',
    isVolumeSeparated: Boolean(isVolumeSeparated),
    volumeHeight: typeof volumeHeight === 'number' ? volumeHeight : 120,
  };

  // 2. Spreads & Order Book Settings
  const safeGrouping = (typeof orderBookGrouping === 'number' && !isNaN(orderBookGrouping) && orderBookGrouping > 0)
    ? orderBookGrouping
    : (parseFloat(orderBookGrouping) || 10.0);

  const spreadsState = {
    orderBookGrouping: safeGrouping,
    obProDepthRows: typeof obProDepthRows === 'number' ? obProDepthRows : 25,
    binanceActiveSubtab: binanceActiveSubtab || 'livro',
  };

  // 3. Indicator Visibility (Ler do DOM com fallback das variáveis globais)
  const btnEma20 = document.getElementById('toggleEma20');
  const btnEma50 = document.getElementById('toggleEma50');
  const btnRsi = document.getElementById('toggleRsi');
  const btnBands = document.getElementById('toggleBands');
  const btnMacd = document.getElementById('toggleMacd');

  const indicatorsState = {
    showEma20: btnEma20 ? btnEma20.classList.contains('active') : Boolean(showEma20),
    showEma50: btnEma50 ? btnEma50.classList.contains('active') : Boolean(showEma50),
    showRsi: btnRsi ? btnRsi.classList.contains('active') : Boolean(showRsi),
    showBands: btnBands ? btnBands.classList.contains('active') : Boolean(showBands),
    showMacd: btnMacd ? btnMacd.classList.contains('active') : Boolean(showMacd),
  };

  // 4. View & Window Layout Settings
  const activeSideTabEl = document.querySelector('.side-tab.active');
  const activeSideTab = activeSideTabEl ? activeSideTabEl.dataset.tab : 'orderbook';

  const isWhaleOrdersActive = el.subviewOrders && el.subviewOrders.classList.contains('active');
  const whaleSubview = isWhaleOrdersActive ? 'orders' : 'holders';

  const viewsState = {
    activeMainView: (tapeState && tapeState.activeView) ? tapeState.activeView : 'chart',
    activeSideTab: activeSideTab,
    whaleSubview: whaleSubview,
    tapeSizeFilter: (tapeState && tapeState.sizeFilter) ? tapeState.sizeFilter : 'all',
    tapeSideFilter: (tapeState && tapeState.sideFilter) ? tapeState.sideFilter : 'all',
  };

  // 5. User Custom Price Markings (Supports, Resistances, Targets)
  const markingsState = Array.isArray(userPriceMarkings) ? [...userPriceMarkings] : [];

  // 6. User Manual Trade Orders (Buy/Sell, Amounts, Costs, Notes)
  const ordersState = Array.isArray(userTradeOrders) ? [...userTradeOrders] : [];

  // 7. Visual Accessibility & 55" TV Settings
  const accessibilityState = (window.AccessibilityManager && AccessibilityManager.settings)
    ? { ...AccessibilityManager.settings }
    : {};

  return {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    chart: chartState,
    spreads: spreadsState,
    indicators: indicatorsState,
    views: viewsState,
    accessibility: accessibilityState,
    markings: markingsState,
    orders: ordersState,
  };
}

/**
 * Saves state instantly (0ms delay) into localStorage and dispatches keepalive HTTP POST to /api/settings
 */
function saveLayoutImmediate() {
  if (isRestoringSettings) return;

  if (saveLayoutTimeout) {
    clearTimeout(saveLayoutTimeout);
    saveLayoutTimeout = null;
  }

  const layoutData = exportCurrentLayoutState();

  // 1. Instant local persistence (survives page refresh immediately)
  try {
    localStorage.setItem('binance_terminal_layout', JSON.stringify(layoutData));
  } catch (e) {
    console.warn('[Layout] localStorage backup failed:', e);
  }

  showLayoutSaveStatus('saving');

  // 2. Network write to physical file 'terminal_layout.json'
  try {
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(layoutData),
      keepalive: true,
    })
      .then(res => {
        if (res.ok) {
          showLayoutSaveStatus('saved');
        } else {
          showLayoutSaveStatus('error');
        }
      })
      .catch(() => {
        showLayoutSaveStatus('error');
      });
  } catch (e) {
    showLayoutSaveStatus('error');
  }
}

/**
 * Auto-save dispatcher: if immediate is true, saves instantly; otherwise debounces (for dragging splitters)
 */
function saveLayoutDebounced(immediate = false) {
  if (isRestoringSettings) return;

  if (immediate) {
    saveLayoutImmediate();
    return;
  }

  if (saveLayoutTimeout) {
    clearTimeout(saveLayoutTimeout);
    saveLayoutTimeout = null;
  }

  showLayoutSaveStatus('pending');
  saveLayoutTimeout = setTimeout(() => {
    saveLayoutImmediate();
  }, 350);
}

// Ensure pending state is saved even if user refreshes or closes the page abruptly
window.addEventListener('beforeunload', () => {
  if (!isRestoringSettings) {
    saveLayoutImmediate();
  }
});

window.addEventListener('pagehide', () => {
  if (!isRestoringSettings) {
    saveLayoutImmediate();
  }
});

/**
 * Updates the visual badge indicating saving state of terminal_layout.json
 */
let statusResetTimer = null;
function showLayoutSaveStatus(status) {
  const badge = el.layoutStatus || document.getElementById('layoutStatus');
  const text = el.layoutStatusText || document.getElementById('layoutStatusText');
  if (!badge || !text) return;

  if (statusResetTimer) {
    clearTimeout(statusResetTimer);
    statusResetTimer = null;
  }

  badge.classList.remove('status-saving', 'status-saved', 'status-error');

  if (status === 'pending' || status === 'saving') {
    badge.classList.add('status-saving');
    text.textContent = '💾 Salvando em terminal_layout.json...';
  } else if (status === 'saved') {
    badge.classList.add('status-saved');
    const timeStr = new Date().toLocaleTimeString();
    text.textContent = `💾 Salvo (${timeStr})`;
    badge.title = `Configurações salvas com sucesso em terminal_layout.json às ${timeStr}`;

    statusResetTimer = setTimeout(() => {
      badge.classList.remove('status-saved');
      text.textContent = '💾 Layout: terminal_layout.json';
    }, 2800);
  } else if (status === 'error') {
    badge.classList.add('status-error');
    text.textContent = '⚠️ Falha ao salvar (Backup local OK)';
    badge.title = 'Não foi possível gravar em terminal_layout.json. O backup local foi mantido.';
  }
}

/**
 * Applies a settings object directly to global runtime variables and DOM elements
 */
function applySettingsObject(settings) {
  if (!settings || typeof settings !== 'object') return;

  // 1. Chart Settings (Symbol, Interval, Volume pane)
  if (settings.chart) {
    if (settings.chart.symbol) {
      currentSymbol = settings.chart.symbol;
      const symbolTabs = document.getElementById('symbolTabs');
      if (symbolTabs) {
        symbolTabs.querySelectorAll('.symbol-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.symbol === currentSymbol);
        });
      }
    }

    if (settings.chart.interval) {
      currentInterval = settings.chart.interval;
      const intervalSelector = document.getElementById('intervalSelector');
      if (intervalSelector) {
        intervalSelector.querySelectorAll('.interval-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.interval === currentInterval);
        });
      }
    }

    if (typeof settings.chart.volumeHeight === 'number') {
      volumeHeight = settings.chart.volumeHeight;
      const volWrapper = el.volumeChartContainer || document.getElementById('volumeChartContainer');
      if (volWrapper) {
        volWrapper.style.height = `${volumeHeight}px`;
      }
    }

    if (settings.chart.isVolumeSeparated !== undefined) {
      isVolumeSeparated = Boolean(settings.chart.isVolumeSeparated);
      const volModeText = document.getElementById('volModeText');
      if (volModeText) {
        volModeText.textContent = isVolumeSeparated ? 'Separado' : 'Sobreposto';
      }
      const volWrapper = el.volumeChartContainer || document.getElementById('volumeChartContainer');
      if (volWrapper) {
        volWrapper.style.display = isVolumeSeparated ? 'block' : 'none';
      }
    }
  }

  // 2. Spreads & Order Book Grouping
  if (settings.spreads) {
    if (settings.spreads.orderBookGrouping !== undefined) {
      const parsedGrouping = parseFloat(settings.spreads.orderBookGrouping);
      if (!isNaN(parsedGrouping) && parsedGrouping > 0) {
        orderBookGrouping = parsedGrouping;
        if (typeof setOrderBookGrouping === 'function') {
          setOrderBookGrouping(orderBookGrouping, true);
        }
      }
    }

    if (typeof settings.spreads.obProDepthRows === 'number') {
      obProDepthRows = settings.spreads.obProDepthRows;
      const proDepthPills = el.obProDepthPills || document.getElementById('obProDepthPills');
      if (proDepthPills) {
        proDepthPills.querySelectorAll('.ob-depth-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.rows, 10) === obProDepthRows);
        });
      }
    }

    if (settings.spreads.binanceActiveSubtab) {
      binanceActiveSubtab = settings.spreads.binanceActiveSubtab;
      if (typeof setBinanceSubtab === 'function') {
        setBinanceSubtab(binanceActiveSubtab);
      }
    }
  }

  // 3. Indicators State
  if (settings.indicators) {
    showEma20 = Boolean(settings.indicators.showEma20);
    showEma50 = Boolean(settings.indicators.showEma50);
    showRsi = Boolean(settings.indicators.showRsi);
    showBands = Boolean(settings.indicators.showBands);
    showMacd = Boolean(settings.indicators.showMacd);

    const toggleEma20 = document.getElementById('toggleEma20');
    if (toggleEma20) toggleEma20.classList.toggle('active', showEma20);

    const toggleEma50 = document.getElementById('toggleEma50');
    if (toggleEma50) toggleEma50.classList.toggle('active', showEma50);

    const toggleRsi = document.getElementById('toggleRsi');
    if (toggleRsi) toggleRsi.classList.toggle('active', showRsi);
    const legendRsiEl = document.getElementById('legendRsi') || el.legendRsi;
    if (legendRsiEl) legendRsiEl.style.display = showRsi ? 'inline' : 'none';

    const toggleBands = document.getElementById('toggleBands');
    if (toggleBands) toggleBands.classList.toggle('active', showBands);

    const toggleMacd = document.getElementById('toggleMacd');
    if (toggleMacd) toggleMacd.classList.toggle('active', showMacd);

    if (typeof setMacdVisibility === 'function') {
      setMacdVisibility(showMacd);
    }

    if (typeof updateIndicatorsData === 'function') {
      updateIndicatorsData();
    }
  }

  // 4. User Price Markings (Supports, Resistances, Horizontal lines)
  if (Array.isArray(settings.markings)) {
    userPriceMarkings = settings.markings;
    if (typeof updateMarkingsCountUI === 'function') {
      updateMarkingsCountUI();
    }
    if (typeof renderAllUserPriceLines === 'function') {
      renderAllUserPriceLines();
    }
  }

  // 4.1 User Manual Trade Orders & Position
  if (Array.isArray(settings.orders)) {
    userTradeOrders = settings.orders;
    if (typeof renderOrderLinesOnChart === 'function') {
      renderOrderLinesOnChart();
    }
    if (typeof updatePositionPnLUI === 'function') {
      updatePositionPnLUI();
    }
    if (typeof renderOrdersListInModal === 'function') {
      renderOrdersListInModal();
    }
  }

  // 4.2 Visual Accessibility & 55" TV Settings
  if (settings.accessibility && window.AccessibilityManager) {
    if (typeof AccessibilityManager.syncFromSettings === 'function') {
      AccessibilityManager.syncFromSettings(settings.accessibility);
    }
  }

  // 5. Views & Window Positions
  if (settings.views) {
    if (settings.views.activeMainView && typeof setMainView === 'function') {
      setMainView(settings.views.activeMainView);
    }

    if (settings.views.activeSideTab) {
      const sideTabs = document.querySelectorAll('.side-tab');
      sideTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      const targetSideTab = document.querySelector(`.side-tab[data-tab="${settings.views.activeSideTab}"]`);
      if (targetSideTab) {
        targetSideTab.classList.add('active');
        const paneId = settings.views.activeSideTab === 'orderbook' ? 'paneOrderBook'
          : settings.views.activeSideTab === 'trades' ? 'paneTrades'
          : settings.views.activeSideTab === 'whales' ? 'paneWhales'
          : settings.views.activeSideTab === 'metrics' ? 'paneMetrics'
          : 'paneAPI';
        const targetPane = document.getElementById(paneId);
        if (targetPane) targetPane.classList.add('active');
      }
    }

    if (settings.views.whaleSubview) {
      if (settings.views.whaleSubview === 'orders' && el.subviewOrders && el.contentWhaleOrders) {
        el.subviewOrders.classList.add('active');
        if (el.subviewHolders) el.subviewHolders.classList.remove('active');
        el.contentWhaleOrders.style.display = 'flex';
        if (el.contentWhaleHolders) el.contentWhaleHolders.style.display = 'none';
      } else if (el.subviewHolders && el.contentWhaleHolders) {
        el.subviewHolders.classList.add('active');
        if (el.subviewOrders) el.subviewOrders.classList.remove('active');
        el.contentWhaleHolders.style.display = 'flex';
        if (el.contentWhaleOrders) el.contentWhaleOrders.style.display = 'none';
      }
    }

    if (settings.views.tapeSizeFilter && el.tapeSizeFilters) {
      const pills = el.tapeSizeFilters.querySelectorAll('.tape-pill');
      pills.forEach(p => p.classList.toggle('active', p.dataset.size === settings.views.tapeSizeFilter));
      if (tapeState) tapeState.sizeFilter = settings.views.tapeSizeFilter;
    }

    if (settings.views.tapeSideFilter && el.tapeSideFilters) {
      const pills = el.tapeSideFilters.querySelectorAll('.tape-pill');
      pills.forEach(p => p.classList.toggle('active', p.dataset.side === settings.views.tapeSideFilter));
      if (tapeState) tapeState.sideFilter = settings.views.tapeSideFilter;
    }
  }
}

/**
 * Pre-applies localStorage immediately upon DOM ready (before network requests)
 */
function applyLocalSettingsImmediately() {
  try {
    const localStr = localStorage.getItem('binance_terminal_layout');
    if (localStr) {
      const parsed = JSON.parse(localStr);
      isRestoringSettings = true;
      applySettingsObject(parsed);
      isRestoringSettings = false;
      console.log('[Layout] Configurações locais pré-aplicadas com sucesso do localStorage');
    }
  } catch (e) {
    console.warn('[Layout] Falha na pré-aplicação local:', e);
    isRestoringSettings = false;
  }
}

/**
 * Loads configuration from terminal_layout.json via GET /api/settings with cache-busting
 */
async function loadAndApplyLayoutSettings() {
  isRestoringSettings = true;
  let settings = null;

  try {
    // Cache-busting URL parameter + no-cache header to always guarantee freshest state from disk
    const res = await fetch(`/api/settings?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
    if (res.ok) {
      settings = await res.json();
      console.log('[Layout] Configurações lidas de terminal_layout.json:', settings);
    }
  } catch (err) {
    console.warn('[Layout] Erro ao carregar de /api/settings, usando fallback local:', err);
  }

  if (!settings) {
    try {
      const localStr = localStorage.getItem('binance_terminal_layout');
      if (localStr) {
        settings = JSON.parse(localStr);
      }
    } catch (e) {}
  }

  if (settings) {
    applySettingsObject(settings);
    // Keep local backup synchronized
    try {
      localStorage.setItem('binance_terminal_layout', JSON.stringify(settings));
    } catch (e) {}
  }

  isRestoringSettings = false;
  isSettingsLoaded = true;
  console.log('[Layout] Sincronização inicial de layout concluída.');
}

/**
 * Resets settings in terminal_layout.json and restores defaults
 */
async function resetLayoutToDefaults() {
  if (!confirm('Deseja realmente restaurar o layout, gráficos, spreads, marcações e indicadores para o padrão original?')) {
    return;
  }

  try {
    const res = await fetch('/api/settings/reset', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    console.log('[Layout] Reset concluído:', json);

    try {
      localStorage.removeItem('binance_terminal_layout');
    } catch (e) {}

    window.location.reload();
  } catch (err) {
    alert('Erro ao restaurar layout padrão: ' + err.message);
  }
}

// ==========================================
// MODAL & UI CONTROLS FOR USER PRICE MARKINGS
// ==========================================

let selectedMarkingColor = '#0ecb81';

function renderMarkingsListInModal() {
  const container = document.getElementById('markingsListContainer');
  const countEl = document.getElementById('modalMarkingsCount');
  if (!container) return;

  if (countEl) countEl.textContent = userPriceMarkings.length;
  if (typeof updateMarkingsCountUI === 'function') {
    updateMarkingsCountUI();
  }

  if (userPriceMarkings.length === 0) {
    container.innerHTML = `
      <div class="markings-empty-state">
        <i data-lucide="bookmark"></i>
        <span>Nenhuma marcação de preço ativa no gráfico.</span>
        <small>Adicione suportes, resistências ou níveis de interesse acima.</small>
      </div>
    `;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
    return;
  }

  container.innerHTML = '';
  const sorted = [...userPriceMarkings].sort((a, b) => b.price - a.price);

  sorted.forEach(m => {
    const row = document.createElement('div');
    row.className = 'marking-row-item';
    row.innerHTML = `
      <div class="marking-color-indicator" style="background-color: ${m.color};"></div>
      <div class="marking-info">
        <span class="marking-label">${m.label}</span>
        <span class="marking-price font-mono">$${formatPrice(m.price)}</span>
      </div>
      <button class="marking-btn-delete" data-id="${m.id}" title="Excluir marcação">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    container.appendChild(row);
  });

  if (window.lucide) {
    try { lucide.createIcons(); } catch (e) {}
  }
}

function openMarkingsModal(prefilledPrice = null) {
  const modal = document.getElementById('modalMarkingsBackdrop');
  const inputPrice = document.getElementById('inputMarkingPrice');
  const inputLabel = document.getElementById('inputMarkingLabel');
  if (!modal) return;

  if (inputPrice) {
    if (prefilledPrice && !isNaN(prefilledPrice)) {
      inputPrice.value = parseFloat(prefilledPrice).toFixed(2);
    } else if (lastPrice && lastPrice > 0) {
      inputPrice.value = lastPrice.toFixed(2);
    }
  }
  if (inputLabel) {
    inputLabel.value = '';
  }

  renderMarkingsListInModal();
  modal.style.display = 'flex';
  if (inputLabel) inputLabel.focus();
}

function closeMarkingsModal() {
  const modal = document.getElementById('modalMarkingsBackdrop');
  if (modal) modal.style.display = 'none';
}

function initMarkingsUI() {
  const btnOpen = document.getElementById('btnOpenAddMarking');
  const btnManage = document.getElementById('btnManageMarkings');
  const btnClose = document.getElementById('btnCloseMarkingsModal');
  const modal = document.getElementById('modalMarkingsBackdrop');
  const btnConfirm = document.getElementById('btnConfirmAddMarking');
  const btnUseLive = document.getElementById('btnUseLivePrice');
  const btnClearAll = document.getElementById('btnClearAllMarkings');
  const colorPresets = document.getElementById('markingColorPresets');
  const listContainer = document.getElementById('markingsListContainer');
  const btnReset = document.getElementById('btnResetLayout');

  const btnStartDraw = document.getElementById('btnStartDrawOnChart');

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      // Alterna o modo desenho com clique no gráfico; se já ativo, abre o modal
      if (window.isDrawingLineModeActive) {
        if (typeof toggleDrawingLineMode === 'function') toggleDrawingLineMode(false);
        openMarkingsModal();
      } else {
        if (typeof toggleDrawingLineMode === 'function') toggleDrawingLineMode(true);
      }
    });
  }

  if (btnStartDraw) {
    btnStartDraw.addEventListener('click', () => {
      closeMarkingsModal();
      if (typeof toggleDrawingLineMode === 'function') {
        toggleDrawingLineMode(true);
      }
    });
  }

  if (btnManage) {
    btnManage.addEventListener('click', () => openMarkingsModal());
  }

  if (btnClose) {
    btnClose.addEventListener('click', closeMarkingsModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeMarkingsModal();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', resetLayoutToDefaults);
  }

  if (colorPresets) {
    colorPresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.color-preset-btn');
      if (!btn) return;
      colorPresets.querySelectorAll('.color-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMarkingColor = btn.dataset.color;
    });
  }

  if (btnUseLive) {
    btnUseLive.addEventListener('click', () => {
      const inputPrice = document.getElementById('inputMarkingPrice');
      if (inputPrice && lastPrice > 0) {
        inputPrice.value = lastPrice.toFixed(2);
      }
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      const inputPrice = document.getElementById('inputMarkingPrice');
      const inputLabel = document.getElementById('inputMarkingLabel');
      if (!inputPrice) return;
      const price = parseFloat(inputPrice.value);
      if (isNaN(price) || price <= 0) {
        alert('Por favor, informe um preço válido.');
        inputPrice.focus();
        return;
      }
      const label = inputLabel ? inputLabel.value.trim() : '';
      addUserPriceMarking(price, label, selectedMarkingColor, 0);
      if (inputLabel) inputLabel.value = '';
      inputPrice.value = lastPrice > 0 ? lastPrice.toFixed(2) : '';
    });
  }

  if (listContainer) {
    listContainer.addEventListener('click', (e) => {
      const btnDel = e.target.closest('.marking-btn-delete');
      if (!btnDel) return;
      const id = btnDel.dataset.id;
      if (id) {
        removeUserPriceMarking(id);
      }
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      if (userPriceMarkings.length === 0) return;
      if (confirm('Deseja excluir todas as marcações de preço do gráfico?')) {
        clearAllUserPriceMarkings();
      }
    });
  }
}
