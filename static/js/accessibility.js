/**
 * Binance Market Terminal - Visual Accessibility & 55" TV Optimization Engine
 * Projetado para proporcionar máximo conforto visual para miopia, início de catarata e vista cansada (presbiopia).
 */

const AccessibilityManager = {
  STORAGE_KEY: 'binance_terminal_accessibility_v1',

  settings: {
    tvMode: false,              // Modo TV 55 polegadas (layout expandido e fontes grandes)
    scaleLevel: '100',          // '100', '120', '140'
    highContrast: false,        // Modo alto contraste anti-ofuscamento (catarata)
    hoverZoom: true,            // Lupa e ampliação no hover de quadros
    floatingLens: true          // Lupa flutuante inteligente para listas densas (Order Book e Trades)
  },

  init() {
    this.loadSettings();
    this.applySettings();
    this.setupUI();
    this.setupCardMagnifiers();
    this.setupFloatingHUD();
    this.setupKeyboardShortcuts();

    // Reaplicar nos elementos gerados dinamicamente a cada 2 segundos
    setInterval(() => {
      this.attachMagnifiersToNewElements();
    }, 2000);
  },

  loadSettings() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.settings = Object.assign({}, this.settings, JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Erro ao carregar configurações de acessibilidade:', e);
    }
  },

  saveSettings() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Erro ao salvar acessibilidade:', e);
    }

    // Persistir imediatamente em terminal_layout.json via /api/settings
    if (typeof saveLayoutImmediate === 'function') {
      saveLayoutImmediate();
    }
  },

  syncUIState() {
    const chkTvMode = document.getElementById('toggleTvMode');
    const chkHoverZoom = document.getElementById('toggleHoverMagnifier');
    const chkFloatingLens = document.getElementById('toggleFloatingLens');
    const chkHighContrast = document.getElementById('toggleHighContrast');
    const scaleBtns = document.querySelectorAll('.comfort-scale-buttons .scale-btn');

    if (chkTvMode) chkTvMode.checked = Boolean(this.settings.tvMode);
    if (chkHoverZoom) chkHoverZoom.checked = Boolean(this.settings.hoverZoom);
    if (chkFloatingLens) chkFloatingLens.checked = Boolean(this.settings.floatingLens);
    if (chkHighContrast) chkHighContrast.checked = Boolean(this.settings.highContrast);

    if (scaleBtns) {
      scaleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scale === this.settings.scaleLevel);
      });
    }
    this.updateHeaderButtonState();
  },

  syncFromSettings(obj) {
    if (!obj || typeof obj !== 'object') return;
    this.settings = Object.assign({}, this.settings, obj);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {}
    this.applySettings();
    this.syncUIState();
  },

  applySettings() {
    const body = document.body;

    // 1. Modo TV 55"
    if (this.settings.tvMode) {
      body.classList.add('tv-mode-55');
    } else {
      body.classList.remove('tv-mode-55');
    }

    // 2. Escala de Fonte
    body.classList.remove('scale-120', 'scale-140');
    if (this.settings.scaleLevel === '120') {
      body.classList.add('scale-120');
    } else if (this.settings.scaleLevel === '140') {
      body.classList.add('scale-140');
    }

    // 3. Alto Contraste
    if (this.settings.highContrast) {
      body.classList.add('high-contrast-mode');
    } else {
      body.classList.remove('high-contrast-mode');
    }

    // 4. Lupa no Hover dos Quadros
    if (this.settings.hoverZoom) {
      body.classList.add('hover-zoom-enabled');
    } else {
      body.classList.remove('hover-zoom-enabled');
    }

    // 5. Lupa Flutuante (Tabelas)
    if (this.settings.floatingLens) {
      body.classList.add('floating-lens-enabled');
    } else {
      body.classList.remove('floating-lens-enabled');
    }

    // Atualiza indicador no botão do topo
    this.updateHeaderButtonState();
  },

  updateHeaderButtonState() {
    const dot = document.getElementById('comfortActiveDot');
    const btn = document.getElementById('btnComfortToggle');
    if (!dot || !btn) return;

    const isCustomized = this.settings.tvMode || this.settings.scaleLevel !== '100' || this.settings.highContrast;
    if (isCustomized) {
      dot.style.display = 'inline-block';
      btn.classList.add('active-mode');
    } else {
      dot.style.display = 'none';
      btn.classList.remove('active-mode');
    }
  },

  setupUI() {
    const btnToggle = document.getElementById('btnComfortToggle');
    const dropdown = document.getElementById('comfortDropdownMenu');
    const btnClose = document.getElementById('btnCloseComfortMenu');
    const btnReset = document.getElementById('btnResetComfortSettings');

    // Toggles de formulário
    const chkTvMode = document.getElementById('toggleTvMode');
    const chkHoverZoom = document.getElementById('toggleHoverMagnifier');
    const chkFloatingLens = document.getElementById('toggleFloatingLens');
    const chkHighContrast = document.getElementById('toggleHighContrast');
    const scaleBtns = document.querySelectorAll('.comfort-scale-buttons .scale-btn');

    if (!btnToggle || !dropdown) return;

    // Atualiza estados dos checkboxes
    if (chkTvMode) chkTvMode.checked = this.settings.tvMode;
    if (chkHoverZoom) chkHoverZoom.checked = this.settings.hoverZoom;
    if (chkFloatingLens) chkFloatingLens.checked = this.settings.floatingLens;
    if (chkHighContrast) chkHighContrast.checked = this.settings.highContrast;

    scaleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scale === this.settings.scaleLevel);
    });

    // Abrir/Fechar Dropdown
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      if (!isVisible && window.lucide) {
        try { lucide.createIcons(); } catch(err){}
      }
    });

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        dropdown.style.display = 'none';
      });
    }

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !btnToggle.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // Eventos dos switches
    if (chkTvMode) {
      chkTvMode.addEventListener('change', () => {
        this.settings.tvMode = chkTvMode.checked;
        this.saveSettings();
        this.applySettings();
      });
    }

    if (chkHoverZoom) {
      chkHoverZoom.addEventListener('change', () => {
        this.settings.hoverZoom = chkHoverZoom.checked;
        this.saveSettings();
        this.applySettings();
      });
    }

    if (chkFloatingLens) {
      chkFloatingLens.addEventListener('change', () => {
        this.settings.floatingLens = chkFloatingLens.checked;
        this.saveSettings();
        this.applySettings();
      });
    }

    if (chkHighContrast) {
      chkHighContrast.addEventListener('change', () => {
        this.settings.highContrast = chkHighContrast.checked;
        this.saveSettings();
        this.applySettings();
      });
    }

    // Botões de escala
    scaleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        scaleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.scaleLevel = btn.dataset.scale;
        this.saveSettings();
        this.applySettings();
      });
    });

    // Restaurar Padrão
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.settings = {
          tvMode: false,
          scaleLevel: '100',
          highContrast: false,
          hoverZoom: true,
          floatingLens: true
        };
        this.saveSettings();
        this.applySettings();

        if (chkTvMode) chkTvMode.checked = false;
        if (chkHoverZoom) chkHoverZoom.checked = true;
        if (chkFloatingLens) chkFloatingLens.checked = true;
        if (chkHighContrast) chkHighContrast.checked = false;
        scaleBtns.forEach(b => b.classList.toggle('active', b.dataset.scale === '100'));
      });
    }
  },

  setupCardMagnifiers() {
    this.attachMagnifiersToNewElements();
  },

  attachMagnifiersToNewElements() {
    const cardSelectors = [
      '.ticker-item',
      '.stat-pill',
      '.tape-metric-box',
      '.depth-stat-item',
      '.trades-stat-pill',
      '.legend-item',
      '.binance-whale-radar-banner',
      '.connection-status'
    ];

    document.querySelectorAll(cardSelectors.join(', ')).forEach(el => {
      if (!el.classList.contains('has-hover-zoom')) {
        el.classList.add('has-hover-zoom');
        el.setAttribute('title', '🔍 Passe o mouse para ampliar os detalhes');
      }
    });
  },

  setupFloatingHUD() {
    let hud = document.getElementById('floatingMagnifierHUD');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'floatingMagnifierHUD';
      hud.className = 'floating-magnifier-hud';
      hud.innerHTML = `
        <div class="hud-header">
          <span class="hud-icon">🔍</span>
          <span class="hud-title">LUPA DE DETALHES</span>
          <span class="hud-side-badge" id="hudSideBadge">ORDEM</span>
        </div>
        <div class="hud-body">
          <div class="hud-row primary-row">
            <span class="hud-label">Preço:</span>
            <span class="hud-value font-mono font-bold" id="hudPrice">---</span>
          </div>
          <div class="hud-row">
            <span class="hud-label">Quantidade:</span>
            <span class="hud-value font-mono" id="hudQty">---</span>
          </div>
          <div class="hud-row">
            <span class="hud-label">Total Est.:</span>
            <span class="hud-value font-mono" id="hudTotal">---</span>
          </div>
        </div>
      `;
      document.body.appendChild(hud);
    }

    const hudPrice = document.getElementById('hudPrice');
    const hudQty = document.getElementById('hudQty');
    const hudTotal = document.getElementById('hudTotal');
    const hudSideBadge = document.getElementById('hudSideBadge');

    let currentHovered = null;

    // Delegação de eventos para Order Book, Trades e Tape Reading
    document.addEventListener('mouseover', (e) => {
      if (!this.settings.floatingLens) return;

      const target = e.target.closest('.orderbook-row, .binance-ladder-row, .binance-trades-row, .tape-row, tr.trade-row');
      if (target) {
        currentHovered = target;
        hud.style.display = 'block';
        this.extractAndPopulateHUD(target, hudPrice, hudQty, hudTotal, hudSideBadge);
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (currentHovered && this.settings.floatingLens && hud.style.display === 'block') {
        const x = e.clientX + 18;
        const y = e.clientY - 25;
        hud.style.left = `${Math.min(x, window.innerWidth - 300)}px`;
        hud.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('.orderbook-row, .binance-ladder-row, .binance-trades-row, .tape-row, tr.trade-row');
      if (target && target === currentHovered) {
        currentHovered = null;
        hud.style.display = 'none';
      }
    });
  },

  extractAndPopulateHUD(row, elPrice, elQty, elTotal, elSide) {
    // Tenta extrair dados a partir de classes comuns ou textos
    let price = '---';
    let qty = '---';
    let total = '---';
    let side = 'COMPRA';
    let isAsk = row.classList.contains('ask') || row.classList.contains('sell') || row.querySelector('.red');

    if (isAsk) {
      side = 'VENDA (ASK)';
      elSide.className = 'hud-side-badge badge-red';
    } else {
      side = 'COMPRA (BID)';
      elSide.className = 'hud-side-badge badge-green';
    }
    elSide.textContent = side;

    // Varredura de elementos filhos
    const priceEl = row.querySelector('.col-price, .order-price, .price, [data-price]');
    const qtyEl = row.querySelector('.col-qty, .order-qty, .qty, [data-qty]');
    const totalEl = row.querySelector('.col-total, .order-total, .total, [data-total]');

    if (priceEl) price = priceEl.textContent.trim();
    if (qtyEl) qty = qtyEl.textContent.trim();
    if (totalEl) total = totalEl.textContent.trim();

    // Fallback: se não achar classes, lê o texto das colunas filhas
    if (price === '---' && row.children.length >= 2) {
      price = row.children[0].textContent.trim();
      qty = row.children[1].textContent.trim();
      if (row.children.length >= 3) {
        total = row.children[2].textContent.trim();
      }
    }

    elPrice.textContent = price;
    elQty.textContent = qty;
    elTotal.textContent = total;
  },

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Alt + T: Alterna Modo TV 55"
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        this.settings.tvMode = !this.settings.tvMode;
        const chk = document.getElementById('toggleTvMode');
        if (chk) chk.checked = this.settings.tvMode;
        this.saveSettings();
        this.applySettings();
      }

      // Alt + L: Alterna Lupa no Hover
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        this.settings.hoverZoom = !this.settings.hoverZoom;
        const chk = document.getElementById('toggleHoverMagnifier');
        if (chk) chk.checked = this.settings.hoverZoom;
        this.saveSettings();
        this.applySettings();
      }
    });
  }
};

// Inicialização automática quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  AccessibilityManager.init();
});
