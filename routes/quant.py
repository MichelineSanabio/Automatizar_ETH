"""
routes/quant.py - API do Motor Quantitativo Institucional
Fornece endpoints para o estado completo de mercado, checklist de descida,
probabilidades de ordens limite, termômetro de altseason, pivô de alta e logs.
"""

from flask import Blueprint, jsonify, request
from quant_analyzer import quant_engine

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
            "rate_limit_seconds": telegram_notifier.rate_limit_seconds,
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
