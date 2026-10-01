/**
 * Binance Market Terminal - Data Fetcher & REST Initializer
 * Realiza as requisições paralelas à API Binance para carregar klines, ticker 24h,
 * profundidade de livro e histórico de trades ao vivo.
 */

// REST Data Fetcher & Initializer
async function loadSymbolData(symbol, interval) {
  showLoading(true);
  updateBaseAssetLabel(symbol);
  if (typeof resetWhaleOrdersFeed === 'function') {
    resetWhaleOrdersFeed(symbol);
  }

  try {
    const startTime = performance.now();

    // Parallel fetch: Klines, 24h Ticker, Depth, Recent Trades
    const [klinesRes, tickerRes, depthRes, tradesRes] = await Promise.all([
      fetchBinance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${CONFIG.candleLimit}`),
      fetchBinance(`/api/v3/ticker/24hr?symbol=${symbol}`),
      fetchBinance(`/api/v3/depth?symbol=${symbol}&limit=50`),
      fetchBinance(`/api/v3/trades?symbol=${symbol}&limit=25`),
    ]);

    const latency = Math.round(performance.now() - startTime);
    if (el.footerPing) {
      el.footerPing.textContent = `Latência: ${latency}ms`;
    }

    if (!klinesRes.ok || !tickerRes.ok) {
      throw new Error('Falha ao comunicar com os servidores da Binance.');
    }

    const klinesData = await klinesRes.json();
    const tickerData = await tickerRes.json();
    const depthData = await depthRes.json();
    const tradesData = await tradesRes.json();

    // 1. Process Historical Candles
    if (typeof processAndRenderCandles === 'function') {
      processAndRenderCandles(klinesData);
    }

    // 2. Process 24h Stats
    if (typeof renderTicker24h === 'function') {
      renderTicker24h(tickerData);
    }
    if (typeof updateMetricsPanel === 'function') {
      updateMetricsPanel();
    }

    // 3. Process Orderbook
    if (typeof renderOrderBook === 'function') {
      renderOrderBook(depthData);
    }

    // 4. Process Recent Trades
    renderTrades(tradesData);

    // 5. Connect WebSocket for Real-time Streaming
    if (typeof connectWebSocket === 'function') {
      connectWebSocket(symbol, interval);
    }

  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    alert('Erro ao carregar dados da Binance API: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// Render Recent Trades (from REST initial fetch)
function renderTrades(trades) {
  if (!el.tradesList) return;
  el.tradesList.innerHTML = '';
  const sorted = trades.slice().reverse();
  sorted.forEach(t => {
    const price = parseFloat(t.price);
    const qty = parseFloat(t.qty);
    const time = typeof formatBrasiliaTime === 'function'
      ? formatBrasiliaTime(t.time)
      : new Date(t.time).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    const tradeType = t.isBuyerMaker ? 'sell' : 'buy';

    const row = document.createElement('div');
    row.className = `trade-row ${tradeType}`;
    row.innerHTML = `
      <span>${formatPrice(price)}</span>
      <span>${qty.toFixed(4)}</span>
      <span class="trade-time">${time}</span>
    `;
    el.tradesList.appendChild(row);
  });

  // Seed Tape Reading with initial REST trades if empty
  if (typeof tapeState !== 'undefined' && tapeState.recentTrades && tapeState.recentTrades.length === 0 && trades.length > 0) {
    if (typeof seedTapeFromRest === 'function') {
      seedTapeFromRest(trades);
    }
  }

  // Seed Binance Dedicated Trades Tab
  if (Array.isArray(trades)) {
    binanceRecentTrades = [];
    trades.slice(-50).forEach(t => {
      if (typeof addBinanceLiveTrade === 'function') {
        addBinanceLiveTrade({
          p: t.price,
          q: t.qty,
          T: t.time,
          m: t.isBuyerMaker,
          id: t.id
        });
      }
    });
  }
}
