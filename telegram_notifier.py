"""
telegram_notifier.py - Módulo de Notificações via Telegram
Alertas em tempo real de probabilidade de ordens limite, proximidade crítica (<= 1%),
evaporação de livro (spoofing em 2.660 USDT) e invalidação de tendência (pivô de alta Fibonacci).
Executa requisições HTTP assíncronas em background sem travar a interface Live do console ou o Flask.
"""

import os
import time
import json
import logging
import threading
from typing import Dict, Any, List, Optional, Set
import requests

logger = logging.getLogger("TelegramNotifier")

def load_env_file():
    """Carrega variáveis do arquivo .env se não estiverem no ambiente."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip()
                        if k and not os.environ.get(k):
                            os.environ[k] = v
        except Exception:
            pass

load_env_file()

class TelegramAlertManager:
    """Gerenciador de regras e disparos de alertas quantitativos para Telegram."""

    def __init__(self):
        self.bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        self.chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

        # Controle de rate-limiting (mínimo 60s por categoria)
        self.last_sent_timestamps: Dict[str, float] = {}
        self.rate_limit_seconds = 60.0

        # Memória para Histerese e detecção de variações
        self.last_order_probabilities: Dict[str, float] = {}
        self.critical_proximity_alerted: Set[str] = set()
        
        # Histórico de volume do paredão 2.660 USDT (para detecção de evaporação < 10s)
        self.wall_history: List[Dict[str, float]] = []
        self.last_evaporation_alert_time = 0.0

        # Controle de alerta de pivô de alta (para disparar 1 única vez por ciclo de reversão)
        self.pivot_alert_dispatched = False

        # Logs internos do bot
        self.notification_logs: List[Dict[str, Any]] = []

    def is_configured(self) -> bool:
        """Verifica se o token e o chat_id foram preenchidos."""
        return bool(self.bot_token and self.chat_id and not self.bot_token.startswith("sua_") and not self.chat_id.startswith("seu_"))

    def send_message_async(self, text: str, category: str = "general") -> bool:
        """
        Dispara o envio de mensagem em background (thread separada).
        Nunca bloqueia a renderização em tempo real do terminal (rich.live) nem o Flask.
        Aplica filtro de rate-limiting de 60 segundos por categoria.
        """
        now = time.time()
        last_sent = self.last_sent_timestamps.get(category, 0.0)

        # Checagem de rate-limiting por categoria (máximo 1 alerta a cada 60s por tipo)
        if (now - last_sent) < self.rate_limit_seconds:
            logger.debug(f"[Telegram] Rate-limit ativo para categoria '{category}'. Aguardando cooldown.")
            return False

        self.last_sent_timestamps[category] = now

        # Grava log na fila local
        log_entry = {
            "time": time.strftime("%H:%M:%S"),
            "category": category,
            "status": "SENT" if self.is_configured() else "SIMULATED (Config pendente)",
            "preview": text.split("\n")[0]
        }
        self.notification_logs.append(log_entry)
        if len(self.notification_logs) > 30:
            self.notification_logs.pop(0)

        if not self.is_configured():
            logger.info(f"[Telegram] [SIMULADO - Token não configurado] {log_entry['preview']}")
            return True

        # Dispara envio HTTP assíncrono em thread
        thread = threading.Thread(
            target=self._send_http_request,
            args=(text,),
            daemon=True,
            name=f"TelegramSendThread-{category}"
        )
        thread.start()
        return True

    def _send_http_request(self, text: str):
        """Executa a requisição POST para a API do Telegram."""
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True
        }
        try:
            res = requests.post(url, json=payload, timeout=8)
            if not res.ok:
                logger.warning(f"[Telegram] Erro na API do Telegram (HTTP {res.status_code}): {res.text}")
        except Exception as e:
            logger.error(f"[Telegram] Falha de conexão ao enviar alerta: {e}")

    # -------------------------------------------------------------------------
    # REGRAS DE DISPARO DE GATILHOS
    # -------------------------------------------------------------------------
    def check_and_notify(self, state: Dict[str, Any]):
        """
        Avalia o estado quantitativo consolidado e aciona as regras de notificação:
        1. Variação Significativa de Probabilidade (>= 10%)
        2. Proximidade Crítica (<= 1,0%)
        3. Evaporação do Livro (Spoofing em 2.660 USDT)
        4. Invalidação de Queda / Pivô de Alta Fibonacci
        """
        prices = state.get("prices", {})
        eth = prices.get("eth", 0.0)
        btc = prices.get("btc", 0.0)
        ethbtc = prices.get("ethbtc", 0.0)
        orders = state.get("order_probabilities", [])
        pivot = state.get("pivot_and_entries", {})
        book_wall = state.get("book_wall", {})

        if eth <= 0:
            return

        # 1. GATILHO DE PROXIMIDADE CRÍTICA (<= 1.0%)
        self._check_critical_proximity(eth, orders)

        # 2. GATILHO DE VARIAÇÃO SIGNIFICATIVA DE PROBABILIDADE (>= 10%)
        self._check_probability_variation(eth, btc, ethbtc, orders, state)

        # 3. GATILHO DE EVAPORAÇÃO DO LIVRO EM 2.660 USDT (RISCO DE SPOOFING)
        self._check_book_wall_evaporation(eth, book_wall)

        # 4. GATILHO DE INVALIDAÇÃO DE QUEDA (PIVÔ DE ALTA CONFIRMADO)
        self._check_pivot_invalidation(pivot, eth, btc)

    def _check_critical_proximity(self, current_eth: float, orders: List[Dict[str, Any]]):
        """Notifica quando o preço atual entra na faixa de tolerância de 1.0% de qualquer ordem limite."""
        for o in orders:
            order_id = o.get("id") or o.get("name")
            target_price = float(o.get("price_usdt") or o.get("price", 0))
            if target_price <= 0:
                continue

            # Distância percentual positiva quando preço está acima do alvo de compra
            diff_pct = ((current_eth - target_price) / current_eth) * 100

            if 0.0 <= diff_pct <= 1.0:
                if order_id not in self.critical_proximity_alerted:
                    self.critical_proximity_alerted.add(order_id)
                    msg = (
                        f"⚡ *[ALERTA MÁXIMO - PROXIMIDADE CRÍTICA]*\n"
                        f"O preço do ETH acaba de entrar na faixa de tolerância de *1,0%*!\n\n"
                        f"🎯 *{o.get('name', 'Ordem')}*: ${target_price:,.2f} USDT\n"
                        f"💰 *Qtd/Montante*: {o.get('size_str', '')}\n"
                        f"📉 *Preço Atual*: ${current_eth:,.2f} USDT (Distância: -{diff_pct:.2f}%)\n"
                        f"📌 *Confluência*: {o.get('confluence', '')}\n\n"
                        f"⏰ _Prepare-se para execução na Binance (status PENDING)._"
                    )
                    self.send_message_async(msg, category=f"proximity_{order_id}")
            elif diff_pct > 2.5:
                # Libera o gatilho se o preço se afastar novamente (histerese)
                self.critical_proximity_alerted.discard(order_id)

    def _check_probability_variation(self, eth: float, btc: float, ethbtc: float, orders: List[Dict[str, Any]], state: Dict[str, Any]):
        """Dispara alerta sempre que a probabilidade oscilar mais de ±10% em relação ao último alerta."""
        has_significant_change = False
        prob_lines = []

        for o in orders:
            name = o.get("name", "Ordem")
            price = float(o.get("price_usdt", 0))
            prob = float(o.get("prob_pct", 50.0))
            last_prob = self.last_order_probabilities.get(name)

            if last_prob is not None:
                delta = prob - last_prob
                if abs(delta) >= 10.0:
                    has_significant_change = True
                
                delta_str = f"{delta:+.1f}%" if delta != 0 else "Estável"
            else:
                delta_str = "Inicial"

            prob_lines.append(f"▫️ *{name}* ({price:,.2f} USDT): *{prob:.1f}%* ({delta_str})")

        if has_significant_change:
            # Atualiza referências
            for o in orders:
                self.last_order_probabilities[o.get("name", "Ordem")] = float(o.get("prob_pct", 50.0))

            # Identificar fator ativador predominante
            fator_msg = "Oscilação de volatilidade e ajuste de densidade do book."
            if btc < 82500:
                fator_msg = f"BTC perdeu suporte de 82.500 USDT (${btc:,.2f}) e testando EMA 25."
            elif ethbtc < 0.03220:
                fator_msg = f"ETH/BTC em {ethbtc:.5f} (pressão vendedora na paridade)."

            msg = (
                f"🚨 *[ALERTA ETH/USDT - VARIAÇÃO DE PROBABILIDADE]*\n"
                f"*Preço Atual:* ${eth:,.2f} USDT | *BTC:* ${btc:,.2f} | *ETH/BTC:* {ethbtc:.5f}\n\n"
                f"📊 *Probabilidades de Execução:*\n"
                + "\n".join(prob_lines) + "\n\n"
                f"⚠️ *Fator Ativador:* {fator_msg}"
            )
            self.send_message_async(msg, category="prob_variation")
        elif not self.last_order_probabilities:
            # Armazena estado inicial silenciosamente
            for o in orders:
                self.last_order_probabilities[o.get("name", "Ordem")] = float(o.get("prob_pct", 50.0))

    def _check_book_wall_evaporation(self, current_eth: float, book_wall: Dict[str, Any]):
        """Detecta se o paredão em 2.660 USDT perdeu >50% do seu volume em menos de 10s próximo ao preço."""
        current_vol = float(book_wall.get("wall_size_eth", 2413.0))
        wall_price = float(book_wall.get("wall_price_usdt", 2660.0))
        now = time.time()

        self.wall_history.append({"time": now, "vol": current_vol})
        # Mantém histórico dos últimos 15 segundos
        self.wall_history = [item for item in self.wall_history if (now - item["time"]) <= 15.0]

        if len(self.wall_history) >= 2:
            oldest = self.wall_history[0]
            elapsed = now - oldest["time"]
            initial_vol = oldest["vol"]

            # Se o volume inicial era alto (~2400 ETH) e caiu mais de 50% em até 10 segundos
            if elapsed <= 10.0 and initial_vol > 1500.0:
                drop_ratio = (initial_vol - current_vol) / initial_vol
                if drop_ratio >= 0.50 and abs(current_eth - wall_price) < 40.0:
                    if (now - self.last_evaporation_alert_time) > 120.0:
                        self.last_evaporation_alert_time = now
                        msg = (
                            f"🐋 *[ALERTA URGENTE - EVAPORAÇÃO DE LIVRO / SPOOFING]*\n"
                            f"Paredão institucional em *${wall_price:,.2f} USDT* perdeu mais de 50% do volume!\n\n"
                            f"📉 *Volume Original:* {initial_vol:,.0f} ETH ➔ *Atual:* {current_vol:,.0f} ETH\n"
                            f"⏱️ *Tempo de Queda:* {elapsed:.1f} segundos\n"
                            f"⚠️ *Alerta Quantitativo:* Risco severo de spoofing (cancelamento de ordens falsas) "
                            f"e abertura de vácuo de liquidez até 2.500 USDT!"
                        )
                        self.send_message_async(msg, category="wall_evaporation")

    def _check_pivot_invalidation(self, pivot: Dict[str, Any], eth: float, btc: float):
        """Notifica quando ocorre invalidação da queda (Pivô de Alta Estrutural confirmado)."""
        is_pivot = pivot.get("pivot_confirmed", False)

        if is_pivot and not self.pivot_alert_dispatched:
            self.pivot_alert_dispatched = True
            entries = pivot.get("dynamic_entries", [])
            targets = pivot.get("targets", [])

            p1 = entries[0]["price_usdt"] if len(entries) > 0 else 2680.0
            p2 = entries[1]["price_usdt"] if len(entries) > 1 else 2640.0
            p3 = entries[2]["price_usdt"] if len(entries) > 2 else 2725.0

            msg = (
                f"🚀 *[ALERTA - PIVÔ DE ALTA ESTRUTURAL CONFIRMADO]*\n"
                f"O movimento de correção foi invalidado com fechamento institucional acima dos níveis chave!\n"
                f"*ETH Atual:* ${eth:,.2f} USDT | *BTC:* ${btc:,.2f} USDT\n\n"
                f"🛑 *Ação Recomendada:* Desarmar ordens limite na base profunda (2.530 / 2.480 USDT).\n\n"
                f"📈 *Novas Entradas Dinâmicas (Fibonacci / Pullback):*\n"
                f"▫️ *Nível 1 (Pullback 0.382):* ${p1:,.2f} USDT (30% capital)\n"
                f"▫️ *Nível 2 (Golden Pocket 0.618):* ${p2:,.2f} USDT (45% capital)\n"
                f"▫️ *Nível 3 (Reteste 2.720-2.730):* ${p3:,.2f} USDT (25% capital)\n\n"
                f"🎯 *Alvos de Realização Proporcional:*\n"
                f"1️⃣ *Alvo 1:* $4.200,00 USDT (35% saída)\n"
                f"2️⃣ *Alvo 2 (Fib 1.272):* $5.930,00 USDT (40% saída)\n"
                f"3️⃣ *Alvo 3 (Fib 1.618):* $7.165,00 USDT (25% saída)"
            )
            self.send_message_async(msg, category="pivot_invalidation")
        elif not is_pivot:
            # Reseta estado quando o pivô não está mais ativo
            self.pivot_alert_dispatched = False

# Instância Singleton do Notifier
telegram_notifier = TelegramAlertManager()
