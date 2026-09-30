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
