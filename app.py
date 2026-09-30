"""
Servidor Flask Principal - Binance Terminal & API de Automação ETH & BTC
Ponto de entrada da aplicação: inicializa o app Flask, configurações e registra os Blueprints modulares.
"""

import os
from flask import Flask
from services import generate_favicon
from routes import register_blueprints

# Inicialização do aplicativo Flask
app = Flask(__name__)

# Configurações para desenvolvimento e tempo real
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

# Garantir geração do favicon oficial na inicialização
generate_favicon(app.root_path)

# Registro de todas as rotas modularizadas (Views, Mercado, OrderBook, Volatilidade, Baleias, Configurações)
register_blueprints(app)

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print(" [>] Servidor Flask Binance Terminal Iniciado!")
    print(" [*] Acesse no seu navegador: http://127.0.0.1:5000")
    print(" [*] Arquitetura modular ativa (Flask Blueprints em /routes)")
    print(" [*] LiveReload Ativo: alteracoes em codigo ou telas recarregam em tempo real!")
    print("=" * 60 + "\n")

    # Monitorar alterações em templates HTML, CSS e JS para recarregamento instantâneo
    extra_files = []
    for folder in ["templates", "static", "routes"]:
        folder_path = os.path.join(app.root_path, folder)
        if os.path.exists(folder_path):
            for root, dirs, files in os.walk(folder_path):
                for f in files:
                    extra_files.append(os.path.join(root, f))

    app.run(host="127.0.0.1", port=5000, debug=True, extra_files=extra_files)
