"""
Rotas de visualização (páginas HTML e status do servidor).
"""

import os
from flask import Blueprint, render_template, jsonify, send_from_directory, current_app
from services import get_app_version

views_bp = Blueprint("views", __name__)

@views_bp.route("/favicon.ico")
def favicon():
    """Serve o favicon.ico para navegadores e ferramentas externas."""
    static_folder = os.path.join(current_app.root_path, "static")
    return send_from_directory(static_folder, "favicon.ico", mimetype="image/vnd.microsoft.icon")

@views_bp.route("/")
def index():
    """Renderiza a página principal do terminal."""
    return render_template("index.html", version=int(get_app_version()))

@views_bp.route("/data-analise")
@views_bp.route("/data_analise.html")
@views_bp.route("/data-analise.html")
@views_bp.route("/analise")
def data_analise():
    """Renderiza o módulo extra de Análise de Dados e Volatilidade Histórica (Manhã, Tarde, Noite, etc.)."""
    return render_template("data_analise.html", version=int(get_app_version()))

@views_bp.route("/liquidez")
@views_bp.route("/liquidez.html")
def liquidez_page():
    """Renderiza o módulo de Monitoramento de Liquidez & Caça de Stops (ETHUSDT)."""
    return render_template("liquidez.html", version=int(get_app_version()))

@views_bp.route("/bloco-analise")
@views_bp.route("/block-analyzer")
@views_bp.route("/zscore-blocos")
@views_bp.route("/orderbook-analyzer")
@views_bp.route("/bloco_analise.html")
def block_analyzer_page():
    """Renderiza a página dedicada do Analisador Estatístico de Blocos & Paredes (Z-Score)."""
    return render_template("block_analyzer.html", version=int(get_app_version()))

@views_bp.route("/tui")
@views_bp.route("/tui.html")
@views_bp.route("/TUI.html")
@views_bp.route("/terminal-tui")
@views_bp.route("/quant-tui")
def tui_page():
    """Renderiza o módulo TUI Web Institucional (Quant Terminal em Rich Web)."""
    return render_template("tui.html", version=int(get_app_version()))

@views_bp.route("/dev/version")
def dev_version():
    """Retorna o timestamp de modificação dos arquivos para LiveReload automático no navegador."""
    return jsonify({"server_start_time": get_app_version()})

@views_bp.route("/api/health")
def health():
    """Health check do servidor Flask."""
    return jsonify({"status": "online", "service": "Flask Binance Market Terminal"})
