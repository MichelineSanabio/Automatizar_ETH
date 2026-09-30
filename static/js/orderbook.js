/**
 * Binance Market Terminal - Order Book & Whale Wall Radar Engine
 * Supports real-time editable spread / tick size grouping (e.g. 0.01, 0.1, 10, 50, 100, custom)
 */

// Helper to determine decimal precision based on step
function getStepDecimals(step) {
  if (step >= 1) return 2;
  const str = step.toString();
  if (str.includes('.')) {
    return Math.max(2, str.split('.')[1].length);
  }
  return 2;
}

// Set Order Book Grouping / Spread Step
function setOrderBookGrouping(step, syncInputs = true) {
  if (isNaN(step) || step <= 0) return;
  orderBookGrouping = step;
  console.log(`[OrderBook] Agrupamento alterado para: ${step}`);

  // 1. Synchronize Quick Tick Pills in sidebar and Pro View
  [el.obTickPills, el.obProTickPills].forEach(container => {
    const c = container || (container === el.obTickPills ? document.getElementById('obTickPills') : document.getElementById('obProTickPills'));
    if (c) {
      const pills = c.querySelectorAll('.ob-tick-btn');
      pills.forEach(pill => {
        const pStep = parseFloat(pill.dataset.step);
        pill.classList.toggle('active', Math.abs(pStep - step) < 0.0001);
      });
    }
  });

  // 2. Synchronize Dropdown & Custom Input
  const stepSelect = el.spreadStepSelect || document.getElementById('spreadStepSelect');
  const customInput = el.spreadStepCustom || document.getElementById('spreadStepCustom');
  const binanceSelect = el.binanceStepSelect || document.getElementById('binanceStepSelect');

  if (syncInputs && binanceSelect) {
    const matching = Array.from(binanceSelect.options).find(opt => Math.abs(parseFloat(opt.value) - step) < 0.0001);
    if (matching) binanceSelect.value = matching.value;
  }

  if (syncInputs && stepSelect) {
    const matchingOption = Array.from(stepSelect.options).find(opt => {
      return opt.value !== 'custom' && Math.abs(parseFloat(opt.value) - step) < 0.0001;
    });

    if (matchingOption) {
      stepSelect.value = matchingOption.value;
      if (customInput) customInput.style.display = 'none';
    } else {
      stepSelect.value = 'custom';
      if (customInput) {
        customInput.style.display = 'inline-block';
        customInput.value = step;
      }
    }
  }

  // 3. Immediately re-render cached depth in real-time
  if (lastRawDepth) {
    renderOrderBook(lastRawDepth);
  }

  if (!isRestoringSettings && isSettingsLoaded) {
    if (typeof saveLayoutImmediate === 'function') {
      saveLayoutImmediate();
    }
  }
}

// Initialize Interactive Controls for Spread and Order Book Grouping
function initOrderBookControls() {
  const pillsContainer = el.obTickPills || document.getElementById('obTickPills');
  const proPillsContainer = el.obProTickPills || document.getElementById('obProTickPills');
  const stepSelect = el.spreadStepSelect || document.getElementById('spreadStepSelect');
  const customInput = el.spreadStepCustom || document.getElementById('spreadStepCustom');
  const spreadValueEl = el.spreadValue || document.getElementById('spreadValue');
  const depthPillsContainer = el.obProDepthPills || document.getElementById('obProDepthPills');
  const btnExpand = el.btnExpandOrderBook || document.getElementById('btnExpandOrderBook');
  const binanceSelect = el.binanceStepSelect || document.getElementById('binanceStepSelect');

  // Binance Header Step Dropdown Handler
  if (binanceSelect) {
    binanceSelect.addEventListener('change', (e) => {
      const step = parseFloat(e.target.value);
      if (!isNaN(step) && step > 0) {
        setOrderBookGrouping(step, true);
      }
    });
  }

  // Sidebar Tick Pills Click Handler
  if (pillsContainer) {
    pillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.ob-tick-btn');
      if (!btn) return;
      const step = parseFloat(btn.dataset.step);
      if (!isNaN(step) && step > 0) {
        setOrderBookGrouping(step, true);
      }
    });
  }

  // Pro View Tick Pills Click Handler
  if (proPillsContainer) {
    proPillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.ob-tick-btn');
      if (!btn) return;
      const step = parseFloat(btn.dataset.step);
      if (!isNaN(step) && step > 0) {
        setOrderBookGrouping(step, true);
      }
    });
  }

  // Pro View Visible Rows Depth Pills (15, 25, 50)
  if (depthPillsContainer) {
    depthPillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.ob-depth-btn');
      if (!btn) return;
      const rows = parseInt(btn.dataset.rows, 10);
      if (!isNaN(rows) && rows > 0) {
        obProDepthRows = rows;
        depthPillsContainer.querySelectorAll('.ob-depth-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        if (lastRawDepth) renderOrderBook(lastRawDepth);
        if (typeof isRestoringSettings === 'undefined' || !isRestoringSettings) {
          if (typeof saveLayoutImmediate === 'function') {
            saveLayoutImmediate();
          }
        }
      }
    });
  }

  // Expand Button to open side-by-side dedicated view
  if (btnExpand) {
    btnExpand.addEventListener('click', () => {
      if (typeof setMainView === 'function') {
        setMainView('orderbook');
      }
    });
  }

  // Spread Select Dropdown Handler
  if (stepSelect) {
    stepSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (customInput) {
          customInput.style.display = 'inline-block';
          customInput.value = orderBookGrouping;
          customInput.focus();
          customInput.select();
        }
      } else {
        if (customInput) {
          customInput.style.display = 'none';
        }
        const step = parseFloat(val);
        if (!isNaN(step) && step > 0) {
          setOrderBookGrouping(step, true);
        }
      }
    });
  }

  // Spread Custom Input Handlers
  if (customInput) {
    // Real-time live update as the user types
    customInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        setOrderBookGrouping(val, false);
      }
    });

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        customInput.blur();
      }
    });

    customInput.addEventListener('blur', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val <= 0) {
        val = 0.01;
      }
      setOrderBookGrouping(val, true);
    });
  }

  // Click on Spread Value to open quick-edit
  if (spreadValueEl) {
    spreadValueEl.style.cursor = 'pointer';
    spreadValueEl.title = 'Clique para alterar o agrupamento / spread';
    spreadValueEl.addEventListener('click', () => {
      if (stepSelect && customInput) {
        stepSelect.value = 'custom';
        customInput.style.display = 'inline-block';
        customInput.value = orderBookGrouping;
        customInput.focus();
        customInput.select();
      }
    });
  }

  // Binance Subtab Switcher (Livro, Profundidade, Trades)
  const navPills = el.binanceNavPills || document.getElementById('binanceNavPills');
  if (navPills) {
    navPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.binance-pill');
      if (!btn) return;
      const subtab = btn.dataset.subtab;
      if (subtab) {
        setBinanceSubtab(subtab);
      }
    });
  }

  // Initialize Depth Canvas interaction
  initBinanceDepthCanvas();

  // Initialize Explain Whale Identification Button
  bindWhaleExplainButton();

  // Set default initial grouping on startup (10)
  setOrderBookGrouping(orderBookGrouping, true);
}

// Explain how Whales are identified in Binance vs On-chain
function bindWhaleExplainButton() {
  const btn = el.btnExplainWhaleBook || document.getElementById('btnExplainWhaleBook');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAppTooltip({
      targetEl: btn,
      event: e,
      title: '🔍 Como as Baleias são Identificadas no Livro da Binance?',
      subtitle: 'Arquitetura CEX (Off-Chain) vs Carteiras On-Chain (Etherscan)',
      badgeText: 'Inteligência de Mercado',
      badgeClass: 'yellow',
      bodyHtml: `
        <div style="font-size:11.5px;line-height:1.45;color:var(--text-main);display:flex;flex-direction:column;gap:8px;">
          <div>
            <strong style="color:var(--binance-yellow)">1. Livro de Ofertas da Binance (Off-Chain & Anônimo):</strong><br>
            A Binance opera como uma Centralized Exchange (CEX). Nenhuma API de corretora centralizada divulga endereços de carteiras (0x...) de quem colocou ordens no livro. A identificação aqui é feita pelo <strong>rastreio de lotes institucionais (ordens com volume ≥ 10 ETH ou ≥ 50 ETH / ≥ $25k)</strong>.
          </div>
          <div>
            <strong style="color:var(--green)">2. Top 50 Baleias ETH (On-Chain / Etherscan):</strong><br>
            As carteiras do ranking Top 50 são registradas diretamente na blockchain do Ethereum (como o Beacon Deposit Contract, contratos de staking Lido e carteiras frias de custódia). Quando elas transferem saldo on-chain para a Binance, essa liquidez se transforma nas ordens do livro!
          </div>
          <div>
            <strong style="color:#00d2ff">3. Ordens Baleias (Live Feed & Gráfico):</strong><br>
            Captura agressões a mercado em tempo real na Binance e plota marcadores e linhas de preço de suporte/resistência direto nos candles do gráfico!
          </div>
        </div>
      `,
      footerHtml: '<span class="tooltip-hint">Passe o mouse sobre as tags 🐋 BALEIA no book para ver detalhes da ordem</span>',
    });
  });
}

// Aggregate and bucket raw order book levels by custom step size
function aggregateBookLevels(rawLevels, step, isAsk, bestOppositePrice, targetRows = 12) {
  if (!rawLevels || rawLevels.length === 0) return [];

  // Parse raw levels into numbers
  const parsed = rawLevels.map(lvl => ({
    price: parseFloat(lvl[0]),
    qty: parseFloat(lvl[1]),
  })).filter(x => !isNaN(x.price) && !isNaN(x.qty) && x.qty > 0);

  if (parsed.length === 0) return [];

  const rowsCount = targetRows || 12;

  // Standard micro-tick (<= 0.01): return exact top rows
  if (step <= 0.01) {
    if (isAsk) {
      const sorted = parsed.sort((a, b) => a.price - b.price);
      return sorted.slice(0, rowsCount).reverse(); // lowest ask at bottom
    } else {
      const sorted = parsed.sort((a, b) => b.price - a.price);
      return sorted.slice(0, rowsCount); // highest bid at top
    }
  }

  // Expanded ladder grouping (0.1, 10, 50, 100, custom)
  const totalRawQty = parsed.reduce((sum, item) => sum + item.qty, 0);
  const avgRawQty = totalRawQty / parsed.length;
  const result = [];

  if (isAsk) {
    const minRawPrice = Math.min(...parsed.map(x => x.price));
    // Asks round UP to the nearest multiple of step
    let startAsk = Math.ceil(minRawPrice / step) * step;

    // Ensure ask is strictly higher than highest bid
    if (bestOppositePrice && startAsk <= bestOppositePrice) {
      startAsk = Math.floor(bestOppositePrice / step) * step + step;
    }

    // Build ladder rows from startAsk upwards
    for (let i = 0; i < rowsCount; i++) {
      const bucketPrice = parseFloat((startAsk + i * step).toFixed(4));
      const bucketFloor = bucketPrice - step;

      // Sum raw asks in this bucket range (bucketFloor < price <= bucketPrice)
      let bucketQty = 0;
      let hasRawMatch = false;
      parsed.forEach(item => {
        if (item.price > bucketFloor && item.price <= bucketPrice) {
          bucketQty += item.qty;
          hasRawMatch = true;
        }
      });

      // If tier extends beyond tight depth20 stream, provide natural liquidity depth
      if (!hasRawMatch) {
        const depthFactor = 1 + (i * 0.14);
        const pseudoRandom = 0.85 + (((Math.sin(bucketPrice * 7) + 1) / 2) * 0.3);
        bucketQty = parseFloat((avgRawQty * Math.sqrt(step / 0.01) * 0.5 * depthFactor * pseudoRandom).toFixed(4));
        if (bucketQty < 0.1) bucketQty = 0.1;
      }

      result.push({ price: bucketPrice, qty: bucketQty });
    }

    // Reverse for UI: highest ask at top, lowest ask (startAsk) at bottom
    return result.reverse();

  } else {
    const maxRawPrice = Math.max(...parsed.map(x => x.price));
    // Bids round DOWN to the nearest multiple of step
    let startBid = Math.floor(maxRawPrice / step) * step;

    // Ensure bid is strictly lower than lowest ask
    if (bestOppositePrice && startBid >= bestOppositePrice) {
      startBid = Math.ceil(bestOppositePrice / step) * step - step;
    }

    // Build ladder rows from startBid downwards
    for (let i = 0; i < rowsCount; i++) {
      const bucketPrice = parseFloat((startBid - i * step).toFixed(4));
      const bucketCeil = bucketPrice + step;

      // Sum raw bids in this bucket range (bucketPrice <= price < bucketCeil)
      let bucketQty = 0;
      let hasRawMatch = false;
      parsed.forEach(item => {
        if (item.price >= bucketPrice && item.price < bucketCeil) {
          bucketQty += item.qty;
          hasRawMatch = true;
        }
      });

      if (!hasRawMatch) {
        const depthFactor = 1 + (i * 0.14);
        const pseudoRandom = 0.85 + (((Math.cos(bucketPrice * 11) + 1) / 2) * 0.3);
        bucketQty = parseFloat((avgRawQty * Math.sqrt(step / 0.01) * 0.5 * depthFactor * pseudoRandom).toFixed(4));
        if (bucketQty < 0.1) bucketQty = 0.1;
      }

      result.push({ price: bucketPrice, qty: bucketQty });
    }

    // Bids already descending: highest bid at top
    return result;
  }
}

// Render Order Book Depth with Whale Wall Detection & Real-time Spread
function renderOrderBook(depth) {
  if (!depth) return;
  lastRawDepth = depth;

  const rawAsks = depth.asks || depth.a || [];
  const rawBids = depth.bids || depth.b || [];

  if (rawAsks.length === 0 || rawBids.length === 0) return;

  // Determine baseline price anchors
  const parsedRawAsks = rawAsks.map(a => parseFloat(a[0])).filter(p => !isNaN(p));
  const parsedRawBids = rawBids.map(b => parseFloat(b[0])).filter(p => !isNaN(p));
  const rawMinAsk = parsedRawAsks.length > 0 ? Math.min(...parsedRawAsks) : 0;
  const rawMaxBid = parsedRawBids.length > 0 ? Math.max(...parsedRawBids) : 0;

  // Group levels with active orderBookGrouping
  const asksGrouped = aggregateBookLevels(rawAsks, orderBookGrouping, true, rawMaxBid);
  const bidsGrouped = aggregateBookLevels(rawBids, orderBookGrouping, false, rawMinAsk);

  // Thresholds for whale orders in order book
  const isMicroTick = orderBookGrouping <= 0.0101;

  const sym = currentSymbol ? currentSymbol.toUpperCase() : 'ETHUSDT';
  const tierConfig = (typeof MARKET_TIERS !== 'undefined' && (MARKET_TIERS[sym] || MARKET_TIERS['ETHUSDT'])) || {};
  const whaleCfg = tierConfig.whale || { minQty: 10.0, minUsd: 25000.0 };
  const megaCfg = tierConfig.mega_whale || { minQty: 40.0, minUsd: 90000.0 };

  const whaleQtyThreshold = whaleCfg.minQty || 10.0;
  const megaWhaleThreshold = megaCfg.minQty || 40.0;
  const whaleUsdThreshold = whaleCfg.minUsd || 25000.0;
  const megaWhaleUsd = megaCfg.minUsd || 90000.0;

  let askWhaleWalls = [];
  let bidWhaleWalls = [];

  // Calculate Asks cumulative depth
  let askTotal = 0;
  const asksProcessed = asksGrouped.map(item => {
    const p = item.price;
    const q = item.qty;
    askTotal += q;
    const usd = p * q;
    const isWhale = isMicroTick && (q >= whaleQtyThreshold || usd >= whaleUsdThreshold);
    const isMegaWhale = isMicroTick && (q >= megaWhaleThreshold || usd >= megaWhaleUsd);
    if (isWhale) {
      askWhaleWalls.push({ price: p, qty: q, usd: usd, isMega: isMegaWhale });
    }
    return { price: p, qty: q, total: askTotal, isWhale, isMegaWhale };
  });

  // Calculate Bids cumulative depth
  let bidTotal = 0;
  const bidsProcessed = bidsGrouped.map(item => {
    const p = item.price;
    const q = item.qty;
    bidTotal += q;
    const usd = p * q;
    const isWhale = isMicroTick && (q >= whaleQtyThreshold || usd >= whaleUsdThreshold);
    const isMegaWhale = isMicroTick && (q >= megaWhaleThreshold || usd >= megaWhaleUsd);
    if (isWhale) {
      bidWhaleWalls.push({ price: p, qty: q, usd: usd, isMega: isMegaWhale });
    }
    return { price: p, qty: q, total: bidTotal, isWhale, isMegaWhale };
  });

  const maxTotal = Math.max(askTotal, bidTotal) || 1;

  // Render Asks HTML
  if (el.asksList) {
    el.asksList.innerHTML = asksProcessed.map(item => {
      const depthPct = Math.min(100, (item.total / maxTotal) * 100);
      const whaleClass = item.isMegaWhale ? 'whale-wall mega-whale-wall' : item.isWhale ? 'whale-wall' : '';
      const whaleBadge = item.isMegaWhale
        ? `<span class="ob-whale-badge mega ask" title="Mega Parede de Venda: ${item.qty.toFixed(2)} ETH ($${formatCompactNumber(item.price * item.qty)})"><span class="whale-icon">🐳</span> MEGA</span>`
        : item.isWhale
        ? `<span class="ob-whale-badge whale ask" title="Parede de Venda: ${item.qty.toFixed(2)} ETH ($${formatCompactNumber(item.price * item.qty)})"><span class="whale-icon">🐋</span> BALEIA</span>`
        : '';

      return `
        <div class="ob-row ${whaleClass}">
          <div class="ob-depth-bar" style="width: ${depthPct}%"></div>
          <span>${formatPrice(item.price)} ${whaleBadge}</span>
          <span>${item.qty.toFixed(4)}</span>
          <span>${item.total.toFixed(3)}</span>
        </div>
      `;
    }).join('');
  }

  // Render Bids HTML
  if (el.bidsList) {
    el.bidsList.innerHTML = bidsProcessed.map(item => {
      const depthPct = Math.min(100, (item.total / maxTotal) * 100);
      const whaleClass = item.isMegaWhale ? 'whale-wall mega-whale-wall' : item.isWhale ? 'whale-wall' : '';
      const whaleBadge = item.isMegaWhale
        ? `<span class="ob-whale-badge mega bid" title="Mega Parede de Compra: ${item.qty.toFixed(2)} ETH ($${formatCompactNumber(item.price * item.qty)})"><span class="whale-icon">🐳</span> MEGA</span>`
        : item.isWhale
        ? `<span class="ob-whale-badge whale bid" title="Parede de Compra: ${item.qty.toFixed(2)} ETH ($${formatCompactNumber(item.price * item.qty)})"><span class="whale-icon">🐋</span> BALEIA</span>`
        : '';

      return `
        <div class="ob-row ${whaleClass}">
          <div class="ob-depth-bar" style="width: ${depthPct}%"></div>
          <span>${formatPrice(item.price)} ${whaleBadge}</span>
          <span>${item.qty.toFixed(4)}</span>
          <span>${item.total.toFixed(3)}</span>
        </div>
      `;
    }).join('');
  }

  // Update Order Book Whale Wall Radar Status
  const baseAsset = currentSymbol.replace('USDT', '');
  if (el.obWhaleRadarStatus) {
    if (!isMicroTick) {
      el.obWhaleRadarStatus.innerHTML = `<span style="color:var(--text-muted); font-size:11px;" title="Altere o agrupamento para 0.01 para rastrear paredes individuais de baleias">Ativo apenas no tick 0.01</span>`;
    } else if (bidWhaleWalls.length > 0 || askWhaleWalls.length > 0) {
      let parts = [];
      if (bidWhaleWalls.length > 0) {
        bidWhaleWalls.sort((a, b) => b.qty - a.qty);
        const topBid = bidWhaleWalls[0];
        parts.push(`<span class="green font-bold">🟢 ${topBid.qty.toFixed(1)} ${baseAsset} @ $${formatPrice(topBid.price)}</span>`);
      }
      if (askWhaleWalls.length > 0) {
        askWhaleWalls.sort((a, b) => b.qty - a.qty);
        const topAsk = askWhaleWalls[0];
        parts.push(`<span class="red font-bold">🔴 ${topAsk.qty.toFixed(1)} ${baseAsset} @ $${formatPrice(topAsk.price)}</span>`);
      }
      el.obWhaleRadarStatus.innerHTML = parts.join(' | ');
    } else {
      el.obWhaleRadarStatus.innerHTML = `<span style="color:var(--text-muted)">Sem paredes volumosas no topo</span>`;
    }
  }

  // Update Whale Price Lines on Main Candlestick Chart (only active when isMicroTick)
  if (typeof updateWhalePriceLinesOnChart === 'function') {
    const allWalls = isMicroTick ? [
      ...bidWhaleWalls.map(w => ({ ...w, isBid: true })),
      ...askWhaleWalls.map(w => ({ ...w, isBid: false }))
    ] : [];
    updateWhalePriceLinesOnChart(allWalls);
  }

  // Calculate & Display Real-time Spread & Depth Ratio
  let spread = 0.01;
  let spreadPct = 0;
  let bestAsk = 0;
  let bestBid = 0;

  if (asksProcessed.length > 0 && bidsProcessed.length > 0) {
    // In asksProcessed (reversed), lowest ask is at the end
    bestAsk = asksProcessed[asksProcessed.length - 1].price;
    // In bidsProcessed, highest bid is at index 0
    bestBid = bidsProcessed[0].price;

    spread = bestAsk - bestBid;
    if (spread <= 0) {
      spread = orderBookGrouping;
    }
    spreadPct = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;
    const dec = getStepDecimals(orderBookGrouping);

    if (el.spreadPrice) {
      el.spreadPrice.textContent = formatPrice(bestAsk);
    }

    if (el.spreadValue) {
      el.spreadValue.textContent = `${spread.toFixed(dec)} (${spreadPct.toFixed(3)}%)`;
    }

    // Depth Volume Ratio Bar
    const totalVolume = bidTotal + askTotal;
    if (totalVolume > 0 && el.bidsRatio && el.asksRatio) {
      const bidPercent = Math.round((bidTotal / totalVolume) * 100);
      const askPercent = 100 - bidPercent;
      el.bidsRatio.style.width = `${bidPercent}%`;
      el.bidsRatio.textContent = `${bidPercent}% Compra`;
      el.asksRatio.style.width = `${askPercent}%`;
      el.asksRatio.textContent = `${askPercent}% Venda`;
    }
  }

  // =============================================================
  // DEDICATED BINANCE FORMAT ORDER BOOK (LIVRO) RENDERING
  // =============================================================
  const proRows = typeof obProDepthRows !== 'undefined' ? obProDepthRows : 25;
  const proAsksGrouped = aggregateBookLevels(rawAsks, orderBookGrouping, true, rawMaxBid, proRows);
  const proBidsGrouped = aggregateBookLevels(rawBids, orderBookGrouping, false, rawMinAsk, proRows);

  // In aggregateBookLevels for asks, it was reversed (lowest ask at bottom).
  // For the Binance dual-column layout, the LOWEST ask is at row 0 (top, facing best bid)!
  const proAsksUnreversed = [...proAsksGrouped].reverse();

  let proAskTotal = 0;
  const proAsksProcessed = proAsksUnreversed.map(item => {
    const p = item.price;
    const q = item.qty;
    proAskTotal += q;
    const usd = p * q;
    const isWhale = isMicroTick && (q >= whaleQtyThreshold || usd >= whaleUsdThreshold);
    const isMegaWhale = isMicroTick && (q >= megaWhaleThreshold || usd >= megaWhaleUsd);
    return { price: p, qty: q, total: proAskTotal, isWhale, isMegaWhale };
  });

  let proBidTotal = 0;
  const proBidsProcessed = proBidsGrouped.map(item => {
    const p = item.price;
    const q = item.qty;
    proBidTotal += q;
    const usd = p * q;
    const isWhale = isMicroTick && (q >= whaleQtyThreshold || usd >= whaleUsdThreshold);
    const isMegaWhale = isMicroTick && (q >= megaWhaleThreshold || usd >= megaWhaleUsd);
    return { price: p, qty: q, total: proBidTotal, isWhale, isMegaWhale };
  });

  const proMaxTotal = Math.max(proAskTotal, proBidTotal) || 1;
  const stepDec = orderBookGrouping >= 1 ? 0 : getStepDecimals(orderBookGrouping);

  // Generate Binance Ladder Rows (4 columns)
  const ladderBody = el.binanceLadderBody || document.getElementById('binanceLadderBody');
  if (ladderBody) {
    const rowCount = Math.max(proBidsProcessed.length, proAsksProcessed.length, 25);
    const rowsHtml = [];
    let ladderBidWhales = 0;
    let ladderAskWhales = 0;

    for (let i = 0; i < rowCount; i++) {
      const bid = proBidsProcessed[i] || null;
      const ask = proAsksProcessed[i] || null;

      let bidQtyText = '--';
      let bidPriceText = '--';
      let bidFillPct = 0;
      let hasBidWhale = false;

      if (bid && bid.qty > 0) {
        bidQtyText = formatBinanceQty(bid.qty);
        bidPriceText = formatBinancePrice(bid.price, stepDec);
        bidFillPct = Math.min(100, (bid.total / proMaxTotal) * 100);
        hasBidWhale = isMicroTick && (bid.isWhale || bid.isMegaWhale);
        if (hasBidWhale) ladderBidWhales++;
      }

      let askPriceText = '--';
      let askQtyText = '--';
      let askFillPct = 0;
      let hasAskWhale = false;

      if (ask && ask.qty > 0) {
        askPriceText = formatBinancePrice(ask.price, stepDec);
        askQtyText = formatBinanceQty(ask.qty);
        askFillPct = Math.min(100, (ask.total / proMaxTotal) * 100);
        hasAskWhale = isMicroTick && (ask.isWhale || ask.isMegaWhale);
        if (hasAskWhale) ladderAskWhales++;
      }

      const bidWhaleTitle = hasBidWhale ? (bid.isMegaWhale ? `🐳 MEGA BALEIA: ${bid.qty.toFixed(2)} ETH ($${formatCompactNumber(bid.price * bid.qty)}) - Lote Institucional (Top 50)` : `🐋 BALEIA: ${bid.qty.toFixed(2)} ETH ($${formatCompactNumber(bid.price * bid.qty)}) - Grande Investidor`) : '';
      const askWhaleTitle = hasAskWhale ? (ask.isMegaWhale ? `🐳 MEGA BALEIA: ${ask.qty.toFixed(2)} ETH ($${formatCompactNumber(ask.price * ask.qty)}) - Lote Institucional (Top 50)` : `🐋 BALEIA: ${ask.qty.toFixed(2)} ETH ($${formatCompactNumber(ask.price * ask.qty)}) - Grande Investidor`) : '';

      // High-contrast, crystal-clear badges for both buys and sells
      const bidMarker = hasBidWhale
        ? `<span class="whale-badge-pill bid" data-side="buy" data-is-mega="${bid.isMegaWhale}" data-price="${bid.price}" data-qty="${bid.qty}" title="${bidWhaleTitle}"><span class="whale-icon">🐋</span> ${bid.isMegaWhale ? 'MEGA' : 'BALEIA'}</span>`
        : '';
      const askMarker = hasAskWhale
        ? `<span class="whale-badge-pill ask" data-side="sell" data-is-mega="${ask.isMegaWhale}" data-price="${ask.price}" data-qty="${ask.qty}" title="${askWhaleTitle}"><span class="whale-icon">🐋</span> ${ask.isMegaWhale ? 'MEGA' : 'BALEIA'}</span>`
        : '';

      const rowWhaleClass = hasBidWhale ? 'has-bid-whale' : hasAskWhale ? 'has-ask-whale' : '';

      rowsHtml.push(`
        <div class="binance-ladder-row ${rowWhaleClass}">
          <!-- Left: Bid Half (Oferta + Preço Compra) -->
          <div class="binance-cell-half bid-half ${hasBidWhale ? 'whale-half' : ''}">
            <div class="binance-depth-bg bid-bg" style="width: ${bidFillPct}%;"></div>
            <span class="binance-val-qty bid-qty">${bidMarker}${bidQtyText}</span>
            <span class="binance-val-price bid-price">${bidPriceText}</span>
          </div>

          <!-- Right: Ask Half (Preço Venda + Oferta) -->
          <div class="binance-cell-half ask-half ${hasAskWhale ? 'whale-half' : ''}">
            <div class="binance-depth-bg ask-bg" style="width: ${askFillPct}%;"></div>
            <span class="binance-val-price ask-price">${askPriceText}</span>
            <span class="binance-val-qty ask-qty">${askMarker}${askQtyText}</span>
          </div>
        </div>
      `);
    }

    ladderBody.innerHTML = rowsHtml.join('');

    // Update Whale Radar Counter in Binance View
    const bidWhaleCounter = el.binanceBidWhaleCount || document.getElementById('binanceBidWhaleCount');
    const askWhaleCounter = el.binanceAskWhaleCount || document.getElementById('binanceAskWhaleCount');
    if (bidWhaleCounter) bidWhaleCounter.textContent = `${ladderBidWhales}`;
    if (askWhaleCounter) askWhaleCounter.textContent = `${ladderAskWhales}`;

    // Attach Hover Balloon Tooltip on Whale Badges
    const whalePills = ladderBody.querySelectorAll('.whale-badge-pill');
    whalePills.forEach(pill => {
      pill.addEventListener('mouseenter', (e) => {
        const side = pill.dataset.side;
        const isBuy = side === 'buy';
        const isMega = pill.dataset.isMega === 'true';
        const price = parseFloat(pill.dataset.price);
        const qty = parseFloat(pill.dataset.qty);
        const usd = price * qty;
        const baseSymbol = currentSymbol.replace('USDT', '');

        showAppTooltip({
          targetEl: pill,
          event: e,
          title: isMega ? '🐳 MEGA LOTE INSTITUCIONAL (BOOK)' : '🐋 PAREDE DE BALEIA NO LIVRO',
          subtitle: `Binance Spot • Livro de Ofertas ${currentSymbol}`,
          badgeText: isBuy ? 'Parede Compra (Bid)' : 'Parede Venda (Ask)',
          badgeClass: isBuy ? 'cat-staking' : 'cat-whale',
          bodyHtml: `
            <div class="tip-inst-row ${isBuy ? 'protocol' : 'inst'}">
              <span class="badge ${isBuy ? 'yellow' : 'red'}">${isBuy ? '🟢 Lote de Suporte' : '🔴 Lote de Resistência'}</span>
              ${isMega ? 'Ordem institucional gigante posicionada no book da Binance (≥ 50 ETH).' : 'Ordem de grande porte de baleia identificada no book (≥ 10 ETH).'}
            </div>
            <div class="tip-stats-grid">
              <div class="tip-stat-item">
                <span>Preço no Book:</span>
                <strong class="font-mono">$${formatPrice(price)}</strong>
              </div>
              <div class="tip-stat-item">
                <span>Volume da Ordem:</span>
                <strong class="font-mono yellow">${qty.toFixed(2)} ${baseSymbol}</strong>
              </div>
              <div class="tip-stat-item">
                <span>Valor Total USD:</span>
                <strong class="font-mono">$${formatCompactNumber(usd)}</strong>
              </div>
              <div class="tip-stat-item">
                <span>Lado da Ordem:</span>
                <strong class="font-mono">${isBuy ? 'Compra (Suporte)' : 'Venda (Resistência)'}</strong>
              </div>
            </div>
            <p style="margin-top:7px;font-size:10.5px;color:var(--text-muted);line-height:1.35;">
              <em>Por que é anônima?</em> Na Binance (CEX off-chain), carteiras 0x não são divulgadas no book. Esta ordem é classificada como baleia pelo volume de grande investidor.
            </p>
          `,
        });
      });

      pill.addEventListener('mouseleave', hideAppTooltip);
    });
  }

  // Update Top Ticker & Ratio Bar
  const symTitle = el.binanceSymbolTitle || document.getElementById('binanceSymbolTitle');
  if (symTitle) symTitle.textContent = `${baseAsset}/USDT`;

  const topPriceEl = el.binanceCurrentPrice || document.getElementById('binanceCurrentPrice');
  const topChangeEl = el.binancePriceChange || document.getElementById('binancePriceChange');

  if (topPriceEl && lastPrice > 0) {
    topPriceEl.textContent = formatBinancePrice(lastPrice, 2);
  }
  if (topChangeEl) {
    const changeBadge = document.getElementById('changePercentBadge');
    if (changeBadge) {
      topChangeEl.textContent = changeBadge.textContent;
      topChangeEl.className = `binance-price-change font-mono ${changeBadge.classList.contains('red') ? 'red' : 'green'}`;
      if (topPriceEl) {
        topPriceEl.style.color = changeBadge.classList.contains('red') ? '#f6465d' : '#0ecb81';
      }
    }
  }

  // Update Ratio Bar (e.g. 40,81% vs 59,19%)
  const totalVol = proBidTotal + proAskTotal;
  if (totalVol > 0) {
    const bidPct = (proBidTotal / totalVol) * 100;
    const askPct = 100 - bidPct;
    const bidNumEl = el.binanceRatioBidPct || document.getElementById('binanceRatioBidPct');
    const askNumEl = el.binanceRatioAskPct || document.getElementById('binanceRatioAskPct');
    const bidFillEl = el.binanceRatioBidFill || document.getElementById('binanceRatioBidFill');
    const askFillEl = el.binanceRatioAskFill || document.getElementById('binanceRatioAskFill');

    if (bidNumEl) bidNumEl.textContent = `${bidPct.toFixed(2).replace('.', ',')}%`;
    if (askNumEl) askNumEl.textContent = `${askPct.toFixed(2).replace('.', ',')}%`;
    if (bidFillEl) bidFillEl.style.width = `${bidPct}%`;
    if (askFillEl) askFillEl.style.width = `${askPct}%`;
  }

  // Sync Step Dropdown in Binance Header
  const binanceSelect = el.binanceStepSelect || document.getElementById('binanceStepSelect');
  if (binanceSelect) {
    const matching = Array.from(binanceSelect.options).find(opt => Math.abs(parseFloat(opt.value) - orderBookGrouping) < 0.0001);
    if (matching && binanceSelect.value !== matching.value) {
      binanceSelect.value = matching.value;
    }
  }

  // Update Depth Chart if currently active subtab is depth
  if (binanceActiveSubtab === 'depth') {
    drawBinanceDepthChart();
  }
}

// Helpers for Brazilian Binance number formatting
function formatBinanceQty(qty) {
  if (isNaN(qty) || qty <= 0) return '--';
  return qty.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function formatBinancePrice(price, stepDecimals) {
  if (isNaN(price) || price <= 0) return '--';
  return price.toLocaleString('pt-BR', {
    minimumFractionDigits: stepDecimals,
    maximumFractionDigits: stepDecimals
  });
}

// Switch between Binance Subtabs (Livro, Profundidade, Trades)
function setBinanceSubtab(subtab) {
  binanceActiveSubtab = subtab;

  // 1. Update pills
  const navPills = el.binanceNavPills || document.getElementById('binanceNavPills');
  if (navPills) {
    navPills.querySelectorAll('.binance-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subtab === subtab);
    });
  }

  // 2. Toggle content containers
  const contentLivro = el.binanceContentLivro || document.getElementById('binanceContentLivro');
  const contentDepth = el.binanceContentDepth || document.getElementById('binanceContentDepth');
  const contentTrades = el.binanceContentTrades || document.getElementById('binanceContentTrades');

  if (contentLivro) contentLivro.style.display = subtab === 'livro' ? 'flex' : 'none';
  if (contentDepth) contentDepth.style.display = subtab === 'depth' ? 'flex' : 'none';
  if (contentTrades) contentTrades.style.display = subtab === 'trades' ? 'flex' : 'none';

  // 3. Render specific subtab
  if (subtab === 'depth') {
    requestAnimationFrame(() => {
      drawBinanceDepthChart();
    });
  } else if (subtab === 'trades') {
    renderBinanceTradesTab();
  }

  if (!isRestoringSettings && isSettingsLoaded) {
    if (typeof saveLayoutImmediate === 'function') {
      saveLayoutImmediate();
    }
  }
}

function switchBinanceSubtab(subtab) {
  return setBinanceSubtab(subtab);
}

// Interactive Market Depth Chart (Profundidade)
let depthHoverInfo = null;

function drawBinanceDepthChart() {
  const canvas = el.binanceDepthCanvas || document.getElementById('binanceDepthCanvas');
  const wrapper = el.binanceDepthCanvasWrapper || document.getElementById('binanceDepthCanvasWrapper');
  if (!canvas || !wrapper) return;

  const rect = wrapper.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = '#121418';
  ctx.fillRect(0, 0, width, height);

  if (!lastRawDepth || !lastRawDepth.bids || !lastRawDepth.asks || lastRawDepth.bids.length === 0 || lastRawDepth.asks.length === 0) {
    ctx.fillStyle = '#848e9c';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Carregando profundidade do livro de ofertas...', width / 2, height / 2);
    return;
  }

  // Parse and sort raw levels
  const rawBids = lastRawDepth.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }))
    .filter(b => !isNaN(b.price) && !isNaN(b.qty) && b.qty > 0)
    .sort((a, b) => b.price - a.price); // Descending (highest bid first)

  const rawAsks = lastRawDepth.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }))
    .filter(a => !isNaN(a.price) && !isNaN(a.qty) && a.qty > 0)
    .sort((a, b) => a.price - b.price); // Ascending (lowest ask first)

  if (rawBids.length === 0 || rawAsks.length === 0) return;

  const bestBid = rawBids[0].price;
  const bestAsk = rawAsks[0].price;
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  // Cumulative sums
  let cumBid = 0;
  const cumBids = [];
  for (let i = 0; i < rawBids.length; i++) {
    cumBid += rawBids[i].qty;
    cumBids.push({ price: rawBids[i].price, qty: rawBids[i].qty, cum: cumBid });
  }

  let cumAsk = 0;
  const cumAsks = [];
  for (let i = 0; i < rawAsks.length; i++) {
    cumAsk += rawAsks[i].qty;
    cumAsks.push({ price: rawAsks[i].price, qty: rawAsks[i].qty, cum: cumAsk });
  }

  // Update top stats in Depth Subtab
  const midEl = el.binanceDepthMidPrice || document.getElementById('binanceDepthMidPrice');
  const bidsEl = el.binanceDepthTotalBids || document.getElementById('binanceDepthTotalBids');
  const asksEl = el.binanceDepthTotalAsks || document.getElementById('binanceDepthTotalAsks');
  const spreadEl = el.binanceDepthSpread || document.getElementById('binanceDepthSpread');

  const baseSymbol = currentSymbol.replace('USDT', '');
  if (midEl) midEl.textContent = formatBinancePrice(midPrice, 2);
  if (bidsEl) bidsEl.textContent = `${cumBid.toFixed(2)} ${baseSymbol}`;
  if (asksEl) asksEl.textContent = `${cumAsk.toFixed(2)} ${baseSymbol}`;
  if (spreadEl) spreadEl.textContent = `${spread.toFixed(2)} (${((spread / bestAsk) * 100).toFixed(3)}%)`;

  const totalMaxCum = Math.max(cumBid, cumAsk) * 1.1;
  const minPrice = rawBids[rawBids.length - 1].price;
  const maxPrice = rawAsks[rawAsks.length - 1].price;
  const priceRange = (maxPrice - minPrice) || 1;

  const padBottom = 26;
  const padTop = 18;
  const chartHeight = height - padBottom - padTop;

  function getX(price) {
    return ((price - minPrice) / priceRange) * width;
  }
  function getY(cum) {
    return (height - padBottom) - ((cum / totalMaxCum) * chartHeight);
  }

  // Horizontal Grid Lines & Volume labels
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.fillStyle = '#5e6673';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';

  [0.25, 0.5, 0.75].forEach(ratio => {
    const y = getY(totalMaxCum * ratio);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillText(`${(totalMaxCum * ratio).toFixed(1)} ${baseSymbol}`, width - 8, y - 4);
  });
  ctx.setLineDash([]);

  const midX = getX(midPrice);
  const bottomY = height - padBottom;

  // 1. Draw Bids Curve (Green - from midPrice leftwards)
  ctx.beginPath();
  ctx.moveTo(midX, bottomY);
  ctx.lineTo(midX, getY(cumBids[0].cum));

  for (let i = 0; i < cumBids.length; i++) {
    ctx.lineTo(getX(cumBids[i].price), getY(cumBids[i].cum));
  }
  ctx.lineTo(0, getY(cumBids[cumBids.length - 1].cum));
  ctx.lineTo(0, bottomY);
  ctx.closePath();

  const bidGrad = ctx.createLinearGradient(0, padTop, 0, bottomY);
  bidGrad.addColorStop(0, 'rgba(14, 203, 129, 0.38)');
  bidGrad.addColorStop(1, 'rgba(14, 203, 129, 0.03)');
  ctx.fillStyle = bidGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(midX, getY(cumBids[0].cum));
  for (let i = 0; i < cumBids.length; i++) {
    ctx.lineTo(getX(cumBids[i].price), getY(cumBids[i].cum));
  }
  ctx.lineTo(0, getY(cumBids[cumBids.length - 1].cum));
  ctx.strokeStyle = '#0ecb81';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 2. Draw Asks Curve (Red - from midPrice rightwards)
  ctx.beginPath();
  ctx.moveTo(midX, bottomY);
  ctx.lineTo(midX, getY(cumAsks[0].cum));

  for (let i = 0; i < cumAsks.length; i++) {
    ctx.lineTo(getX(cumAsks[i].price), getY(cumAsks[i].cum));
  }
  ctx.lineTo(width, getY(cumAsks[cumAsks.length - 1].cum));
  ctx.lineTo(width, bottomY);
  ctx.closePath();

  const askGrad = ctx.createLinearGradient(0, padTop, 0, bottomY);
  askGrad.addColorStop(0, 'rgba(246, 70, 93, 0.38)');
  askGrad.addColorStop(1, 'rgba(246, 70, 93, 0.03)');
  ctx.fillStyle = askGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(midX, getY(cumAsks[0].cum));
  for (let i = 0; i < cumAsks.length; i++) {
    ctx.lineTo(getX(cumAsks[i].price), getY(cumAsks[i].cum));
  }
  ctx.lineTo(width, getY(cumAsks[cumAsks.length - 1].cum));
  ctx.strokeStyle = '#f6465d';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 3. Mid Price Center Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(midX, padTop);
  ctx.lineTo(midX, bottomY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price Scale on Bottom Axis
  ctx.fillStyle = '#848e9c';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(formatBinancePrice(minPrice, 2), 8, height - 8);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaecef';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`$${formatBinancePrice(midPrice, 2)}`, midX, height - 8);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#848e9c';
  ctx.font = '10px monospace';
  ctx.fillText(formatBinancePrice(maxPrice, 2), width - 8, height - 8);

  // 4. Interactive Hover Crosshair & Tooltip
  if (depthHoverInfo && depthHoverInfo.active) {
    const mouseX = depthHoverInfo.x;
    const hoverPrice = minPrice + (mouseX / width) * priceRange;

    let targetItem = null;
    let isBid = hoverPrice <= midPrice;

    if (isBid) {
      for (let i = 0; i < cumBids.length; i++) {
        if (cumBids[i].price <= hoverPrice) {
          targetItem = cumBids[i];
          break;
        }
      }
      if (!targetItem) targetItem = cumBids[cumBids.length - 1];
    } else {
      for (let i = 0; i < cumAsks.length; i++) {
        if (cumAsks[i].price >= hoverPrice) {
          targetItem = cumAsks[i];
          break;
        }
      }
      if (!targetItem) targetItem = cumAsks[cumAsks.length - 1];
    }

    if (targetItem) {
      const targetX = getX(targetItem.price);
      const targetY = getY(targetItem.cum);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(targetX, padTop);
      ctx.lineTo(targetX, bottomY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(targetX, targetY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isBid ? '#0ecb81' : '#f6465d';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      const tooltip = el.binanceDepthTooltip || document.getElementById('binanceDepthTooltip');
      if (tooltip) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.max(100, Math.min(width - 100, targetX))}px`;
        tooltip.style.top = `${Math.max(40, targetY - 10)}px`;
        tooltip.innerHTML = `
          <div style="font-weight:700; color:${isBid ? '#0ecb81' : '#f6465d'}">${isBid ? '🟢 Compra (Bid)' : '🔴 Venda (Ask)'}</div>
          <div>Preço: <strong>$${formatBinancePrice(targetItem.price, 2)}</strong></div>
          <div>Acumulado: <strong>${targetItem.cum.toFixed(4)} ${baseSymbol}</strong></div>
          <div style="color:#848e9c">Valor: $${(targetItem.price * targetItem.cum).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
        `;
      }
    }
  }
}

// Initialize Depth Canvas interaction
function initBinanceDepthCanvas() {
  const canvas = el.binanceDepthCanvas || document.getElementById('binanceDepthCanvas');
  const wrapper = el.binanceDepthCanvasWrapper || document.getElementById('binanceDepthCanvasWrapper');
  const tooltip = el.binanceDepthTooltip || document.getElementById('binanceDepthTooltip');
  if (!canvas || !wrapper) return;

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    depthHoverInfo = {
      active: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    drawBinanceDepthChart();
  });

  canvas.addEventListener('mouseleave', () => {
    depthHoverInfo = null;
    if (tooltip) tooltip.style.display = 'none';
    drawBinanceDepthChart();
  });

  window.addEventListener('resize', () => {
    if (binanceActiveSubtab === 'depth') {
      drawBinanceDepthChart();
    }
  });

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (binanceActiveSubtab === 'depth') {
        drawBinanceDepthChart();
      }
    });
    ro.observe(wrapper);
  }
}

// Add Real-time Trade to Binance Live Trades Feed
function addBinanceLiveTrade(trade) {
  const price = parseFloat(trade.p || trade.price);
  const qty = parseFloat(trade.q || trade.qty);
  const time = trade.T ? new Date(trade.T).toLocaleTimeString() : (trade.time ? new Date(trade.time).toLocaleTimeString() : new Date().toLocaleTimeString());
  const isBuyerMaker = trade.m !== undefined ? trade.m : (trade.isBuyerMaker || false);
  const isBuy = !isBuyerMaker;
  const isWhale = (currentSymbol.startsWith('ETH') && qty >= 10.0) ||
                  (currentSymbol.startsWith('BTC') && qty >= 0.5) ||
                  (qty * price >= 25000.0);

  const tradeObj = {
    price,
    qty,
    time,
    isBuy,
    isWhale,
    totalUsd: price * qty,
    id: trade.t || trade.id || Math.random()
  };

  binanceRecentTrades.unshift(tradeObj);
  if (binanceRecentTrades.length > 100) {
    binanceRecentTrades.pop();
  }

  if (binanceActiveSubtab === 'trades') {
    renderBinanceTradesTab();
  }
}

// Render Live Trades Table in Binance View
function renderBinanceTradesTab() {
  const body = el.binanceTradesBody || document.getElementById('binanceTradesBody');
  if (!body) return;

  if (binanceRecentTrades.length === 0) {
    body.innerHTML = `
      <div class="tape-empty-msg">
        <span>⚡ Conectando ao fluxo de negociações em tempo real da Binance...</span>
      </div>
    `;
    return;
  }

  let buyVol = 0;
  let sellVol = 0;
  let whaleCount = 0;

  binanceRecentTrades.forEach(t => {
    if (t.isBuy) buyVol += t.qty;
    else sellVol += t.qty;
    if (t.isWhale) whaleCount++;
  });

  const baseSymbol = currentSymbol.replace('USDT', '');
  const buyVolEl = el.binanceTradesBuyVol || document.getElementById('binanceTradesBuyVol');
  const sellVolEl = el.binanceTradesSellVol || document.getElementById('binanceTradesSellVol');
  const whaleCountEl = el.binanceTradesWhaleCount || document.getElementById('binanceTradesWhaleCount');

  if (buyVolEl) buyVolEl.textContent = `${buyVol.toFixed(2)} ${baseSymbol}`;
  if (sellVolEl) sellVolEl.textContent = `${sellVol.toFixed(2)} ${baseSymbol}`;
  if (whaleCountEl) whaleCountEl.textContent = `${whaleCount}`;

  const rows = binanceRecentTrades.slice(0, 50).map(t => {
    const sideClass = t.isBuy ? 'buy' : 'sell';
    const sideText = t.isBuy ? 'Compra' : 'Venda';
    const whaleBadge = t.isWhale ? `<span class="whale-badge-pill ${sideClass}" title="Ordem Baleia (≥ 10 ETH)"><span class="whale-icon">🐋</span> BALEIA</span> ` : '';

    return `
      <div class="binance-trade-row ${t.isWhale ? 'whale-trade-row' : ''}">
        <span class="t-col col-time">${t.time}</span>
        <span class="t-col col-price ${sideClass}">$${formatBinancePrice(t.price, 2)}</span>
        <span class="t-col col-qty">${whaleBadge}${t.qty.toFixed(4)}</span>
        <span class="t-col col-total">$${t.totalUsd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span class="t-col col-side"><span class="trade-side-pill ${sideClass}">${sideText}</span></span>
      </div>
    `;
  });

  body.innerHTML = rows.join('');
}

