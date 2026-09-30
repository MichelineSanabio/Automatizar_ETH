"""
Rotas da API de Livro de Ofertas (Order Book), Z-Score e Análise de Liquidez / Stops.
"""

from flask import Blueprint, jsonify, request
from services import liquidity_analyzer, orderbook_analyzer

orderbook_bp = Blueprint("orderbook", __name__)

@orderbook_bp.route("/api/liquidity/status")
def api_liquidity_status():
    """
    Retorna o status em tempo real do setup de liquidez e probabilidade de varredura de stops.
    Parâmetros:
      - timeframe: 1h (padrão), 15m, 4h, 1d
      - target_high: 2530.0 (padrão)
      - target_low: 2480.0 (padrão)
    """
    timeframe = request.args.get("timeframe", "1h")
    try:
        target_high = float(request.args.get("target_high", 2530.0))
    except (ValueError, TypeError):
        target_high = 2530.0

    try:
        target_low = float(request.args.get("target_low", 2480.0))
    except (ValueError, TypeError):
        target_low = 2480.0

    try:
        res = liquidity_analyzer.evaluate_setup(timeframe=timeframe, target_high=target_high, target_low=target_low)
        return jsonify(res)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@orderbook_bp.route("/api/orderbook/analyze-block", methods=["GET", "POST"])
def api_orderbook_analyze_block():
    """
    Analisa um bloco de suporte ou resistência no livro de ofertas via Z-Score.
    Parâmetros:
      - symbol: ETHUSDT, BTCUSDT, etc. (padrão ETHUSDT)
      - target_price: float (ex: 2660.0). Se omitido, analisa o livro geral.
      - side: bids, asks, auto (padrão auto se target_price fornecido, senão bids)
      - limit: 1000 (padrão)
      - atol: tolerância de preço (opcional)
    """
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        symbol = payload.get("symbol", "ETHUSDT")
        target_price = payload.get("target_price")
        side = payload.get("side", "auto")
        limit = payload.get("limit", 1000)
        atol = payload.get("atol")
    else:
        symbol = request.args.get("symbol", "ETHUSDT")
        target_price = request.args.get("target_price")
        side = request.args.get("side", "auto" if target_price else "bids")
        limit = request.args.get("limit", 1000)
        atol = request.args.get("atol")

    try:
        limit = int(limit)
    except (ValueError, TypeError):
        limit = 1000

    try:
        target_price = float(target_price) if target_price is not None and str(target_price).strip() != "" else None
    except (ValueError, TypeError):
        target_price = None

    try:
        atol = float(atol) if atol is not None and str(atol).strip() != "" else None
    except (ValueError, TypeError):
        atol = None

    try:
        result = orderbook_analyzer.analyze_support_block(
            symbol=symbol,
            target_price=target_price,
            side=side,
            limit=limit,
            atol=atol
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@orderbook_bp.route("/api/orderbook/anomalies")
def api_orderbook_anomalies():
    """Retorna as principais anomalias volumétricas e paredes do livro com Z-Score >= 2.0."""
    symbol = request.args.get("symbol", "ETHUSDT")
    try:
        limit = int(request.args.get("limit", 1000))
    except (ValueError, TypeError):
        limit = 1000
    side = request.args.get("side", "bids")
    try:
        result = orderbook_analyzer.analyze_support_block(
            symbol=symbol,
            target_price=None,
            side=side,
            limit=limit
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400
