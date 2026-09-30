# MAPA DO PROJETO | Binance Market Terminal (Flask & Trading Engine)

Documento estruturado de arquitetura, mapeamento funcional, fluxo de dados e catálogo de busca rápida para desenvolvedores e modelos de linguagem (LLMs).

---

## 1. Árvore do Projeto (Estrutura Arquitetural Modular)

```text
Automatizar_ETH/
├── app.py                         # Ponto de entrada Flask (bootstrap, favicon e registro de Blueprints)
├── services.py                    # Singleton de serviços compartilhados (BinanceClient, Analisadores, Cache-Busting)
├── terminal_layout.json           # Persistência do layout do usuário, marcações e preferências
├── Definir_Baleias.json           # Definição e faixas de volume para classificação de baleias e tiers
│
├── routes/                        # Módulos REST & Views (Flask Blueprints)
│   ├── __init__.py                # Agregador e registrador de blueprints (register_blueprints)
│   ├── views.py                   # Renderização de HTMLs (/, /zscore-blocos, /liquidez, /data-analise)
│   ├── market.py                  # Cotações, candles (klines), depth, trades, indicadores e proxy
│   ├── orderbook.py               # Z-Score de blocos, anomalias do livro de ofertas e liquidez
│   ├── volatility.py              # Análise estatística de volatilidade horária e relatórios CSV
│   ├── whales.py                  # Rastreador de baleias on-chain (Etherscan V2) e cotas
│   └── settings.py                # Persistência de layout e parâmetros de baleias (Definir_Baleias)
│
├── core_engines/ (Python)
│   ├── binance_client.py          # Cliente HTTP REST para Binance API & Binance Vision (com fallbacks)
│   ├── etherscan_client.py        # Rastreador de saldos on-chain e baleias ETH via Etherscan
│   ├── indicators.py              # Cálculo numérico puro de EMA, RSI, Bollinger Bands e MACD
│   ├── liquidity_analyzer.py      # Avaliação de liquidez, caça de stops e desequilíbrios
│   ├── orderbook_analyzer.py      # Motor estatístico Z-Score de blocos e risco de spoofing
│   └── volatility_analyzer.py     # Motor estatístico de volatilidade por turnos/horas com suporte a CSV
│
├── templates/                     # Interfaces HTML (Jinja2)
│   ├── index.html                 # Interface do Terminal Principal (Gráfico, Book, Tape, Ordens, Ticker)
│   ├── block_analyzer.html        # Interface dedicada ao Z-Score e Análise de Blocos/Paredes
│   ├── liquidez.html              # Interface de Monitoramento de Liquidez e Caça de Stops
│   └── data_analise.html          # Interface de Estatísticas de Volatilidade e Turnos
│
└── static/
    ├── css/                       # Estilização Modular Vanilla CSS
    │   ├── base.css               # Tema dark, variáveis CSS, header, ticker-bar, footer e reset
    │   ├── chart.css              # Toolbar do gráfico em 2 linhas, Lightweight Charts, HUD OHLC, splitter
    │   ├── panels.css             # Order book nativo, tape reading, baleias, abas laterais
    │   ├── orders.css             # Modal de ordens PnL, quick summary pill e linhas de breakeven
    │   ├── modals.css             # Modais genéricos, confirmações e avisos
    │   ├── accessibility.css      # Modo TV 55", alto contraste, lupas inteligentes e escalas
    │   └── block_analyzer.css     # Estilos da página de Z-Score de Blocos
    │
    └── js/                        # Frontend Modular em JavaScript Vanilla
        ├── state.js               # Estado global compartilhado, variáveis de runtime e cache de elementos DOM
        ├── utils.js               # Formatadores numéricos, datas, debounce, throttle e helpers
        ├── storage.js             # Sincronização e persistência em terminal_layout.json e localStorage
        ├── indicators.js          # Helpers de cálculo e renderização de indicadores no frontend
        ├── chart.js               # Instanciação Lightweight Charts, candles, zoom TV e marcações (+ Linha)
        ├── orderbook.js           # Agrupamento de tick, renderização de livro e radar de paredes
        ├── tapereading.js         # Processamento de trades ao vivo, velocímetro, delta e filtros
        ├── whales.js              # Carregamento e renderização do painel de baleias on-chain
        ├── websocket.js           # Gerenciador de conexão WebSocket Binance com auto-reconnect
        ├── accessibility.js       # Controle de Modo TV 55", Lupa no cursor e alto contraste
        ├── orders.js              # Gestor de ordens do usuário, PnL flutuante e linhas no gráfico
        ├── block_analyzer.js      # Lógica da interface de Z-Score e blocos institucionais
        ├── ticker.js              # Atualização das métricas de 24h na barra superior
        ├── loader.js              # Carga inicial de dados históricos e sincronização de abas
        ├── events.js              # Event listeners centralizados de botões, abas e atalhos de teclado
        └── app.js                 # Inicializador central do frontend (boot lifecycle)
```

---

## 2. Tabela de Mapeamento de Funções & Módulos

| Arquivo | Função / Classe | Responsabilidade Direta | Dependências Principais |
| :--- | :--- | :--- | :--- |
| **app.py** | `Flask(__name__)`, `register_blueprints` | Inicialização da aplicação, assets estáticos e bootstrap dos Blueprints. | `flask`, `services`, `routes` |
| **services.py** | `BinanceClient`, `VolatilityAnalyzer`, etc. | Singletons globais de infraestrutura para evitar recriação de conexões. | `binance_client`, `orderbook_analyzer`, etc. |
| **routes/views.py** | `index`, `block_analyzer_page`, etc. | Entrega dos templates HTML e endpoints de versão/health check. | `flask`, `services.get_app_version` |
| **routes/market.py** | `get_klines`, `binance_proxy`, etc. | Proxy reverso seguro e consumo de endpoints públicos da Binance. | `services.client`, `indicators` |
| **routes/orderbook.py**| `api_orderbook_analyze_block` | Cálculo de Z-Score de blocos, anomalias e setups de liquidez. | `services.orderbook_analyzer` |
| **routes/volatility.py**| `api_volatility_analysis`, `export_csv` | Estatísticas históricas por período (madrugada/manhã/tarde/noite). | `services.volatility_analyzer` |
| **routes/whales.py** | `get_whales`, `get_whales_quota` | Top 50 holders on-chain e consumo da quota da Etherscan. | `services.whale_tracker` |
| **routes/settings.py**| `get_settings`, `save_settings` | Leitura e gravação no `terminal_layout.json` e `Definir_Baleias.json`. | `os`, `json`, `datetime` |
| **binance_client.py**| `BinanceClient` | Requisições HTTP com fallback multi-domínio (`api.binance.com` / `vision`). | `requests`, `time` |
| **orderbook_analyzer.py**| `OrderBookAnalyzer` | Análise quantitativa via desvio padrão, Z-Score de ordens e spoofing. | `numpy`, `requests` |
| **volatility_analyzer.py**| `VolatilityAnalyzer` | Quebra de volatilidade em turnos horários, cálculo de amplitude e spikes. | `datetime`, `numpy`, `csv` |
| **static/js/state.js** | `initDOMElements`, `MARKET_TIERS` | Declaração do estado reativo global e cache de nós do DOM. | Global Scope |
| **static/js/storage.js** | `saveLayoutImmediate`, `restoreLayout` | Sincroniza estado da UI com `terminal_layout.json` no backend. | `fetch`, `localStorage` |
| **static/js/chart.js** | `initTradingViewChart`, `setCandleSize` | Renderização dos candles, volume, drag, zoom tipo Binance e linhas. | `LightweightCharts` |
| **static/js/orderbook.js**| `setOrderBookGrouping`, `renderOrderBook` | Agrupa preços por tick size, soma volumes e detecta paredes. | `state.js`, `utils.js` |
| **static/js/websocket.js**| `initWebSocket`, `handleTradeMessage` | Stream multiplexado (kline + depth + trade) e reconexão silenciosa. | `WebSocket`, `state.js` |
| **static/js/orders.js** | `addManualOrder`, `updatePositions` | Gestão de ordens manuais, cálculo de PnL não realizado e breakeven. | `chart.js`, `storage.js` |
| **static/js/events.js** | `setupEventListeners` | Ligações de cliques, atalhos de teclado (Alt+T, Alt+L) e seletores. | Todos os módulos frontend |

---

## 3. Fluxo de Dados Principal

1. **Bootstrapping**:
   - O navegador requisita `/`. O Flask entrega [templates/index.html](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/templates/index.html) com `version` injetada para quebra de cache.
   - [state.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/state.js) lê o `localStorage` de forma síncrona para evitar piscamentos (FOUC).
   - [app.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/app.js) dispara o lifecycle: carrega tiers (`/api/tiers`), restaura layout salvo (`/api/settings`), inicializa o gráfico [chart.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/chart.js) e conecta o WebSocket.

2. **Fluxo de Tempo Real (Real-Time Ingestion)**:
   - [websocket.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/websocket.js) mantém um stream combinado com a Binance (`@ticker`, `@kline_<interval>`, `@depth20@100ms`, `@aggTrade`).
   - Dados de preço alimentam [ticker.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/ticker.js) (topo) e atualizam o candle em formação no [chart.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/chart.js).
   - Profundidade alimenta [orderbook.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/orderbook.js) aplicando o agrupamento aritmético ativo.
   - Trades agressivos alimentam o Tape Reading e o velocímetro de pressão compradora/vendedora em [tapereading.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/tapereading.js).

3. **Ciclo de Persistência (State Syncing)**:
   - Qualquer interação de personalização do usuário (mudança de intervalo, ativação de indicador EMA/MACD, adição de linha de suporte, ajuste de agrupamento) dispara `saveLayoutDebounced()` em [storage.js](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/static/js/storage.js).
   - O payload consolida o estado da UI e envia via `POST /api/settings`, que salva fisicamente em [terminal_layout.json](file:///c:/Users/Misha/Documents/Github/Automatizar_ETH/terminal_layout.json) e no `localStorage`.

---

## 4. Tags de Busca Rápida (Catálogo de Contexto LLM)

| Tag de Busca | Arquivos Relevantes | Quando Modificar |
| :--- | :--- | :--- |
| `[CHART_CANDLES_ZOOM]` | `static/js/chart.js`, `static/css/chart.css` | Alterar comportamento de velas, zoom TradingView, navegação, escala de preço ou HUD OHLC. |
| `[ORDER_BOOK_GROUPING]`| `static/js/orderbook.js`, `routes/orderbook.py`, `orderbook_analyzer.py` | Modificar agrupamento de ticks, profundidade de linhas, radar de paredes ou cálculo de Z-Score. |
| `[INDICATORS_MATH]` | `indicators.py`, `static/js/indicators.js`, `routes/market.py` | Incluir ou refinar fórmulas de indicadores técnicos (RSI, Bollinger, Médias, MACD). |
| `[TAPE_READING_TRADES]`| `static/js/tapereading.js`, `static/js/websocket.js` | Ajustar fita de trades, classificação de ordens por porte (Varejo/Baleia) ou delta. |
| `[LAYOUT_PERSISTENCE]` | `static/js/storage.js`, `routes/settings.py`, `terminal_layout.json` | Adicionar novas preferências que devem ser lembradas ao recarregar a página. |
| `[ORDERS_PNL_MANUAL]` | `static/js/orders.js`, `static/css/orders.css` | Modificar modal de ordens, cálculo de preço médio (PM), PnL ou linhas no gráfico. |
| `[WHALES_ONCHAIN]` | `etherscan_client.py`, `routes/whales.py`, `static/js/whales.js` | Ajustar rastreamento de carteiras on-chain da rede Ethereum ou limites de API da Etherscan. |
| `[VOLATILITY_ANALYSIS]`| `volatility_analyzer.py`, `routes/volatility.py`, `templates/data_analise.html` | Métricas de volatilidade por período, upload ou exportação de arquivos CSV. |
| `[ACCESSIBILITY_TV]` | `static/js/accessibility.js`, `static/css/accessibility.css` | Modo TV 55 polegadas, lupa de hover no cursor, zoom de fontes ou alto contraste. |
