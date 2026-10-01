/**
 * Binance Market Terminal - Whale Radar & Etherscan Intelligence Engine
 */

// Whale Tracker State
let rawWhalesData = [];
let currentWhaleCategory = 'all';
let whaleSearchQuery = '';
let whaleOrdersCount = 0;
let whaleOrdersTotalUSD = 0.0;

// Helper to extract clean base asset (ETH, SOL, BTC, etc.)
function getBaseAssetFromSymbol(symbol) {
  const sym = symbol || (typeof currentSymbol !== 'undefined' ? currentSymbol : 'ETHUSDT');
  if (sym.startsWith('ETH')) return 'ETH';
  if (sym.startsWith('BTC')) return 'BTC';
  if (sym.startsWith('SOL')) return 'SOL';
  return sym.replace('USDT', '').replace('BUSD', '').replace('USDC', '').replace('BTC', '') || 'Crypto';
}
window.getBaseAssetFromSymbol = getBaseAssetFromSymbol;

// Update UI text labels for the selected cryptocurrency symbol
function updateWhaleUIForSymbol(symbol) {
  const sym = symbol || (typeof currentSymbol !== 'undefined' ? currentSymbol : 'ETHUSDT');
  const baseAsset = getBaseAssetFromSymbol(sym);

  // 1. Atualizar Aba lateral "Baleias [ATIVO]"
  const tabWhalesSpan = document.querySelector('#tabWhales span');
  if (tabWhalesSpan) {
    tabWhalesSpan.textContent = `Baleias ${baseAsset}`;
  }
  const tabWhales = document.getElementById('tabWhales');
  if (tabWhales) {
    tabWhales.title = `Rastreador de Baleias ${baseAsset}`;
  }

  // 2. Tiers config
  const tierConfig = (typeof MARKET_TIERS !== 'undefined' && MARKET_TIERS[sym]) ? MARKET_TIERS[sym] : null;
  const whaleCfg = (tierConfig && tierConfig.whale) ? tierConfig.whale : { minQty: null, minUsd: 25000.0 };
  const minQtyLabel = whaleCfg.minQty ? `${whaleCfg.minQty} ${baseAsset}` : `$${Math.round((whaleCfg.minUsd || 25000) / 1000)}k`;
  const usdK = Math.round((whaleCfg.minUsd || 25000) / 1000);

  // 3. Atualizar Botão Subview Top 50
  const btnHolders = document.getElementById('subviewHolders');
  if (btnHolders) {
    if (baseAsset === 'ETH') {
      btnHolders.innerHTML = `🏆 Top 50 Baleias ETH`;
    } else {
      btnHolders.innerHTML = `🏆 Top 50 Baleias ETH (On-Chain)`;
    }
  }

  // 4. Atualizar Header da coluna de ordens ("Volume ETH" -> "Volume SOL")
  const headerCols = document.querySelectorAll('.whale-orders-header span');
  if (headerCols && headerCols.length >= 2) {
    headerCols[1].textContent = `Volume ${baseAsset}`;
  }

  // 5. Atualizar Banner explicativo
  const bannerDesc = document.querySelector('.whale-orders-banner .banner-desc');
  if (bannerDesc) {
    bannerDesc.innerHTML = `Captura instantânea de compras e vendas na Binance com volume ≥ <strong>${minQtyLabel}</strong> (~$${usdK}k+).`;
  }

  // 6. Atualizar Checkbox de filtro no histórico de trades
  const toggleWhalesSpan = document.querySelector('#paneTrades .whale-filter-toggle span');
  if (toggleWhalesSpan) {
    toggleWhalesSpan.textContent = `Filtrar Apenas Baleias (≥ ${minQtyLabel})`;
  }
}
window.updateWhaleUIForSymbol = updateWhaleUIForSymbol;

// Reset Whale Orders Feed when symbol changes
function resetWhaleOrdersFeed(symbol) {
  whaleOrdersCount = 0;
  whaleOrdersTotalUSD = 0.0;
  const sym = symbol || (typeof currentSymbol !== 'undefined' ? currentSymbol : 'ETHUSDT');
  const baseAsset = getBaseAssetFromSymbol(sym);

  if (el.whaleTradesCount) {
    el.whaleTradesCount.textContent = '0 ordens';
  }
  if (el.whaleSessionTotal) {
    el.whaleSessionTotal.textContent = 'Total: $0.00';
  }

  if (el.whaleOrdersFeed) {
    el.whaleOrdersFeed.innerHTML = `
      <div class="whale-empty-state">
        <span>🐋 Aguardando ordens de baleias em ${baseAsset} (${sym})...</span>
      </div>
    `;
  }

  updateWhaleUIForSymbol(sym);
}
window.resetWhaleOrdersFeed = resetWhaleOrdersFeed;

// Record real-time whale trade in sidebar feed
function recordWhaleOrder(side, price, qty, time) {
  whaleOrdersCount++;
  const totalUSD = price * qty;
  whaleOrdersTotalUSD += totalUSD;
  const baseAsset = getBaseAssetFromSymbol(currentSymbol);

  if (el.whaleTradesCount) {
    el.whaleTradesCount.textContent = `${whaleOrdersCount} ordens`;
  }
  if (el.whaleSessionTotal) {
    el.whaleSessionTotal.textContent = `Total: $${formatCompactNumber(whaleOrdersTotalUSD)}`;
  }

  // Prepend to Whale Orders Feed
  if (el.whaleOrdersFeed) {
    const emptyState = el.whaleOrdersFeed.querySelector('.whale-empty-state');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = `whale-order-row ${side}`;

    const sideBadge = side === 'buy'
      ? `<span class="whale-side-badge buy"><span class="whale-side-icon">🐋</span> COMPRA</span>`
      : `<span class="whale-side-badge sell"><span class="whale-side-icon">🐋</span> VENDA</span>`;

    row.innerHTML = `
      <span>${sideBadge} @ ${formatPrice(price)}</span>
      <span class="font-bold">${qty.toFixed(2)} ${baseAsset}</span>
      <span>$${formatCompactNumber(totalUSD)} <small style="color:var(--text-muted);font-size:9.5px">${time}</small></span>
    `;
    el.whaleOrdersFeed.prepend(row);

    if (el.whaleOrdersFeed.children.length > 50) {
      el.whaleOrdersFeed.removeChild(el.whaleOrdersFeed.lastChild);
    }
  }
}

// Fetch Top 50 ETH Whales from Flask / Etherscan API
async function loadWhalesData(force = false) {
  if (!el.whalesCardsList) return;

  if (force && el.btnRefreshWhales) {
    el.btnRefreshWhales.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px;"></div> Consultando...`;
  }

  try {
    const res = await fetch(`/api/whales?refresh=${force ? 'true' : 'false'}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    rawWhalesData = json.whales || [];

    // Update Quota status
    if (el.etherscanCallsUsed) {
      el.etherscanCallsUsed.textContent = `${json.daily_calls_used || 3}`;
    }
    if (el.whaleCacheBadge) {
      if (json.cached) {
        el.whaleCacheBadge.textContent = `Cache (${json.cache_age_seconds}s atrás)`;
        el.whaleCacheBadge.className = 'badge green';
      } else {
        el.whaleCacheBadge.textContent = 'Atualizado agora';
        el.whaleCacheBadge.className = 'badge green';
      }
    }

    renderWhalesList();

  } catch (err) {
    console.error('Erro ao carregar baleias:', err);
    if (el.whalesCardsList) {
      el.whalesCardsList.innerHTML = `
        <div style="padding:20px;text-align:center;color:var(--red);">
          <p>Erro ao consultar Etherscan: ${err.message}</p>
          <button class="btn btn-secondary" onclick="loadWhalesData(true)" style="margin:10px auto;">Tentar Novamente</button>
        </div>
      `;
    }
  } finally {
    if (el.btnRefreshWhales) {
      el.btnRefreshWhales.innerHTML = `<i data-lucide="refresh-cw"></i> Atualizar`;
      if (window.refreshIcons) refreshIcons();
      else if (window.lucide) lucide.createIcons();
    }
  }
}

// Render Whale Cards List with Informative Balloons on Hover
function renderWhalesList() {
  if (!el.whalesCardsList) return;

  let filtered = rawWhalesData;

  // Filter by category
  if (currentWhaleCategory !== 'all') {
    filtered = filtered.filter(w => w.category === currentWhaleCategory);
  }

  // Filter by search query
  if (whaleSearchQuery) {
    filtered = filtered.filter(w =>
      w.name.toLowerCase().includes(whaleSearchQuery) ||
      w.address.toLowerCase().includes(whaleSearchQuery) ||
      (w.category && w.category.toLowerCase().includes(whaleSearchQuery)) ||
      (w.description && w.description.toLowerCase().includes(whaleSearchQuery))
    );
  }

  if (filtered.length === 0) {
    el.whalesCardsList.innerHTML = `
      <div class="whale-empty-state">
        <p>Nenhuma carteira encontrada com o filtro aplicado.</p>
      </div>
    `;
    return;
  }

  el.whalesCardsList.innerHTML = filtered.map((w, index) => {
    const catClass = `cat-${w.category.toLowerCase()}`;
    const rankClass = w.rank === 1 ? 'rank-1' : w.rank === 2 ? 'rank-2' : w.rank === 3 ? 'rank-3' : '';
    const pctSupply = w.percent_supply || 0;
    const barWidth = Math.min(100, Math.max(3, pctSupply * 1.3));

    const isBeacon = w.name.includes('Beacon Deposit') || w.rank === 1;
    const instTag = w.is_institution
      ? '<span class="whale-inst-tag inst"><i data-lucide="building-2"></i> Instituição</span>'
      : isBeacon
      ? '<span class="whale-inst-tag protocol beacon-pulse"><i data-lucide="shield-check"></i> Protocolo Oficial (Não Instituição)</span>'
      : '<span class="whale-inst-tag protocol"><i data-lucide="code"></i> Smart Contract / On-Chain</span>';

    return `
      <div class="whale-card ${rankClass}" data-whale-index="${index}" id="whale-card-${w.rank}">
        <div class="whale-card-header">
          <div class="whale-card-title">
            <span class="whale-rank-badge">#${w.rank}</span>
            <span class="whale-name" title="${w.name}">${w.name}</span>
          </div>
          <div class="whale-header-right">
            ${instTag}
            <span class="whale-category-badge ${catClass}">${w.category}</span>
            <button class="whale-info-trigger" title="Ver informações completas da carteira" data-rank="${w.rank}">
              <i data-lucide="info"></i>
            </button>
          </div>
        </div>

        <div class="whale-card-body">
          <span class="whale-balance-eth">${w.balance_eth.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ETH</span>
          <span class="whale-balance-usd">$${formatCompactNumber(w.balance_usd)}</span>
        </div>

        <div class="whale-supply-row">
          <div class="whale-supply-bar">
            <div class="whale-supply-fill" style="width: ${barWidth}%"></div>
          </div>
          <span>${pctSupply.toFixed(2)}% do suprimento global</span>
        </div>

        <div class="whale-card-footer">
          <a href="${w.etherscan_url}" target="_blank" rel="noopener noreferrer" class="whale-address-link" title="Ver endereço no Etherscan">
            <code>${w.short_address}</code>
            <i data-lucide="external-link" style="width:11px;height:11px;"></i>
          </a>
          <button class="whale-copy-btn" onclick="copyWhaleAddress('${w.address}', this)">
            <i data-lucide="copy" style="width:11px;height:11px;"></i> Copiar
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.refreshIcons) {
    refreshIcons();
  } else if (window.lucide) {
    lucide.createIcons();
  }

  // Attach hover events to cards to display informative balloons
  const cards = el.whalesCardsList.querySelectorAll('.whale-card');
  cards.forEach(card => {
    const idx = parseInt(card.dataset.whaleIndex, 10);
    const whale = filtered[idx];
    if (!whale) return;

    const handleHover = (e) => {
      const isBeacon = whale.name.includes('Beacon Deposit') || whale.rank === 1;

      const instStatusHtml = whale.is_institution
        ? '<div class="tip-inst-row inst"><span class="badge blue">🏦 Instituição Financeira / CEX</span> Esta carteira pertence a uma empresa, custodiante institucional ou mesa de trading regulada.</div>'
        : isBeacon
        ? '<div class="tip-inst-row protocol beacon"><span class="badge green">⚡ PROTOCOLO OFICIAL (NÃO É UMA INSTITUIÇÃO)</span> O <strong>Beacon Deposit Contract</strong> NÃO é uma empresa nem instituição privada! É o contrato inteligente canônico do Ethereum onde todos os validadores da rede mundial travam seus 32 ETH para participar do consenso Proof-of-Stake (PoS).</div>'
        : '<div class="tip-inst-row protocol"><span class="badge purple">⚡ Não é Instituição Centralizada</span> Contrato inteligente descentralizado, ponte Layer-2 ou carteira individual.</div>';

      const detailsHtml = `
        ${instStatusHtml}
        <div class="tip-desc-box">
          <p>${whale.info_details || whale.description || 'Carteira relevante rastreada na rede Ethereum.'}</p>
        </div>
        <div class="tip-stats-grid">
          <div class="tip-stat-item">
            <span>Saldo Atual:</span>
            <strong class="font-mono">${whale.balance_eth.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETH</strong>
          </div>
          <div class="tip-stat-item">
            <span>Valor em USD:</span>
            <strong class="font-mono">$${formatCompactNumber(whale.balance_usd)}</strong>
          </div>
          <div class="tip-stat-item">
            <span>Suprimento Total:</span>
            <strong class="font-mono yellow">${whale.percent_supply.toFixed(2)}% de todo ETH do mundo</strong>
          </div>
          <div class="tip-stat-item">
            <span>Tipo:</span>
            <strong class="font-mono">${whale.entity_type || whale.category}</strong>
          </div>
        </div>
      `;

      showAppTooltip({
        targetEl: card,
        event: e,
        title: `#${whale.rank} ${whale.name}`,
        subtitle: `Endereço: ${whale.short_address}`,
        badgeText: whale.category,
        badgeClass: `cat-${whale.category.toLowerCase()}`,
        bodyHtml: detailsHtml,
        footerHtml: '<span class="tooltip-hint">Clique no link para inspecionar transações on-chain no Etherscan</span>',
      });
    };

    card.addEventListener('mouseenter', handleHover);
    card.addEventListener('mouseleave', hideAppTooltip);
  });
}

// Copy Whale Address Helper
function copyWhaleAddress(address, btn) {
  navigator.clipboard.writeText(address).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width:11px;height:11px;color:var(--green)"></i> Copiado!`;
    if (window.refreshIcons) refreshIcons();
    else if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = originalText;
      if (window.refreshIcons) refreshIcons();
      else if (window.lucide) lucide.createIcons();
    }, 1500);
  });
}
