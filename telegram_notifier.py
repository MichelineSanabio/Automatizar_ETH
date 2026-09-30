"""
telegram_notifier.py - Módulo de Notificações via Telegram
Implementa a classe TelegramProbabilityNotifier utilizando httpx assíncrono com connection pooling,
filtro de histerese (±10%), travas de cooldown (anti-spam de 60s), gatilhos de proximidade crítica,
evaporação de livro em 2.660 USDT e invalidação de queda com recálculo Fibonacci.
"""

import os
import time
import asyncio
import logging
import threading
from typing import Dict, Any, List, Optional, Set
from dotenv import load_dotenv

# Carrega variáveis do arquivo .env
load_dotenv()

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    import requests

logger = logging.getLogger("TelegramNotifier")

class TelegramProbabilityNotifier:
    """
    Gerenciador e cliente assíncrono de notificações de probabilidade e risco para o Telegram.
    Utiliza pooling assíncrono de conexões via httpx.AsyncClient e processamento em background.
    """

    def __init__(
        self,
        bot_token: Optional[str] = None,
        chat_id: Optional[str] = None,
        hysteresis_threshold: float = 10.0,
        cooldown_seconds: int = 60
    ):
        """
        :param bot_token: Token do bot obtido com o @BotFather.
        :param chat_id: ID numérico do usuário ou grupo no Telegram.
        :param hysteresis_threshold: Variação percentual mínima (em pontos percentuais) para disparar alerta.
        :param cooldown_seconds: Tempo mínimo de espera entre envios sucessivos para evitar rate-limit.
        """
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN") or ""
        self.chat_id = chat_id or os.getenv("TELEGRAM_CHAT_ID") or ""
        self.api_url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage" if self.bot_token else ""

        self.hysteresis_threshold = hysteresis_threshold
        self.cooldown_seconds = cooldown_seconds

        # Histórico da última probabilidade notificada por ordem
        self.last_notified_probs: Dict[str, float] = {}
        self.last_sent_timestamp = 0.0

        # Rate-limiting por categoria específica
        self.category_cooldowns: Dict[str, float] = {}

        # Histórico de proximidade e livro
        self.critical_proximity_alerted: Set[str] = set()
        self.wall_history: List[Dict[str, float]] = []
        self.last_evaporation_alert_time = 0.0
        self.pivot_alert_dispatched = False

        # Logs de auditoria interna
        self.notification_logs: List[Dict[str, Any]] = []

        # Cliente HTTP reutilizável com pooling assíncrono
        self._client: Optional[Any] = None

    @property
    def client(self):
        """Inicialização preguiçosa (lazy) do cliente httpx para respeitar o event loop ativo."""
        if self._client is None and HTTPX_AVAILABLE:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    def is_configured(self) -> bool:
        """Verifica se o token e o chat_id foram preenchidos no .env."""
        token = self.bot_token.strip()
        cid = self.chat_id.strip()
        return bool(token and cid and not token.startswith("sua_") and not cid.startswith("seu_"))

    async def _send_raw_message(self, text: str) -> bool:
        """Envia a requisição assíncrona para a API do Telegram utilizando httpx."""
        if not self.is_configured():
            log_entry = {
                "time": time.strftime("%H:%M:%S"),
                "status": "SIMULATED (Config pendente)",
                "preview": text.split("\n")[0]
            }
            self.notification_logs.append(log_entry)
            if len(self.notification_logs) > 30:
                self.notification_logs.pop(0)
            logger.info(f"[AVISO TELEGRAM] Config pendente no .env: {log_entry['preview']}")
            return False

        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True
        }

        # Atualiza a URL caso o token tenha sido definido após a inicialização
        api_url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"

        try:
            if HTTPX_AVAILABLE and self.client:
                response = await self.client.post(api_url, json=payload)
                response.raise_for_status()
            else:
                import requests
                response = requests.post(api_url, json=payload, timeout=5.0)
                response.raise_for_status()

            log_entry = {
                "time": time.strftime("%H:%M:%S"),
                "status": "SENT",
                "preview": text.split("\n")[0]
            }
            self.notification_logs.append(log_entry)
            return True
        except Exception as exc:
            logger.error(f"[ERRO TELEGRAM] Falha no envio: {exc}")
            return False

    def send_message_async(self, text: str, category: str = "general") -> bool:
        """
        Dispara o envio de mensagem em background.
        Pode ser chamado de código síncrono ou assíncrono sem nunca bloquear a UI.
        """
        now = time.time()
        last_cat = self.category_cooldowns.get(category, 0.0)

        # Checagem de rate-limiting (mínimo 60s por categoria)
        if (now - last_cat) < self.cooldown_seconds:
            return False

        self.category_cooldowns[category] = now
        self.last_sent_timestamp = now

        def _runner():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._send_raw_message(text))
                loop.close()
            except Exception as e:
                logger.error(f"[Telegram Runner] Erro: {e}")

        # Se já estivermos em uma thread assíncrona com loop rodando
        try:
            active_loop = asyncio.get_running_loop()
            if active_loop.is_running():
                asyncio.create_task(self._send_raw_message(text))
                return True
        except RuntimeError:
            pass

        # Disparo seguro em thread separada
        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        return True

    async def avaliar_e_notificar(
        self,
        current_probs: Dict[str, float],
        eth_price: float,
        btc_price: float,
        eth_btc: float,
        fator_ativador: str = ""
    ):
        """
        Avalia as probabilidades atuais contra o último histórico.
        Se qualquer ordem tiver variação >= hysteresis_threshold (10%),
        formata a mensagem e agenda o disparo assíncrono via httpx.
        """
        agora = time.time()

        # 1. Trava de Cooldown (Anti-spam)
        if agora - self.last_sent_timestamp < self.cooldown_seconds:
            return

        ordens_com_mudanca = {}
        houve_disparo = False

        # 2. Avaliação de Histerese de 10%
        for ordem_id, prob_atual in current_probs.items():
            prob_anterior = self.last_notified_probs.get(ordem_id)

            if prob_anterior is None:
                # Primeira medição: registra a base inicial sem spammar alerta
                self.last_notified_probs[ordem_id] = prob_atual
                continue

            delta = prob_atual - prob_anterior

            # Checa se ultrapassou o limiar de histerese (ex: de 70% foi para 81% ou caiu para 59%)
            if abs(delta) >= self.hysteresis_threshold:
                houve_disparo = True
                sinal = "+" if delta > 0 else ""
                ordens_com_mudanca[ordem_id] = f"{prob_atual:.1f}% ({sinal}{delta:.1f}%)"
                # Atualiza a referência de histerese
                self.last_notified_probs[ordem_id] = prob_atual
            else:
                ordens_com_mudanca[ordem_id] = f"{prob_atual:.1f}% (Estável)"

        # 3. Se atingiu o limiar de histerese, monta e envia a notificação
        if houve_disparo:
            linhas_ordens = []
            for ordem_id, status_str in ordens_com_mudanca.items():
                linhas_ordens.append(f"▫️ {ordem_id}: {status_str}")

            bloco_ordens = "\n".join(linhas_ordens)

            mensagem = (
                f"🚨 *[ALERTA ETH/USDT - VARIAÇÃO DE PROBABILIDADE]*\n\n"
                f"💰 *Preço Atual ETH:* ${eth_price:,.2f} USDT\n"
                f"🪙 *BTC:* ${btc_price:,.2f} USDT | *ETH/BTC:* {eth_btc:.5f}\n\n"
                f"📊 *Probabilidades de Execução:*\n"
                f"{bloco_ordens}\n\n"
                f"⚠️ *Fator:* {fator_ativador or 'Deslocamento de volatilidade nas médias'}"
            )

            # Executa o envio em background para não congelar o loop principal da tela
            self.send_message_async(mensagem, category="prob_variation")
            self.last_sent_timestamp = agora

    def check_and_notify(self, state: Dict[str, Any]):
        """
        Método de alta conveniência chamado pelo motor quantitativo.
        Avalia o estado completo e aciona as rotinas:
        - Variação de probabilidade (histerese ±10%)
        - Proximidade crítica (<= 1.0%)
        - Evaporação de livro (spoofing em 2.660 USDT)
        - Invalidação de queda (pivô de alta Fibonacci)
        """
        prices = state.get("prices", {})
        eth = prices.get("eth", 0.0)
        btc = prices.get("btc", 0.0)
        ethbtc = prices.get("ethbtc", 0.0)
        orders = state.get("order_probabilities", [])
        pivot = state.get("pivot_and_entries", {})
        book_wall = state.get("book_wall", {})

        if eth <= 0 or not orders:
            return

        # 1. Avalia Variação de Probabilidade com Histerese de 10%
        probs_dict = {
            f"{o.get('name', 'Ordem')} ({o.get('price_usdt', 0):,.0f} USDT)": float(o.get("prob_pct", 50.0))
            for o in orders
        }
        
        fator = "Oscilação de volatilidade e ajuste de densidade do book."
        if btc < 82500:
            fator = f"BTC abaixo de 82.500 USDT (${btc:,.2f}) testando EMA 25."
        elif ethbtc < 0.03220:
            fator = f"ETH/BTC em {ethbtc:.5f} (pressão vendedora na paridade)."

        # Aciona avaliar_e_notificar
        asyncio_probs_eval = False
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                asyncio.create_task(self.avaliar_e_notificar(probs_dict, eth, btc, ethbtc, fator))
                asyncio_probs_eval = True
        except RuntimeError:
            pass

        if not asyncio_probs_eval:
            self._avaliar_histerese_sync(probs_dict, eth, btc, ethbtc, fator)

        # 2. Avalia Proximidade Crítica (<= 1.0%)
        self._check_critical_proximity(eth, orders)

        # 3. Avalia Evaporação de Livro em 2.660 USDT (Risco de Spoofing)
        self._check_book_wall_evaporation(eth, book_wall)

        # 4. Avalia Invalidação de Queda / Pivô de Alta Fibonacci
        self._check_pivot_invalidation(pivot, eth, btc)

    def _avaliar_histerese_sync(
        self,
        current_probs: Dict[str, float],
        eth_price: float,
        btc_price: float,
        eth_btc: float,
        fator_ativador: str = ""
    ):
        """Avaliação de histerese compatível com execução síncrona."""
        agora = time.time()
        last_prob_sent = self.category_cooldowns.get("prob_variation", 0.0)
        if agora - last_prob_sent < self.cooldown_seconds:
            return

        ordens_com_mudanca = {}
        houve_disparo = False

        for ordem_id, prob_atual in current_probs.items():
            prob_anterior = self.last_notified_probs.get(ordem_id)
            if prob_anterior is None:
                self.last_notified_probs[ordem_id] = prob_atual
                continue

            delta = prob_atual - prob_anterior
            if abs(delta) >= self.hysteresis_threshold:
                houve_disparo = True
                sinal = "+" if delta > 0 else ""
                ordens_com_mudanca[ordem_id] = f"{prob_atual:.1f}% ({sinal}{delta:.1f}%)"
                self.last_notified_probs[ordem_id] = prob_atual
            else:
                ordens_com_mudanca[ordem_id] = f"{prob_atual:.1f}% (Estável)"

        if houve_disparo:
            linhas_ordens = [f"▫️ {oid}: {st}" for oid, st in ordens_com_mudanca.items()]
            mensagem = (
                f"🚨 *[ALERTA ETH/USDT - VARIAÇÃO DE PROBABILIDADE]*\n\n"
                f"💰 *Preço Atual ETH:* ${eth_price:,.2f} USDT\n"
                f"🪙 *BTC:* ${btc_price:,.2f} USDT | *ETH/BTC:* {eth_btc:.5f}\n\n"
                f"📊 *Probabilidades de Execução:*\n"
                + "\n".join(linhas_ordens) + "\n\n"
                f"⚠️ *Fator:* {fator_ativador or 'Deslocamento de volatilidade nas médias'}"
            )
            self.send_message_async(mensagem, category="prob_variation")

    def _check_critical_proximity(self, current_eth: float, orders: List[Dict[str, Any]]):
        """Notifica quando o preço atual entra na faixa de tolerância de 1.0% de qualquer ordem limite."""
        for o in orders:
            order_id = o.get("id") or o.get("name")
            target_price = float(o.get("price_usdt") or o.get("price", 0))
            if target_price <= 0:
                continue

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
                self.critical_proximity_alerted.discard(order_id)

    def _check_book_wall_evaporation(self, current_eth: float, book_wall: Dict[str, Any]):
        """Detecta se o paredão em 2.660 USDT perdeu >50% do seu volume em menos de 10s próximo ao preço."""
        current_vol = float(book_wall.get("wall_size_eth", 2413.0))
        wall_price = float(book_wall.get("wall_price_usdt", 2660.0))
        now = time.time()

        self.wall_history.append({"time": now, "vol": current_vol})
        self.wall_history = [item for item in self.wall_history if (now - item["time"]) <= 15.0]

        if len(self.wall_history) >= 2:
            oldest = self.wall_history[0]
            elapsed = now - oldest["time"]
            initial_vol = oldest["vol"]

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
                            f"⚠️ *Alerta Quantitativo:* Risco severo de spoofing e abertura de vácuo de liquidez até 2.500 USDT!"
                        )
                        self.send_message_async(msg, category="wall_evaporation")

    def _check_pivot_invalidation(self, pivot: Dict[str, Any], eth: float, btc: float):
        """Notifica quando ocorre invalidação da queda (Pivô de Alta Estrutural confirmado)."""
        is_pivot = pivot.get("pivot_confirmed", False)

        if is_pivot and not self.pivot_alert_dispatched:
            self.pivot_alert_dispatched = True
            entries = pivot.get("dynamic_entries", [])
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
                f"1️⃣ *Alvo 1:* $4.200,00 USDT (35%)\n"
                f"2️⃣ *Alvo 2 (Fib 1.272):* $5.930,00 USDT (40%)\n"
                f"3️⃣ *Alvo 3 (Fib 1.618):* $7.165,00 USDT (25%)"
            )
            self.send_message_async(msg, category="pivot_invalidation")
        elif not is_pivot:
            self.pivot_alert_dispatched = False

    async def fechar(self):
        """Fecha o pool de conexões HTTP ao encerrar a aplicação."""
        if self._client:
            await self._client.aclose()
            self._client = None

# Aliases para compatibilidade total
TelegramAlertManager = TelegramProbabilityNotifier
telegram_notifier = TelegramProbabilityNotifier()
