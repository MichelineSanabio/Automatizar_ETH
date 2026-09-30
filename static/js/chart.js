/**
 * Binance Market Terminal - TradingView Lightweight Charts Engine
 * Supports separate draggable and resizable Candlestick and Volume sub-chart panes
 */

// Map de acesso O(1) aos candles por timestamp para performance do crosshair
let candlesByTimeMap = new Map();
let resizeChartsTimer = null;

// Initialize Candlestick and Volume Charts
function initChart() {
  const container = el.tvChartContainer || document.getElementById('tvChartContainer');
  const volWrapper = el.volumeChartContainer || document.getElementById('volumeChartContainer');
  const volContainer = el.tvVolumeChart || document.getElementById('tvVolumeChart');

  if (!container) return;
  container.innerHTML = '';
  if (volContainer) volContainer.innerHTML = '';

  // 1. Create Main Candlestick Chart
  tvChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: '#0b0e14' },
      textColor: '#848e9c',
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: '#f0b90b',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1f273b',
      },
      horzLine: {
        color: '#f0b90b',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1f273b',
      },
    },
    localization: {
      locale: 'pt-BR',
      dateFormat: 'dd/MM/yyyy',
      timeFormatter: (ts) => typeof formatBrasiliaTime === 'function' ? formatBrasiliaTime(ts, false) : new Date(ts * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit' }),
    },
    rightPriceScale: {
      autoScale: true,
      mode: LightweightCharts.PriceScaleMode.Normal,
      borderColor: 'rgba(255, 255, 255, 0.08)',
      scaleMargins: {
        top: 0.08,
        bottom: 0.08,
      },
      alignLabels: true,
      borderVisible: true,
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.08)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 12,
      barSpacing: 9,
      minBarSpacing: 1.0,
      shiftVisibleRangeOnNewBar: true,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      axisPressedMouseMove: {
        time: true,
        price: true,
      },
      axisDoubleClickReset: {
        time: true,
        price: true,
      },
      mouseWheel: true,
      pinch: true,
    },
    kineticScroll: {
      touch: true,
      mouse: true,
    },
  });

  // Candlestick Series
  candleSeries = tvChart.addCandlestickSeries({
    upColor: '#0ecb81',
    downColor: '#f6465d',
    borderVisible: false,
    wickUpColor: '#0ecb81',
    wickDownColor: '#f6465d',
  });

  // Fallback Overlay Volume Series on Main Chart (used if user chooses overlay mode)
  volumeSeries = tvChart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: {
      type: 'volume',
    },
    priceScaleId: '', // overlay
    scaleMargins: {
      top: 0.8,
      bottom: 0,
    },
  });

  // EMA 20 (Yellow)
  ema20Series = tvChart.addLineSeries({
    color: '#f0b90b',
    lineWidth: 2,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });

  // EMA 50 (Cyan)
  ema50Series = tvChart.addLineSeries({
    color: '#00d2ff',
    lineWidth: 2,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });

  // Bollinger Bands
  upperBandSeries = tvChart.addLineSeries({
    color: 'rgba(153, 69, 255, 0.6)',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });
  lowerBandSeries = tvChart.addLineSeries({
    color: 'rgba(153, 69, 255, 0.6)',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  });

  // 2. Create Separate Volume Sub-Chart
  if (volContainer && volWrapper) {
    volumeChart = LightweightCharts.createChart(volContainer, {
      width: volContainer.clientWidth || container.clientWidth,
      height: volContainer.clientHeight || volumeHeight,
      layout: {
        background: { color: '#0b0e14' },
        textColor: '#848e9c',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: '#f0b90b',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: '#1f273b',
        },
        horzLine: {
          visible: false,
          labelVisible: false,
        },
      },
      localization: {
        locale: 'pt-BR',
        dateFormat: 'dd/MM/yyyy',
        timeFormatter: (ts) => typeof formatBrasiliaTime === 'function' ? formatBrasiliaTime(ts, false) : new Date(ts * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit' }),
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.12,
          bottom: 0,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 9,
        minBarSpacing: 1.0,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: {
        touch: true,
        mouse: true,
      },
    });

    separateVolumeSeries = volumeChart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
    });

    // Synchronize Time Scale between Candlestick Chart and Volume Chart
    let isSyncingRange = false;
    tvChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncingRange || !range || !volumeChart || !isVolumeSeparated) return;
      isSyncingRange = true;
      try {
        volumeChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) {}
      isSyncingRange = false;
    });

    volumeChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncingRange || !range || !tvChart || !isVolumeSeparated) return;
      isSyncingRange = true;
      try {
        tvChart.timeScale().setVisibleLogicalRange(range);
      } catch (e) {}
      isSyncingRange = false;
    });
  }

  // 3. Initialize Interactive Splitter Drag & Resize
  initSplitterResize();

  // 4. Handle Window Resize com debounce (evita múltiplos reflows ao redimensionar)
  window.addEventListener('resize', () => {
    if (resizeChartsTimer) clearTimeout(resizeChartsTimer);
    resizeChartsTimer = setTimeout(resizeAllCharts, 120);
  });

  // 5. Crosshair listener for footer stats & splitter volume (busca O(1) otimizada)
  tvChart.subscribeCrosshairMove((param) => {
    if (!param || !param.time || !param.seriesPrices) {
      return;
    }
    const candleData = param.seriesPrices.get(candleSeries);
    if (candleData) {
      const openStr = formatPrice(candleData.open);
      const highStr = formatPrice(candleData.high);
      const lowStr = formatPrice(candleData.low);
      const closeStr = formatPrice(candleData.close);

      if (el.statOpen) el.statOpen.textContent = openStr;
      if (el.statHigh) el.statHigh.textContent = highStr;
      if (el.statLow) el.statLow.textContent = lowStr;
      if (el.statClose) el.statClose.textContent = closeStr;

      const oOpen = document.getElementById('ohlcValOpen');
      const oHigh = document.getElementById('ohlcValHigh');
      const oLow = document.getElementById('ohlcValLow');
      const oClose = document.getElementById('ohlcValClose');
      const oTime = document.getElementById('ohlcValTime');

      if (oOpen) oOpen.textContent = openStr;
      if (oHigh) oHigh.textContent = highStr;
      if (oLow) oLow.textContent = lowStr;
      if (oClose) oClose.textContent = closeStr;
      if (oTime && param.time) {
        oTime.textContent = typeof formatBrasiliaTime === 'function'
          ? formatBrasiliaTime(param.time)
          : new Date(typeof param.time === 'number' ? param.time * 1000 : param.time).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
      }
    }
    // Update live volume display on splitter com busca rápida O(1) via Map
    const matched = candlesByTimeMap ? candlesByTimeMap.get(param.time) : null;
    if (matched) {
      const liveVolEl = el.splitterLiveVol || document.getElementById('splitterLiveVol');
      if (liveVolEl) {
        const symbolLabel = currentSymbol.replace('USDT', '');
        liveVolEl.textContent = `${matched.volume.toFixed(2)} ${symbolLabel} ($${formatCompactNumber(matched.volume * matched.close)})`;
      }
    }
  });

  // 6. Clique Interativo no Gráfico para Traçar Linhas de Preço
  tvChart.subscribeClick((param) => {
    if (!window.isDrawingLineModeActive) return;
    if (!param || !param.point || !candleSeries) return;

    try {
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price && price > 0) {
        const color = window.selectedMarkingColor || '#f0b90b';
        addUserPriceMarking(price, `Nível $${formatPrice(price)}`, color, 0);
        if (typeof toggleDrawingLineMode === 'function') {
          toggleDrawingLineMode(false);
        }
        showDrawingToast(`Linha traçada em $${formatPrice(price)} e salva com sucesso!`);
      }
    } catch (e) {
      console.warn('Erro ao traçar linha interativa no clique:', e);
    }
  });

  // 7. Inicializar Controles Flutuantes de Zoom e Navegação (Estilo TradingView / Binance)
  if (typeof initChartNavigationControls === 'function') {
    initChartNavigationControls();
  }
}

// Resizes all active chart containers to match their DOM dimensions
function resizeAllCharts() {
  const container = el.tvChartContainer || document.getElementById('tvChartContainer');
  if (tvChart && container) {
    tvChart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    });
  }
  const volWrapper = el.volumeChartContainer || document.getElementById('volumeChartContainer');
  if (volumeChart && volWrapper && isVolumeSeparated) {
    volumeChart.applyOptions({
      width: volWrapper.clientWidth,
      height: volWrapper.clientHeight,
    });
  }
  const macdWrapper = el.tvMacdChart || document.getElementById('tvMacdChart');
  if (macdChart && macdWrapper && showMacd) {
    macdChart.applyOptions({
      width: macdWrapper.clientWidth,
      height: 110,
    });
  }
}

// Initialize Interactive Drag Splitter between Candlesticks and Volume
function initSplitterResize() {
  const splitter = el.volumeSplitter || document.getElementById('volumeSplitter');
  const volWrapper = el.volumeChartContainer || document.getElementById('volumeChartContainer');
  if (!splitter || !volWrapper) return;

  let isDragging = false;
  let startY = 0;
  let startHeight = volumeHeight;

  splitter.addEventListener('mousedown', (e) => {
    // Don't drag if clicking buttons inside splitter
    if (e.target.closest('.splitter-btn')) return;

    isDragging = true;
    startY = e.clientY;
    startHeight = volWrapper.clientHeight;
    splitter.classList.add('dragging');
    document.body.classList.add('resizing-chart');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY; // dragging up increases volume height
    const mainView = el.chartMainView || document.getElementById('chartMainView');
    const mainViewHeight = mainView ? mainView.clientHeight : 500;
    const maxVolHeight = Math.max(120, mainViewHeight - 160); // keep at least 160px for candles
    const newHeight = Math.max(40, Math.min(maxVolHeight, startHeight + deltaY));

    volWrapper.style.height = `${newHeight}px`;
    volumeHeight = newHeight;
    resizeAllCharts();
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove('dragging');
      document.body.classList.remove('resizing-chart');
      resizeAllCharts();
      if (typeof saveLayoutDebounced === 'function') saveLayoutDebounced();
    }
  });

  // Reset Height Button (120px default)
  const btnReset = el.btnResetVolHeight || document.getElementById('btnResetVolHeight');
  if (btnReset) {
    btnReset.addEventListener('click', (e) => {
      e.stopPropagation();
      volWrapper.style.height = '120px';
      volumeHeight = 120;
      resizeAllCharts();
      if (typeof saveLayoutDebounced === 'function') saveLayoutDebounced();
    });
  }

  // Toggle Mode Button (Separated vs Overlay)
  const btnToggleMode = el.btnToggleVolMode || document.getElementById('btnToggleVolMode');
  if (btnToggleMode) {
    btnToggleMode.addEventListener('click', (e) => {
      e.stopPropagation();
      setVolumeSeparationMode(!isVolumeSeparated);
    });
  }

  // Double-click splitter to toggle minimize (40px) / expand (120px)
  splitter.addEventListener('dblclick', (e) => {
    if (e.target.closest('.splitter-btn')) return;
    if (volWrapper.clientHeight <= 50) {
      volWrapper.style.height = '120px';
      volumeHeight = 120;
    } else {
      volWrapper.style.height = '40px';
      volumeHeight = 40;
    }
    resizeAllCharts();
    if (typeof saveLayoutDebounced === 'function') saveLayoutDebounced();
  });
}

// Toggle between Separated (draggable pane) and Overlay (on candle chart)
function setVolumeSeparationMode(separated) {
  isVolumeSeparated = separated;
  const volWrapper = el.volumeChartContainer || document.getElementById('volumeChartContainer');
  const volModeText = document.getElementById('volModeText');

  if (volModeText) {
    volModeText.textContent = separated ? 'Separado' : 'Sobreposto';
  }

  if (separated) {
    if (volWrapper) volWrapper.style.display = 'block';
    // Clear overlay volume from candle chart
    if (volumeSeries) volumeSeries.setData([]);
    // Populate separate volume chart
    if (separateVolumeSeries && historicalCandles.length > 0) {
      const volData = historicalCandles.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(14, 203, 129, 0.65)' : 'rgba(246, 70, 93, 0.65)',
      }));
      separateVolumeSeries.setData(volData);
      if (volumeChart) volumeChart.timeScale().fitContent();
    }
    // Main chart rightPriceScale scaleMargins can be full height
    if (tvChart) {
      tvChart.applyOptions({
        rightPriceScale: {
          scaleMargins: { top: 0.08, bottom: 0.08 },
        },
      });
    }
  } else {
    if (volWrapper) volWrapper.style.display = 'none';
    // Clear separate volume chart
    if (separateVolumeSeries) separateVolumeSeries.setData([]);
    // Restore overlay volume onto main candle chart
    if (volumeSeries && historicalCandles.length > 0) {
      const volData = historicalCandles.map(c => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)',
      }));
      volumeSeries.setData(volData);
    }
    // Main chart needs space for volume overlay at the bottom
    if (tvChart) {
      tvChart.applyOptions({
        rightPriceScale: {
          scaleMargins: { top: 0.1, bottom: 0.22 },
        },
      });
    }
  }

  resizeAllCharts();
  if (typeof saveLayoutDebounced === 'function') saveLayoutDebounced();
}

// Process and Plot Historical Candlesticks and Volume
function processAndRenderCandles(rawKlines) {
  historicalCandles = rawKlines.map(k => ({
    time: Math.floor(k[0] / 1000), // convert ms to seconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));

  // Ensure strictly ascending and deduplicated by time for TradingView Lightweight Charts
  const candleMap = new Map();
  historicalCandles.forEach(c => candleMap.set(c.time, c));
  const sortedUnique = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
  historicalCandles = sortedUnique;
  candlesByTimeMap = candleMap;

  const candleChartData = historicalCandles.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));

  const volumeChartData = historicalCandles.map(c => ({
    time: c.time,
    value: c.volume,
    color: c.close >= c.open ? 'rgba(14, 203, 129, 0.65)' : 'rgba(246, 70, 93, 0.65)',
  }));

  // Set Candlestick data
  candleSeries.setData(candleChartData);

  // Set Volume data (Separate Sub-chart vs Overlay)
  if (isVolumeSeparated && separateVolumeSeries) {
    separateVolumeSeries.setData(volumeChartData);
    if (volumeSeries) volumeSeries.setData([]);
  } else if (volumeSeries) {
    volumeSeries.setData(volumeChartData);
    if (separateVolumeSeries) separateVolumeSeries.setData([]);
  }

  // Compute and Render Indicators (EMAs, Bollinger Bands, RSI)
  updateIndicatorsData();

  // Render User Custom Price Markings (Supports, Resistances, Custom Lines)
  if (typeof renderAllUserPriceLines === 'function') {
    renderAllUserPriceLines();
  }

  // Render User Manual Trade Orders & Breakeven Price Lines
  if (typeof renderOrderLinesOnChart === 'function') {
    renderOrderLinesOnChart();
  }
  if (typeof updatePositionPnLUI === 'function' && historicalCandles.length > 0) {
    const latestCandle = historicalCandles[historicalCandles.length - 1];
    updatePositionPnLUI(latestCandle.close);
  }

  // Update Footer Stats & Floating OHLC HUD with latest candle
  if (historicalCandles.length > 0) {
    const last = historicalCandles[historicalCandles.length - 1];
    const openStr = formatPrice(last.open);
    const highStr = formatPrice(last.high);
    const lowStr = formatPrice(last.low);
    const closeStr = formatPrice(last.close);
    const candleCloseStr = typeof formatBrasiliaTime === 'function'
      ? formatBrasiliaTime(last.closeTime)
      : new Date(last.closeTime).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    const currentUpdateTime = typeof formatBrasiliaTime === 'function'
      ? formatBrasiliaTime(new Date())
      : new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });

    if (el.statCandlesCount) el.statCandlesCount.textContent = historicalCandles.length;
    if (el.statOpen) el.statOpen.textContent = openStr;
    if (el.statHigh) el.statHigh.textContent = highStr;
    if (el.statLow) el.statLow.textContent = lowStr;
    if (el.statClose) el.statClose.textContent = closeStr;
    if (el.statLastUpdate) el.statLastUpdate.textContent = currentUpdateTime;

    const oOpen = document.getElementById('ohlcValOpen');
    const oHigh = document.getElementById('ohlcValHigh');
    const oLow = document.getElementById('ohlcValLow');
    const oClose = document.getElementById('ohlcValClose');
    const oTime = document.getElementById('ohlcValTime');
    const oSym = document.getElementById('ohlcSymbolBadge');

    if (oOpen) oOpen.textContent = openStr;
    if (oHigh) oHigh.textContent = highStr;
    if (oLow) oLow.textContent = lowStr;
    if (oClose) oClose.textContent = closeStr;
    if (oTime) oTime.textContent = candleCloseStr;
    if (oSym) oSym.textContent = currentSymbol;

    // Update Splitter Volume Label
    const liveVolEl = el.splitterLiveVol || document.getElementById('splitterLiveVol');
    if (liveVolEl) {
      const symbolLabel = currentSymbol.slice(0, 3);
      liveVolEl.textContent = `${last.volume.toFixed(2)} ${symbolLabel} ($${formatCompactNumber(last.volume * last.close)})`;
    }
  }

  // Inicializar espaçamento e enquadramento visual agradável (sem achatar 500 candles em fitContent)
  if (!window.isInitialChartLoaded) {
    if (tvChart) {
      tvChart.timeScale().applyOptions({
        rightOffset: 12,
        barSpacing: 9,
      });
      safeScrollToRealtime(tvChart);
    }
    if (volumeChart && isVolumeSeparated) {
      volumeChart.timeScale().applyOptions({
        rightOffset: 12,
        barSpacing: 9,
      });
      safeScrollToRealtime(volumeChart);
    }
    window.isInitialChartLoaded = true;
  }
}

// Compute Technical Indicators Data on Chart
function updateIndicatorsData() {
  const closes = historicalCandles.map(c => c.close);
  const times = historicalCandles.map(c => c.time);

  // EMA 20
  if (showEma20 && ema20Series) {
    const ema20 = calculateEMA(closes, 20);
    const ema20Data = times.map((t, i) => ({ time: t, value: ema20[i] })).filter(d => !isNaN(d.value));
    ema20Series.setData(ema20Data);
    const lastEma20 = ema20[ema20.length - 1];
    if (el.valEma20) el.valEma20.textContent = formatPrice(lastEma20);
    if (el.cardEma20) el.cardEma20.textContent = formatPrice(lastEma20);
  } else if (ema20Series) {
    ema20Series.setData([]);
    if (el.valEma20) el.valEma20.textContent = 'Off';
  }

  // EMA 50
  if (showEma50 && ema50Series) {
    const ema50 = calculateEMA(closes, 50);
    const ema50Data = times.map((t, i) => ({ time: t, value: ema50[i] })).filter(d => !isNaN(d.value));
    ema50Series.setData(ema50Data);
    const lastEma50 = ema50[ema50.length - 1];
    if (el.valEma50) el.valEma50.textContent = formatPrice(lastEma50);
    if (el.cardEma50) el.cardEma50.textContent = formatPrice(lastEma50);

    // Trend Evaluation
    const lastPriceVal = closes[closes.length - 1];
    if (el.cardTrendBadge) {
      if (lastPriceVal > lastEma50) {
        el.cardTrendBadge.textContent = 'Bullish (Acima EMA 50)';
        el.cardTrendBadge.className = 'badge green';
      } else {
        el.cardTrendBadge.textContent = 'Bearish (Abaixo EMA 50)';
        el.cardTrendBadge.className = 'badge red';
      }
    }
  } else if (ema50Series) {
    ema50Series.setData([]);
    if (el.valEma50) el.valEma50.textContent = 'Off';
  }

  // Bollinger Bands (20 periods, 2 std dev)
  if (showBands && upperBandSeries && lowerBandSeries) {
    const { upper, lower } = calculateBollingerBands(closes, 20, 2);
    const upperData = times.map((t, i) => ({ time: t, value: upper[i] })).filter(d => !isNaN(d.value));
    const lowerData = times.map((t, i) => ({ time: t, value: lower[i] })).filter(d => !isNaN(d.value));
    upperBandSeries.setData(upperData);
    lowerBandSeries.setData(lowerData);
  } else if (upperBandSeries && lowerBandSeries) {
    upperBandSeries.setData([]);
    lowerBandSeries.setData([]);
  }

  // RSI 14
  const rsiValues = calculateRSI(closes, 14);
  const currentRsi = rsiValues[rsiValues.length - 1] || 50;
  if (el.valRsi) el.valRsi.textContent = currentRsi.toFixed(1);
  if (el.cardRsi) {
    el.cardRsi.textContent = currentRsi.toFixed(1);
    if (currentRsi >= 70) {
      el.cardRsi.className = 'font-mono font-bold red';
    } else if (currentRsi <= 30) {
      el.cardRsi.className = 'font-mono font-bold green';
    } else {
      el.cardRsi.className = 'font-mono font-bold';
    }
  }

  const needle = document.getElementById('cardRsiNeedle');
  if (needle) {
    needle.style.left = `${Math.min(100, Math.max(0, currentRsi))}%`;
  }

  // MACD (12, 26, 9)
  const { macdLine, signalLine, histogram } = calculateMACD(closes, 12, 26, 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const lastHist = histogram[histogram.length - 1];

  if (el.valMacd && !isNaN(lastMacd)) el.valMacd.textContent = lastMacd.toFixed(2);
  if (el.valMacdSignal && !isNaN(lastSignal)) el.valMacdSignal.textContent = lastSignal.toFixed(2);
  if (el.valMacdHist && !isNaN(lastHist)) el.valMacdHist.textContent = (lastHist >= 0 ? '+' : '') + lastHist.toFixed(2);

  if (el.macdSubVal && !isNaN(lastMacd)) el.macdSubVal.textContent = lastMacd.toFixed(2);
  if (el.macdSubSignal && !isNaN(lastSignal)) el.macdSubSignal.textContent = lastSignal.toFixed(2);
  if (el.macdSubHist && !isNaN(lastHist)) {
    el.macdSubHist.textContent = (lastHist >= 0 ? '+' : '') + lastHist.toFixed(2);
    el.macdSubHist.style.color = lastHist >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // Update Analytics Card in Metrics tab
  if (el.cardMacd && !isNaN(lastMacd)) el.cardMacd.textContent = lastMacd.toFixed(2);
  if (el.cardMacdSignal && !isNaN(lastSignal)) el.cardMacdSignal.textContent = lastSignal.toFixed(2);
  if (el.cardMacdHist && !isNaN(lastHist)) {
    el.cardMacdHist.textContent = (lastHist >= 0 ? '+' : '') + lastHist.toFixed(2);
    el.cardMacdHist.style.color = lastHist >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (el.cardMacdStatusBadge && !isNaN(lastMacd) && !isNaN(lastSignal)) {
    const isBull = lastMacd >= lastSignal;
    el.cardMacdStatusBadge.textContent = isBull ? 'Bullish (Compra)' : 'Bearish (Venda)';
    el.cardMacdStatusBadge.className = isBull ? 'badge green' : 'badge red';
  }

  // Populate MACD Sub-chart if active
  if (showMacd && macdChart) {
    const macdData = times.map((t, i) => ({ time: t, value: macdLine[i] })).filter(d => !isNaN(d.value));
    const signalData = times.map((t, i) => ({ time: t, value: signalLine[i] })).filter(d => !isNaN(d.value));
    const histData = times.map((t, i) => ({
      time: t,
      value: histogram[i],
      color: histogram[i] >= 0 ? 'rgba(14, 203, 129, 0.85)' : 'rgba(246, 70, 93, 0.85)',
    })).filter(d => !isNaN(d.value));

    if (macdLineSeries) macdLineSeries.setData(macdData);
    if (signalLineSeries) signalLineSeries.setData(signalData);
    if (macdHistogramSeries) macdHistogramSeries.setData(histData);
  }
}

// Initialize Separate MACD Sub-Chart
function initMacdChart() {
  const container = el.tvMacdChart || document.getElementById('tvMacdChart');
  const wrapper = el.macdChartContainer || document.getElementById('macdChartContainer');
  if (!container || !wrapper) return;
  container.innerHTML = '';

  macdChart = LightweightCharts.createChart(container, {
    width: container.clientWidth || 600,
    height: 110,
    layout: {
      background: { color: '#0b0e14' },
      textColor: '#848e9c',
      fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace",
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: '#f0b90b',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1f273b',
      },
      horzLine: {
        visible: false,
        labelVisible: false,
      },
    },
    localization: {
      locale: 'pt-BR',
      dateFormat: 'dd/MM/yyyy',
      timeFormatter: (ts) => typeof formatBrasiliaTime === 'function' ? formatBrasiliaTime(ts, false) : new Date(ts * 1000).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit' }),
    },
    rightPriceScale: {
      borderColor: 'rgba(255, 255, 255, 0.08)',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.08)',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  macdHistogramSeries = macdChart.addHistogramSeries({
    priceFormat: { type: 'volume' },
  });

  macdLineSeries = macdChart.addLineSeries({
    color: '#2962ff',
    lineWidth: 2,
    priceLineVisible: false,
  });

  signalLineSeries = macdChart.addLineSeries({
    color: '#ff6d00',
    lineWidth: 1.5,
    priceLineVisible: false,
  });

  // Sync TimeScale with Main Chart
  let isSyncingRange = false;
  tvChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (isSyncingRange || !range || !macdChart || !showMacd) return;
    isSyncingRange = true;
    try { macdChart.timeScale().setVisibleLogicalRange(range); } catch (e) {}
    isSyncingRange = false;
  });

  macdChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (isSyncingRange || !range || !tvChart || !showMacd) return;
    isSyncingRange = true;
    try { tvChart.timeScale().setVisibleLogicalRange(range); } catch (e) {}
    isSyncingRange = false;
  });
}

// Toggle MACD Sub-Chart Visibility
function setMacdVisibility(show) {
  showMacd = show;
  const wrapper = el.macdChartContainer || document.getElementById('macdChartContainer');
  const btn = el.toggleMacd || document.getElementById('toggleMacd');
  const legend = el.legendMacd || document.getElementById('legendMacd');

  if (btn) btn.classList.toggle('active', showMacd);
  if (legend) legend.style.display = showMacd ? 'inline' : 'none';
  if (wrapper) wrapper.style.display = showMacd ? 'block' : 'none';

  if (showMacd) {
    if (!macdChart) initMacdChart();
    updateIndicatorsData();
    if (macdChart) {
      setTimeout(() => {
        const container = el.tvMacdChart || document.getElementById('tvMacdChart');
        if (container) {
          macdChart.applyOptions({
            width: container.clientWidth,
            height: 110,
          });
          macdChart.timeScale().fitContent();
        }
      }, 50);
    }
  }
  resizeAllCharts();
  if (typeof saveLayoutImmediate === 'function') {
    saveLayoutImmediate();
  } else if (typeof saveLayoutDebounced === 'function') {
    saveLayoutDebounced();
  }
}

// Whale Visual Markers & Price Lines on Candlestick Chart
let chartWhaleMarkers = [];
let chartWhalePriceLines = [];

function addWhaleMarkerToChart(timeSeconds, price, qty, isBuy, isMega) {
  if (!candleSeries || historicalCandles.length === 0) return;

  const lastCandle = historicalCandles[historicalCandles.length - 1];
  const markerTime = timeSeconds || lastCandle.time;

  // High contrast label and distinct emoji icon
  const label = isMega
    ? (isBuy ? `🐳 MEGA COMPRA ${qty.toFixed(1)} ETH` : `🐳 MEGA VENDA ${qty.toFixed(1)} ETH`)
    : (isBuy ? `🐋 COMPRA ${qty.toFixed(1)} ETH` : `🐋 VENDA ${qty.toFixed(1)} ETH`);

  // Fixed contrast: Buy markers are bright golden yellow (#f0b90b) so they are NEVER faded green!
  const marker = {
    time: markerTime,
    position: isBuy ? 'belowBar' : 'aboveBar',
    color: isBuy ? '#f0b90b' : '#f6465d',
    shape: isBuy ? 'arrowUp' : 'arrowDown',
    text: label,
    size: isMega ? 2 : 1,
  };

  chartWhaleMarkers.push(marker);
  if (chartWhaleMarkers.length > 30) {
    chartWhaleMarkers.shift();
  }

  // Lightweight Charts requires markers sorted strictly ascending by time
  const sorted = [...chartWhaleMarkers].sort((a, b) => a.time - b.time);
  try {
    candleSeries.setMarkers(sorted);
  } catch (e) {
    console.warn('Erro ao plotar marcador de baleia no gráfico:', e);
  }
}

function updateWhalePriceLinesOnChart(walls) {
  if (!candleSeries) return;

  // Clear previous lines
  chartWhalePriceLines.forEach(line => {
    try { candleSeries.removePriceLine(line); } catch (e) {}
  });
  chartWhalePriceLines = [];

  // Only plot price lines when book is on micro-tick 0.01 (unaccumulated)
  if (orderBookGrouping > 0.0101 || !walls || walls.length === 0) return;

  walls.slice(0, 5).forEach(w => {
    try {
      const isBuy = w.isBid;
      const title = isBuy
        ? `🐋 PAREDE COMPRA (${w.qty.toFixed(1)} ETH)`
        : `🐋 PAREDE VENDA (${w.qty.toFixed(1)} ETH)`;

      // Fixed: High contrast golden yellow (#f0b90b) for buy walls instead of faint green
      const line = candleSeries.createPriceLine({
        price: w.price,
        color: isBuy ? '#f0b90b' : '#f6465d',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: title,
      });
      chartWhalePriceLines.push(line);
    } catch (e) {}
  });
}

// ==========================================
// USER CUSTOM PRICE MARKINGS & SUPPORT/RESISTANCE
// ==========================================

function updateMarkingsCountUI() {
  const badge = el.markingsCountBadge || document.getElementById('markingsCountBadge');
  if (badge) {
    badge.textContent = userPriceMarkings.length;
    badge.style.display = userPriceMarkings.length > 0 ? 'inline-block' : 'none';
  }
}

function renderAllUserPriceLines() {
  if (!candleSeries) return;

  // Clear existing lines to prevent duplicates
  userChartPriceLines.forEach((line) => {
    try { candleSeries.removePriceLine(line); } catch (e) {}
  });
  userChartPriceLines.clear();

  const solidStyle = (typeof LightweightCharts !== 'undefined' && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Solid !== undefined)
    ? LightweightCharts.LineStyle.Solid : 0;

  // Create price lines for all saved user markings
  userPriceMarkings.forEach(mark => {
    try {
      const lineStyleVal = mark.lineStyle !== undefined ? parseInt(mark.lineStyle, 10) : solidStyle;
      const line = candleSeries.createPriceLine({
        price: parseFloat(mark.price),
        color: mark.color || '#f0b90b',
        lineWidth: mark.lineWidth || 2,
        lineStyle: lineStyleVal,
        axisLabelVisible: true,
        title: mark.label || `Nível $${formatPrice(mark.price)}`,
      });
      userChartPriceLines.set(mark.id, line);
    } catch (e) {
      console.warn('Erro ao plotar marcação de preço do usuário:', e);
    }
  });

  updateMarkingsCountUI();
}

function addUserPriceMarking(price, label, color = '#f0b90b', lineStyle = 0) {
  const numPrice = parseFloat(price);
  if (isNaN(numPrice) || numPrice <= 0) return null;

  const mark = {
    id: 'mark_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    price: numPrice,
    label: (label && label.trim().length > 0) ? label.trim() : `Nível $${formatPrice(numPrice)}`,
    color: color || '#f0b90b',
    lineStyle: parseInt(lineStyle, 10) || 0,
    lineWidth: 2,
    createdAt: new Date().toISOString()
  };

  userPriceMarkings.push(mark);

  if (candleSeries) {
    try {
      const line = candleSeries.createPriceLine({
        price: mark.price,
        color: mark.color,
        lineWidth: mark.lineWidth,
        lineStyle: mark.lineStyle,
        axisLabelVisible: true,
        title: mark.label,
      });
      userChartPriceLines.set(mark.id, line);
    } catch (e) {
      console.warn('Erro ao adicionar linha de preço:', e);
    }
  }

  updateMarkingsCountUI();
  if (typeof renderMarkingsListInModal === 'function') {
    renderMarkingsListInModal();
  }
  // Salvar imediatamente no arquivo terminal_layout.json e localStorage
  if (typeof saveLayoutImmediate === 'function') {
    saveLayoutImmediate();
  }
  return mark;
}

function removeUserPriceMarking(id) {
  const line = userChartPriceLines.get(id);
  if (line && candleSeries) {
    try { candleSeries.removePriceLine(line); } catch (e) {}
  }
  userChartPriceLines.delete(id);
  userPriceMarkings = userPriceMarkings.filter(m => m.id !== id);

  updateMarkingsCountUI();
  if (typeof renderMarkingsListInModal === 'function') {
    renderMarkingsListInModal();
  }
  // Salvar imediatamente no arquivo terminal_layout.json e localStorage
  if (typeof saveLayoutImmediate === 'function') {
    saveLayoutImmediate();
  }
}

function clearAllUserPriceMarkings() {
  userChartPriceLines.forEach((line) => {
    if (candleSeries) {
      try { candleSeries.removePriceLine(line); } catch (e) {}
    }
  });
  userChartPriceLines.clear();
  userPriceMarkings = [];

  updateMarkingsCountUI();
  if (typeof renderMarkingsListInModal === 'function') {
    renderMarkingsListInModal();
  }
  // Salvar imediatamente no arquivo terminal_layout.json e localStorage
  if (typeof saveLayoutImmediate === 'function') {
    saveLayoutImmediate();
  }
}

// ==========================================
// MODO DESENHO RÁPIDO & FEEDBACK VISUAL
// ==========================================

window.isDrawingLineModeActive = false;

function toggleDrawingLineMode(forceState = null) {
  window.isDrawingLineModeActive = (forceState !== null) ? forceState : !window.isDrawingLineModeActive;
  const btn = document.getElementById('btnOpenAddMarking');
  const chartWrapper = document.getElementById('tvChartContainer');

  if (btn) {
    btn.classList.toggle('drawing-active', window.isDrawingLineModeActive);
    if (window.isDrawingLineModeActive) {
      btn.title = 'Modo Desenho ATIVO: Clique no gráfico para traçar a linha (ou clique aqui para cancelar)';
      showDrawingToast('Clique em qualquer altura do gráfico para fixar a linha de preço!');
    } else {
      btn.title = 'Adicionar Linha de Preço (Suporte / Resistência / Alvo) no Gráfico';
    }
  }

  if (chartWrapper) {
    chartWrapper.classList.toggle('crosshair-drawing-mode', window.isDrawingLineModeActive);
  }
}

function showDrawingToast(msg) {
  let toast = document.getElementById('drawingToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'drawingToast';
    toast.className = 'drawing-toast';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<i data-lucide="check-circle"></i> <span>${msg}</span>`;
  if (window.refreshIcons) {
    refreshIcons();
  } else if (window.lucide) {
    try { lucide.createIcons(); } catch (e) {}
  }
  toast.classList.add('visible');

  clearTimeout(window.drawingToastTimer);
  window.drawingToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3200);
}

// ==========================================
// CONTROLES DE ZOOM E NAVEGAÇÃO TRADINGVIEW
// ==========================================

window.isInitialChartLoaded = false;

function zoomInCandles(factor = 1.25) {
  if (!tvChart) return;
  const currentSpacing = tvChart.timeScale().options().barSpacing || 9;
  const newSpacing = Math.min(65, currentSpacing * factor);
  tvChart.timeScale().applyOptions({ barSpacing: newSpacing });
  if (volumeChart && isVolumeSeparated) {
    volumeChart.timeScale().applyOptions({ barSpacing: newSpacing });
  }
}

function zoomOutCandles(factor = 1.25) {
  if (!tvChart) return;
  const currentSpacing = tvChart.timeScale().options().barSpacing || 9;
  const newSpacing = Math.max(1.2, currentSpacing / factor);
  tvChart.timeScale().applyOptions({ barSpacing: newSpacing });
  if (volumeChart && isVolumeSeparated) {
    volumeChart.timeScale().applyOptions({ barSpacing: newSpacing });
  }
}

// Função helper segura para rolar para a vela mais recente compatível com todas as versões da Lightweight Charts
function safeScrollToRealtime(chartInstance) {
  if (!chartInstance) return;
  try {
    const ts = chartInstance.timeScale();
    if (typeof ts.scrollToRealTime === 'function') {
      ts.scrollToRealTime();
    } else if (typeof ts.scrollToPosition === 'function') {
      ts.scrollToPosition(0, false);
    } else if (typeof ts.scrollToRealtime === 'function') {
      ts.scrollToRealtime();
    } else if (typeof ts.resetTimeScale === 'function') {
      ts.resetTimeScale();
    }
  } catch (e) {
    console.warn('[Chart] Falha ao rolar para o candle em tempo real:', e);
  }
}

function resetChartZoom() {
  if (!tvChart) return;
  // Restaura escala de preços automática
  tvChart.priceScale('right').applyOptions({ autoScale: true });
  tvChart.timeScale().applyOptions({
    rightOffset: 12,
    barSpacing: 9,
  });
  safeScrollToRealtime(tvChart);

  if (volumeChart && isVolumeSeparated) {
    volumeChart.priceScale('right').applyOptions({ autoScale: true });
    volumeChart.timeScale().applyOptions({
      rightOffset: 12,
      barSpacing: 9,
    });
    safeScrollToRealtime(volumeChart);
  }
  showDrawingToast('Escala automática & velas centralizadas!');
}

function scrollChartToRealtime() {
  if (!tvChart) return;
  safeScrollToRealtime(tvChart);
  if (volumeChart && isVolumeSeparated) {
    safeScrollToRealtime(volumeChart);
  }
}

function initChartNavigationControls() {
  const btnIn = document.getElementById('btnZoomInCandles');
  const btnOut = document.getElementById('btnZoomOutCandles');
  const btnRealtime = document.getElementById('btnScrollRealtime');
  const btnAuto = document.getElementById('btnResetChartZoom');

  if (btnIn) {
    btnIn.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomInCandles();
    });
  }
  if (btnOut) {
    btnOut.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomOutCandles();
    });
  }
  if (btnRealtime) {
    btnRealtime.addEventListener('click', (e) => {
      e.stopPropagation();
      scrollChartToRealtime();
    });
  }
  if (btnAuto) {
    btnAuto.addEventListener('click', (e) => {
      e.stopPropagation();
      resetChartZoom();
    });
  }

  // Atalhos de teclado para aumentar/diminuir candles e navegar
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === '+' || e.key === '=') {
      zoomInCandles();
    } else if (e.key === '-' || e.key === '_') {
      zoomOutCandles();
    } else if (e.key === 'Home') {
      if (tvChart) tvChart.timeScale().scrollToPosition(-1000, true);
    } else if (e.key === 'End') {
      scrollChartToRealtime();
    }
  });
}


