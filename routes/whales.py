"""
Rotas da API de Monitoramento de Baleias e Dados On-Chain (Etherscan).
"""

from flask import Blueprint, jsonify, request
from services import whale_tracker, client

whales_bp = Blueprint("whales", __name__)

@whales_bp.route("/api/whales")
def get_whales():
    """
    Retorna as 50 maiores carteiras de ETH com saldos atualizados via Etherscan V2.
    Utiliza cache automático de 5 minutos para economizar chamadas da API gratuita.
    """
    force = request.args.get("refresh", "false").lower() == "true"
    try:
        # Obter cotação atual de ETH para converter para USD
        eth_price = 2690.0
        try:
            price_data = client.get_price("ETHUSDT")
            eth_price = price_data.get("price", eth_price)
        except Exception:
            pass

        data = whale_tracker.get_top_50_whales(eth_price_usd=eth_price, force_refresh=force)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@whales_bp.route("/api/whales/quota")
def get_whales_quota():
    """Retorna o consumo atual de requisições da chave Etherscan."""
    return jsonify(whale_tracker.get_api_quota())
