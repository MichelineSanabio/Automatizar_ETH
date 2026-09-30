"""
Rotas da API de Configurações, Persistência de Estado do Terminal e Tiers de Baleias.
"""

import os
import json
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

settings_bp = Blueprint("settings", __name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYOUT_FILE_PATH = os.path.join(BASE_DIR, "terminal_layout.json")

def get_default_layout_settings():
    return {
        "version": "1.0",
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "chart": {
            "symbol": "ETHUSDT",
            "interval": "15m",
            "isVolumeSeparated": True,
            "volumeHeight": 120
        },
        "spreads": {
            "orderBookGrouping": 10.0,
            "obProDepthRows": 25,
            "binanceActiveSubtab": "livro"
        },
        "indicators": {
            "showEma20": False,
            "showEma50": False,
            "showRsi": False,
            "showBands": False,
            "showMacd": False
        },
        "views": {
            "activeMainView": "chart",
            "activeSideTab": "orderbook",
            "whaleSubview": "holders",
            "tapeSizeFilter": "all",
            "tapeSideFilter": "all"
        },
        "accessibility": {
            "tvMode": False,
            "scaleLevel": "100",
            "highContrast": False,
            "hoverZoom": True,
            "floatingLens": True
        },
        "markings": [],
        "orders": [],
        "ordersOptions": {
            "showOrdersOnChart": True,
            "showBreakevenOnChart": True
        }
    }

def resolve_tiers_file():
    """Localiza o arquivo de configuração de baleias (Definir_Baleias.json com fallbacks seguros)."""
    candidates = [
        os.path.join(BASE_DIR, "Definir_Baleias.json"),
        os.path.join(BASE_DIR, "Definir_Baleias"),
        os.path.join(BASE_DIR, "market_tiers.json")
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return candidates[0]

@settings_bp.route("/api/tiers", methods=["GET"])
def get_tiers():
    """Retorna as configurações de classificação de ordens (Varejo, Médio, Tubarão, Baleia, Mega)."""
    try:
        current_file = resolve_tiers_file()
        if os.path.exists(current_file):
            with open(current_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            resp = jsonify(data)
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            return resp
        return jsonify({"error": "Arquivo Definir_Baleias.json não encontrado"}), 404
    except Exception as e:
        return jsonify({"error": f"Erro ao ler Definir_Baleias.json: {str(e)}"}), 500

@settings_bp.route("/api/settings", methods=["GET"])
def get_settings():
    """Retorna as configurações salvas em terminal_layout.json."""
    try:
        if os.path.exists(LAYOUT_FILE_PATH):
            with open(LAYOUT_FILE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = get_default_layout_settings()
            with open(LAYOUT_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        
        response = jsonify(data)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    except Exception as e:
        return jsonify({"error": f"Erro ao ler layout: {str(e)}"}), 500

@settings_bp.route("/api/settings", methods=["POST"])
def save_settings():
    """Salva as configurações do usuário diretamente no arquivo terminal_layout.json."""
    try:
        new_data = request.get_json(force=True, silent=True)
        if not new_data or not isinstance(new_data, dict):
            return jsonify({"error": "Payload JSON inválido"}), 400

        # Carregar dados existentes ou default para fazer merge seguro
        current_data = get_default_layout_settings()
        if os.path.exists(LAYOUT_FILE_PATH):
            try:
                with open(LAYOUT_FILE_PATH, "r", encoding="utf-8") as f:
                    current_data = json.load(f)
            except Exception:
                pass

        # Merge de seções
        for key in ["chart", "spreads", "indicators", "views", "accessibility", "ordersOptions"]:
            if key in new_data and isinstance(new_data[key], dict):
                if key not in current_data:
                    current_data[key] = {}
                current_data[key].update(new_data[key])

        # Se markings vier no payload, substitui ou atualiza a lista
        if "markings" in new_data and isinstance(new_data["markings"], list):
            current_data["markings"] = new_data["markings"]

        # Se orders vier no payload, substitui ou atualiza a lista de ordens do usuário
        if "orders" in new_data and isinstance(new_data["orders"], list):
            current_data["orders"] = new_data["orders"]

        current_data["version"] = new_data.get("version", current_data.get("version", "1.0"))
        current_data["lastUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        with open(LAYOUT_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(current_data, f, indent=2, ensure_ascii=False)

        response = jsonify({
            "status": "success",
            "message": "Configurações salvas com sucesso em terminal_layout.json",
            "data": current_data
        })
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        return response
    except Exception as e:
        return jsonify({"error": f"Erro ao salvar layout: {str(e)}"}), 500

@settings_bp.route("/api/settings/reset", methods=["POST"])
def reset_settings():
    """Restaura as configurações de terminal_layout.json para os padrões."""
    try:
        default_data = get_default_layout_settings()
        with open(LAYOUT_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(default_data, f, indent=2, ensure_ascii=False)
        response = jsonify({
            "status": "reset",
            "message": "Configurações restauradas para o padrão com sucesso",
            "data": default_data
        })
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        return response
    except Exception as e:
        return jsonify({"error": f"Erro ao resetar layout: {str(e)}"}), 500
