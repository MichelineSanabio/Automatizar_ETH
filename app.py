"""
Servidor Flask - Binance Terminal & API de Automação ETH & BTC
Renderiza o dashboard e fornece rotas REST para cotações, dados históricos e exportações.
"""

import io
import os
import csv
import time
import json
from datetime import datetime
from flask import Flask, render_template, jsonify, request, Response, send_from_directory
from binance_client import BinanceClient
from etherscan_client import EtherscanWhaleTracker
from indicators import calculate_ema, calculate_rsi, calculate_bollinger_bands, calculate_macd
from volatility_analyzer import VolatilityAnalyzer
from liquidity_analyzer import MarketLiquidityAnalyzer

app = Flask(__name__)

# Configurações para desenvolvimento e tempo real
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
SERVER_START_TIME = time.time()

def generate_favicon():
    """Gera um favicon.ico no formato da marca (Activity Icon dourado da Binance)."""
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        static_dir = os.path.join(base_dir, "static")
        os.makedirs(static_dir, exist_ok=True)
        
        ico_static = os.path.join(static_dir, "favicon.ico")
        ico_root = os.path.join(base_dir, "favicon.ico")
        
        # Se já existe e é válido, não precisa recriar a cada reload
        if os.path.exists(ico_static) and os.path.exists(ico_root) and os.path.getsize(ico_static) > 1000:
            return

        from PIL import Image, ImageDraw
        size = 256
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        
        # 1. Background com gradiente dourado Binance (#f0b90b -> #f39c12)
        corner_radius = 52
        mask = Image.new("L", (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([4, 4, size - 5, size - 5], radius=corner_radius, fill=255)
        
        gradient = Image.new("RGBA", (size, size))
        for y in range(size):
            for x in range(size):
                t = (x + y) / (2 * size)
                r = int(240 + t * (243 - 240))
                g = int(185 - t * (185 - 156))
                b = int(11 + t * (18 - 11))
                gradient.putpixel((x, y), (r, g, b, 255))
        
        img.paste(gradient, (0, 0), mask)
        
        # 2. Desenhar traçado do ícone activity (Lucide Activity) em #0b0e14
        draw = ImageDraw.Draw(img)
        pad = 32
        scale = (size - 2 * pad) / 24.0
        
        pts_24 = [
            (2.0, 12.0),
            (4.49, 12.0),
            (6.84, 20.36),
            (9.24, 2.18),
            (14.50, 20.36),
            (16.85, 12.0),
            (22.0, 12.0),
        ]
        
        pts_scaled = [(pad + x * scale, pad + y * scale) for x, y in pts_24]
        line_color = (11, 14, 20, 255)
        line_width = 17
        draw.line(pts_scaled, fill=line_color, width=line_width, joint="round")
        
        r_cap = line_width / 2.0
        for pt in [pts_scaled[0], pts_scaled[-1]]:
            draw.ellipse([pt[0] - r_cap, pt[1] - r_cap, pt[0] + r_cap, pt[1] + r_cap], fill=line_color)
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        static_dir = os.path.join(base_dir, "static")
        os.makedirs(static_dir, exist_ok=True)
        
        ico_static = os.path.join(static_dir, "favicon.ico")
        ico_root = os.path.join(base_dir, "favicon.ico")
        
        img.save(ico_static, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        img.save(ico_root, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        print(f"[*] Favicon gerado com sucesso em: {ico_static} e {ico_root}")
    except Exception as e:
        print("[!] Erro ao gerar favicon:", e)

generate_favicon()



def get_app_version():
    """Retorna o maior mtime dos arquivos estáticos e templates para LiveReload e cache-busting perfeitos."""
    max_mtime = SERVER_START_TIME
    base_dir = os.path.dirname(os.path.abspath(__file__))
    watch_dirs = [
        os.path.join(base_dir, "templates"),
        os.path.join(base_dir, "static", "js"),
        os.path.join(base_dir, "static", "css"),
    ]
    for d in watch_dirs:
        if os.path.exists(d):
            for root, _, files in os.walk(d):
                for f in files:
                    try:
                        max_mtime = max(max_mtime, os.path.getmtime(os.path.join(root, f)))
                    except OSError:
                        pass
    return max_mtime

client = BinanceClient()
whale_tracker = EtherscanWhaleTracker()
volatility_analyzer = VolatilityAnalyzer(client)
liquidity_analyzer = MarketLiquidityAnalyzer()

@app.route("/favicon.ico")
def favicon():
    """Serve o favicon.ico para navegadores e ferramentas externas."""
    return send_from_directory(os.path.join(app.root_path, "static"), "favicon.ico", mimetype="image/vnd.microsoft.icon")

@app.route("/")
def index():
    """Renderiza a página principal do terminal."""
    return render_template("index.html", version=int(get_app_version()))

@app.route("/data-analise")
@app.route("/data_analise.html")
@app.route("/data-analise.html")
@app.route("/analise")
def data_analise():
    """Renderiza o módulo extra de Análise de Dados e Volatilidade Histórica (Manhã, Tarde, Noite, etc.)."""
    return render_template("data_analise.html", version=int(get_app_version()))

@app.route("/liquidez")
@app.route("/liquidez.html")
def liquidez_page():
    """Renderiza o módulo de Monitoramento de Liquidez & Caça de Stops (ETHUSDT)."""
    return render_template("liquidez.html", version=int(get_app_version()))

@app.route("/api/liquidity/status")
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

@app.route("/api/analysis/volatility")
def api_volatility_analysis():
    """
    Executa a análise histórica de volatilidade por período (Manhã, Tarde, Noite, Madrugada).
    Suporta paginação histórica de até anos de candles de 1h ou outros timeframes.
    """
    symbol = request.args.get("symbol", "ETHUSDT").upper()
    interval = request.args.get("interval", "1h")
    start_date = request.args.get("start_date", None)
    end_date = request.args.get("end_date", None)
    try:
        years = float(request.args.get("years", 2.0))
    except (ValueError, TypeError):
        years = 2.0
        
    try:
        tz_offset = int(request.args.get("tz_offset", -3))
    except (ValueError, TypeError):
        tz_offset = -3

    try:
        data = volatility_analyzer.analyze_volatility(
            symbol=symbol,
            interval=interval,
            start_date_str=start_date,
            end_date_str=end_date,
            years=years,
            tz_offset_hours=tz_offset
        )
        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/api/analysis/export-csv")
def api_export_analysis_csv():
    """Exporta o relatório e todos os candles com métricas de período em formato CSV."""
    symbol = request.args.get("symbol", "ETHUSDT").upper()
    interval = request.args.get("interval", "1h")
    start_date = request.args.get("start_date", None)
    end_date = request.args.get("end_date", None)
    try:
        years = float(request.args.get("years", 2.0))
    except (ValueError, TypeError):
        years = 2.0

    try:
        tz_offset = int(request.args.get("tz_offset", -3))
    except (ValueError, TypeError):
        tz_offset = -3

    try:
        data = volatility_analyzer.analyze_volatility(
            symbol=symbol,
            interval=interval,
            start_date_str=start_date,
            end_date_str=end_date,
            years=years,
            tz_offset_hours=tz_offset
        )
        if not data.get("success"):
            return jsonify(data), 400

        output = io.StringIO()
        writer = csv.writer(output)
        
        # Cabeçalho dos Períodos
        writer.writerow(["=== RELATORIO ESTATISTICO DE VOLATILIDADE ==="])
        writer.writerow(["Par", symbol, "Intervalo", interval, "Fuso Horario", data["timezone"]["label"]])
        writer.writerow(["Data Inicial", data["date_range"]["start"], "Data Final", data["date_range"]["end"], "Total Candles", data["total_candles"]])
        writer.writerow([])
        writer.writerow(["Periodo", "Horario", "Candles", "Volatilidade Media (%)", "Volatilidade Mediana (%)", "Desvio Padrao (%)", "Volatilidade Max (%)", "Volume Total (USDT)", "Taxa Candles Alta (%)", "Retorno Medio (%)"])
        
        for p in data.get("periods", []):
            writer.writerow([
                p["name"],
                p["hours_range"],
                p["candle_count"],
                p["avg_volatility_pct"],
                p["median_volatility_pct"],
                p["std_dev_pct"],
                p["max_volatility_pct"],
                p["total_volume_usd"],
                p["win_rate_bullish_pct"],
                p["avg_return_pct"]
            ])

        writer.writerow([])
        writer.writerow(["=== RESUMO HORARIO (00h as 23h) ==="])
        writer.writerow(["Hora", "Volatilidade Media (%)", "Volume Medio (USDT)", "Qtd Candles"])
        for h in data.get("hours", []):
            writer.writerow([h["label"], h["avg_volatility_pct"], h["avg_volume_usd"], h["candle_count"]])

        writer.writerow([])
        writer.writerow(["=== TOP 10 MAIORES SPIKES DE VOLATILIDADE ==="])
        writer.writerow(["Data/Hora Local", "Data UTC", "Abertura", "Maxima", "Minima", "Fechamento", "Amplitude (%)", "Amplitude (USDT)", "Volume (USDT)", "Sentido"])
        for s in data.get("top_spikes", []):
            writer.writerow([
                s["datetime_local"], s["datetime_utc"], s["open"], s["high"], s["low"], s["close"],
                s["amplitude_pct"], s["amplitude_usd"], s["quote_volume"], s["direction"]
            ])

        output.seek(0)
        filename = f"Relatorio_Volatilidade_{symbol}_{interval}.csv"
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/analysis/upload-csv", methods=["POST"])
def api_upload_analysis_csv():
    """Recebe um arquivo CSV de candles e executa a análise de volatilidade imediatamente."""
    if "file" not in request.files:
        return jsonify({"success": False, "error": "Nenhum arquivo enviado."}), 400
    
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "Nome de arquivo vazio."}), 400

    try:
        content = file.read().decode("utf-8")
        tz_offset = int(request.form.get("tz_offset", -3))
        res = volatility_analyzer.analyze_from_csv(content, tz_offset_hours=tz_offset)
        return jsonify(res)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400

@app.route("/dev/version")
def dev_version():
    """Retorna o timestamp de modificação dos arquivos para LiveReload automático no navegador."""
    return jsonify({"server_start_time": get_app_version()})

@app.route("/api/health")
def health():
    """Health check do servidor Flask."""
    return jsonify({"status": "online", "service": "Flask Binance Market Terminal"})

@app.route("/api/price/<symbol>")
def get_price(symbol):
    """Retorna o preço mais recente do par."""
    try:
        data = client.get_price(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/ticker/<symbol>")
def get_ticker_24h(symbol):
    """Retorna estatísticas de 24 horas (máxima, mínima, variação, volume)."""
    try:
        data = client.get_24hr_ticker(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/klines/<symbol>")
def get_klines(symbol):
    """
    Retorna candles históricos.
    Parâmetros na query string: interval (ex: 15m), limit (ex: 500).
    """
    interval = request.args.get("interval", "15m")
    limit = int(request.args.get("limit", 500))
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

@app.route("/api/depth/<symbol>")
def get_depth(symbol):
    """Retorna o livro de ofertas (Order Book)."""
    limit = int(request.args.get("limit", 20))
    try:
        data = client.get_order_book(symbol.upper(), limit=limit)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/trades/<symbol>")
def get_trades(symbol):
    """Retorna trades recentes do par."""
    limit = int(request.args.get("limit", 30))
    try:
        trades = client.get_recent_trades(symbol.upper(), limit=limit)
        return jsonify(trades)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/indicators/<symbol>")
def get_indicators(symbol):
    """Calcula indicadores técnicos (EMA, RSI, Bollinger) no backend."""
    interval = request.args.get("interval", "15m")
    limit = int(request.args.get("limit", 100))
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

@app.route("/api/export/<symbol>")
def export_csv(symbol):
    """Exporta candles históricos diretamente como arquivo CSV para download."""
    interval = request.args.get("interval", "1h")
    count = int(request.args.get("count", 500))
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

@app.route("/api/whales")
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

@app.route("/api/whales/quota")
def get_whales_quota():
    """Retorna o consumo atual de requisições da chave Etherscan."""
    return jsonify(whale_tracker.get_api_quota())

LAYOUT_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terminal_layout.json")

def get_default_layout_settings():
    return {
        "version": "1.0",
        "lastUpdated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
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
        "markings": []
    }

@app.route("/api/settings", methods=["GET"])
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

@app.route("/api/settings", methods=["POST"])
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
        for key in ["chart", "spreads", "indicators", "views"]:
            if key in new_data and isinstance(new_data[key], dict):
                if key not in current_data:
                    current_data[key] = {}
                current_data[key].update(new_data[key])

        # Se markings vier no payload, substitui ou atualiza a lista
        if "markings" in new_data and isinstance(new_data["markings"], list):
            current_data["markings"] = new_data["markings"]

        current_data["version"] = new_data.get("version", current_data.get("version", "1.0"))
        current_data["lastUpdated"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

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

@app.route("/api/settings/reset", methods=["POST"])
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



if __name__ == "__main__":
    print("\n" + "="*60)
    print(" [>] Servidor Flask Binance Terminal Iniciado!")
    print(" [*] Acesse no seu navegador: http://127.0.0.1:5000")
    print(" [*] LiveReload Ativo: alteracoes em codigo ou telas recarregam em tempo real!")
    print("="*60 + "\n")

    # Monitorar alterações em templates HTML, CSS e JS para recarregamento instantâneo
    extra_files = []
    for folder in ["templates", "static"]:
        if os.path.exists(folder):
            for root, dirs, files in os.walk(folder):
                for f in files:
                    extra_files.append(os.path.join(root, f))

    app.run(host="127.0.0.1", port=5000, debug=True, extra_files=extra_files)
