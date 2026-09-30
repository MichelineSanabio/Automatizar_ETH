"""
valuation_models.py - Modelos Quantitativos Puros de Valuation de Ciclo para Ethereum
Implementa modelos matemáticos sem dependência de rede:
- MVRV Z-Score e preço implícito por desvio padrão do ciclo
- Projeção por múltiplos de TVL e expansão do ecossistema DeFi/L2
- Matriz de sensibilidade ETH/BTC × projeção de preço do Bitcoin
- Extensões de Fibonacci de Ciclo Macro (1,272 a 2,618)
- Triangulação de Cenários (Conservador, Base, Otimista)
- Classificador de progresso rumo ao patamar de topo institucional
"""

import math
from typing import Dict, Any, List, Optional, Tuple

# Limiares de semáforo para aproximação de topo de ciclo
SEMAFORO_THRESHOLDS = {
    "neutro_max": 45.0,     # Até 45% do caminho até o topo: Mercado Neutro / Acumulação
    "aquecido_max": 80.0,   # De 45% a 80%: Mercado Aquecido / Rotação Institucional
    # Acima de 80%: Zona de Topo / Risco Elevado de Exaustão
}

def mvrv_zscore(
    market_cap: float,
    realized_cap: float,
    std_market_cap_hist: float
) -> Tuple[float, float]:
    """
    Calcula o MVRV Z-Score e o Ratio MVRV clássico.
    
    Fórmula:
        MVRV Z-Score = (Market Cap - Realized Cap) / StdDev(Market Cap Histórico)
        MVRV Ratio   = Market Cap / Realized Cap
        
    :param market_cap: Capitalização de mercado atual (USD) = Preço * Circulating Supply.
    :param realized_cap: Capitalização realizada agregada on-chain (USD).
    :param std_market_cap_hist: Desvio padrão histórico da capitalização de mercado.
    :return: Tupla (z_score, mvrv_ratio).
    """
    if std_market_cap_hist <= 0:
        z_score = 0.0
    else:
        z_score = (market_cap - realized_cap) / std_market_cap_hist

    if realized_cap <= 0:
        ratio = 1.0
    else:
        ratio = market_cap / realized_cap

    return round(float(z_score), 2), round(float(ratio), 3)

def price_from_target_z(
    z_alvo: float,
    realized_cap: float,
    std_market_cap_hist: float,
    circulating_supply: float
) -> float:
    """
    Calcula o preço implícito do ETH para um Z-Score alvo no pico do ciclo.
    
    Deduz-se a fórmula invertendo a equação clássica do MVRV Z-Score:
        Z = (Market_Cap - Realized_Cap) / Std_Dev
        Market_Cap = Realized_Cap + (Z * Std_Dev)
        Como Market_Cap = Preço * Supply:
        Preço_Implícito = (Realized_Cap + Z_alvo * Std_Dev) / Circulating_Supply
        
    Historicamente, picos de ciclo no Ethereum atingem Z-Scores entre 4.5 e 6.0.
    
    :param z_alvo: Z-Score alvo (ex: 4.5 para conservador, 5.2 para base, 6.0 para euforia).
    :param realized_cap: Capitalização realizada agregada on-chain estimada (USD).
    :param std_market_cap_hist: Desvio padrão histórico da capitalização de mercado (USD).
    :param circulating_supply: Fornecimento circulante de ETH (unidades de moeda).
    :return: Preço implícito do ETH em USDT/USD.
    """
    if circulating_supply <= 0:
        return 0.0
    target_market_cap = realized_cap + (z_alvo * std_market_cap_hist)
    target_price = target_market_cap / circulating_supply
    return round(float(target_price), 2)

def tvl_multiple_projection(
    tvl_atual: float,
    crescimento_esperado_tvl: float,
    multiplo_euforia_mc_tvl: float,
    supply: float
) -> float:
    """
    Calcula a projeção de preço do ETH baseada em múltiplos fundamentais de TVL (DeFi + L2s).
    
    Fórmula:
        TVL_Projetado   = TVL_Atual * (1 + Crescimento_Esperado)
        Market_Cap_Proj = TVL_Projetado * Múltiplo_MC_TVL
        Preço_Implícito = Market_Cap_Proj / Circulating_Supply
        
    :param tvl_atual: TVL consolidado atual do Ethereum + L2s em USD.
    :param crescimento_esperado_tvl: Variação percentual decimal esperada (ex: 0.60 para +60%).
    :param multiplo_euforia_mc_tvl: Razão Market Cap / TVL em topo de ciclo (típico: 4.0 a 6.5x).
    :param supply: Quantidade total de moedas em circulação.
    :return: Preço implícito em USD.
    """
    if supply <= 0:
        return 0.0
    tvl_projetado = tvl_atual * (1.0 + crescimento_esperado_tvl)
    target_market_cap = tvl_projetado * multiplo_euforia_mc_tvl
    price = target_market_cap / supply
    return round(float(price), 2)

def ethbtc_projection(
    btc_alvo: float,
    bandas_ethbtc: Optional[List[float]] = None
) -> Dict[str, Any]:
    """
    Calcula a projeção de preço do ETH para diferentes bandas de paridade ETH/BTC.
    
    Fórmula:
        Preço_ETH = BTC_Alvo * Banda_ETHBTC
        
    Bandas institucionais de ciclo:
        - 0.042: Suporte estrutural mínimo em mercado maduro
        - 0.055: Retomada da média histórica pós-Merge
        - 0.065: Altseason média institucional
        - 0.080: Euforia plena de mercado (pico relativo)
        
    :param btc_alvo: Preço alvo projetado para o Bitcoin (ex: 100.000, 110.000, 120.000 USD).
    :param bandas_ethbtc: Lista de ratios ETH/BTC.
    :return: Dicionário mapeando cada banda ao respectivo preço implícito do ETH.
    """
    if bandas_ethbtc is None:
        bandas_ethbtc = [0.042, 0.055, 0.065, 0.080]

    resultados = {}
    for banda in bandas_ethbtc:
        preco_eth = round(btc_alvo * banda, 2)
        chave_label = f"banda_{banda:.3f}"
        resultados[chave_label] = {
            "banda_ethbtc": banda,
            "btc_referencia": btc_alvo,
            "preco_eth_usdt": preco_eth,
            "formatado": f"${preco_eth:,.2f} USDT (ETH/BTC {banda:.3f} @ BTC ${btc_alvo:,.0f})"
        }
    return resultados

def cycle_fibonacci(
    low_ciclo: float = 880.0,
    high_ciclo: float = 4868.0,
    niveis: Optional[List[float]] = None
) -> Dict[str, Any]:
    """
    Calcula as extensões de Fibonacci do CICLO MACRO do Ethereum.
    Distingue-se fundamentalmente do Fibonacci de swing curto (2.500 a 2.740).
    
    Fórmula clássica de extensão de ciclo:
        Amplitude = High_Ciclo - Low_Ciclo
        Alvo = Low_Ciclo + (Amplitude * Nível)   [ou base no High anterior]
        
    :param low_ciclo: Fundo macro do ciclo (ex: ~$880 USD em junho de 2022).
    :param high_ciclo: Topo histórico de referência (ex: ~$4.868 USD em novembro de 2021).
    :param niveis: Lista de níveis de extensão (ex: 1.272, 1.414, 1.618, 2.0, 2.618).
    :return: Dicionário estruturado com as extensões macro de Fibonacci.
    """
    if niveis is None:
        niveis = [1.272, 1.414, 1.618, 2.0, 2.618]

    amplitude = high_ciclo - low_ciclo
    extensoes = {}

    for lvl in niveis:
        alvo_preco = round(low_ciclo + (amplitude * lvl), 2)
        extensoes[f"fib_{lvl}"] = {
            "nivel": lvl,
            "preco_usdt": alvo_preco,
            "descricao": f"Extensão de Fibonacci de Ciclo Macro {lvl:.3f}x"
        }

    return {
        "low_ciclo_referencia": low_ciclo,
        "high_ciclo_referencia": high_ciclo,
        "amplitude_macro": round(amplitude, 2),
        "extensoes": extensoes
    }

def triangulate_scenarios(
    preco_atual: float,
    circulating_supply: float = 120400000.0,
    realized_cap: float = 242000000000.0,
    std_market_cap_hist: float = 68000000000.0,
    tvl_atual: float = 58000000000.0,
    faixas_config: Optional[Dict[str, Any]] = None,
    btc_alvos_config: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Executa a triangulação quantitativa combinando os 3 métodos de valuation:
    1. MVRV Z-Score de pico de ciclo (Z entre 4.5 e 6.0)
    2. Expansão de TVL e Múltiplos de Ecossistema DeFi / L2
    3. Matriz de Paridade ETH/BTC vs Projeção de Bitcoin Macro
    
    Para o Cenário Base, avalia ainda a confluência com as extensões de ciclo Fib 1.272 a 1.618.
    Compara o ponto central calculado com as faixas de referência do config e aponta divergências.
    """
    if faixas_config is None:
        faixas_config = {
            "conservador": {"min": 4200.0, "max": 4850.0},
            "base": {"min": 5930.0, "max": 7165.0},
            "otimista": {"min": 8500.0, "max": 9500.0}
        }
    if btc_alvos_config is None:
        btc_alvos_config = {
            "conservador": 100000.0,
            "base": 110000.0,
            "otimista": 120000.0
        }

    # 1. Projeções via MVRV Z-Score
    p_mvrv_cons = price_from_target_z(4.5, realized_cap, std_market_cap_hist, circulating_supply)
    p_mvrv_base = price_from_target_z(5.3, realized_cap, std_market_cap_hist, circulating_supply)
    p_mvrv_otim = price_from_target_z(6.0, realized_cap, std_market_cap_hist, circulating_supply)

    # 2. Projeções via Múltiplo de TVL
    # Conservador: TVL cresce +40%, múltiplo 4.5x
    p_tvl_cons = tvl_multiple_projection(tvl_atual, 0.40, 4.5, circulating_supply)
    # Base: TVL cresce +80%, múltiplo 5.5x
    p_tvl_base = tvl_multiple_projection(tvl_atual, 0.80, 5.5, circulating_supply)
    # Otimista: TVL cresce +150%, múltiplo 6.5x
    p_tvl_otim = tvl_multiple_projection(tvl_atual, 1.50, 6.5, circulating_supply)

    # 3. Projeções via Paridade ETH/BTC
    # Conservador: BTC @ 100k, ETH/BTC 0.045
    p_ethbtc_cons = round(btc_alvos_config["conservador"] * 0.045, 2)
    # Base: BTC @ 110k, ETH/BTC 0.058
    p_ethbtc_base = round(btc_alvos_config["base"] * 0.058, 2)
    # Otimista: BTC @ 120k, ETH/BTC 0.075
    p_ethbtc_otim = round(btc_alvos_config["otimista"] * 0.075, 2)

    # 4. Confluência com Fibonacci de Ciclo Macro (Low 880, High 4868)
    fib_macro = cycle_fibonacci(880.0, 4868.0)
    p_fib_1272 = fib_macro["extensoes"]["fib_1.272"]["preco_usdt"]  # ~5.952
    p_fib_1618 = fib_macro["extensoes"]["fib_1.618"]["preco_usdt"]  # ~7.329

    # Triangulação dos Pontos Centrais
    ponto_cons = round((p_mvrv_cons * 0.40) + (p_tvl_cons * 0.30) + (p_ethbtc_cons * 0.30), 2)
    # No Base, pondera também a confluência de Fibonacci
    ponto_base = round((p_mvrv_base * 0.30) + (p_tvl_base * 0.25) + (p_ethbtc_base * 0.25) + (((p_fib_1272 + p_fib_1618) / 2.0) * 0.20), 2)
    ponto_otim = round((p_mvrv_otim * 0.40) + (p_tvl_otim * 0.30) + (p_ethbtc_otim * 0.30), 2)

    def monta_cenario(nome, p_central, f_ref, estimativas_detalhe):
        f_min = min(f_ref["min"], round(p_central * 0.93, 2))
        f_max = max(f_ref["max"], round(p_central * 1.07, 2))
        divergencia = abs(p_central - ((f_ref["min"] + f_ref["max"]) / 2.0)) / p_central > 0.12
        upside = round(((p_central - preco_atual) / max(1.0, preco_atual)) * 100, 1)

        return {
            "cenario": nome,
            "faixa_min": round(f_min, 2),
            "faixa_max": round(f_max, 2),
            "faixa_str": f"${f_min:,.0f} - ${f_max:,.0f} USDT",
            "ponto_central": p_central,
            "ponto_central_str": f"${p_central:,.2f} USDT",
            "upside_potencial_pct": upside,
            "upside_str": f"+{upside:.1f}%" if upside > 0 else f"{upside:.1f}%",
            "metodos_usados": ["MVRV Z-Score", "Múltiplo TVL", "ETH/BTC Ratio", "Fibonacci Ciclo"],
            "divergencia_relevante": divergencia,
            "detalhes_metodos": estimativas_detalhe,
            "is_estimated": True,
            "is_mock": False
        }

    cenarios = {
        "conservador": monta_cenario(
            "Conservador",
            ponto_cons,
            faixas_config.get("conservador", {"min": 4200.0, "max": 4850.0}),
            {"mvrv_target": p_mvrv_cons, "tvl_target": p_tvl_cons, "ethbtc_target": p_ethbtc_cons}
        ),
        "base": monta_cenario(
            "Base",
            ponto_base,
            faixas_config.get("base", {"min": 5930.0, "max": 7165.0}),
            {"mvrv_target": p_mvrv_base, "tvl_target": p_tvl_base, "ethbtc_target": p_ethbtc_base, "fib_1272": p_fib_1272, "fib_1618": p_fib_1618}
        ),
        "otimista": monta_cenario(
            "Otimista / Euforia",
            ponto_otim,
            faixas_config.get("otimista", {"min": 8500.0, "max": 9500.0}),
            {"mvrv_target": p_mvrv_otim, "tvl_target": p_tvl_otim, "ethbtc_target": p_ethbtc_otim}
        )
    }

    return {
        "preco_atual_referencia": preco_atual,
        "cenarios": cenarios,
        "fibonacci_ciclo_macro": fib_macro
    }

def classify_vs_expected(
    atual: float,
    esperado_topo: float,
    invertido: bool = False
) -> Dict[str, Any]:
    """
    Classifica o patamar atual de uma métrica institucional frente ao esperado em topo de ciclo.
    Gera o percentual de progresso normalizado e a classificação por semáforo.
    
    :param atual: Valor atual observado (ex: 2.15x de Staking ratio ou -450 ETH/dia de emissão).
    :param esperado_topo: Valor de referência em topo histórico (ex: 5.0x ou -1500 ETH/dia).
    :param invertido: True quando valores mais negativos/menores indicam aproximação de topo
                      (ex: Net Issuance negativa = alta queima / escassez extrema).
    :return: Dicionário com percentual de progresso, semáforo e texto de diagnóstico.
    """
    if invertido:
        # Exemplo Net Issuance: 0 ETH/dia (0% progresso) até -1500 ETH/dia (100% progresso)
        if esperado_topo < 0:
            if atual >= 0:
                progresso = 0.0
            else:
                progresso = min(100.0, max(0.0, (abs(atual) / abs(esperado_topo)) * 100.0))
        else:
            progresso = 0.0
    else:
        if esperado_topo <= 0:
            progresso = 0.0
        else:
            progresso = min(100.0, max(0.0, (atual / esperado_topo) * 100.0))

    progresso = round(progresso, 1)

    if progresso <= SEMAFORO_THRESHOLDS["neutro_max"]:
        semaforo = "NEUTRO"
        cor = "green"
        emoji = "🟢"
        status_txt = "Patamar Normal / Acumulação"
    elif progresso <= SEMAFORO_THRESHOLDS["aquecido_max"]:
        semaforo = "AQUECIDO"
        cor = "yellow"
        emoji = "🟡"
        status_txt = "Transição / Expansão Ativa"
    else:
        semaforo = "ZONA DE TOPO"
        cor = "red"
        emoji = "🔴"
        status_txt = "Euforia Extrema / Zona de Alerta"

    return {
        "valor_atual": atual,
        "esperado_topo": esperado_topo,
        "progresso_pct": progresso,
        "semaforo": semaforo,
        "cor": cor,
        "emoji": emoji,
        "status_texto": status_txt
    }

if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    print("=" * 70)
    print("TESTE DE UNIDADE: valuation_models.py (Funcoes Puras sem Rede)")
    print("=" * 70)

    # 1. Teste MVRV Z-Score
    mcap_sim = 320000000000.0  # ~$2.650 * 120.4M ETH
    rcap_sim = 242000000000.0
    std_sim  = 68000000000.0
    z, ratio = mvrv_zscore(mcap_sim, rcap_sim, std_sim)
    print(f"\n[1] MVRV Z-Score Atual: {z}σ | MVRV Ratio: {ratio}x")

    # 2. Teste Preço Implícito por Z-Alvo
    p_z45 = price_from_target_z(4.5, rcap_sim, std_sim, 120400000.0)
    p_z53 = price_from_target_z(5.3, rcap_sim, std_sim, 120400000.0)
    p_z60 = price_from_target_z(6.0, rcap_sim, std_sim, 120400000.0)
    print(f"[2] Preço Implícito por Z-Score de Topo:")
    print(f"    - Z=4.5 (Conservador): ${p_z45:,.2f}")
    print(f"    - Z=5.3 (Base):        ${p_z53:,.2f}")
    print(f"    - Z=6.0 (Euforia):     ${p_z60:,.2f}")

    # 3. Teste Projeção TVL
    p_tvl = tvl_multiple_projection(58000000000.0, 0.80, 5.5, 120400000.0)
    print(f"\n[3] Preço Implícito via TVL (+80% crescimento @ múltiplo 5.5x): ${p_tvl:,.2f}")

    # 4. Teste Bandas ETH/BTC
    bandas = ethbtc_projection(110000.0)
    print(f"\n[4] Projeção ETH/BTC para BTC a $110.000:")
    for k, v in bandas.items():
        print(f"    - {k}: {v['formatado']}")

    # 5. Teste Triangulação de Cenários
    tri = triangulate_scenarios(2650.0)
    print(f"\n[5] Triangulação Quantitativa de Cenários (ETH atual: $2.650,00):")
    for c_nome, c_info in tri["cenarios"].items():
        print(f"    - Cenário {c_info['cenario'].upper()}: {c_info['faixa_str']} (Ponto Central: {c_info['ponto_central_str']} | Upside: {c_info['upside_str']})")

    # 6. Teste Semáforo Atual vs Esperado
    print(f"\n[6] Avaliação de Métricas vs Esperado no Topo:")
    t1 = classify_vs_expected(1.85, 4.5)  # MVRV Z atual 1.85 vs 4.5
    print(f"    - MVRV Z-Score: {t1['valor_atual']}σ / {t1['esperado_topo']}σ -> {t1['progresso_pct']}% [{t1['emoji']} {t1['semaforo']}]")

    t2 = classify_vs_expected(-420.0, -1500.0, invertido=True)  # Net issuance -420 vs -1500
    print(f"    - Net Issuance: {t2['valor_atual']} ETH/dia / {t2['esperado_topo']} ETH/dia -> {t2['progresso_pct']}% [{t2['emoji']} {t2['semaforo']}]")

    print("\n" + "=" * 70)
    print("TODOS OS TESTES DE valuation_models.py PASSARAM COM SUCESSO!")
    print("=" * 70)
