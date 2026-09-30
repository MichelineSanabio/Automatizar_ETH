"""
routes/quant.py - API do Motor Quantitativo Institucional
Fornece endpoints para o estado completo de mercado, checklist de descida,
probabilidades de ordens limite, termômetro de altseason, pivô de alta e logs.
"""

from flask import Blueprint, jsonify, request
import json
import os
from quant_analyzer import quant_engine
from onchain_engine import OnChainEngine
from valuation_models import (
    mvrv_zscore,
    price_from_target_z,
    tvl_multiple_projection,
    ethbtc_projection,
    cycle_fibonacci,
    triangulate_scenarios,
    classify_vs_expected,
    SEMAFORO_THRESHOLDS
)

# Instância Singleton do motor onchain institucional
onchain_engine = OnChainEngine()

def _get_current_eth_price() -> float:
    """Obtém preço atual spot de ETH com múltiplos níveis de fallback seguro."""
    try:
        state = quant_engine.get_full_market_state()
        price = float(state.get("prices", {}).get("eth", 0.0))
        if price > 0:
            return price
    except Exception:
        pass
    try:
        from services import client
        p_data = client.get_price("ETHUSDT")
        return float(p_data.get("price", 2650.0))
    except Exception:
        return 2650.0

quant_bp = Blueprint("quant", __name__, url_prefix="/api/quant")

@quant_bp.route("/state", methods=["GET"])
def get_quant_state():
    """Retorna o estado consolidado institucional do motor quantitativo."""
    try:
        state = quant_engine.get_full_market_state()
        return jsonify({
            "status": "success",
            "data": state
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@quant_bp.route("/recalculate-fibonacci", methods=["POST"])
def recalculate_fibonacci():
    """Permite recalcular níveis dinâmicos com parâmetros personalizados."""
    try:
        data = request.get_json() or {}
        high_pivot = float(data.get("high_pivot", 2750.0))
        swing_low = float(data.get("swing_low", 2480.0))
        
        diff = high_pivot - swing_low
        recalculated = {
            "high_pivot": high_pivot,
            "swing_low": swing_low,
            "level_382": round(high_pivot - (diff * 0.382), 2),
            "level_golden_618": round(high_pivot - (diff * 0.618), 2),
            "level_golden_650": round(high_pivot - (diff * 0.650), 2),
            "target_1": 4200.0,
            "target_2_fib1272": round(high_pivot + (diff * 1.272), 2),
            "target_3_fib1618": round(high_pivot + (diff * 1.618), 2)
        }
        return jsonify({
            "status": "success",
            "data": recalculated
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400

@quant_bp.route("/telegram/status", methods=["GET"])
def get_telegram_status():
    """Retorna o status de configuração e histórico recente do bot Telegram."""
    from telegram_notifier import telegram_notifier
    configured = telegram_notifier.is_configured()
    masked_chat = ""
    if telegram_notifier.chat_id:
        cid = telegram_notifier.chat_id
        masked_chat = cid[:2] + "****" + cid[-2:] if len(cid) > 4 else "****"

    return jsonify({
        "status": "success",
        "data": {
            "configured": configured,
            "bot_token_set": bool(telegram_notifier.bot_token),
            "chat_id_set": bool(telegram_notifier.chat_id),
            "masked_chat_id": masked_chat,
            "rate_limit_seconds": getattr(telegram_notifier, "cooldown_seconds", 60),
            "recent_logs": telegram_notifier.notification_logs[-10:]
        }
    })

@quant_bp.route("/telegram/test", methods=["POST"])
def send_telegram_test():
    """Envia um alerta de teste para validação de credenciais."""
    from telegram_notifier import telegram_notifier
    if not telegram_notifier.is_configured():
        return jsonify({
            "status": "warning",
            "message": "Telegram não configurado. Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no arquivo .env."
        }), 400

    test_msg = (
        "🔔 *[TESTE DE CONECTIVIDADE - BOT TELEGRAM]*\n"
        "✅ Conexão estabelecida com sucesso com o Binance Market Terminal!\n"
        "📊 Alertas de probabilidade, proximidade de ordens e risco de spoofing estão ativos."
    )
    dispatched = telegram_notifier.send_message_async(test_msg, category="test_alert")
    return jsonify({
        "status": "success" if dispatched else "rate_limited",
        "message": "Mensagem de teste enviada em background!" if dispatched else "Rate-limit atingido. Aguarde 60 segundos."
    })


# =============================================================================
# NOVOS ENDPOINTS INSTITUCIONAIS DO PROMPT MESTRE (ETAPA 3)
# =============================================================================

@quant_bp.route("/config", methods=["GET"])
def get_quant_config():
    """Retorna os parâmetros institucionais de quant_config.json."""
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "quant_config.json")
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            return jsonify({"status": "success", "data": cfg})
        else:
            return jsonify({"status": "error", "message": "Arquivo quant_config.json não encontrado"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@quant_bp.route("/orders", methods=["GET"])
def get_quant_orders():
    """
    Retorna as ordens canônicas A, B, C, D enriquecidas em tempo real
    com distância em USD, percentual, status de proximidade e confluências técnicas.
    """
    try:
        eth_price = _get_current_eth_price()
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "quant_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        raw_orders = cfg.get("ordens", [])
        enriched_orders = []

        for o in raw_orders:
            preco_alvo = float(o.get("preco_usdt", 0.0))
            dist_usd = round(preco_alvo - eth_price, 2)
            dist_pct = round(((preco_alvo - eth_price) / max(1.0, eth_price)) * 100, 2)

            if eth_price <= preco_alvo:
                status_prox = "EXECUTADA / PREÇO NO NÍVEL"
                atingida = True
                badge_cor = "green"
            elif abs(dist_pct) <= 1.0:
                status_prox = "IMINENTE / MUITO PRÓXIMA (< 1%)"
                atingida = False
                badge_cor = "yellow"
            elif abs(dist_pct) <= 3.0:
                status_prox = "ZONA DE ATENÇÃO (< 3%)"
                atingida = False
                badge_cor = "cyan"
            else:
                status_prox = "AGUARDANDO APROXIMAÇÃO"
                atingida = False
                badge_cor = "gray"

            enriched_orders.append({
                "id": o.get("id"),
                "preco_usdt": preco_alvo,
                "qtd_eth": o.get("qtd_eth"),
                "valor_referencia": o.get("valor_referencia"),
                "rotulo": o.get("rotulo"),
                "alocacao_pct": o.get("alocacao_pct"),
                "distancia_usd": dist_usd,
                "distancia_pct": dist_pct,
                "atingida": atingida,
                "status_proximidade": status_prox,
                "badge_cor": badge_cor
            })

        # Informações de spoofing e pivô
        spoof_cfg = cfg.get("spoofing", {})
        spoof_nivel = float(spoof_cfg.get("nivel_preco_usdt", 2660.0))
        spoof_dist_usd = round(eth_price - spoof_nivel, 2)
        spoof_dist_pct = round(((eth_price - spoof_nivel) / max(1.0, eth_price)) * 100, 2)

        pivo_cfg = cfg.get("pivo", {})

        return jsonify({
            "status": "success",
            "data": {
                "eth_price_usd": eth_price,
                "orders": enriched_orders,
                "spoofing": {
                    "nivel_preco_usdt": spoof_nivel,
                    "distancia_usd": spoof_dist_usd,
                    "distancia_pct": spoof_dist_pct,
                    "limiar_queda_volume_pct": spoof_cfg.get("limiar_queda_volume_pct", 0.50),
                    "janela_analise_segundos": spoof_cfg.get("janela_analise_segundos", 15.0),
                    "distancia_maxima_alerta_usd": spoof_cfg.get("distancia_maxima_alerta_usd", 40.0),
                    "em_zona_de_risco": abs(spoof_dist_usd) <= spoof_cfg.get("distancia_maxima_alerta_usd", 40.0)
                },
                "pivo": pivo_cfg
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@quant_bp.route("/onchain", methods=["GET"])
def get_quant_onchain():
    """
    Retorna o diagnóstico macro on-chain 360° com Net Issuance diária,
    Saturação de Blob Gas (EIP-4844), Staking vs Corretoras e TVL L1+L2 (DefiLlama).
    """
    try:
        force_refresh = request.args.get("refresh", "false").lower() == "true"
        eth_price = _get_current_eth_price()
        onchain_state = onchain_engine.get_onchain_state(eth_price_usd=eth_price, force_refresh=force_refresh)
        return jsonify({
            "status": "success",
            "data": onchain_state
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@quant_bp.route("/valuation", methods=["GET"])
def get_quant_valuation():
    """
    Retorna os modelos quantitativos puros de ciclo macro:
    MVRV Z-Score, Preços Implícitos de Topo, Projeção TVL, Matriz ETH/BTC,
    Fibonacci de Ciclo (1.272 a 2.618) e Triangulação dos Cenários Conservador, Base e Otimista.
    """
    try:
        eth_price = _get_current_eth_price()
        force_refresh = request.args.get("refresh", "false").lower() == "true"

        # Obter TVL consolidado via onchain_engine (com cache)
        tvl_data = onchain_engine.get_total_value_locked(force_refresh=force_refresh)
        tvl_atual = tvl_data.get("tvl_total_usd", 62000000000.0)

        circulating_supply = onchain_engine.config.get("rede_parametros", {}).get("circulating_supply_eth_estimado", 120400000.0)
        realized_cap = onchain_engine.config.get("rede_parametros", {}).get("realized_cap_usd_estimado", 242000000000.0)
        std_cap = onchain_engine.config.get("rede_parametros", {}).get("std_market_cap_hist_usd", 68000000000.0)

        # MVRV Z-Score e Preços por Z-alvo
        z_atual, mvrv_ratio = mvrv_zscore(eth_price * circulating_supply, realized_cap, std_cap)
        p_mvrv_45 = price_from_target_z(4.5, realized_cap, std_cap, circulating_supply)
        p_mvrv_53 = price_from_target_z(5.3, realized_cap, std_cap, circulating_supply)
        p_mvrv_60 = price_from_target_z(6.0, realized_cap, std_cap, circulating_supply)

        # Projeções por TVL
        tvl_projections = {
            "conservador_40pct": tvl_multiple_projection(tvl_atual, 0.40, 4.5, circulating_supply),
            "base_80pct": tvl_multiple_projection(tvl_atual, 0.80, 5.5, circulating_supply),
            "otimista_150pct": tvl_multiple_projection(tvl_atual, 1.50, 6.5, circulating_supply)
        }

        # Matriz ETH/BTC
        bandas = onchain_engine.config.get("cenarios_topo", {}).get("bandas_ethbtc", [0.042, 0.055, 0.065, 0.080])
        btc_alvos = onchain_engine.config.get("cenarios_topo", {}).get("btc_alvo", {"conservador": 100000.0, "base": 110000.0, "otimista": 120000.0})
        ethbtc_matrix = {
            "btc_100k": ethbtc_projection(btc_alvos.get("conservador", 100000.0), bandas),
            "btc_110k": ethbtc_projection(btc_alvos.get("base", 110000.0), bandas),
            "btc_120k": ethbtc_projection(btc_alvos.get("otimista", 120000.0), bandas)
        }

        # Fibonacci de Ciclo Macro
        fib_macro = cycle_fibonacci(880.0, 4868.0)

        # Triangulação Consolidada
        triangulacao = triangulate_scenarios(
            preco_atual=eth_price,
            circulating_supply=circulating_supply,
            realized_cap=realized_cap,
            std_market_cap_hist=std_cap,
            tvl_atual=tvl_atual,
            faixas_config=onchain_engine.config.get("cenarios_topo", {}).get("faixas_referencia_eth"),
            btc_alvos_config=btc_alvos
        )

        return jsonify({
            "status": "success",
            "data": {
                "eth_price_usd": eth_price,
                "mvrv": {
                    "z_score_atual": z_atual,
                    "mvrv_ratio_atual": mvrv_ratio,
                    "precos_topo_implictos": {
                        "z_4_5_conservador": p_mvrv_45,
                        "z_5_3_base": p_mvrv_53,
                        "z_6_0_euforia": p_mvrv_60
                    }
                },
                "tvl_projections": tvl_projections,
                "ethbtc_matrix": ethbtc_matrix,
                "fibonacci_cycle": fib_macro,
                "triangulacao_cenarios": triangulacao
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@quant_bp.route("/macro-summary", methods=["GET"])
def get_quant_macro_summary():
    """
    Retorna o resumo executivo quantitativo 360° para visualização instantânea
    no Dashboard Web e no Terminal TUI.
    """
    try:
        eth_price = _get_current_eth_price()
        onchain_state = onchain_engine.get_onchain_state(eth_price_usd=eth_price)

        # Identificar ordem mais próxima
        config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "quant_config.json")
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        ordens = cfg.get("ordens", [])
        ordem_mais_proxima = None
        menor_dist_pct = float("inf")
        for o in ordens:
            p = float(o.get("preco_usdt", 0.0))
            d_pct = abs(((p - eth_price) / max(1.0, eth_price)) * 100)
            if d_pct < menor_dist_pct:
                menor_dist_pct = d_pct
                ordem_mais_proxima = {
                    "id": o.get("id"),
                    "preco_usdt": p,
                    "rotulo": o.get("rotulo"),
                    "distancia_usd": round(p - eth_price, 2),
                    "distancia_pct": round(((p - eth_price) / max(1.0, eth_price)) * 100, 2)
                }

        cenario_base = onchain_state.get("cenarios_valuation", {}).get("cenarios", {}).get("base", {})

        return jsonify({
            "status": "success",
            "data": {
                "timestamp": onchain_state.get("timestamp"),
                "eth_price_usd": eth_price,
                "ordem_mais_proxima": ordem_mais_proxima,
                "net_issuance": {
                    "net_diaria_eth": onchain_state.get("net_issuance", {}).get("net_issuance_diaria_eth"),
                    "is_deflationary": onchain_state.get("net_issuance", {}).get("is_deflationary"),
                    "status": onchain_state.get("net_issuance", {}).get("status_descricao")
                },
                "blob_saturation": {
                    "saturation_target_pct": onchain_state.get("blob_gas_saturation", {}).get("saturation_target_pct"),
                    "semaforo": onchain_state.get("blob_gas_saturation", {}).get("semaforo"),
                    "regime": onchain_state.get("blob_gas_saturation", {}).get("regime")
                },
                "staking_ratio": {
                    "ratio": onchain_state.get("staking_vs_exchanges", {}).get("ratio"),
                    "semaforo": onchain_state.get("staking_vs_exchanges", {}).get("semaforo")
                },
                "tvl_total_usd": onchain_state.get("tvl", {}).get("tvl_total_usd"),
                "valuation_base": {
                    "ponto_central_str": cenario_base.get("ponto_central_str"),
                    "faixa_str": cenario_base.get("faixa_str"),
                    "upside_str": cenario_base.get("upside_str")
                },
                "semaforos_topo": onchain_state.get("avaliacao_topo_macro")
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
