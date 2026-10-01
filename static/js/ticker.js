/**
 * Binance Market Terminal - 24h Ticker & Metrics Renderer
 * Gerencia as estatísticas de 24h (preço, variação, máxima, mínima, volume, vwap),
 * além dos painéis dedicados de métricas estatísticas e status da API.
 */

window.lastTicker24hData = null;

// Render 24h Ticker Stats
function renderTicker24h(data) {
  if (!data) return;
  const price = parseFloat(data.lastPrice || data.c || 0);
  const changeVal = parseFloat(data.priceChange || data.p || 0);
  const changePct = parseFloat(data.priceChangePercent || data.P || 0);
  const high = parseFloat(data.highPrice || data.h || 0);
  const low = parseFloat(data.lowPrice || data.l || 0);
  const volBase = parseFloat(data.volume || data.v || 0);
  const volQuote = parseFloat(data.quoteVolume || data.q || 0);
  const vwap = parseFloat(data.weightedAvgPrice || data.w || 0);

  // Cache para consultas e trocas de aba
  window.lastTicker24hData = { price, changeVal, changePct, high, low, volBase, volQuote, vwap };

  if (typeof updateLivePrice === 'function' && price > 0) {
    updateLivePrice(price);
  }

  // Change value & percent
  const sign = changeVal >= 0 ? '+' : '';
  if (el.changeVal) el.changeVal.textContent = `${sign}${formatPrice(changeVal)}`;
  if (el.changePercentBadge) {
    el.changePercentBadge.textContent = `${sign}${changePct.toFixed(2)}%`;
    el.changePercentBadge.className = `badge ${changeVal >= 0 ? 'green' : 'red'}`;
  }

  // High & Low no Ticker Bar
  if (el.high24h && high > 0) el.high24h.textContent = formatPrice(high);
  if (el.low24h && low > 0) el.low24h.textContent = formatPrice(low);

  // Volume no Ticker Bar
  if (el.volBase24h && volBase > 0) el.volBase24h.textContent = formatCompactNumber(volBase);
  if (el.volQuote24h && volQuote > 0) el.volQuote24h.textContent = '$' + formatCompactNumber(volQuote);

  // VWAP no painel de Métricas Técnicas
  const cardVwapEl = el.cardVwap || document.getElementById('cardVwap');
  if (vwap > 0 && cardVwapEl) {
    cardVwapEl.textContent = formatPrice(vwap);
  }

  // Range 24h bar
  if (high > low && el.rangePercent && el.rangeBarFill) {
    const rangePos = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    el.rangePercent.textContent = `${rangePos.toFixed(0)}%`;
    el.rangeBarFill.style.width = `${rangePos}%`;
  }

  // Atualização em Tempo Real do Card "Resumo de Mercado (24 Horas)" na aba Métricas
  const assetLabel = (typeof getBaseAssetFromSymbol === 'function')
    ? getBaseAssetFromSymbol(currentSymbol)
    : (currentSymbol ? currentSymbol.replace('USDT', '') : 'ETH');

  const metricHigh24 = el.metricHigh24 || document.getElementById('metricHigh24');
  const metricLow24 = el.metricLow24 || document.getElementById('metricLow24');
  const metricVolBase24 = el.metricVolBase24 || document.getElementById('metricVolBase24');
  const metricVolQuote24 = el.metricVolQuote24 || document.getElementById('metricVolQuote24');

  if (metricHigh24 && high > 0) metricHigh24.textContent = formatPrice(high);
  if (metricLow24 && low > 0) metricLow24.textContent = formatPrice(low);
  if (metricVolBase24 && volBase > 0) metricVolBase24.textContent = `${formatCompactNumber(volBase)} ${assetLabel}`;
  if (metricVolQuote24 && volQuote > 0) metricVolQuote24.textContent = `$${formatCompactNumber(volQuote)}`;
}

// Update Dedicated Metrics Tab
function updateMetricsPanel() {
  const rsiVal = parseFloat(el.valRsi ? el.valRsi.textContent : '50') || 50;
  const needle = document.getElementById('cardRsiNeedle');
  if (needle) {
    needle.style.left = `${Math.min(100, Math.max(0, rsiVal))}%`;
  }

  const assetLabel = (typeof getBaseAssetFromSymbol === 'function')
    ? getBaseAssetFromSymbol(currentSymbol)
    : (currentSymbol ? currentSymbol.replace('USDT', '') : 'ETH');

  const metricHigh24 = el.metricHigh24 || document.getElementById('metricHigh24');
  const metricLow24 = el.metricLow24 || document.getElementById('metricLow24');
  const metricVolBase24 = el.metricVolBase24 || document.getElementById('metricVolBase24');
  const metricVolQuote24 = el.metricVolQuote24 || document.getElementById('metricVolQuote24');

  if (window.lastTicker24hData) {
    const { high, low, volBase, volQuote, vwap } = window.lastTicker24hData;
    if (metricHigh24 && high > 0) metricHigh24.textContent = formatPrice(high);
    if (metricLow24 && low > 0) metricLow24.textContent = formatPrice(low);
    if (metricVolBase24 && volBase > 0) metricVolBase24.textContent = `${formatCompactNumber(volBase)} ${assetLabel}`;
    if (metricVolQuote24 && volQuote > 0) metricVolQuote24.textContent = `$${formatCompactNumber(volQuote)}`;
    const cardVwapEl = el.cardVwap || document.getElementById('cardVwap');
    if (cardVwapEl && vwap > 0) cardVwapEl.textContent = formatPrice(vwap);
  } else {
    // Fallback lendo do ticker bar
    if (metricHigh24 && el.high24h && el.high24h.textContent !== '---.--') {
      metricHigh24.textContent = el.high24h.textContent;
    }
    if (metricLow24 && el.low24h && el.low24h.textContent !== '---.--') {
      metricLow24.textContent = el.low24h.textContent;
    }
    if (metricVolBase24 && el.volBase24h && el.volBase24h.textContent !== '---') {
      metricVolBase24.textContent = `${el.volBase24h.textContent} ${assetLabel}`;
    }
    if (metricVolQuote24 && el.volQuote24h && el.volQuote24h.textContent !== '---') {
      metricVolQuote24.textContent = el.volQuote24h.textContent;
    }
  }

  // Recalcular indicadores da aba se necessário
  if (typeof updateIndicatorsData === 'function') {
    updateIndicatorsData();
  }
}

// Update Dedicated API & Quotas Tab
function updateApiPanel() {
  const apiRestLatency = document.getElementById('apiRestLatency');
  if (apiRestLatency && el.footerPing) {
    apiRestLatency.textContent = el.footerPing.textContent.replace('Latência:', '').trim();
  }

  const apiWsBadge = document.getElementById('apiWsBadge');
  if (apiWsBadge && el.wsStatusText) {
    const isConn = el.wsStatusText.textContent.includes('Conectado');
    apiWsBadge.className = `badge ${isConn ? 'green' : 'red'}`;
    apiWsBadge.textContent = isConn ? '🟢 Conectado' : '🔴 Desconectado';
  }

  const callsUsed = parseInt(el.etherscanCallsUsed ? el.etherscanCallsUsed.textContent : '3', 10) || 3;
  const quotaFill = document.getElementById('etherscanQuotaFill');
  if (quotaFill) {
    const pct = Math.max(1, Math.min(100, (callsUsed / 100000) * 100));
    quotaFill.style.width = `${pct}%`;
  }
}
