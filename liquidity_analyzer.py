"""
Módulo MarketLiquidityAnalyzer - Monitoramento de Liquidez, Caça de Stops e Alinhamento Técnico
Avalia confluência técnica de ETH, BTC e par cruzado ETH/BTC combinando:
- Supertrend (10, 3.0)
- Parabolic SAR
- Médias Móveis Exponenciais (EMA25 e EMA99)
- Força relativa do ETH vs BTC (ETHBTC)
- Proximidade de preço até a zona de liquidez (ex: 2.480 - 2.530 USDT configurável)
- Índice Composto de Prontidão do Evento (Event Readiness Probability)
"""

import numpy as np
import pandas as pd
import requests
import time
from datetime import datetime, timezone

BINANCE_BASE_URL = "https://api.binance.com"
BINANCE_FALLBACK_URL = "https://data-api.binance.vision"

class MarketLiquidityAnalyzer:
    """Analisador de liquidez e alinhamento técnico institucional para ETH e BTC."""

    def __init__(self, target_high: float = 2530.0, target_low: float = 2480.0):
        self.target_high = float(target_high)
        self.target_low = float(target_low)

    def get_klines(self, symbol: str, interval: str = "1h", limit: int = 120) -> pd.DataFrame:
        """Busca klines recentes com suporte a fallback de conexão."""
        endpoint = f"{BINANCE_BASE_URL}/api/v3/klines"
        params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}

        try:
            response = requests.get(endpoint, params=params, timeout=8)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            # Fallback para endpoint alternativo da Binance
            try:
                fallback_ep = f"{BINANCE_FALLBACK_URL}/api/v3/klines"
                response = requests.get(fallback_ep, params=params, timeout=8)
                response.raise_for_status()
                data = response.json()
            except Exception as e2:
                raise RuntimeError(f"Erro ao buscar klines de {symbol}: {e} / {e2}")

        df = pd.DataFrame(
            data,
            columns=[
                "open_time",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "close_time",
                "quote_asset_volume",
                "trades",
                "taker_buy_base",
                "taker_buy_quote",
                "ignore",
            ],
        )

        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)
        df["open_time"] = pd.to_datetime(df["open_time"], unit="ms")
        return df

    @staticmethod
    def calculate_emas(df: pd.DataFrame) -> pd.DataFrame:
        """Calcula EMAs 25 e 99 períodos."""
        df["ema25"] = df["close"].ewm(span=25, adjust=False).mean()
        df["ema99"] = df["close"].ewm(span=99, adjust=False).mean()
        return df

    @staticmethod
    def calculate_supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0) -> pd.DataFrame:
        """Calcula o indicador Supertrend (ATR band)."""
        high_low = df["high"] - df["low"]
        high_close = (df["high"] - df["close"].shift()).abs()
        low_close = (df["low"] - df["close"].shift()).abs()
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        atr = tr.rolling(period).mean()

        hl2 = (df["high"] + df["low"]) / 2
        upperband = hl2 + (multiplier * atr)
        lowerband = hl2 - (multiplier * atr)

        supertrend = [True] * len(df)
        for i in range(1, len(df)):
            if df["close"].iloc[i] > upperband.iloc[i - 1]:
                supertrend[i] = True
            elif df["close"].iloc[i] < lowerband.iloc[i - 1]:
                supertrend[i] = False
            else:
                supertrend[i] = supertrend[i - 1]
                if supertrend[i] and lowerband.iloc[i] < lowerband.iloc[i - 1]:
                    lowerband.iloc[i] = lowerband.iloc[i - 1]
                if not supertrend[i] and upperband.iloc[i] > upperband.iloc[i - 1]:
                    upperband.iloc[i] = upperband.iloc[i - 1]

        df["supertrend_bullish"] = supertrend
        df["supertrend_val"] = [lowerband.iloc[i] if supertrend[i] else upperband.iloc[i] for i in range(len(df))]
        return df

    @staticmethod
    def calculate_sar(df: pd.DataFrame, af_start=0.02, af_step=0.02, af_max=0.2) -> pd.DataFrame:
        """Calcula Parabolic SAR (Stop and Reverse)."""
        high, low = df["high"].values, df["low"].values
        n = len(df)
        sar = np.zeros(n)
        trend = np.zeros(n)

        trend[0] = 1 if df["close"].iloc[0] > df["open"].iloc[0] else -1
        sar[0] = low[0] if trend[0] == 1 else high[0]
        ep = high[0] if trend[0] == 1 else low[0]
        af = af_start

        for i in range(1, n):
            cur_sar = sar[i - 1] + af * (ep - sar[i - 1])

            if trend[i - 1] == 1:
                if low[i] < cur_sar:
                    trend[i] = -1
                    sar[i] = ep
                    ep = low[i]
                    af = af_start
                else:
                    trend[i] = 1
                    if high[i] > ep:
                        ep = high[i]
                        af = min(af + af_step, af_max)
                    sar[i] = (
                        min(cur_sar, low[i - 1], low[i - 2])
                        if i >= 2
                        else min(cur_sar, low[i - 1])
                    )
            else:
                if high[i] > cur_sar:
                    trend[i] = 1
                    sar[i] = ep
                    ep = high[i]
                    af = af_start
                else:
                    trend[i] = -1
                    if low[i] < ep:
                        ep = low[i]
                        af = min(af + af_step, af_max)
                    sar[i] = (
                        max(cur_sar, high[i - 1], high[i - 2])
                        if i >= 2
                        else max(cur_sar, high[i - 1])
                    )

        df["sar_bullish"] = trend == 1
        df["sar_val"] = sar
        return df

    def evaluate_setup(self, timeframe: str = "1h", target_high: float = None, target_low: float = None) -> dict:
        """
        Executa a avaliação quantitativa do setup de busca de liquidez.
        Combina os 5 pesos técnicos + proximidade geográfica do preço alvo.
        """
        if target_high is not None:
            self.target_high = float(target_high)
        if target_low is not None:
            self.target_low = float(target_low)

        # 1. Obtenção e processamento de ETH, BTC e ETH/BTC
        eth_df = self.calculate_sar(
            self.calculate_supertrend(
                self.calculate_emas(
                    self.get_klines("ETHUSDT", interval=timeframe)
                )
            )
        )
        btc_df = self.calculate_emas(
            self.get_klines("BTCUSDT", interval=timeframe)
        )
        ethbtc_df = self.calculate_emas(
            self.get_klines("ETHBTC", interval=timeframe)
        )

        last_eth = eth_df.iloc[-1]
        last_btc = btc_df.iloc[-1]
        last_ethbtc = ethbtc_df.iloc[-1]
        eth_price = float(last_eth["close"])
        btc_price = float(last_btc["close"])
        ethbtc_ratio = float(last_ethbtc["close"])

        # 2. Pesos e Confluência Técnica (Soma = 100%)
        # - Supertrend Bear: 25% (expansão direcional da tendência)
        # - SAR Bear: 20% (aceleração do fluxo vendedor)
        # - ETH abaixo da EMA25: 20% (perda do suporte de curto prazo)
        # - Fraqueza no ETH/BTC: 20% (ETH perdendo força frente ao BTC)
        # - BTC abaixo da EMA25: 15% (mercado geral em retração)
        technical_weights = {
            "supertrend_bear": (
                25.0 if not last_eth["supertrend_bullish"] else 0.0
            ),
            "sar_bear": 20.0 if not last_eth["sar_bullish"] else 0.0,
            "eth_below_ema25": (
                20.0 if eth_price < last_eth["ema25"] else 0.0
            ),
            "ethbtc_weakness": (
                20.0 if last_ethbtc["close"] < last_ethbtc["ema25"] else 0.0
            ),
            "btc_pullback": (
                15.0 if last_btc["close"] < last_btc["ema25"] else 0.0
            ),
        }
        technical_alignment_pct = sum(technical_weights.values())

        # 3. Proximidade Geográfica de Preço (0% a 100%)
        # Referência: máxima recente dos últimos 60 candles vs alvo de 2.530
        recent_high = float(eth_df["high"].tail(60).max())
        recent_low = float(eth_df["low"].tail(60).min())

        if eth_price <= self.target_high:
            price_proximity_pct = 100.0  # Já atingiu a zona de caça de stops
        elif eth_price >= recent_high:
            price_proximity_pct = 0.0  # Está no topo ou rompendo máxima
        else:
            # Distância percorrida do topo até o alvo de target_high
            denom = recent_high - self.target_high
            if denom > 0:
                price_proximity_pct = ((recent_high - eth_price) / denom) * 100.0
            else:
                price_proximity_pct = 100.0 if eth_price <= self.target_high else 0.0
            price_proximity_pct = max(0.0, min(100.0, price_proximity_pct))

        # 4. Índice Composto de Prontidão do Evento
        # Ponderação: 60% alinhamento técnico dos indicadores + 40% proximidade de preço
        overall_readiness_pct = (technical_alignment_pct * 0.60) + (
            price_proximity_pct * 0.40
        )

        # Distância em USDT e percentual direto até o primeiro alvo (target_high)
        distance_to_target_usd = eth_price - self.target_high
        distance_to_target_pct = (distance_to_target_usd / eth_price) * 100.0 if eth_price > 0 else 0.0

        # Classificação de status
        if overall_readiness_pct >= 75:
            status_level = "CRÍTICO / ALTA PROBABILIDADE"
            status_color = "#f6465d" # Vermelho / Alerta Máximo
            status_badge = "Pronto para Sweep"
        elif overall_readiness_pct >= 50:
            status_level = "MODERADO / EM FORMAÇÃO"
            status_color = "#f0b90b" # Dourado / Atenção
            status_badge = "Pressão Vendedora Ativa"
        elif overall_readiness_pct >= 25:
            status_level = "BAIXO / TRANSIÇÃO"
            status_color = "#3498db" # Azul
            status_badge = "Sinais Mistos"
        else:
            status_level = "INATIVO / TENDÊNCIA CONTRÁRIA"
            status_color = "#0ecb81" # Verde
            status_badge = "Sem Risco Imediato"

        # Histórico recente para mini gráficos
        eth_recent_spark = eth_df[["open_time", "close", "ema25", "ema99"]].tail(24).to_dict(orient="records")
        for r in eth_recent_spark:
            r["open_time"] = r["open_time"].strftime("%d/%m" if timeframe in ["1d", "1w"] else "%H:%M")

        return {
            "success": True,
            "timestamp": int(time.time() * 1000),
            "timeframe": timeframe,
            "eth_price": round(eth_price, 2),
            "btc_price": round(btc_price, 2),
            "ethbtc_ratio": round(ethbtc_ratio, 6),
            "target_range": f"{self.target_low:.2f} - {self.target_high:.2f} USDT",
            "target_high": self.target_high,
            "target_low": self.target_low,
            "recent_high_60": round(recent_high, 2),
            "recent_low_60": round(recent_low, 2),
            "distance_to_target_usd": round(distance_to_target_usd, 2),
            "distance_to_target_pct": f"{distance_to_target_pct:+.2f}%",
            "readiness_summary": {
                "overall_event_probability": round(overall_readiness_pct, 1),
                "overall_event_probability_str": f"{overall_readiness_pct:.1f}%",
                "technical_alignment": round(technical_alignment_pct, 1),
                "technical_alignment_str": f"{technical_alignment_pct:.1f}%",
                "price_proximity": round(price_proximity_pct, 1),
                "price_proximity_str": f"{price_proximity_pct:.1f}%",
                "status_level": status_level,
                "status_color": status_color,
                "status_badge": status_badge,
            },
            "indicator_breakdown": {
                "supertrend_bearish": not bool(last_eth["supertrend_bullish"]),
                "sar_bearish": not bool(last_eth["sar_bullish"]),
                "eth_below_ema25": bool(eth_price < last_eth["ema25"]),
                "ethbtc_weakness": bool(last_ethbtc["close"] < last_ethbtc["ema25"]),
                "btc_pullback": bool(last_btc["close"] < last_btc["ema25"]),
            },
            "weights_table": [
                {
                    "name": "Supertrend Bearish (10, 3.0)",
                    "weight_max": 25.0,
                    "weight_earned": technical_weights["supertrend_bear"],
                    "active": not bool(last_eth["supertrend_bullish"]),
                    "description": "Expansão da tendência vendedora em ETH",
                    "value_str": f"SAR/ST: {'Baixa ↘' if not last_eth['supertrend_bullish'] else 'Alta ↗'}"
                },
                {
                    "name": "Parabolic SAR Bearish",
                    "weight_max": 20.0,
                    "weight_earned": technical_weights["sar_bear"],
                    "active": not bool(last_eth["sar_bullish"]),
                    "description": "Aceleração do fluxo de venda por trailing stop",
                    "value_str": f"SAR: ${last_eth.get('sar_val', 0):,.1f}"
                },
                {
                    "name": "ETH Abaixo da EMA 25",
                    "weight_max": 20.0,
                    "weight_earned": technical_weights["eth_below_ema25"],
                    "active": bool(eth_price < last_eth["ema25"]),
                    "description": "Perda do suporte dinâmico de curto prazo do Ethereum",
                    "value_str": f"EMA25: ${last_eth['ema25']:,.1f}"
                },
                {
                    "name": "Fraqueza no Par ETH/BTC",
                    "weight_max": 20.0,
                    "weight_earned": technical_weights["ethbtc_weakness"],
                    "active": bool(last_ethbtc["close"] < last_ethbtc["ema25"]),
                    "description": "Ethereum perdendo força relativa contra o Bitcoin",
                    "value_str": f"Ratio: {last_ethbtc['close']:.5f} (EMA {last_ethbtc['ema25']:.5f})"
                },
                {
                    "name": "BTC Abaixo da EMA 25",
                    "weight_max": 15.0,
                    "weight_earned": technical_weights["btc_pullback"],
                    "active": bool(last_btc["close"] < last_btc["ema25"]),
                    "description": "Bitcoin em retração puxando a liquidez do mercado geral",
                    "value_str": f"BTC: ${last_btc['close']:,.0f} (EMA ${last_btc['ema25']:,.0f})"
                }
            ],
            "values": {
                "eth_ema25": round(float(last_eth["ema25"]), 2),
                "eth_ema99": round(float(last_eth["ema99"]), 2),
                "btc_ema25": round(float(last_btc["ema25"]), 2),
                "btc_ema99": round(float(last_btc["ema99"]), 2),
                "ethbtc_ema25": round(float(last_ethbtc["ema25"]), 6),
                "sar_val": round(float(last_eth.get("sar_val", 0)), 2),
                "supertrend_val": round(float(last_eth.get("supertrend_val", 0)), 2),
            },
            "recent_spark": eth_recent_spark
        }

if __name__ == "__main__":
    analyzer = MarketLiquidityAnalyzer(target_high=2530.0, target_low=2480.0)
    result = analyzer.evaluate_setup(timeframe="1h")

    print("\n--- MONITORAMENTO DE LIQUIDEZ (ETHUSDT) ---")
    print(f"Preco Atual ETH: ${result['eth_price']}")
    print(f"Distancia ate {result['target_high']}: {result['distance_to_target_pct']}")
    print(f"Probabilidade Global do Evento: {result['readiness_summary']['overall_event_probability_str']}")
    print(f"  [+] Alinhamento dos Indicadores: {result['readiness_summary']['technical_alignment_str']}")
    print(f"  [+] Proximidade de Preco: {result['readiness_summary']['price_proximity_str']}\n")
    print("Detalhamento dos Indicadores:", result["indicator_breakdown"])
