"""
Rotas da API de Análise de Volatilidade Estatística por Período e Exportação/Importação CSV.
"""

import io
import csv
from flask import Blueprint, jsonify, request, Response
from services import volatility_analyzer

volatility_bp = Blueprint("volatility", __name__)

@volatility_bp.route("/api/analysis/volatility")
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

@volatility_bp.route("/api/analysis/export-csv")
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

@volatility_bp.route("/api/analysis/upload-csv", methods=["POST"])
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
