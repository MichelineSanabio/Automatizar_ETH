"""
Rotas da API de Mercado Binance (cotações, klines, profundidade, trades, indicadores e proxy).
"""

import io
import csv
import requests
from flask import Blueprint, jsonify, request, Response
from services import client
from indicators import calculate_ema, calculate_rsi, calculate_bollinger_bands, calculate_macd

market_bp = Blueprint("market", __name__)

ALLOWED_BINANCE_PREFIXES = ("api/v3/", "api/v1/")

@market_bp.route("/api/binance/<path:subpath>")
def binance_proxy(subpath):
    """Proxy local seguro com validação estrita de rotas públicas permitidas da Binance (prevenção contra SSRF)."""
    clean_subpath = subpath.lstrip("/")
    if ".." in clean_subpath or not clean_subpath.startswith(ALLOWED_BINANCE_PREFIXES):
        return jsonify({"error": "Caminho não autorizado no proxy Binance"}), 403

    try:
        url = f"https://api.binance.com/{clean_subpath}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = requests.get(url, params=request.args, headers=headers, timeout=8)
        return Response(resp.content, status=resp.status_code, content_type=resp.headers.get("content-type", "application/json"))
    except Exception as e1:
        try:
            fallback_url = f"https://data-api.binance.vision/{clean_subpath}"
            resp = requests.get(fallback_url, params=request.args, headers=headers, timeout=8)
            return Response(resp.content, status=resp.status_code, content_type=resp.headers.get("content-type", "application/json"))
        except Exception as e2:
            return jsonify({"error": f"Proxy falhou: {str(e1)} | Fallback: {str(e2)}"}), 502

@market_bp.route("/api/price/<symbol>")
def get_price(symbol):
    """Retorna o preço mais recente do par."""
    try:
        data = client.get_price(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@market_bp.route("/api/ticker/<symbol>")
def get_ticker_24h(symbol):
    """Retorna estatísticas de 24 horas (máxima, mínima, variação, volume)."""
    try:
        data = client.get_24hr_ticker(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@market_bp.route("/api/klines/<symbol>")
def get_klines(symbol):
    """
    Retorna candles históricos.
    Parâmetros na query string: interval (ex: 15m), limit (ex: 500).
    """
    interval = request.args.get("interval", "15m")
    try:
        limit = int(request.args.get("limit", 500))
    except (ValueError, TypeError):
        limit = 500
    try:
        candles = client.get_historical_klines(symbol.upper(), interval=interval, limit=limit)
        return jsonify({
            "symbol": symbol.upper(),
            "interval": interval,
            "count": len(candles),
            "candles": candles
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@market_bp.route("/api/depth/<symbol>")
def get_depth(symbol):
    """Retorna o livro de ofertas (Order Book)."""
    try:
        limit = int(request.args.get("limit", 20))
    except (ValueError, TypeError):
        limit = 20
    try:
        data = client.get_order_book(symbol.upper(), limit=limit)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@market_bp.route("/api/trades/<symbol>")
def get_trades(symbol):
    """Retorna trades recentes do par."""
    try:
        limit = int(request.args.get("limit", 30))
    except (ValueError, TypeError):
        limit = 30
    try:
        trades = client.get_recent_trades(symbol.upper(), limit=limit)
        return jsonify(trades)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@market_bp.route("/api/indicators/<symbol>")
def get_indicators(symbol):
    """Calcula indicadores técnicos (EMA, RSI, Bollinger, MACD) no backend."""
    interval = request.args.get("interval", "15m")
    try:
        limit = int(request.args.get("limit", 100))
    except (ValueError, TypeError):
        limit = 100
    try:
        candles = client.get_historical_klines(symbol.upper(), interval=interval, limit=limit)
        closes = [c["close"] for c in candles]
        
        ema_20 = calculate_ema(closes, 20)
        ema_50 = calculate_ema(closes, 50)
        rsi_14 = calculate_rsi(closes, 14)
        bollinger = calculate_bollinger_bands(closes, 20)
        macd_data = calculate_macd(closes, 12, 26, 9)

        last_close = closes[-1] if closes else 0
        last_ema_20 = ema_20[-1] if ema_20 else None
        last_ema_50 = ema_50[-1] if ema_50 else None
        last_rsi = rsi_14[-1] if rsi_14 else None
        last_macd = macd_data["macd"][-1] if macd_data["macd"] else None
        last_signal = macd_data["signal"][-1] if macd_data["signal"] else None
        last_hist = macd_data["histogram"][-1] if macd_data["histogram"] else None

        trend = "indefinido"
        if last_ema_50 is not None:
            trend = "alta" if last_close > last_ema_50 else "baixa"

        macd_trend = "neutro"
        if last_macd is not None and last_signal is not None:
            macd_trend = "alta (cruzamento de compra)" if last_macd > last_signal else "baixa (cruzamento de venda)"

        return jsonify({
            "symbol": symbol.upper(),
            "interval": interval,
            "last_price": last_close,
            "rsi_14": round(last_rsi, 2) if last_rsi else None,
            "ema_20": round(last_ema_20, 2) if last_ema_20 else None,
            "ema_50": round(last_ema_50, 2) if last_ema_50 else None,
            "trend": trend,
            "macd": round(last_macd, 2) if last_macd is not None else None,
            "macd_signal": round(last_signal, 2) if last_signal is not None else None,
            "macd_histogram": round(last_hist, 2) if last_hist is not None else None,
            "macd_trend": macd_trend,
            "bollinger_upper": round(bollinger["upper"][-1], 2) if bollinger["upper"][-1] else None,
            "bollinger_lower": round(bollinger["lower"][-1], 2) if bollinger["lower"][-1] else None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@market_bp.route("/api/export/<symbol>")
def export_csv(symbol):
    """Exporta candles históricos diretamente como arquivo CSV para download."""
    interval = request.args.get("interval", "1h")
    try:
        count = int(request.args.get("count", 500))
    except (ValueError, TypeError):
        count = 500
    try:
        candles = client.get_historical_klines(symbol.upper(), interval=interval, limit=count)
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp_ms", "datetime_utc", "open", "high", "low", "close", "volume", "quote_volume", "trades"])

        for c in candles:
            writer.writerow([
                c["timestamp"],
                c["datetime_utc"],
                c["open"],
                c["high"],
                c["low"],
                c["close"],
                c["volume"],
                c["quote_asset_volume"],
                c["number_of_trades"]
            ])

        output.seek(0)
        filename = f"{symbol.upper()}_{interval}_{count}candles.csv"
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400
