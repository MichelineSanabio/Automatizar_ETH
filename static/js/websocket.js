/**
 * Binance Market Terminal - Real-time WebSocket Streaming Engine
 */

// Connect to Binance Combined WebSocket Stream
let wsReconnectTimer = null;
let currentWsEndpointIndex = 0;

function getWsEndpoints() {
  return [
    CONFIG.wsBaseUrl || 'wss://stream.binance.com:443/stream?streams=',
    CONFIG.wsFallbackUrl || 'wss://data-stream.binance.vision/stream?streams=',
    'wss://stream.binance.com:9443/stream?streams='
  ];
}

// Safely disconnect active WebSocket without triggering reconnect loops
function disconnectWebSocket() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (activeWs) {
    // Unbind listeners before closing so it doesn't trigger onclose reconnect cascades
    activeWs.onopen = null;
    activeWs.onmessage = null;
    activeWs.onerror = null;
    activeWs.onclose = null;
    try {
      if (activeWs.readyState === WebSocket.OPEN || activeWs.readyState === WebSocket.CONNECTING) {
        activeWs.close();
      }
    } catch (e) {
      // Ignore
    }
    activeWs = null;
  }
}

function connectWebSocket(symbol, interval) {
  // Always clean up existing socket and timers cleanly
  disconnectWebSocket();

  const s = symbol.toLowerCase();
  // Combined streams: kline, trade, depth, and 24h ticker
  const streams = `${s}@kline_${interval}/${s}@trade/${s}@depth20@100ms/${s}@ticker`;
  
  const endpoints = getWsEndpoints();
  const baseUrl = endpoints[currentWsEndpointIndex % endpoints.length];
  const wsUrl = `${baseUrl}${streams}`;

  setWsStatus('Conectando...', 'connecting');
  
  let wsInstance = null;
  try {
    wsInstance = new WebSocket(wsUrl);
  } catch (err) {
    console.error('[WebSocket] Falha ao instanciar conexão:', err);
    scheduleWsReconnect(symbol, interval);
    return;
  }

  activeWs = wsInstance;

  wsInstance.onopen = () => {
    if (activeWs !== wsInstance) return;
    setWsStatus('Conectado', 'connected');
    console.log(`[WebSocket] Conectado com sucesso (${baseUrl})`);
  };

  wsInstance.onmessage = (event) => {
    if (activeWs !== wsInstance) return;
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
      console.error('[WebSocket] Erro ao processar mensagem:', err);
    }
  };

  wsInstance.onerror = (err) => {
    if (activeWs !== wsInstance) return;
    console.warn('[WebSocket] Alerta de conexão:', err);
    setWsStatus('Erro de Conexão', 'error');
  };

  wsInstance.onclose = (event) => {
    if (activeWs !== wsInstance) return;
    console.warn(`[WebSocket] Desconectado (código ${event.code}). Tentando reconexão limpa...`);
    setWsStatus('Reconectando...', 'disconnected');
    
    // Rotaciona para o endpoint alternativo caso o primário falhe
    currentWsEndpointIndex = (currentWsEndpointIndex + 1) % endpoints.length;
    scheduleWsReconnect(symbol, interval);
  };
}

function scheduleWsReconnect(symbol, interval) {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
  }
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    if (currentSymbol === symbol) {
      connectWebSocket(symbol, interval);
    }
  }, 3500);
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

  // Update Live Price Flash & Footer Stats
  updateLivePrice(close);
  if (el.statLastUpdate) {
    el.statLastUpdate.textContent = typeof formatBrasiliaTime === 'function'
      ? formatBrasiliaTime(new Date())
      : new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  }
  if (el.statClose && typeof formatPrice === 'function') {
    el.statClose.textContent = formatPrice(close);
  }

  // If candle closed, add/update in historical list and recalculate indicators
  if (k.x) {
    const closedCandle = {
      time: candleTime,
      open, high, low, close, volume,
      closeTime: k.T,
    };
    const lastIdx = historicalCandles.length - 1;
    if (lastIdx >= 0 && historicalCandles[lastIdx].time === candleTime) {
      historicalCandles[lastIdx] = closedCandle;
    } else {
      historicalCandles.push(closedCandle);
    }
    if (typeof candlesByTimeMap !== 'undefined' && candlesByTimeMap.set) {
      candlesByTimeMap.set(candleTime, closedCandle);
    }
    if (historicalCandles.length > CONFIG.candleLimit) {
      const removed = historicalCandles.shift();
      if (removed && typeof candlesByTimeMap !== 'undefined' && candlesByTimeMap.delete) {
        candlesByTimeMap.delete(removed.time);
      }
    }
    updateIndicatorsData();
  }
}

// Handle Real-time Trade Tick
function handleRealtimeTrade(trade) {
  const price = parseFloat(trade.p);
  const qty = parseFloat(trade.q);
  const time = typeof formatBrasiliaTime === 'function'
    ? formatBrasiliaTime(trade.T)
    : new Date(trade.T).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
  const isBuyerMaker = trade.m; // true = sell taker, false = buy taker
  const tradeType = isBuyerMaker ? 'sell' : 'buy';

  const sym = currentSymbol ? currentSymbol.toUpperCase() : 'ETHUSDT';
  const tierConfig = (typeof MARKET_TIERS !== 'undefined' && MARKET_TIERS[sym]) ? MARKET_TIERS[sym] : null;
  const usdValue = qty * price;

  let isWhaleTrade = false;
  let isMega = false;

  if (tierConfig && tierConfig.whale) {
    const whaleCfg = tierConfig.whale;
    const megaCfg = tierConfig.mega_whale || { minQty: whaleCfg.minQty * 3.5, minUsd: 90000.0 };
    isWhaleTrade = (qty >= whaleCfg.minQty) || (usdValue >= (whaleCfg.minUsd || 25000.0));
    isMega = (qty >= megaCfg.minQty) || (usdValue >= (megaCfg.minUsd || 90000.0));
  } else {
    isWhaleTrade = usdValue >= 25000.0;
    isMega = usdValue >= 90000.0;
  }

  // If Whale Trade, record in Whale Radar Feed & plot marker on chart
  if (isWhaleTrade) {
    recordWhaleOrder(tradeType, price, qty, time);
    if (typeof addWhaleMarkerToChart === 'function') {
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
