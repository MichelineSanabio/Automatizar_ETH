/**
 * Binance Market Terminal - Technical Indicators & Math Engine
 */

// Exponential Moving Average (EMA)
function calculateEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(NaN);
  if (values.length < period) return ema;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// Bollinger Bands (SMA + Multiplier * StdDev)
function calculateBollingerBands(values, period = 20, multiplier = 2) {
  const upper = new Array(values.length).fill(NaN);
  const lower = new Array(values.length).fill(NaN);

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, val) => acc + val, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upper[i] = mean + multiplier * stdDev;
    lower[i] = mean - multiplier * stdDev;
  }

  return { upper, lower };
}

// Relative Strength Index (RSI - Wilder's Smoothing)
function calculateRSI(values, period = 14) {
  const rsi = new Array(values.length).fill(NaN);
  if (values.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}

// Moving Average Convergence Divergence (MACD)
function calculateMACD(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calculateEMA(values, fastPeriod);
  const emaSlow = calculateEMA(values, slowPeriod);
  const macdLine = new Array(values.length).fill(NaN);

  for (let i = 0; i < values.length; i++) {
    if (!isNaN(emaFast[i]) && !isNaN(emaSlow[i])) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Extract valid MACD indices and values
  const validEntries = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (!isNaN(macdLine[i])) {
      validEntries.push({ idx: i, val: macdLine[i] });
    }
  }

  const signalLine = new Array(values.length).fill(NaN);
  const histogram = new Array(values.length).fill(NaN);

  if (validEntries.length >= signalPeriod) {
    const vals = validEntries.map(e => e.val);
    const sigEma = calculateEMA(vals, signalPeriod);
    for (let k = 0; k < sigEma.length; k++) {
      if (!isNaN(sigEma[k])) {
        const origIdx = validEntries[k].idx;
        signalLine[origIdx] = sigEma[k];
        histogram[origIdx] = macdLine[origIdx] - sigEma[k];
      }
    }
  }

  return { macdLine, signalLine, histogram };
}

// Average True Range (ATR 14)
function calculateATR(highs, lows, closes, period = 14) {
  const n = closes.length;
  const atr = new Array(n).fill(NaN);
  if (n < period + 1) return atr;

  const tr = new Array(n).fill(0);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += tr[i];
  }
  atr[period] = sum / period;

  for (let i = period + 1; i < n; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

// SuperTrend (period = 10, multiplier = 3.0)
function calculateSuperTrend(highs, lows, closes, period = 10, multiplier = 3.0) {
  const n = closes.length;
  const superTrend = new Array(n).fill(NaN);
  const direction = new Array(n).fill(1); // 1 = BULL (Verde), -1 = BEAR (Vermelho)
  if (n < period + 1) return { superTrend, direction };

  const atr = calculateATR(highs, lows, closes, period);
  const basicUpper = new Array(n);
  const basicLower = new Array(n);
  const finalUpper = new Array(n).fill(NaN);
  const finalLower = new Array(n).fill(NaN);

  for (let i = period; i < n; i++) {
    const hl2 = (highs[i] + lows[i]) / 2;
    basicUpper[i] = hl2 + multiplier * atr[i];
    basicLower[i] = hl2 - multiplier * atr[i];

    if (i === period) {
      finalUpper[i] = basicUpper[i];
      finalLower[i] = basicLower[i];
      direction[i] = closes[i] >= basicLower[i] ? 1 : -1;
      superTrend[i] = direction[i] === 1 ? finalLower[i] : finalUpper[i];
      continue;
    }

    finalUpper[i] = (basicUpper[i] < finalUpper[i - 1] || closes[i - 1] > finalUpper[i - 1])
      ? basicUpper[i]
      : finalUpper[i - 1];

    finalLower[i] = (basicLower[i] > finalLower[i - 1] || closes[i - 1] < finalLower[i - 1])
      ? basicLower[i]
      : finalLower[i - 1];

    const prevDir = direction[i - 1];
    let currDir = prevDir;
    if (prevDir === 1 && closes[i] < finalLower[i]) {
      currDir = -1;
    } else if (prevDir === -1 && closes[i] > finalUpper[i]) {
      currDir = 1;
    }
    direction[i] = currDir;
    superTrend[i] = currDir === 1 ? finalLower[i] : finalUpper[i];
  }

  return { superTrend, direction };
}

// Parabolic SAR (step = 0.02, maxStep = 0.20)
function calculateSAR(highs, lows, closes, step = 0.02, maxStep = 0.20) {
  const n = closes.length;
  const sar = new Array(n).fill(NaN);
  const direction = new Array(n).fill(1); // 1 = Bull, -1 = Bear
  if (n < 5) return { sar, direction };

  let isBull = closes[1] >= closes[0];
  let ep = isBull ? highs[1] : lows[1];
  let af = step;
  sar[1] = isBull ? lows[0] : highs[0];
  direction[1] = isBull ? 1 : -1;

  for (let i = 2; i < n; i++) {
    let prevSar = sar[i - 1];
    let currSar = prevSar + af * (ep - prevSar);

    if (isBull) {
      currSar = Math.min(currSar, lows[i - 1], lows[i - 2]);
      if (lows[i] < currSar) {
        // Reversão para Bear
        isBull = false;
        currSar = ep;
        ep = lows[i];
        af = step;
      } else {
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(maxStep, af + step);
        }
      }
    } else {
      currSar = Math.max(currSar, highs[i - 1], highs[i - 2]);
      if (highs[i] > currSar) {
        // Reversão para Bull
        isBull = true;
        currSar = ep;
        ep = highs[i];
        af = step;
      } else {
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(maxStep, af + step);
        }
      }
    }

    sar[i] = currSar;
    direction[i] = isBull ? 1 : -1;
  }

  return { sar, direction };
}

// On-Balance Volume (OBV)
function calculateOBV(closes, volumes) {
  const n = closes.length;
  const obv = new Array(n).fill(0);
  if (n === 0) return { obv, obvEma: [] };

  obv[0] = volumes[0] || 0;
  for (let i = 1; i < n; i++) {
    const c = closes[i];
    const prevC = closes[i - 1];
    const v = volumes[i] || 0;
    if (c > prevC) {
      obv[i] = obv[i - 1] + v;
    } else if (c < prevC) {
      obv[i] = obv[i - 1] - v;
    } else {
      obv[i] = obv[i - 1];
    }
  }

  const obvEma = calculateEMA(obv, 20);
  return { obv, obvEma };
}

// Stochastic KDJ (period = 9, signal1 = 3, signal2 = 3)
function calculateKDJ(highs, lows, closes, period = 9, m1 = 3, m2 = 3) {
  const n = closes.length;
  const k = new Array(n).fill(NaN);
  const d = new Array(n).fill(NaN);
  const j = new Array(n).fill(NaN);
  if (n < period) return { k, d, j };

  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < n; i++) {
    if (i < period - 1) {
      k[i] = NaN;
      d[i] = NaN;
      j[i] = NaN;
      continue;
    }

    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (let w = i - period + 1; w <= i; w++) {
      if (lows[w] < minLow) minLow = lows[w];
      if (highs[w] > maxHigh) maxHigh = highs[w];
    }

    const range = maxHigh - minLow;
    const rsv = range === 0 ? 50 : ((closes[i] - minLow) / range) * 100;

    const currK = (2 / 3) * prevK + (1 / 3) * rsv;
    const currD = (2 / 3) * prevD + (1 / 3) * currK;
    const currJ = 3 * currK - 2 * currD;

    k[i] = currK;
    d[i] = currD;
    j[i] = currJ;

    prevK = currK;
    prevD = currD;
  }

  return { k, d, j };
}

