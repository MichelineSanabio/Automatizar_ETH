// Centralized Debounced Lucide Icons Refresh (evita re-renderizações e scans massivos no DOM)
let _lucideDebounceTimer = null;
function refreshIcons() {
  if (typeof lucide === 'undefined' || !lucide.createIcons) return;
  if (_lucideDebounceTimer) clearTimeout(_lucideDebounceTimer);
  _lucideDebounceTimer = setTimeout(() => {
    try {
      lucide.createIcons();
    } catch (e) {
      console.warn('[Lucide] Erro ao renderizar ícones:', e);
    }
  }, 40);
}
window.refreshIcons = refreshIcons;
window.debouncedLucideIcons = refreshIcons;

// Helper to fetch Binance REST API with multi-tier fallback (direct -> data-api -> Flask local proxy)
async function fetchBinance(endpoint) {
  try {
    const res = await fetch(`${CONFIG.restBaseUrl}${endpoint}`);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    try {
      console.warn(`Tentando fallback data-api para ${endpoint}...`, err);
      const resFallback = await fetch(`${CONFIG.restFallbackUrl}${endpoint}`);
      if (resFallback.ok) return resFallback;
      throw new Error(`HTTP ${resFallback.status}`);
    } catch (err2) {
      console.warn(`Tentando proxy local do Flask para ${endpoint}...`, err2);
      const cleanPath = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
      return fetch(`/api/binance/${cleanPath}`);
    }
  }
}

// Price Number Formatter
function formatPrice(num) {
  if (isNaN(num) || num === null) return '---';
  if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(2);
  if (num >= 0.0001) return num.toFixed(6);
  return num.toString();
}

// Compact Number Formatter (K, M, B)
function formatCompactNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return Number(num).toFixed(2);
}

// Update Base Asset Labels throughout the UI
function updateBaseAssetLabel(symbol) {
  let asset = 'ETH';
  if (symbol.startsWith('ETH')) asset = 'ETH';
  else if (symbol.startsWith('BTC')) asset = 'BTC';
  else if (symbol.startsWith('SOL')) asset = 'SOL';
  else asset = 'Crypto';

  if (el.baseAssetLabel) el.baseAssetLabel.textContent = asset;
  const volAsset = el.volAssetLabel || document.getElementById('volAssetLabel');
  if (volAsset) volAsset.textContent = asset;

  if (symbol.endsWith('BTC')) {
    if (el.priceCurrency) el.priceCurrency.textContent = 'BTC';
  } else {
    if (el.priceCurrency) el.priceCurrency.textContent = 'USDT';
  }
}

// Set WebSocket Connection Status in Header
function setWsStatus(text, status) {
  if (!el.wsStatusText || !el.wsStatus) return;
  el.wsStatusText.textContent = text;
  const dot = el.wsStatus.querySelector('.status-dot');
  if (!dot) return;

  if (status === 'connected') {
    dot.className = 'status-dot pulsing';
    el.wsStatus.style.borderColor = 'rgba(14, 203, 129, 0.25)';
    el.wsStatusText.style.color = '#0ecb81';
  } else if (status === 'connecting') {
    dot.className = 'status-dot';
    el.wsStatus.style.borderColor = 'rgba(240, 185, 11, 0.3)';
    el.wsStatusText.style.color = '#f0b90b';
  } else {
    dot.className = 'status-dot';
    el.wsStatus.style.borderColor = 'rgba(246, 70, 93, 0.3)';
    el.wsStatusText.style.color = '#f6465d';
  }
}

// Show/Hide Chart Loading Overlay
function showLoading(show) {
  if (!el.chartLoader) return;
  if (show) el.chartLoader.classList.remove('hidden');
  else el.chartLoader.classList.add('hidden');
}

// Live Reload for Development (executa apenas em localhost com throttling inteligente)
function setupLiveReload() {
  const isDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isDevHost) return;

  let initialServerTime = null;
  let consecutiveErrors = 0;

  const timerId = setInterval(async () => {
    if (consecutiveErrors > 15) {
      clearInterval(timerId);
      return;
    }
    try {
      const res = await fetch('/dev/version');
      if (res.ok) {
        consecutiveErrors = 0;
        const data = await res.json();
        if (initialServerTime === null) {
          initialServerTime = data.server_start_time;
        } else if (data.server_start_time && data.server_start_time !== initialServerTime) {
          console.log('[LiveReload] Servidor Flask reiniciado por alteração de código. Recarregando página...');
          window.location.reload();
        }
      } else {
        consecutiveErrors++;
      }
    } catch (e) {
      consecutiveErrors++;
    }
  }, 2000);
}

// CSV Export Utility
function exportToCSV() {
  if (!historicalCandles || historicalCandles.length === 0) {
    alert('Nenhum dado histórico carregado para exportar.');
    return;
  }

  const headers = ['Timestamp_UTC', 'DateTime', 'Open', 'High', 'Low', 'Close', 'Volume'];
  const rows = historicalCandles.map(c => [
    c.time * 1000,
    new Date(c.time * 1000).toISOString(),
    c.open,
    c.high,
    c.low,
    c.close,
    c.volume,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BINANCE_${currentSymbol}_${currentInterval}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================================================
// UNIVERSAL FLOATING TOOLTIP & EXPLANATION BALLOONS ENGINE
// ==========================================================================

let globalTooltipEl = null;

// Indicator Knowledge Base
const INDICATOR_EXPLANATIONS = {
  ema20: {
    title: 'EMA 20 (Média Móvel Exponencial)',
    badge: 'Momentum Rápido',
    badgeClass: 'yellow',
    formula: 'EMA = (Fechamento * k) + (EMA anterior * (1 - k)), onde k = 2 / (20 + 1)',
    summary: 'Atribui peso exponencial aos preços mais recentes. Reage rápido a mudanças de curto prazo.',
    interpretation: '• Preço acima da EMA 20: Momentum comprador imediato ativo.<br>• Preço abaixo da EMA 20: Correção ou fraqueza de curto prazo.<br>• Serve como suporte e resistência dinâmico em tendências fortes.',
  },
  ema50: {
    title: 'EMA 50 (Média Móvel Exponencial)',
    badge: 'Tendência Principal',
    badgeClass: 'cyan',
    formula: 'Média exponencial calculada sobre os últimos 50 candles.',
    summary: 'Define a direção dominante do mercado no médio prazo e filtra ruídos.',
    interpretation: '• <strong>Bullish</strong>: Preço negociando acima da EMA 50.<br>• <strong>Bearish</strong>: Preço negociando abaixo da EMA 50.<br>• <strong>Golden Cross</strong>: EMA 20 cruzando para cima da EMA 50 indica início de rali de alta.',
  },
  rsi: {
    title: 'RSI (Relative Strength Index 14)',
    badge: 'Oscilador de Momentum',
    badgeClass: 'purple',
    formula: 'RSI = 100 - (100 / (1 + Média Ganhos / Média Perdas))',
    summary: 'Mede a velocidade e a magnitude dos movimentos de preço em uma escala de 0 a 100.',
    interpretation: '• <strong>Sobrecompra (> 70)</strong>: Ativo subiu demais rápido, risco iminente de correção.<br>• <strong>Sobrevenda (< 30)</strong>: Ativo excessivamente vendido, chance de repique comprador.<br>• <strong>Zona Neutra (40-60)</strong>: Mercado em equilíbrio ou consolidação.',
  },
  bands: {
    title: 'Bandas de Bollinger (20 períodos, 2 Desvios)',
    badge: 'Volatilidade Estatística',
    badgeClass: 'purple',
    formula: 'Média SMA 20 ± (2 * Desvio Padrão dos preços)',
    summary: 'Envolve o preço em um canal de probabilidade estatística de 95,4%.',
    interpretation: '• <strong>Squeeze (Estreitamento)</strong>: Baixa volatilidade que antecipa rompimentos explosivos.<br>• <strong>Toque na Banda Superior</strong>: Preço esticado na ponta compradora.<br>• <strong>Toque na Banda Inferior</strong>: Preço em suporte estatístico de sobrevenda.',
  },
  macd: {
    title: 'MACD (Moving Average Convergence Divergence 12, 26, 9)',
    badge: 'Tendência & Momentum',
    badgeClass: 'blue',
    formula: 'Linha MACD = EMA(12) - EMA(26) | Linha de Sinal = EMA(9) do MACD | Histograma = MACD - Sinal',
    summary: 'Um dos osciladores mais respeitados no mundo. Rastreia o início e a força de novas tendências.',
    interpretation: '• <strong>Cruzamento de Alta (🟢 Compra)</strong>: Linha MACD cruza acima da Linha de Sinal.<br>• <strong>Cruzamento de Baixa (🔴 Venda)</strong>: Linha MACD cruza abaixo da Linha de Sinal.<br>• <strong>Histograma Crescente</strong>: Aceleração da força da tendência.',
  },
  vwap: {
    title: 'VWAP Estimado (Volume-Weighted Average Price)',
    badge: 'Referência Institucional',
    badgeClass: 'green',
    formula: '∑ (Preço Médio do Candle * Volume) / ∑ Volume Total da Sessão',
    summary: 'Preço médio ponderado pelo volume. O principal benchmark de mesas institucionais e fundos.',
    interpretation: '• Instituições compram quando o preço está <strong>abaixo do VWAP</strong> (comprando barato).<br>• Compras <strong>acima do VWAP</strong> indicam urgência compradora agressiva.',
  },
};

function initGlobalTooltip() {
  if (globalTooltipEl) return;
  globalTooltipEl = document.createElement('div');
  globalTooltipEl.id = 'appFloatingTooltip';
  globalTooltipEl.className = 'app-floating-tooltip';
  globalTooltipEl.style.display = 'none';
  document.body.appendChild(globalTooltipEl);

  // Close on Escape or scroll
  window.addEventListener('scroll', hideAppTooltip, true);
}

function showAppTooltip({ targetEl, event, title, subtitle, badgeText, badgeClass = '', bodyHtml = '', footerHtml = '' }) {
  if (!globalTooltipEl) initGlobalTooltip();

  globalTooltipEl.innerHTML = `
    <div class="app-tooltip-header">
      <div class="app-tooltip-title-wrap">
        <span class="app-tooltip-title">${title}</span>
        ${subtitle ? `<span class="app-tooltip-subtitle">${subtitle}</span>` : ''}
      </div>
      ${badgeText ? `<span class="app-tooltip-badge ${badgeClass}">${badgeText}</span>` : ''}
    </div>
    ${bodyHtml ? `<div class="app-tooltip-body">${bodyHtml}</div>` : ''}
    ${footerHtml ? `<div class="app-tooltip-footer">${footerHtml}</div>` : ''}
  `;

  globalTooltipEl.style.display = 'block';

  // Calculate best position
  const rect = targetEl ? targetEl.getBoundingClientRect() : null;
  const tipRect = globalTooltipEl.getBoundingClientRect();
  const pad = 12;

  let left = event ? event.clientX + 14 : rect.left + rect.width / 2 - tipRect.width / 2;
  let top = event ? event.clientY + 14 : rect.bottom + 8;

  // Boundary checks
  if (left + tipRect.width > window.innerWidth - pad) {
    left = window.innerWidth - tipRect.width - pad;
  }
  if (left < pad) left = pad;

  if (top + tipRect.height > window.innerHeight - pad) {
    if (rect) {
      top = rect.top - tipRect.height - 8;
    } else {
      top = event.clientY - tipRect.height - 14;
    }
  }
  if (top < pad) top = pad;

  globalTooltipEl.style.left = `${Math.round(left)}px`;
  globalTooltipEl.style.top = `${Math.round(top)}px`;
}

function hideAppTooltip() {
  if (globalTooltipEl) {
    globalTooltipEl.style.display = 'none';
  }
}

// Bind tooltips to indicator buttons
function bindIndicatorTooltips() {
  const indicatorButtons = document.querySelectorAll('.toggle-pill[data-indicator]');
  indicatorButtons.forEach(btn => {
    const key = btn.dataset.indicator;
    const info = INDICATOR_EXPLANATIONS[key];
    if (!info) return;

    btn.addEventListener('mouseenter', (e) => {
      showAppTooltip({
        targetEl: btn,
        event: e,
        title: info.title,
        badgeText: info.badge,
        badgeClass: info.badgeClass,
        bodyHtml: `
          <div class="tooltip-summary">${info.summary}</div>
          <div class="tooltip-formula"><code>${info.formula}</code></div>
          <div class="tooltip-interp">${info.interpretation}</div>
        `,
        footerHtml: '<span class="tooltip-hint">Clique para ligar / desligar no gráfico</span>',
      });
    });

    btn.addEventListener('mouseleave', hideAppTooltip);
  });
}
