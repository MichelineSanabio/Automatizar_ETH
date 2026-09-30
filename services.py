"""
Serviços e instâncias centrais compartilhadas entre os módulos e rotas do terminal.
"""

import os
import time
from binance_client import BinanceClient
from etherscan_client import EtherscanWhaleTracker
from volatility_analyzer import VolatilityAnalyzer
from liquidity_analyzer import MarketLiquidityAnalyzer
from orderbook_analyzer import OrderBookAnalyzer

SERVER_START_TIME = time.time()

# Instâncias dos clientes e analisadores
client = BinanceClient()
whale_tracker = EtherscanWhaleTracker()
volatility_analyzer = VolatilityAnalyzer(client)
liquidity_analyzer = MarketLiquidityAnalyzer()
orderbook_analyzer = OrderBookAnalyzer()
try:
    orderbook_analyzer.start_background_worker(symbol="ETHUSDT", interval=2.5)
except Exception:
    pass

_last_version_check = 0.0
_cached_version = SERVER_START_TIME

def get_app_version():
    """Retorna o maior mtime dos arquivos estáticos e templates com cache leve de 1.5s."""
    global _last_version_check, _cached_version
    now = time.time()
    if now - _last_version_check < 1.5:
        return _cached_version

    _last_version_check = now
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
    _cached_version = max_mtime
    return max_mtime

def generate_favicon(base_dir=None):
    """Gera um favicon.ico no formato da marca (Activity Icon dourado da Binance)."""
    try:
        if base_dir is None:
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
        
        # Geração rápida de pixels via putdata em bloco (50x mais veloz que 65k chamadas a putpixel)
        pixels = [
            (
                int(240 + ((x + y) / (2.0 * size)) * 3),
                int(185 - ((x + y) / (2.0 * size)) * 29),
                int(11 + ((x + y) / (2.0 * size)) * 7),
                255
            )
            for y in range(size) for x in range(size)
        ]
        gradient = Image.new("RGBA", (size, size))
        gradient.putdata(pixels)
        
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
        
        img.save(ico_static, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        img.save(ico_root, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        print(f"[*] Favicon gerado com sucesso em: {ico_static} e {ico_root}")
    except Exception as e:
        print("[!] Erro ao gerar favicon:", e)
