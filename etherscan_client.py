"""
Etherscan API Client (V2) - Rastreador de Baleias (Whale Tracker)
Respeita estritamente o plano gratuito:
 - Limite: máx 3 chamadas/segundo (throttle interno de 400ms entre requisições)
 - Limite diário: até 100.000 chamadas/dia
 - Otimizado com batch 'balancemulti' (até 20 endereços por chamada -> 50 endereços = apenas 3 chamadas!)
 - Sistema de Cache em memória com TTL de 5 minutos para economizar chamadas.
"""

import json
import time
import os
from datetime import datetime, timezone
import urllib.request
import urllib.parse
import urllib.error

class EtherscanWhaleTracker:
    # Etherscan V2 endpoint
    BASE_URL = "https://api.etherscan.io/v2/api"
    CHAIN_ID = 1  # Ethereum Mainnet
    DEFAULT_API_KEY = os.getenv("ETHERSCAN_API_KEY", "313HF7ST9FPPYVEBDGCXK2MT78TRCWG8QQ")
    CACHE_TTL_SECONDS = 300  # 5 minutos de cache em memória
    MIN_REQUEST_INTERVAL = 0.40  # 400ms (máx 2.5 req/s, bem abaixo do limite de 3 req/s)

    # 50 Maiores Carteiras e Entidades Conhecidas do Ethereum
    TOP_WHALE_ENTITIES = [
        {"address": "0x00000000219ab540356cbb839cbe05303d7705fa", "name": "Beacon Deposit Contract", "category": "Staking", "desc": "Contrato oficial de staking do Ethereum Proof-of-Stake"},
        {"address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "name": "Wrapped Ether (WETH)", "category": "DeFi", "desc": "Contrato canônico de WETH usado em DEXs e DeFi"},
        {"address": "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8", "name": "Binance 7 (Cold Storage)", "category": "Exchange", "desc": "Carteira fria principal de ETH da Binance"},
        {"address": "0x40b38765696e3d5d8d9d834d8aad4bb6e418e489", "name": "Robinhood 1", "category": "Exchange", "desc": "Custódia de Ethereum dos usuários da Robinhood"},
        {"address": "0x49048044d57e1c92a77f79988d21fa8faf74e97e", "name": "Coinbase: Cold Storage", "category": "Exchange", "desc": "Carteira fria institucional da Coinbase"},
        {"address": "0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a", "name": "Arbitrum One: Bridge", "category": "Bridge", "desc": "Ponte oficial de ETH bloqueado na L2 Arbitrum"},
        {"address": "0x742d35cc6634c0532925a3b844bc454e4438f44e", "name": "Bitfinex 1", "category": "Exchange", "desc": "Carteira de reserva da corretora Bitfinex"},
        {"address": "0x28c6c06298d514db089934071355e5743bf21d60", "name": "Binance 14", "category": "Exchange", "desc": "Carteira operacional de liquidez da Binance"},
        {"address": "0x220866b1a2219f40e72f5c628b65d54268ca3a9d", "name": "Vitalik Buterin (vb.eth)", "category": "Whale", "desc": "Carteira pública do co-fundador do Ethereum"},
        {"address": "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae", "name": "Ethereum Foundation", "category": "Foundation", "desc": "Tesouraria oficial da Fundação Ethereum"},
        {"address": "0x3bfc20f0b9afcace800d73d2191166ff16540258", "name": "Kraken 1", "category": "Exchange", "desc": "Carteira de custódia da exchange Kraken"},
        {"address": "0xd3a22590f8243f8e83ac230d1842c9af0404c4a1", "name": "Gemini 4", "category": "Exchange", "desc": "Carteira fria da exchange Gemini (Winklevoss)"},
        {"address": "0x8103683202aa8da10536036edef04cdd865c225e", "name": "OKX: Hot Wallet", "category": "Exchange", "desc": "Carteira de processamento de saques da OKX"},
        {"address": "0x5a52e96bacdabb82fd05763e25335261b270efcb", "name": "Binance 8", "category": "Exchange", "desc": "Carteira de custódia e depósitos da Binance"},
        {"address": "0xbeb5fc579115071764c7423a4f12edde41f106ed", "name": "Bitfinex: Cold Storage", "category": "Exchange", "desc": "Carteira fria de segurança da Bitfinex"},
        {"address": "0x0a4c79ce84202b03e95b7a692e5d728d83c44c76", "name": "Optimism: Portal (Bridge)", "category": "Bridge", "desc": "Ponte de depósito da rede L2 OP Mainnet"},
        {"address": "0xf977814e90da44bfa03b6295a0616a897441acec", "name": "Binance 9", "category": "Exchange", "desc": "Hot wallet de alta movimentação da Binance"},
        {"address": "0x539c92186f7c6cc4cbf443f26ef84c595babbca1", "name": "Upbit Cold Storage", "category": "Exchange", "desc": "Maior corretora da Coreia do Sul (Upbit)"},
        {"address": "0x2b6ed29a95753c3ad948348e3e7b1a251080ffb9", "name": "Lido: Execution Layer Vault", "category": "Staking", "desc": "Cofre de recompensas e staking do protocolo Lido"},
        {"address": "0xbfbbfaccd1126a11b8f84c60b09859f80f3bd10f", "name": "Bybit Cold Wallet", "category": "Exchange", "desc": "Reserva de ETH da Bybit"},
        {"address": "0x868dab0b8e21ec0a48b726a1ccf25826c78c6d7f", "name": "Polygon: PoS Bridge", "category": "Bridge", "desc": "Contrato de ponte de ativos para a rede Polygon"},
        {"address": "0x1b3cb81e51011b549d78bf720b0d924ac763a7c2", "name": "Jump Trading (Whale)", "category": "Whale", "desc": "Formador de mercado e fundo quantitativo institucional"},
        {"address": "0x73af3bcf944a6559933396c1577b257e2054d935", "name": "Wintermute Trading", "category": "Whale", "desc": "Grande mesa de trading algorítmico e market making"},
        {"address": "0x866c9a77d8ab71d2874703e80cb7ad809b301e8e", "name": "Genesis Trading", "category": "Institutional", "desc": "Carteira de mesa institucional OTC de empréstimos"},
        {"address": "0x15c22df3e71e7380012668fb837c537d0f8b38a1", "name": "Compound: cETH", "category": "DeFi", "desc": "Contrato de empréstimos e rendimento Compound Finance"},
        {"address": "0x0bd48f6b86a26d3a217d0fa6ffe2b491b956a7a2", "name": "Bithumb Cold Wallet", "category": "Exchange", "desc": "Carteira de segurança da sul-coreana Bithumb"},
        {"address": "0x17e5545b11b468072283cee1f066a059fb0dbf24", "name": "Crypto.com 1", "category": "Exchange", "desc": "Carteira fria principal da Crypto.com"},
        {"address": "0xafcd96e580138cfa2332c632e66308eacd45c5da", "name": "Gate.io 1", "category": "Exchange", "desc": "Carteira de depósitos e reserva da Gate.io"},
        {"address": "0x9c22a4039f269e72de6b029b273be059cdbb831c", "name": "KuCoin 6", "category": "Exchange", "desc": "Carteira operacional de ETH da KuCoin"},
        {"address": "0xbf3aeb96e164ae67e763d9e050ff124e7c3fdd28", "name": "Poloniex Cold Storage", "category": "Exchange", "desc": "Carteira fria histórica da exchange Poloniex"},
        {"address": "0x94dbf04e273d87e6d9bed68c616f43bf86560c74", "name": "HTX / Huobi 1", "category": "Exchange", "desc": "Carteira de reservas da HTX (antiga Huobi)"},
        {"address": "0x7bbfaa2f8b2d2a613b4439be3428dfbf0f405390", "name": "Cumberland (DRW)", "category": "Whale", "desc": "Braço de trading de criptoativos do grupo DRW"},
        {"address": "0x5b5b69f4e0add2df5d2176d7dbd20b4897bc7ec4", "name": "Paradigm Capital", "category": "Fund", "desc": "Fundo de capital de risco e investimentos Web3"},
        {"address": "0x2f2d854c1d6d5bb8936bb85bc07c28ebb42c9b10", "name": "Aave V3: Pool", "category": "DeFi", "desc": "Pool de liquidez descentralizada do protocolo Aave"},
        {"address": "0x109be9d7d5f64c8c391ced3a8f69bdef20fcaea9", "name": "Uniswap V3: Factory", "category": "DeFi", "desc": "Contrato de governança e liquidez da Uniswap"},
        {"address": "0xa023f08c70a23abc7edfc5b6b5e171d78dfc947e", "name": "Nexo: Hot Wallet", "category": "Exchange", "desc": "Carteira de processamento de custódia Nexo"},
        {"address": "0xc882b111a75c0c657fc507c04fbfcd2cc984f071", "name": "Binance US Cold", "category": "Exchange", "desc": "Reserva de Ethereum da divisão Binance US"},
        {"address": "0xb5ab08d153218c1a6a5318b14eeb92df0fb168d6", "name": "Bitstamp 1", "category": "Exchange", "desc": "Carteira de custódia regulada da Bitstamp"},
        {"address": "0x8484ef722627bf18ca5ae6bcf031c23e6e922b30", "name": "StarkNet: StarkGate", "category": "Bridge", "desc": "Ponte de depósito da rede ZK-Rollup StarkNet"},
        {"address": "0xd47b4a4c6207b1ee0eb1dd4e5c46a19b50fec00b", "name": "Base: Portal Bridge", "category": "Bridge", "desc": "Ponte oficial da rede L2 Base (Coinbase)"},
        {"address": "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", "name": "Binance 32", "category": "Exchange", "desc": "Carteira fria secundária da Binance"},
        {"address": "0x61edcdf5bb737adffe5043706e7c5bb1f1a56eea", "name": "Amber Group", "category": "Fund", "desc": "Baleia institucional e formadora de liquidez"},
        {"address": "0x8d0bb74e37ab644964aca2f3fbe12b9147f9d841", "name": "Coinbase 2", "category": "Exchange", "desc": "Carteira operacional de saques da Coinbase"},
        {"address": "0xa6dfb62fc572da152a335384f7724535b9defc84", "name": "MEXC Global", "category": "Exchange", "desc": "Carteira fria da exchange MEXC"},
        {"address": "0xca8fa8f0b631ecdb18cda619c4fc9d197c8affca", "name": "Galaxy Digital", "category": "Fund", "desc": "Fundo de ativos digitais de Mike Novogratz"},
        {"address": "0xc61b9bb3a7a0767e3179713f3a5c7a9aedce193c", "name": "Circle: Treasury", "category": "DeFi", "desc": "Tesouraria da emissora do USDC (Circle)"},
        {"address": "0xe92d1a43df510f82c66382592a047d288f85226f", "name": "Coincheck", "category": "Exchange", "desc": "Carteira da corretora japonesa Coincheck"},
        {"address": "0x0e58e8993100f1cbe45376c410f97f4893d9bfcd", "name": "Bitget: Cold Storage", "category": "Exchange", "desc": "Carteira fria de segurança da Bitget"},
        {"address": "0x64ff637fb478863b7468bc97d30a5bf3a428a1fd", "name": "Pantera Capital", "category": "Fund", "desc": "Primeiro fundo de risco de criptoativos dos EUA"},
        {"address": "0xf20d962a6c8f70c731bd838a3a388d7d48fa6e15", "name": "a16z Crypto (Andreessen)", "category": "Fund", "desc": "Carteira institucional do fundo a16z Crypto"},
    ]

    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("ETHERSCAN_API_KEY", self.DEFAULT_API_KEY)
        self._last_request_time = 0.0
        self._cached_whales = None
        self._cache_timestamp = 0.0
        self._daily_calls_count = 0
        self._daily_calls_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _track_call(self):
        """Registra o uso diário para manter o usuário 100% informado do limite de 100k/dia."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._daily_calls_date:
            self._daily_calls_date = today
            self._daily_calls_count = 0
        self._daily_calls_count += 1

    def _throttle(self):
        """Garante que nunca ultrapassamos o limite de 3 chamadas/segundo (espera mín 400ms)."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.MIN_REQUEST_INTERVAL:
            time.sleep(self.MIN_REQUEST_INTERVAL - elapsed)
        self._last_request_time = time.time()

    def _request(self, params):
        """Executa requisição GET à API V2 do Etherscan com rate limiting."""
        self._throttle()
        self._track_call()

        full_params = {"chainid": self.CHAIN_ID, "apikey": self.api_key}
        full_params.update(params)

        query_str = urllib.parse.urlencode(full_params)
        url = f"{self.BASE_URL}?{query_str}"

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Automatizar_ETH/1.0",
                "Content-Type": "application/json"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                data = json.loads(response.read().decode("utf-8"))
                if data.get("status") == "0" and "NOTOK" in data.get("message", ""):
                    err = data.get("result", "Erro na API do Etherscan")
                    # Se for erro de rate limit, apenas lança exceção tratável
                    raise RuntimeError(f"Etherscan API: {err}")
                return data.get("result", [])
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Etherscan HTTP {e.code}: {e.reason}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"Falha de conexão com o Etherscan: {e.reason}")

    def get_top_50_whales(self, eth_price_usd=2700.0, force_refresh=False):
        """
        Retorna as 50 maiores carteiras de ETH com saldos atualizados.
        Utiliza 'balancemulti' em lotes de 20 para fazer APENAS 3 chamadas HTTP no total!
        Retorna dados do cache se tiverem menos de 5 minutos (economiza 100% de chamadas).
        """
        now = time.time()
        # Verificar se podemos servir do cache
        if not force_refresh and self._cached_whales and (now - self._cache_timestamp < self.CACHE_TTL_SECONDS):
            # Apenas atualiza a conversão em USD com o preço mais recente
            for item in self._cached_whales:
                item["balance_usd"] = item["balance_eth"] * eth_price_usd
            return {
                "whales": self._cached_whales,
                "cached": True,
                "cache_age_seconds": round(now - self._cache_timestamp),
                "cache_ttl_seconds": self.CACHE_TTL_SECONDS,
                "daily_calls_used": self._daily_calls_count,
                "daily_calls_limit": 100000,
                "rate_limit_per_second": 3
            }

        # Se expirou ou forçou recarregar, consulta Etherscan em lotes de 20
        addresses = [w["address"] for w in self.TOP_WHALE_ENTITIES]
        address_to_entity = {w["address"].lower(): w for w in self.TOP_WHALE_ENTITIES}
        
        batch_size = 20
        balances_map = {}

        for i in range(0, len(addresses), batch_size):
            chunk = addresses[i : i + batch_size]
            params = {
                "module": "account",
                "action": "balancemulti",
                "address": ",".join(chunk),
                "tag": "latest"
            }
            try:
                results = self._request(params)
                for r in results:
                    acc = r.get("account", "").lower()
                    raw_bal = float(r.get("balance", 0))
                    balances_map[acc] = raw_bal / 1e18
            except Exception as e:
                print(f"[!] Aviso no lote Etherscan: {e}")

        # Total aproximado de ETH em circulação (~120.4 milhões)
        ESTIMATED_TOTAL_ETH_SUPPLY = 120400000.0

        enriched = []
        for w in self.TOP_WHALE_ENTITIES:
            addr_lower = w["address"].lower()
            eth_bal = balances_map.get(addr_lower, 0.0)
            usd_bal = eth_bal * eth_price_usd
            pct_supply = (eth_bal / ESTIMATED_TOTAL_ETH_SUPPLY) * 100

            # Determinar se é instituição ou contrato/protocolo/pessoa física
            name = w["name"]
            cat = w["category"]
            desc = w["desc"]
            
            if "Beacon Deposit" in name:
                entity_type = "Protocolo PoS (Não é Instituição)"
                is_institution = False
                info_details = "NÃO é uma empresa nem instituição privada. É o contrato oficial onde todos os validadores da rede Ethereum mundial travam 32 ETH para participar do consenso Proof-of-Stake (PoS). Guarda mais de 28% de todo o Ethereum existente para segurança coletiva descentralizada."
            elif "Wrapped Ether" in name or "WETH" in name:
                entity_type = "Smart Contract DeFi (ERC-20)"
                is_institution = False
                info_details = "Contrato inteligente canônico de WETH usado em DEXs (como Uniswap) e protocolos DeFi. Não pertence a uma instituição individual."
            elif "Vitalik" in name:
                entity_type = "Pessoa Física (Co-fundador)"
                is_institution = False
                info_details = "Carteira pessoal pública de Vitalik Buterin, co-fundador do Ethereum. Movimentações são monitoradas de perto por investidores."
            elif "Bridge" in name or cat == "Bridge":
                entity_type = "Ponte de Rollup Layer-2"
                is_institution = False
                info_details = f"Contrato de bloqueio (bridge) para segunda camada (L2). Bloqueia ETH na Mainnet para liberar saldo em L2. Descrição: {desc}"
            elif cat == "Staking" and "Lido" in name:
                entity_type = "Protocolo Descentralizado (DeFi)"
                is_institution = False
                info_details = "Protocolo descentralizado de liquid staking gerenciado por governança Lido DAO."
            elif cat in ["Exchange"]:
                entity_type = "Corretora Centralizada (CEX / Custódia)"
                is_institution = True
                info_details = f"Instituição financeira / corretora de custódia centralizada. Armazena fundos de clientes e reservas corporativas. {desc}."
            elif cat in ["Fund", "Institutional"] or "Trading" in name or "Capital" in name or "Cumberland" in name:
                entity_type = "Fundo / Market Maker Institucional"
                is_institution = True
                info_details = f"Empresa ou fundo institucional de trading quantitativo / formador de mercado de grande porte. {desc}."
            elif cat == "DeFi":
                entity_type = "Protocolo Descentralizado (Smart Contract)"
                is_institution = False
                info_details = f"Protocolo financeiro descentralizado (sem custódia central). {desc}."
            elif cat == "Foundation":
                entity_type = "Fundação sem fins lucrativos"
                is_institution = True
                info_details = f"Tesouraria oficial de suporte ao desenvolvimento do protocolo. {desc}."
            else:
                entity_type = "Grande Investidor / Whale"
                is_institution = False
                info_details = f"Endereço on-chain de alta relevância no Ethereum. {desc}."

            enriched.append({
                "address": w["address"],
                "short_address": f"{w['address'][:6]}...{w['address'][-4:]}",
                "etherscan_url": f"https://etherscan.io/address/{w['address']}",
                "name": w["name"],
                "category": w["category"],
                "entity_type": entity_type,
                "is_institution": is_institution,
                "info_details": info_details,
                "description": w["desc"],
                "balance_eth": round(eth_bal, 2),
                "balance_usd": usd_bal,
                "percent_supply": round(pct_supply, 3),
            })

        # Ordenar do maior saldo para o menor
        enriched.sort(key=lambda x: x["balance_eth"], reverse=True)

        # Adicionar rank de 1 a 50
        for idx, item in enumerate(enriched, start=1):
            item["rank"] = idx

        # Atualizar cache
        self._cached_whales = enriched
        self._cache_timestamp = now

        return {
            "whales": self._cached_whales,
            "cached": False,
            "cache_age_seconds": 0,
            "cache_ttl_seconds": self.CACHE_TTL_SECONDS,
            "daily_calls_used": self._daily_calls_count,
            "daily_calls_limit": 100000,
            "rate_limit_per_second": 3
        }

    def get_api_quota(self):
        """Retorna o status atual de consumo da API do usuário."""
        return {
            "daily_calls_used": self._daily_calls_count,
            "daily_calls_limit": 100000,
            "rate_limit_per_sec": 3,
            "cache_ttl_seconds": self.CACHE_TTL_SECONDS,
            "calls_remaining": max(0, 100000 - self._daily_calls_count)
        }

if __name__ == "__main__":
    print("=== Testando Etherscan Whale Tracker (50 Maiores Baleias) ===")
    tracker = EtherscanWhaleTracker()
    data = tracker.get_top_50_whales(eth_price_usd=2690.0)
    print(f"Baleias processadas: {len(data['whales'])}")
    print(f"Chamadas Etherscan hoje: {data['daily_calls_used']}/100,000")
    print("\nTop 5 Baleias:")
    for w in data['whales'][:5]:
        print(f"#{w['rank']} [{w['category']}] {w['name']}: {w['balance_eth']:,.2f} ETH (${w['balance_usd']:,.2f}) - {w['percent_supply']}% do suprimento")
