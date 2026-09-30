/**
 * Binance Market Terminal - 24h Ticker & Metrics Renderer
 * Gerencia as estatísticas de 24h (preço, variação, máxima, mínima, volume, vwap),
 * além dos painéis dedicados de métricas estatísticas e status da API.
 */

// Render 24h Ticker Stats
function renderTicker24h(data) {
  const price = parseFloat(data.lastPrice || data.c || 0);
  const changeVal = parseFloat(data.priceChange || data.p || 0);
  const changePct = parseFloat(data.priceChangePercent || data.P || 0);
  const high = parseFloat(data.highPrice || data.h || 0);
  const low = parseFloat(data.lowPrice || data.l || 0);
  const volBase = parseFloat(data.volume || data.v || 0);
  const volQuote = parseFloat(data.quoteVolume || data.q || 0);
  const vwap = parseFloat(data.weightedAvgPrice || data.w || 0);

  if (typeof updateLivePrice === 'function') {
    updateLivePrice(price);
  }

  // Change value & percent
  const sign = changeVal >= 0 ? '+' : '';
  if (el.changeVal) el.changeVal.textContent = `${sign}${formatPrice(changeVal)}`;
  if (el.changePercentBadge) {
    el.changePercentBadge.textContent = `${sign}${changePct.toFixed(2)}%`;
    el.changePercentBadge.className = `badge ${changeVal >= 0 ? 'green' : 'red'}`;
  }

  // High & Low
  if (el.high24h) el.high24h.textContent = formatPrice(high);
  if (el.low24h) el.low24h.textContent = formatPrice(low);

  // Volume
  if (el.volBase24h) el.volBase24h.textContent = formatCompactNumber(volBase);
  if (el.volQuote24h) el.volQuote24h.textContent = '$' + formatCompactNumber(volQuote);

  if (vwap && el.cardVwap) {
    el.cardVwap.textContent = formatPrice(vwap);
  }

  // Range 24h bar
  if (high > low && el.rangePercent && el.rangeBarFill) {
    const rangePos = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
    el.rangePercent.textContent = `${rangePos.toFixed(0)}%`;
    el.rangeBarFill.style.width = `${rangePos}%`;
  }
}

// Update Dedicated Metrics Tab
function updateMetricsPanel() {
  const rsiVal = parseFloat(el.valRsi ? el.valRsi.textContent : '50') || 50;
  const needle = document.getElementById('cardRsiNeedle');
  if (needle) {
    needle.style.left = `${Math.min(100, Math.max(0, rsiVal))}%`;
  }

  const metricHigh24 = document.getElementById('metricHigh24');
  const metricLow24 = document.getElementById('metricLow24');
  const metricVolBase24 = document.getElementById('metricVolBase24');
  const metricVolQuote24 = document.getElementById('metricVolQuote24');

  if (metricHigh24 && el.high24h) metricHigh24.textContent = el.high24h.textContent;
  if (metricLow24 && el.low24h) metricLow24.textContent = el.low24h.textContent;
  if (metricVolBase24 && el.volBase24h) metricVolBase24.textContent = el.volBase24h.textContent + ' ' + (currentSymbol.slice(0, 3));
  if (metricVolQuote24 && el.volQuote24h) metricVolQuote24.textContent = el.volQuote24h.textContent;
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
