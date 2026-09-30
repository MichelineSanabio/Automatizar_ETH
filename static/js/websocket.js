/**
 * Binance Market Terminal - Real-time WebSocket Streaming Engine
 */

// Connect to Binance Combined WebSocket Stream
function connectWebSocket(symbol, interval) {
  if (activeWs) {
    activeWs.close();
  }

  const s = symbol.toLowerCase();
  // Combined streams: kline, trade, depth, and 24h ticker
  const streams = `${s}@kline_${interval}/${s}@trade/${s}@depth20@100ms/${s}@ticker`;
  const wsUrl = `${CONFIG.wsBaseUrl}${streams}`;

  setWsStatus('Conectando...', 'connecting');
  activeWs = new WebSocket(wsUrl);

  activeWs.onopen = () => {
    setWsStatus('WebSocket Conectado', 'connected');
  };

  activeWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const stream = msg.stream;
      const data = msg.data;

      if (!stream || !data) return;

      if (stream.includes('@kline')) {
        handleRealtimeKline(data.k);
      } else if (stream.includes('@trade')) {
        handleRealtimeTrade(data);
      } else if (stream.includes('@depth')) {
        renderOrderBook(data);
      } else if (stream.includes('@ticker')) {
        renderTicker24h(data);
      }
    } catch (err) {
      console.error('WS parse error:', err);
    }
  };

  activeWs.onerror = (err) => {
    console.warn('WS error:', err);
    setWsStatus('Erro de Conexão', 'error');
  };

  activeWs.onclose = () => {
    setWsStatus('Desconectado (Reconectando...)', 'disconnected');
    // Auto-reconnect after 3 seconds
    setTimeout(() => {
      if (currentSymbol === symbol) {
        connectWebSocket(symbol, interval);
      }
    }, 3000);
  };
}

// Handle Real-time Candlestick Tick
function handleRealtimeKline(k) {
  const candleTime = Math.floor(k.t / 1000);
  const open = parseFloat(k.o);
  const high = parseFloat(k.h);
  const low = parseFloat(k.l);
  const close = parseFloat(k.c);
  const volume = parseFloat(k.v);

  // Update Candlestick series
  if (candleSeries) {
    candleSeries.update({
      time: candleTime,
      open: open,
      high: high,
      low: low,
      close: close,
    });
  }

  // Update Volume series (Separate or Overlay)
  const volColor = close >= open ? 'rgba(14, 203, 129, 0.65)' : 'rgba(246, 70, 93, 0.65)';
  if (separateVolumeSeries && isVolumeSeparated) {
    separateVolumeSeries.update({
      time: candleTime,
      value: volume,
      color: volColor,
    });
  } else if (volumeSeries) {
    volumeSeries.update({
      time: candleTime,
      value: volume,
      color: volColor,
    });
  }

  // Update Splitter Volume Live Display
  const liveVolEl = el.splitterLiveVol || document.getElementById('splitterLiveVol');
  if (liveVolEl) {
    const symbolLabel = currentSymbol.replace('USDT', '');
    liveVolEl.textContent = `${volume.toFixed(2)} ${symbolLabel} ($${formatCompactNumber(volume * close)})`;
  }

  // Update Live Price Flash
  updateLivePrice(close);

  // If candle closed, add to historical list and recalculate indicators
  if (k.x) {
    historicalCandles.push({
      time: candleTime,
      open, high, low, close, volume,
      closeTime: k.T,
    });
    if (historicalCandles.length > CONFIG.candleLimit) {
      historicalCandles.shift();
    }
    updateIndicatorsData();
  }
}

// Handle Real-time Trade Tick
function handleRealtimeTrade(trade) {
  const price = parseFloat(trade.p);
  const qty = parseFloat(trade.q);
  const time = new Date(trade.T).toLocaleTimeString();
  const isBuyerMaker = trade.m; // true = sell taker, false = buy taker
  const tradeType = isBuyerMaker ? 'sell' : 'buy';
  const isWhaleTrade = (currentSymbol.startsWith('ETH') && qty >= 10.0) ||
                       (currentSymbol.startsWith('BTC') && qty >= 0.5) ||
                       (qty * price >= 25000.0);

  // If Whale Trade, record in Whale Radar Feed & plot marker on chart
  if (isWhaleTrade) {
    recordWhaleOrder(tradeType, price, qty, time);
    if (typeof addWhaleMarkerToChart === 'function') {
      const isMega = (qty * price >= 90000.0) || (currentSymbol.startsWith('ETH') && qty >= 40.0);
      const timeSec = Math.floor((trade.T || Date.now()) / 1000);
      addWhaleMarkerToChart(timeSec, price, qty, tradeType === 'buy', isMega);
    }
  }

  // Process Expanded Tape Reading Pro Feed
  processTapeReadingTrade(trade);

  // Feed Binance Dedicated Live Trades subview
  if (typeof addBinanceLiveTrade === 'function') {
    addBinanceLiveTrade(trade);
  }

  // Filter if user toggled "Only Whales" in small sidebar
  if (el.toggleWhalesOnly && el.toggleWhalesOnly.checked && !isWhaleTrade) {
    return;
  }

  if (el.tradesList) {
    const row = document.createElement('div');
    row.className = `trade-row ${tradeType} ${isWhaleTrade ? 'whale-trade' : ''}`;
    row.innerHTML = `
      <span>${formatPrice(price)} ${isWhaleTrade ? '<span class="whale-tag-inline">🐋 BALEIA</span>' : ''}</span>
      <span>${qty.toFixed(4)}</span>
      <span class="trade-time">${time}</span>
    `;

    el.tradesList.prepend(row);

    // Limit list to 40 rows
    if (el.tradesList.children.length > 40) {
      el.tradesList.removeChild(el.tradesList.lastChild);
    }
  }
}

// Live Price Flash Animation
function updateLivePrice(price) {
  if (!price || !el.livePrice) return;
  el.livePrice.textContent = formatPrice(price);

  if (lastPrice > 0 && price !== lastPrice) {
    const isUp = price > lastPrice;
    el.livePrice.classList.remove('price-flash-up', 'price-flash-down');
    void el.livePrice.offsetWidth; // trigger reflow
    el.livePrice.classList.add(isUp ? 'price-flash-up' : 'price-flash-down');
  }
  lastPrice = price;

  // Atualizar PnL e métricas da carteira em tempo real a cada tick de preço
  if (typeof updatePositionPnLUI === 'function') {
    updatePositionPnLUI(price);
  }
}
