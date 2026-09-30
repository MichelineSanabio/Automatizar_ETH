"""
Módulo OrderBookAnalyzer - Análise Estatística de Blocos, Suportes e Paredes Institucionais
Calcula anomalias volumétricas no Livro de Ofertas da Binance através de Z-Score (Desvios Padrão),
identificando concentração de liquidez, presença institucional inferida e risco de evaporação (spoofing).
"""

import os
import json
import time
import threading
from collections import deque
import requests
import numpy as np
from typing import Dict, Any, Optional, List

BINANCE_BASE_URL = "https://api.binance.com"
BINANCE_FALLBACK_URL = "https://data-api.binance.vision"

BINANCE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def _load_market_tiers() -> Dict[str, Any]:
    """Carrega as definições de patamares de baleias do Definir_Baleias.json."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, "Definir_Baleias.json"),
        os.path.join(base_dir, "Definir_Baleias"),
        os.path.join(base_dir, "market_tiers.json")
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                with open(c, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
    return {}

class OrderBookAnalyzer:
    """Analisador estatístico de profundidade de livro de ofertas e fluxo contínuo de trades da Binance."""

    def __init__(self, base_url: str = BINANCE_BASE_URL, fallback_url: str = BINANCE_FALLBACK_URL):
        self.base_url = base_url
        self.fallback_url = fallback_url
        self.trade_buffer: deque = deque(maxlen=3000)
        self.trade_lock = threading.Lock()
        self.tracked_walls: Dict[str, Any] = {}
        self.latest_depth: Dict[str, Any] = {}
        self.background_running = False
        self.background_thread: Optional[threading.Thread] = None
        self.background_cycles = 0
        self.last_background_timestamp = 0.0
        self.active_symbol = "ETHUSDT"

    def fetch_depth(self, symbol: str = "ETHUSDT", limit: int = 1000) -> Dict[str, Any]:
        """
        Busca a profundidade do livro de ofertas na Binance REST API.
        Limites suportados: 5, 10, 20, 50, 100, 500, 1000, 5000.
        """
        limit = min(max(int(limit), 5), 1000)
        params = {"symbol": symbol.upper(), "limit": limit}
        
        try:
            url = f"{self.base_url}/api/v3/depth"
            resp = requests.get(url, params=params, headers=BINANCE_HEADERS, timeout=8)
            resp.raise_for_status()
            data = resp.json()
            self.latest_depth = data
            return data
        except Exception as e1:
            try:
                fallback_url = f"{self.fallback_url}/api/v3/depth"
                resp = requests.get(fallback_url, params=params, headers=BINANCE_HEADERS, timeout=8)
                resp.raise_for_status()
                data = resp.json()
                self.latest_depth = data
                return data
            except Exception as e2:
                raise RuntimeError(f"Falha ao obter livro de ofertas para {symbol}: {e1} | Fallback: {e2}")

    def fetch_recent_trades(self, symbol: str = "ETHUSDT", limit: int = 500) -> List[Dict[str, Any]]:
        """
        Coleta os trades recentes na Binance e armazena em buffer circular contínuo,
        classificando agressão compradora vs vendedora em tempo real.
        """
        symbol = symbol.upper()
        limit = min(max(int(limit), 10), 1000)
        params = {"symbol": symbol, "limit": limit}

        raw_trades = []
        try:
            url = f"{self.base_url}/api/v3/trades"
            resp = requests.get(url, params=params, headers=BINANCE_HEADERS, timeout=6)
            if resp.ok:
                raw_trades = resp.json()
        except Exception:
            try:
                url_fb = f"{self.fallback_url}/api/v3/trades"
                resp_fb = requests.get(url_fb, params=params, headers=BINANCE_HEADERS, timeout=6)
                if resp_fb.ok:
                    raw_trades = resp_fb.json()
            except Exception:
                pass

        if not raw_trades:
            with self.trade_lock:
                return list(self.trade_buffer)

        with self.trade_lock:
            existing_ids = {t["id"] for t in self.trade_buffer}
            for t in raw_trades:
                tid = t.get("id")
                if tid not in existing_ids:
                    p = float(t.get("price", 0.0))
                    q = float(t.get("qty", 0.0))
                    is_buyer_maker = bool(t.get("isBuyerMaker", False))
                    # isBuyerMaker == True: quem executou a mercado foi VENDEDOR (Agressão Sell)
                    # isBuyerMaker == False: quem executou a mercado foi COMPRADOR (Agressão Buy)
                    side = "SELL" if is_buyer_maker else "BUY"
                    self.trade_buffer.append({
                        "id": tid,
                        "price": p,
                        "qty": q,
                        "usd": p * q,
                        "time": t.get("time", int(time.time() * 1000)),
                        "side": side,
                        "isBuyerMaker": is_buyer_maker
                    })
            return list(self.trade_buffer)

    def get_trade_flow_analysis(self, target_price: Optional[float] = None, atol: float = 0.5) -> Dict[str, Any]:
        """Calcula métricas agregadas de ordens executadas de compra e venda a partir do buffer contínuo."""
        with self.trade_lock:
            trades = list(self.trade_buffer)

        if not trades:
            return {
                "total_trades": 0,
                "buy_volume": 0.0,
                "sell_volume": 0.0,
                "delta_volume": 0.0,
                "buy_pct": 50.0,
                "sell_pct": 50.0,
                "pressao_dominante": "AGUARDANDO FLUXO",
                "trades_bloco_volume": 0.0,
                "trades_bloco_count": 0,
                "absorcao_bloco_status": "SEM TRADES NA FAIXA"
            }

        buy_vol = sum(t["qty"] for t in trades if t["side"] == "BUY")
        sell_vol = sum(t["qty"] for t in trades if t["side"] == "SELL")
        total_vol = buy_vol + sell_vol
        delta_vol = buy_vol - sell_vol

        buy_pct = round((buy_vol / total_vol) * 100, 1) if total_vol > 0 else 50.0
        sell_pct = round((sell_vol / total_vol) * 100, 1) if total_vol > 0 else 50.0

        if delta_vol > 0.05 * total_vol:
            pressao = "🟢 COMPRADORA FORTE" if delta_vol > 0.15 * total_vol else "🟢 COMPRADORA"
        elif delta_vol < -0.05 * total_vol:
            pressao = "🔴 VENDEDORA FORTE" if delta_vol < -0.15 * total_vol else "🔴 VENDEDORA"
        else:
            pressao = "⚪ EQUILIBRADA"

        trades_bloco_vol = 0.0
        trades_bloco_count = 0
        trades_bloco_buy = 0.0
        trades_bloco_sell = 0.0

        if target_price is not None and target_price > 0:
            p_min = target_price - atol
            p_max = target_price + atol
            for t in trades:
                if p_min <= t["price"] <= p_max:
                    trades_bloco_vol += t["qty"]
                    trades_bloco_count += 1
                    if t["side"] == "BUY":
                        trades_bloco_buy += t["qty"]
                    else:
                        trades_bloco_sell += t["qty"]

        absorcao_status = "SEM TRADES RECENTES NO BLOCO"
        if trades_bloco_count > 0:
            if trades_bloco_sell > trades_bloco_buy:
                absorcao_status = f"ABSORVENDO VENDAS ({trades_bloco_vol:.2f} ETH em {trades_bloco_count} trades)"
            else:
                absorcao_status = f"ABSORVENDO COMPRAS ({trades_bloco_vol:.2f} ETH em {trades_bloco_count} trades)"

        return {
            "total_trades": len(trades),
            "buy_volume": round(buy_vol, 4),
            "sell_volume": round(sell_vol, 4),
            "delta_volume": round(delta_vol, 4),
            "buy_pct": buy_pct,
            "sell_pct": sell_pct,
            "pressao_dominante": pressao,
            "trades_bloco_volume": round(trades_bloco_vol, 4),
            "trades_bloco_count": trades_bloco_count,
            "trades_bloco_buy": round(trades_bloco_buy, 4),
            "trades_bloco_sell": round(trades_bloco_sell, 4),
            "absorcao_bloco_status": absorcao_status
        }

    def start_background_worker(self, symbol: str = "ETHUSDT", interval: float = 2.5):
        """Inicia o worker daemon contínuo em segundo plano para alimentar livro e trades ininterruptamente."""
        self.active_symbol = symbol.upper()
        if self.background_running:
            return

        self.background_running = True
        self.background_thread = threading.Thread(
            target=self._background_loop,
            args=(self.active_symbol, interval),
            daemon=True,
            name="BlockAnalyzerBackgroundWorker"
        )
        self.background_thread.start()

    def _background_loop(self, symbol: str, interval: float):
        """Loop infinito de segundo plano: roda sem parar independente de abas ativas."""
        while self.background_running:
            try:
                # 1. Ingestão contínua de trades de compra e venda
                self.fetch_recent_trades(symbol=symbol, limit=200)
                # 2. Ingestão contínua de profundidade
                self.fetch_depth(symbol=symbol, limit=1000)
                self.background_cycles += 1
                self.last_background_timestamp = time.time()
            except Exception:
                pass
            time.sleep(interval)

    def analyze_support_block(
        self,
        symbol: str = "ETHUSDT",
        target_price: Optional[float] = 2660.0,
        side: str = "bids",
        limit: int = 1000,
        atol: Optional[float] = None,
        grouping: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Analisa um degrau de preço específico ou identifica a presença institucional
        utilizando média, desvio padrão e Z-Score (sigmas acima da média).
        Suporta agrupamento de spread manual (ex: 1.0 ou 10.0).
        """
        symbol = symbol.upper()
        depth = self.fetch_depth(symbol=symbol, limit=limit)
        
        raw_bids = depth.get("bids", [])
        raw_asks = depth.get("asks", [])
        
        bids_data = np.array([[float(p), float(q)] for p, q in raw_bids]) if raw_bids else np.empty((0, 2))
        asks_data = np.array([[float(p), float(q)] for p, q in raw_asks]) if raw_asks else np.empty((0, 2))

        best_bid = float(bids_data[0, 0]) if len(bids_data) > 0 else 0.0
        best_ask = float(asks_data[0, 0]) if len(asks_data) > 0 else 0.0
        spread_raw = round(best_ask - best_bid, 4) if (best_bid and best_ask) else 0.0

        if grouping is not None and grouping > 0.01:
            best_bid_grouped = float(np.floor(best_bid / grouping) * grouping)
            best_ask_grouped = float(np.ceil(best_ask / grouping) * grouping)
            if best_ask_grouped <= best_bid_grouped:
                best_ask_grouped = best_bid_grouped + grouping
            spread = round(max(grouping, best_ask_grouped - best_bid_grouped), 2)
        else:
            best_bid_grouped = best_bid
            best_ask_grouped = best_ask
            spread = spread_raw

        # Seleciona o lado do livro
        target_side = side.lower()
        if target_side == "auto" and target_price is not None:
            mid_price = (best_bid + best_ask) / 2.0 if (best_bid and best_ask) else best_bid
            target_side = "bids" if target_price <= mid_price else "asks"

        active_data = bids_data if target_side in ["bids", "buy", "suporte"] else asks_data
        side_label = "Suporte (Bids)" if target_side in ["bids", "buy", "suporte"] else "Resistência (Asks)"

        if len(active_data) == 0:
            return {
                "success": False,
                "error": f"Nenhuma ordem encontrada no lado {side_label} do livro.",
                "symbol": symbol
            }

        quantidades = active_data[:, 1]
        media_volume = float(np.mean(quantidades))
        desvio_padrao = float(np.std(quantidades))
        mediana_volume = float(np.median(quantidades))
        max_volume = float(np.max(quantidades))

        # Determina tolerância do degrau (atol) caso não informada
        if atol is None:
            if "BTC" in symbol:
                atol = 5.0
            elif "ETH" in symbol:
                atol = 0.5
            elif "SOL" in symbol:
                atol = 0.1
            else:
                atol = max(0.01, (target_price or best_bid) * 0.0003)

        tiers_cfg = _load_market_tiers().get(symbol, _load_market_tiers().get("ETHUSDT", {}))
        whale_min_qty = tiers_cfg.get("whale", {}).get("minQty", 10.0)
        whale_min_usd = tiers_cfg.get("whale", {}).get("minUsd", 25000.0)
        mega_min_qty = tiers_cfg.get("mega_whale", {}).get("minQty", 40.0)
        mega_min_usd = tiers_cfg.get("mega_whale", {}).get("minUsd", 90000.0)

        result_bloco = None

        if target_price is not None:
            target_price = float(target_price)
            # Localiza o degrau alvo com tolerância
            mask = np.isclose(active_data[:, 0], target_price, atol=atol)
            linhas_alvo = active_data[mask]

            if len(linhas_alvo) > 0:
                # Se houver múltiplos ticks no raio de tolerância, pega o mais próximo
                diffs = np.abs(linhas_alvo[:, 0] - target_price)
                closest_idx = np.argmin(diffs)
                degrau = linhas_alvo[closest_idx]
                
                preco_degrau = float(degrau[0])
                qtd_alvo = float(degrau[1])
                valor_usd = float(qtd_alvo * preco_degrau)
                
                # Z-Score estatístico: desvios acima da média
                z_score = float((qtd_alvo - media_volume) / desvio_padrao) if desvio_padrao > 0 else 0.0
                
                # Inferência estatística de concentração
                is_whale_stat = bool(z_score > 3.0)
                is_whale_cfg = bool(qtd_alvo >= whale_min_qty or valor_usd >= whale_min_usd)
                is_mega_cfg = bool(qtd_alvo >= mega_min_qty or valor_usd >= mega_min_usd)
                
                # Risco de Evaporação (Spoofing)
                if z_score >= 3.0 or is_mega_cfg:
                    risco = "ALTO (Parede Única / Risco de Spoofing)"
                elif z_score >= 2.0 or is_whale_cfg:
                    risco = "MÉDIO (Bloco Significativo)"
                else:
                    risco = "BAIXO (Distribuído / Liquidez Orgânica)"

                classificacao_texto = "Normal"
                if is_mega_cfg or z_score >= 5.0:
                    classificacao_texto = "🐳 Mega Baleia (Parede Crítica)"
                elif is_whale_stat or is_whale_cfg:
                    classificacao_texto = "🐋 Baleia Institucional"
                elif z_score >= 1.5:
                    classificacao_texto = "🐬 Tubarão / Bloco Acima da Média"
                else:
                    classificacao_texto = "🦐 Varejo / Regular"

                result_bloco = {
                    "encontrado": True,
                    "preco": round(preco_degrau, 2),
                    "distancia_preco": round(preco_degrau - (best_bid if target_side in ['bids', 'buy'] else best_ask), 2),
                    "volume_moeda": round(qtd_alvo, 4),
                    "valor_usd": round(valor_usd, 2),
                    "desvios_acima_da_media": round(z_score, 2),
                    "presenca_institucional_inferida": is_whale_stat or is_whale_cfg,
                    "risco_de_evaporacao": risco,
                    "classificacao_tier": classificacao_texto,
                    "detalhes": {
                        "anomalia_sigmas": f"+{round(z_score, 2)}σ" if z_score > 0 else f"{round(z_score, 2)}σ",
                        "limite_whale_definido": whale_min_qty,
                        "limite_mega_definido": mega_min_qty
                    }
                }
            else:
                result_bloco = {
                    "encontrado": False,
                    "mensagem": f"Degrau próximo a ${target_price:.2f} (±{atol}) não encontrado nos {len(active_data)} níveis visíveis.",
                    "preco_consultado": target_price,
                    "faixa_visivel": {
                        "min": round(float(np.min(active_data[:, 0])), 2),
                        "max": round(float(np.max(active_data[:, 0])), 2)
                    }
                }

        # Localiza os TOP 5 maiores blocos anômalos no livro atual
        z_scores_all = (quantidades - media_volume) / desvio_padrao if desvio_padrao > 0 else np.zeros(len(quantidades))
        top_anomalias = []
        indices_ordenados = np.argsort(z_scores_all)[::-1]

        for i in indices_ordenados[:5]:
            p = float(active_data[i, 0])
            q = float(active_data[i, 1])
            usd = float(p * q)
            z = float(z_scores_all[i])
            if z >= 1.5:  # Acima de 1.5 sigmas
                top_anomalias.append({
                    "preco": round(p, 2),
                    "volume": round(q, 4),
                    "valor_usd": round(usd, 2),
                    "z_score": round(z, 2),
                    "sigmas_label": f"+{round(z, 2)}σ",
                    "is_whale": z >= 3.0 or q >= whale_min_qty or usd >= whale_min_usd,
                    "risco_evaporacao": "ALTO (Parede Única)" if z >= 3.0 else "MÉDIO"
                })

        if result_bloco is None and len(top_anomalias) > 0:
            top_wall = top_anomalias[0]
            dist_top = round(top_wall["preco"] - best_bid if target_side in ["bids", "buy", "suporte"] else top_wall["preco"] - best_ask, 2)
            result_bloco = {
                "encontrado": True,
                "preco": top_wall["preco"],
                "distancia_preco": dist_top,
                "volume_moeda": top_wall["volume"],
                "valor_usd": top_wall["valor_usd"],
                "desvios_acima_da_media": top_wall["z_score"],
                "classificacao_tier": "🚨 Maior Parede Detectada" if top_wall["z_score"] >= 3.0 else "⚡ Parede Institucional",
                "presenca_institucional_inferida": bool(top_wall["z_score"] >= 2.5),
                "risco_de_evaporacao": top_wall["risco_evaporacao"],
                "detalhes": {
                    "anomalia_sigmas": top_wall["sigmas_label"]
                }
            }

        if len(self.trade_buffer) < 50:
            try:
                self.fetch_recent_trades(symbol=symbol, limit=200)
            except Exception:
                pass

        trade_flow = self.get_trade_flow_analysis(target_price=target_price, atol=atol)

        return {
            "success": True,
            "symbol": symbol,
            "lado_analisado": side_label,
            "target_price": target_price,
            "best_bid": round(best_bid, 2),
            "best_ask": round(best_ask, 2),
            "spread": spread,
            "spread_raw": spread_raw,
            "grouping": grouping,
            "best_bid_grouped": round(best_bid_grouped, 2),
            "best_ask_grouped": round(best_ask_grouped, 2),
            "bloco": result_bloco,
            "fluxo_trades": trade_flow,
            "background_engine": {
                "active": self.background_running,
                "cycles": self.background_cycles,
                "last_update": self.last_background_timestamp,
                "trades_buffered": len(self.trade_buffer),
                "status": "Executando continuamente em segundo plano" if self.background_running else "Ativo sob demanda"
            },
            "estatisticas_livro": {
                "total_degraus_analisados": len(active_data),
                "media_volume": round(media_volume, 4),
                "mediana_volume": round(mediana_volume, 4),
                "desvio_padrao": round(desvio_padrao, 4),
                "volume_maximo": round(max_volume, 4),
            },
            "top_paredes_institucionais": top_anomalias
        }

# Instância Singleton do Analisador
_analyzer_instance = OrderBookAnalyzer()

def analisar_bloco_suporte(symbol: str = "ETHUSDT", target_price: float = 2660.0) -> Any:
    """
    Função canônica compatível com o protótipo solicitado pelo usuário.
    Retorna o dicionário de análise estatística de bloco com Z-score e inferência de baleia.
    """
    res = _analyzer_instance.analyze_support_block(
        symbol=symbol,
        target_price=target_price,
        side="bids",
        limit=1000,
        atol=0.5
    )
    bloco = res.get("bloco")
    if bloco and bloco.get("encontrado"):
        return {
            "preco": bloco["preco"],
            "volume_eth": bloco["volume_moeda"],
            "valor_usd": bloco["valor_usd"],
            "desvios_acima_da_media": bloco["desvios_acima_da_media"],
            "presenca_institucional_inferida": bloco["presenca_institucional_inferida"],
            "risco_de_evaporacao": bloco["risco_de_evaporacao"]
        }
    return "Degrau não encontrado no topo do livro."

if __name__ == "__main__":
    print("--- Teste do Módulo OrderBookAnalyzer ---")
    resultado = analisar_bloco_suporte("ETHUSDT", 2660.0)
    print("Resultado Canônico:", resultado)
    
    print("\n--- Teste Análise Completa de Top Paredes ---")
    completo = _analyzer_instance.analyze_support_block("ETHUSDT", None, side="bids", limit=1000)
    print(f"Média: {completo['estatisticas_livro']['media_volume']} | Desvio: {completo['estatisticas_livro']['desvio_padrao']}")
    print(f"Top 5 Paredes Institucionais Detectadas:")
    for w in completo["top_paredes_institucionais"]:
        print(f" - Preco: ${w['preco']} | Vol: {w['volume']} ETH (${w['valor_usd']:,.2f}) | {w['sigmas_label'].replace('σ', ' sigmas')} | Risco: {w['risco_evaporacao']}")
