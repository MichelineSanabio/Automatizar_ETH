/**
 * Binance Market Terminal - Main Application Orchestrator
 * Orquestra o ciclo de vida e a inicialização de todos os módulos:
 * state, utils, storage, indicators, chart, orderbook, tapereading,
 * whales, websocket, accessibility, orders, ticker, loader e events.
 */

// Application Bootstrap
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) {
    try { lucide.createIcons(); } catch (e) { console.warn('Lucide init warning', e); }
  }

  // 1. Inicializar Cache de Elementos do DOM e Gráficos
  initDOMElements();
  initChart();

  // 2. Aplicar imediatamente configurações locais em cache antes de qualquer requisição (0ms)
  if (typeof applyLocalSettingsImmediately === 'function') {
    applyLocalSettingsImmediately();
  }

  // 3. Carregar e aplicar configurações persistentes de terminal_layout.json
  if (typeof loadAndApplyLayoutSettings === 'function') {
    await loadAndApplyLayoutSettings();
  }

  // 4. Carregar thresholds de baleias e categorias de Definir_Baleias.json
  if (typeof loadMarketTiers === 'function') {
    await loadMarketTiers();
  }

  // 5. Configurar ouvintes de eventos da UI
  if (typeof setupEventListeners === 'function') {
    setupEventListeners();
  }

  // 6. Inicializar interfaces de marcações de preço e rastreador de ordens
  if (typeof initMarkingsUI === 'function') {
    initMarkingsUI();
  }
  if (typeof initOrdersUI === 'function') {
    initOrdersUI();
  }

  // 7. Renderizar ordens e marcações no gráfico
  if (typeof renderAllUserPriceLines === 'function') {
    renderAllUserPriceLines();
  }
  if (typeof renderOrderLinesOnChart === 'function') {
    renderOrderLinesOnChart();
  }
  if (typeof updatePositionPnLUI === 'function') {
    updatePositionPnLUI();
  }

  // 8. Carregar dados do par ativo e iniciar streaming com par e intervalo restaurados
  if (typeof loadSymbolData === 'function') {
    loadSymbolData(currentSymbol, currentInterval);
  }

  // 9. Relógio de rodapé e recarregamento automático
  startClock();
  if (typeof setupLiveReload === 'function') {
    setupLiveReload();
  }
});

// Setup Clock
function startClock() {
  setInterval(() => {
    const now = new Date();
    if (el.footerClock) {
      el.footerClock.textContent = now.toUTCString().slice(17, 25) + ' UTC';
    }
  }, 1000);
}
