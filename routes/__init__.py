"""
Módulo de registro central de rotas e Blueprints da aplicação Flask.
"""

from .views import views_bp
from .market import market_bp
from .orderbook import orderbook_bp
from .volatility import volatility_bp
from .whales import whales_bp
from .settings import settings_bp

def register_blueprints(app):
    """Registra todos os Blueprints no aplicativo Flask principal."""
    app.register_blueprint(views_bp)
    app.register_blueprint(market_bp)
    app.register_blueprint(orderbook_bp)
    app.register_blueprint(volatility_bp)
    app.register_blueprint(whales_bp)
    app.register_blueprint(settings_bp)
