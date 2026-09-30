/**
 * Binance Market Terminal - Global State & DOM Element Cache
 */

// Configuration
const CONFIG = {
  restBaseUrl: 'https://api.binance.com',
  restFallbackUrl: 'https://data-api.binance.vision',
  wsBaseUrl: 'wss://stream.binance.com:9443/stream?streams=',
  defaultSymbol: 'ETHUSDT',
  defaultInterval: '15m',
  candleLimit: 500,
  defaultSpreadStep: 10,
};

// Global Runtime State
let currentSymbol = CONFIG.defaultSymbol;
let currentInterval = CONFIG.defaultInterval;
let activeWs = null;
let lastPrice = 0;
let historicalCandles = [];
let orderBookGrouping = CONFIG.defaultSpreadStep;
let lastRawDepth = null;

// Lightweight Charts Series References
let tvChart = null;
let candleSeries = null;
let volumeSeries = null;
let volumeChart = null;
let separateVolumeSeries = null;
let isVolumeSeparated = true;
let volumeHeight = 120;
let ema20Series = null;
let ema50Series = null;
let upperBandSeries = null;
let lowerBandSeries = null;
let macdChart = null;
let macdLineSeries = null;
let signalLineSeries = null;
let macdHistogramSeries = null;

// Indicator Visibility Toggles
let showEma20 = false;
let showEma50 = false;
let showRsi = false;
let showBands = false;
let showMacd = false;

// User Custom Price Markings (Horizontal Price Lines, Supports, Resistances)
let userPriceMarkings = []; // [{ id, price, label, color, lineStyle, lineWidth }]
let userChartPriceLines = new Map(); // id -> LightweightCharts PriceLine instance
let isSettingsLoaded = false;

// DOM Elements Cache
const el = {};

function initDOMElements() {
  el.livePrice = document.getElementById('livePrice');
  el.priceCurrency = document.getElementById('priceCurrency');
  el.priceChange24h = document.getElementById('priceChange24h');
  el.changeVal = document.getElementById('changeVal');
  el.changePercentBadge = document.getElementById('changePercentBadge');
  el.high24h = document.getElementById('high24h');
  el.low24h = document.getElementById('low24h');
  el.volBase24h = document.getElementById('volBase24h');
  el.volQuote24h = document.getElementById('volQuote24h');
  el.baseAssetLabel = document.getElementById('baseAssetLabel');
  el.rangePercent = document.getElementById('rangePercent');
  el.rangeBarFill = document.getElementById('rangeBarFill');
  el.chartLoader = document.getElementById('chartLoader');
  el.tvChartContainer = document.getElementById('tvChartContainer');
  el.volumeSplitter = document.getElementById('volumeSplitter');
  el.volumeChartContainer = document.getElementById('volumeChartContainer');
  el.tvVolumeChart = document.getElementById('tvVolumeChart');
  el.splitterLiveVol = document.getElementById('splitterLiveVol');
  el.volAssetLabel = document.getElementById('volAssetLabel');
  el.btnToggleVolMode = document.getElementById('btnToggleVolMode');
  el.btnResetVolHeight = document.getElementById('btnResetVolHeight');
  el.asksList = document.getElementById('asksList');
  el.bidsList = document.getElementById('bidsList');
  el.spreadPrice = document.getElementById('spreadPrice');
  el.spreadValue = document.getElementById('spreadValue');
  el.spreadArrow = document.getElementById('spreadArrow');
  el.spreadStepSelect = document.getElementById('spreadStepSelect');
  el.spreadStepCustom = document.getElementById('spreadStepCustom');
  el.obTickPills = document.getElementById('obTickPills');
  el.bidsRatio = document.getElementById('bidsRatio');
  el.asksRatio = document.getElementById('asksRatio');
  el.tradesList = document.getElementById('tradesList');
  el.wsStatus = document.getElementById('wsStatus');
  el.wsStatusText = document.getElementById('wsStatusText');
  el.footerClock = document.getElementById('footerClock');
  el.footerPing = document.getElementById('footerPing');
  // Stats
  el.statCandlesCount = document.getElementById('statCandlesCount');
  el.statOpen = document.getElementById('statOpen');
  el.statHigh = document.getElementById('statHigh');
  el.statLow = document.getElementById('statLow');
  el.statClose = document.getElementById('statClose');
  el.statLastUpdate = document.getElementById('statLastUpdate');
  // Indicators Legend
  el.valEma20 = document.getElementById('valEma20');
  el.valEma50 = document.getElementById('valEma50');
  el.valRsi = document.getElementById('valRsi');
  el.legendRsi = document.getElementById('legendRsi');
  el.toggleMacd = document.getElementById('toggleMacd');
  el.legendMacd = document.getElementById('legendMacd');
  el.valMacd = document.getElementById('valMacd');
  el.valMacdSignal = document.getElementById('valMacdSignal');
  el.valMacdHist = document.getElementById('valMacdHist');
  el.macdChartContainer = document.getElementById('macdChartContainer');
  el.tvMacdChart = document.getElementById('tvMacdChart');
  el.macdSubVal = document.getElementById('macdSubVal');
  el.macdSubSignal = document.getElementById('macdSubSignal');
  el.macdSubHist = document.getElementById('macdSubHist');
  // Analytics Card
  el.cardRsi = document.getElementById('cardRsi');
  el.cardEma20 = document.getElementById('cardEma20');
  el.cardEma50 = document.getElementById('cardEma50');
  el.cardTrendBadge = document.getElementById('cardTrendBadge');
  el.cardVwap = document.getElementById('cardVwap');
  el.cardMacd = document.getElementById('cardMacd');
  el.cardMacdSignal = document.getElementById('cardMacdSignal');
  el.cardMacdHist = document.getElementById('cardMacdHist');
  el.cardMacdStatusBadge = document.getElementById('cardMacdStatusBadge');
  // Whale Radar Elements
  el.binanceBidWhaleCount = document.getElementById('binanceBidWhaleCount');
  el.binanceAskWhaleCount = document.getElementById('binanceAskWhaleCount');
  el.btnExplainWhaleBook = document.getElementById('btnExplainWhaleBook');
  el.whalesCardsList = document.getElementById('whalesCardsList');
  el.whaleOrdersFeed = document.getElementById('whaleOrdersFeed');
  el.toggleWhalesOnly = document.getElementById('toggleWhalesOnly');
  el.whaleTradesCount = document.getElementById('whaleTradesCount');
  el.whaleSessionTotal = document.getElementById('whaleSessionTotal');
  el.etherscanCallsUsed = document.getElementById('etherscanCallsUsed');
  el.whaleCacheBadge = document.getElementById('whaleCacheBadge');
  el.btnRefreshWhales = document.getElementById('btnRefreshWhales');
  el.whaleSearchInput = document.getElementById('whaleSearchInput');
  el.whaleCategoryFilters = document.getElementById('whaleCategoryFilters');
  el.subviewHolders = document.getElementById('subviewHolders');
  el.subviewOrders = document.getElementById('subviewOrders');
  el.contentWhaleHolders = document.getElementById('contentWhaleHolders');
  el.contentWhaleOrders = document.getElementById('contentWhaleOrders');
  el.obWhaleRadarStatus = document.getElementById('obWhaleRadarStatus');
  // Tape Reading / Expanded Live Trades Elements
  el.btnViewChart = document.getElementById('btnViewChart');
  el.btnViewTape = document.getElementById('btnViewTape');
  el.btnViewLiquidity = document.getElementById('btnViewLiquidity');
  el.btnViewDataAnalysis = document.getElementById('btnViewDataAnalysis');
  el.chartMainView = document.getElementById('chartMainView');
  el.tapeReadingMainView = document.getElementById('tapeReadingMainView');
  el.liquidityMainView = document.getElementById('liquidityMainView');
  el.dataAnalysisMainView = document.getElementById('dataAnalysisMainView');
  el.iframeLiquidity = document.getElementById('iframeLiquidity');
  el.iframeDataAnalysis = document.getElementById('iframeDataAnalysis');
  el.chartControlsGroup = document.getElementById('chartControlsGroup');
  el.chartLegend = document.getElementById('chartLegend');
  el.tapeBuyVol = document.getElementById('tapeBuyVol');
  el.tapeBuyUsd = document.getElementById('tapeBuyUsd');
  el.tapeSellVol = document.getElementById('tapeSellVol');
  el.tapeSellUsd = document.getElementById('tapeSellUsd');
  el.tapeDeltaVol = document.getElementById('tapeDeltaVol');
  el.aggressionFillBuy = document.getElementById('aggressionFillBuy');
  el.aggressionFillSell = document.getElementById('aggressionFillSell');
  el.tapeSpeed = document.getElementById('tapeSpeed');
  el.tapeMaxBuy = document.getElementById('tapeMaxBuy');
  el.tapeMaxSell = document.getElementById('tapeMaxSell');
  el.btnPauseTape = document.getElementById('btnPauseTape');
  el.txtPauseTape = document.getElementById('txtPauseTape');
  el.btnClearTape = document.getElementById('btnClearTape');
  el.tapeSizeFilters = document.getElementById('tapeSizeFilters');
  el.tapeSideFilters = document.getElementById('tapeSideFilters');
  el.tapeTableBody = document.getElementById('tapeTableBody');
  // Order Book Livro Binance Elements
  el.btnViewOrderBook = document.getElementById('btnViewOrderBook');
  el.orderBookMainView = document.getElementById('orderBookMainView');
  el.btnExpandOrderBook = document.getElementById('btnExpandOrderBook');
  el.binanceSymbolTitle = document.getElementById('binanceSymbolTitle');
  el.binanceCurrentPrice = document.getElementById('binanceCurrentPrice');
  el.binancePriceChange = document.getElementById('binancePriceChange');
  el.binanceRatioBidPct = document.getElementById('binanceRatioBidPct');
  el.binanceRatioAskPct = document.getElementById('binanceRatioAskPct');
  el.binanceRatioBidFill = document.getElementById('binanceRatioBidFill');
  el.binanceRatioAskFill = document.getElementById('binanceRatioAskFill');
  el.binanceStepSelect = document.getElementById('binanceStepSelect');
  el.binanceLadderBody = document.getElementById('binanceLadderBody');
  // Binance Subtab Elements (Livro, Profundidade, Trades)
  el.binanceNavPills = document.getElementById('binanceNavPills');
  el.pillLivro = document.getElementById('pillLivro');
  el.pillProfundidade = document.getElementById('pillProfundidade');
  el.pillTrades = document.getElementById('pillTrades');
  el.binanceContentLivro = document.getElementById('binanceContentLivro');
  el.binanceContentDepth = document.getElementById('binanceContentDepth');
  el.binanceContentTrades = document.getElementById('binanceContentTrades');
  el.binanceDepthCanvas = document.getElementById('binanceDepthCanvas');
  el.binanceDepthCanvasWrapper = document.getElementById('binanceDepthCanvasWrapper');
  el.binanceDepthTooltip = document.getElementById('binanceDepthTooltip');
  el.binanceDepthMidPrice = document.getElementById('binanceDepthMidPrice');
  el.binanceDepthTotalBids = document.getElementById('binanceDepthTotalBids');
  el.binanceDepthTotalAsks = document.getElementById('binanceDepthTotalAsks');
  el.binanceDepthSpread = document.getElementById('binanceDepthSpread');
  el.binanceTradesBody = document.getElementById('binanceTradesBody');
  el.binanceTradesBuyVol = document.getElementById('binanceTradesBuyVol');
  el.binanceTradesSellVol = document.getElementById('binanceTradesSellVol');
  el.binanceTradesWhaleCount = document.getElementById('binanceTradesWhaleCount');
  // Persistent Layout & Markings Elements
  el.layoutStatus = document.getElementById('layoutStatus');
  el.layoutStatusText = document.getElementById('layoutStatusText');
  el.btnResetLayout = document.getElementById('btnResetLayout');
  el.btnManageMarkings = document.getElementById('btnManageMarkings');
  el.markingsCountBadge = document.getElementById('markingsCountBadge');
  el.modalMarkings = document.getElementById('modalMarkings');
}
let obProDepthRows = 25;
let binanceActiveSubtab = 'livro'; // 'livro', 'depth', 'trades'
let binanceRecentTrades = [];
