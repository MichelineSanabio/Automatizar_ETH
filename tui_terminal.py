#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tui_terminal.py - Interface Gráfica de Console Terminal (TUI) Institucional Quant
Utiliza a biblioteca Rich (Layout, Panel, Table, Live) para monitoramento institucional
de ETHUSDT, BTCUSDT, Futuros, Altseason, Livro de Ordens, Gatilhos e Recálculo Fibonacci.
"""

import sys
import os
import time
import asyncio
from datetime import datetime, timezone

try:
    from rich.console import Console
    from rich.layout import Layout
    from rich.panel import Panel
    from rich.table import Table
    from rich.live import Live
    from rich.text import Text
    from rich.align import Align
    from rich.style import Style
except ImportError:
    print("[ERRO] A biblioteca 'rich' não está instalada.")
    print("Instale executando: pip install rich python-binance pandas-ta yfinance web3 requests")
    sys.exit(1)

from quant_analyzer import quant_engine
from telegram_notifier import telegram_notifier

# Configurar codificação UTF-8 robusta para Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

console = Console(force_terminal=True, legacy_windows=False)

def make_header_panel(state: dict) -> Panel:
    """Gera o painel superior de cabeçalho e métricas globais."""
    prices = state.get("prices", {})
    fut = state.get("futures", {})
    ind = state.get("indicators", {})
    macro = state.get("macro", {})
    web3_st = state.get("web3", {})

    eth = prices.get("eth", 0.0)
    btc = prices.get("btc", 0.0)
    ethbtc = prices.get("ethbtc", 0.0)
    usdtbrl = prices.get("usdtbrl", 0.0)
    funding = fut.get("funding_rate", 0.0) * 100
    funding_ann = fut.get("funding_rate_annualized", 0.0)
    oi_eth = fut.get("open_interest_eth", 0.0)
    ls_ratio = fut.get("long_short_ratio", 1.0)
    long_pct = fut.get("long_pct", 50.0)
    short_pct = fut.get("short_pct", 50.0)

    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    grid = Table.grid(expand=True)
    grid.add_column(justify="left", ratio=2)
    grid.add_column(justify="center", ratio=5)
    grid.add_column(justify="right", ratio=3)

    # Coluna 1: Branding
    title_text = Text()
    title_text.append("◆ QUANT TERMINAL INSTITUCIONAL ◆\n", style="bold cyan")
    title_text.append("BINANCE FUTURES & ON-CHAIN ENGINE", style="dim white")

    # Coluna 2: Tickers rápidos
    ticker_text = Text()
    ticker_text.append("ETH: ", style="bold white")
    ticker_text.append(f"${eth:,.2f}  ", style="bold yellow")
    ticker_text.append("BTC: ", style="bold white")
    ticker_text.append(f"${btc:,.2f}  ", style="bold yellow")
    ticker_text.append("ETH/BTC: ", style="bold white")
    ticker_text.append(f"{ethbtc:.5f}  ", style="bold green" if ethbtc >= 0.0322 else "bold red")
    ticker_text.append("USDT/BRL: ", style="bold white")
    ticker_text.append(f"R${usdtbrl:.2f}\n", style="bold magenta")

    ticker_text.append(f"Funding 8h: {funding:+.4f}% ({funding_ann:.1f}% a.a) | ", style="green" if funding >= 0 else "red")
    ticker_text.append(f"OI: {oi_eth:,.0f} ETH | ", style="cyan")
    ticker_text.append(f"L/S: {ls_ratio:.2f} (L: {long_pct:.1f}% / S: {short_pct:.1f}%)", style="white")

    # Coluna 3: Macro & Relógio
    macro_text = Text()
    macro_text.append(f"S&P500: {macro.get('sp500', 0):,.0f} | DXY: {macro.get('dxy', 0):.2f}\n", style="dim white")
    macro_text.append(f"OURO: ${macro.get('gold', 0):,.1f} | WTI: ${macro.get('oil_wti', 0):.1f}\n", style="dim white")

    tg_status = "TG: ● ATIVO" if telegram_notifier.is_configured() else "TG: ○ STANDBY"
    tg_style = "bold green" if telegram_notifier.is_configured() else "dim yellow"
    macro_text.append(f"{tg_status}  |  ● LOCAL: {now_str} UTC-3", style=tg_style)

    grid.add_row(title_text, ticker_text, macro_text)

    return Panel(grid, style="bold cyan", border_style="cyan", padding=(0, 1))

def make_altseason_panel(state: dict) -> Panel:
    """Gera o Bloco 2: Termômetro de Altseason Index Dinâmico."""
    alt = state.get("altseason", {})
    idx = alt.get("index_pct", 34.0)
    stage = alt.get("stage", "Neutro")
    bar = alt.get("unicode_bar", "[████░░░░░░]")
    ethbtc_status = alt.get("ethbtc_status", "Abaixo da resistência")
    desc = alt.get("desc", "")
    color = alt.get("color", "yellow")

    table = Table.grid(expand=True)
    table.add_column(justify="left", ratio=3)
    table.add_column(justify="center", ratio=4)
    table.add_column(justify="right", ratio=3)

    col1 = Text()
    col1.append("TERMÔMETRO ALTSEASON: ", style="bold white")
    col1.append(f"{idx:.1f}%\n", style=f"bold {color}")
    col1.append(f"Ciclo: {stage}", style=f"bold {color}")

    col2 = Text()
    col2.append(f"[{bar}]  {idx:.1f}%\n", style=f"bold {color}")
    col2.append(f"Paridade ETH/BTC: {ethbtc_status}", style="dim white")

    col3 = Text()
    col3.append(f"BTC.D Est.: {alt.get('btc_dominance', 56.5)}%\n", style="cyan")
    col3.append(f"Top 50 Altcoins: {alt.get('alt_vs_btc_outperforming', 16)}/50 superando BTC", style="dim cyan")

    table.add_row(col1, col2, col3)
    return Panel(table, title="[bold yellow]BLOCO 2: TERMÔMETRO DE ALTSEASON & FLUXO DE CAPITAL[/bold yellow]", border_style="yellow", padding=(0, 1))

def make_down_factors_table(state: dict) -> Table:
    """Gera a tabela do Checklist de Fatores da Descida."""
    table = Table(title="CHECKLIST DE GATILHOS DA DESCIDA (SUPORTE / ARMADILHA)", expand=True, border_style="blue", show_header=True, header_style="bold blue")
    table.add_column("Fator Analisado", style="white", ratio=4)
    table.add_column("Diagnóstico / Confluência", style="dim white", ratio=5)
    table.add_column("Status", justify="center", ratio=3)

    down_factors = state.get("down_factors", [])
    for f in down_factors:
        status_text = Text()
        if f.get("active"):
            status_text.append("✔ ATIVO", style="bold green on black")
        else:
            status_text.append("✖ DESARMADO", style="bold red on black")

        table.add_row(
            f.get("name", ""),
            f.get("detail", ""),
            status_text
        )

    return table

def make_order_probabilities_table(state: dict) -> Table:
    """Gera a tabela de probabilidades das 4 Ordens Limite do usuário."""
    table = Table(title="MEDIDOR DE PROBABILIDADE INDIVIDUAL DE ORDENS LIMITE", expand=True, border_style="magenta", show_header=True, header_style="bold magenta")
    table.add_column("Ordem", style="bold white", ratio=2)
    table.add_column("Preço (USDT)", justify="right", style="bold yellow", ratio=2)
    table.add_column("Qtd / Montante", justify="right", style="cyan", ratio=2)
    table.add_column("Probabilidade", justify="center", style="bold white", ratio=2)
    table.add_column("Barra Visual", justify="left", ratio=3)
    table.add_column("Confluência Técnica", style="dim white", ratio=4)

    orders = state.get("order_probabilities", [])
    for o in orders:
        prob = o.get("prob_pct", 50.0)
        p_color = o.get("prob_color", "yellow")
        bar_text = Text(o.get("prob_bar", "[████░░░░░░]"), style=p_color)

        prob_cell = Text(f"{prob:.1f}%", style=f"bold {p_color}")

        table.add_row(
            o.get("name", ""),
            f"${o.get('price_usdt', 0):,.2f}",
            o.get("size_str", ""),
            prob_cell,
            bar_text,
            o.get("confluence", "")
        )

    return table

def make_pivot_detector_panel(state: dict) -> Panel:
    """Gera o Bloco 3: Detector de Invalidação da Queda e Recálculo Fibonacci."""
    pivot = state.get("pivot_and_entries", {})
    banner = pivot.get("status_banner", "[MODO VIGENTE: CORREÇÃO / DESCIDA ATIVA]")
    confirmed = pivot.get("pivot_confirmed", False)
    conds = pivot.get("conditions", [])
    entries = pivot.get("dynamic_entries", [])
    targets = pivot.get("targets", [])

    banner_style = "bold white on red" if not confirmed else "bold black on green"
    banner_text = Align.center(Text(f" {banner} ", style=banner_style))

    # Tabela de Condições do Gatilho de Alta Estrutural
    cond_table = Table(expand=True, show_header=True, header_style="bold cyan", border_style="dim cyan")
    cond_table.add_column("Gatilho de Alta Estrutural", ratio=5)
    cond_table.add_column("Nível Chave", justify="center", ratio=3)
    cond_table.add_column("Valor Atual", justify="center", ratio=3)
    cond_table.add_column("Status", justify="center", ratio=3)

    for c in conds:
        c_status = Text("ROMPIDO" if c.get("met") else "NÃO ROMPIDO", style="bold green" if c.get("met") else "bold yellow")
        cond_table.add_row(
            c.get("trigger", ""),
            c.get("key_level", ""),
            c.get("current_value", ""),
            c_status
        )

    # Tabela de Novas Entradas Fibonacci (Pullback / Golden Pocket / Reteste)
    entries_table = Table(title="MOTOR DE RECÁLCULO DINÂMICO DE ENTRADAS (CASO REVERTA EM ALTA)", expand=True, show_header=True, header_style="bold green", border_style="green")
    entries_table.add_column("Nível de Entrada", style="bold white", ratio=3)
    entries_table.add_column("Preço (USDT)", justify="right", style="bold yellow", ratio=2)
    entries_table.add_column("Capital Alocado", justify="right", style="cyan", ratio=2)
    entries_table.add_column("Fundamento Matemático / Fibonacci", style="dim white", ratio=5)

    for e in entries:
        entries_table.add_row(
            e.get("level", ""),
            f"${e.get('price_usdt', 0):,.2f}",
            e.get("capital_alloc", ""),
            e.get("description", "")
        )

    # Tabela de Alvos de Realização
    targets_table = Table(title="ALVOS DE REALIZAÇÃO PROPORCIONAL (LUCRO MÁXIMO)", expand=True, show_header=True, header_style="bold gold1", border_style="gold1")
    targets_table.add_column("Alvo", style="bold white", ratio=2)
    targets_table.add_column("Preço Alvo", justify="right", style="bold yellow", ratio=2)
    targets_table.add_column("Expansão / Confluência", style="dim white", ratio=4)
    targets_table.add_column("Realização", justify="center", style="bold green", ratio=2)

    for t in targets:
        targets_table.add_row(
            t.get("target", ""),
            f"${t.get('price_usdt', 0):,.2f}",
            t.get("expansion", ""),
            t.get("exit_pct", "")
        )

    content_grid = Table.grid(expand=True)
    content_grid.add_column(ratio=1)
    content_grid.add_row(banner_text)
    content_grid.add_row(Text(""))
    content_grid.add_row(cond_table)
    content_grid.add_row(Text(""))
    content_grid.add_row(entries_table)
    content_grid.add_row(Text(""))
    content_grid.add_row(targets_table)

    return Panel(
        content_grid,
        title="[bold green]BLOCO 3: PAINEL DE PIVÔ DE ALTA & RECÁLCULO AUTOMÁTICO DE ENTRADAS[/bold green]",
        border_style="green",
        padding=(0, 1)
    )

def make_logs_panel(state: dict) -> Panel:
    """Gera a janela inferior de logs e eventos quantitativos em tempo real."""
    logs = state.get("logs", [])
    log_table = Table.grid(expand=True)
    log_table.add_column(justify="left", ratio=2)
    log_table.add_column(justify="left", ratio=2)
    log_table.add_column(justify="left", ratio=12)

    # Exibir os últimos 8 logs
    for entry in logs[-8:]:
        lvl = entry.get("level", "INFO")
        lvl_color = "cyan"
        if lvl == "WARN":
            lvl_color = "yellow"
        elif lvl == "ERROR":
            lvl_color = "red"
        elif lvl == "TICK":
            lvl_color = "magenta"
        elif lvl == "ONCHAIN":
            lvl_color = "green"

        log_table.add_row(
            Text(f"[{entry.get('time', '')}]", style="dim white"),
            Text(f"[{lvl}]", style=f"bold {lvl_color}"),
            Text(f" {entry.get('msg', '')}", style="white")
        )

    if not logs:
        log_table.add_row(Text("Aguardando eventos quantitativos da Binance e On-Chain...", style="dim white"))

    return Panel(
        log_table,
        title="[bold cyan]LOGS & EVENTOS QUANTITATIVOS INSTITUCIONAIS EM TEMPO REAL[/bold cyan]",
        border_style="dim cyan",
        padding=(0, 1)
    )

from onchain_engine import OnChainEngine

# Instância Singleton do motor on-chain
onchain_engine = OnChainEngine()

def make_onchain_valuation_panel(onchain: dict) -> Panel:
    """Gera o Bloco 4: Radar On-Chain, MVRV Z-Score e Triangulação de Valuation."""
    if not onchain:
        return Panel(Text("Carregando métricas on-chain...", style="dim white"), title="[bold green]BLOCO 4: RADAR ON-CHAIN & VALUATION MACRO[/bold green]", border_style="green")

    net = onchain.get("net_issuance", {})
    blob = onchain.get("blob_gas_saturation", {})
    stk = onchain.get("staking_vs_exchanges", {})
    tvl = onchain.get("tvl", {})
    mvrv = onchain.get("mvrv", {})
    cenarios = onchain.get("cenarios_valuation", {}).get("cenarios", {})
    topo = onchain.get("avaliacao_topo_macro", {})

    grid = Table.grid(expand=True)
    grid.add_column(ratio=1)

    # 1. Tabela On-Chain Radar
    onchain_table = Table(title="RADAR ON-CHAIN (EMISSÃO, BLOBS E CHOQUE DE OFERTA)", expand=True, show_header=True, header_style="bold green", border_style="green")
    onchain_table.add_column("Métrica On-Chain", style="bold white", ratio=3)
    onchain_table.add_column("Valor Atual", justify="right", style="bold yellow", ratio=3)
    onchain_table.add_column("Meta Ciclo / Topo", justify="center", style="cyan", ratio=3)
    onchain_table.add_column("Semáforo", justify="center", ratio=3)

    # Net Issuance
    net_val = net.get("net_issuance_diaria_eth", 0.0)
    net_str = f"{net_val:+.1f} ETH/d"
    s_net = topo.get("net_issuance", {})
    onchain_table.add_row(
        "Net Issuance (PoS - Queima)",
        net_str,
        f"{net.get('limiar_esperado_topo', -1500)} ETH/d",
        f"{s_net.get('emoji', '🟢')} {s_net.get('semaforo', 'NEUTRO')}"
    )

    # Blobs EIP-4844
    blob_sat = blob.get("saturation_target_pct", 0.0)
    onchain_table.add_row(
        "Blob Saturation (EIP-4844)",
        f"{blob_sat:.1f}% ({blob.get('estimated_blobs_count', 0)} blobs)",
        f"Alvo 3 / Máx 6",
        f"{blob.get('semaforo', '🟢 VERDE')}"
    )

    # Staking vs Exchanges
    ratio_stk = stk.get("ratio", 0.0)
    onchain_table.add_row(
        "Staking / Corretoras Ratio",
        f"{ratio_stk:.2f}x ({stk.get('staking_eth_total', 0)/1e6:.1f}M / {stk.get('exchanges_eth_total', 0)/1e6:.1f}M)",
        f"{stk.get('limiar_esperado_topo', 5.0)}x",
        f"{stk.get('semaforo', '🟢 NORMAL')}"
    )

    # TVL DefiLlama
    tvl_tot = tvl.get("tvl_total_usd", 0.0)
    s_tvl = topo.get("tvl", {})
    chains_b = tvl.get("chains_breakdown", [{}])
    l1_share = chains_b[0].get("share_pct", 85.0) if chains_b else 85.0
    onchain_table.add_row(
        "TVL Consolidado (L1+L2s)",
        f"${tvl_tot/1e9:.2f}B (L1: {l1_share}%)",
        f"${tvl.get('limiar_esperado_topo_usd', 160e9)/1e9:.0f}B",
        f"{s_tvl.get('emoji', '🟢')} {s_tvl.get('semaforo', 'NEUTRO')}"
    )

    # 2. Tabela de Valuation Triangulado
    val_table = Table(title="TRIANGULAÇÃO DE VALUATION & CENÁRIOS DE TOPO", expand=True, show_header=True, header_style="bold gold1", border_style="gold1")
    val_table.add_column("Cenário", style="bold white", ratio=3)
    val_table.add_column("Faixa de Preço", justify="center", style="bold yellow", ratio=4)
    val_table.add_column("Ponto Central", justify="right", style="bold green", ratio=3)
    val_table.add_column("Upside", justify="center", style="bold cyan", ratio=2)

    for k in ["conservador", "base", "otimista"]:
        c = cenarios.get(k, {})
        val_table.add_row(
            c.get("cenario", k.capitalize()),
            c.get("faixa_str", "--"),
            c.get("ponto_central_str", "--"),
            c.get("upside_str", "--")
        )

    grid.add_row(onchain_table)
    grid.add_row(Text(""))
    grid.add_row(val_table)

    return Panel(
        grid,
        title="[bold green]BLOCO 4: RADAR ON-CHAIN & MOTOR DE VALUATION MACRO[/bold green]",
        border_style="green",
        padding=(0, 1)
    )

def build_full_layout(state: dict, onchain_state: dict) -> Layout:
    """Monta o Layout hierárquico do terminal com rich."""
    layout = Layout(name="root")

    # Divisão principal vertical:
    # 1. header (fixo ~4 linhas)
    # 2. altseason (fixo ~3 linhas)
    # 3. body (expande)
    # 4. logs (fixo ~8 linhas)
    layout.split_column(
        Layout(name="header", size=4),
        Layout(name="altseason", size=4),
        Layout(name="body", ratio=1),
        Layout(name="footer_logs", size=8)
    )

    # No body, dividimos horizontalmente:
    # Esquerda: Bloco 1 (Fatores + Ordens Limite) -> 50%
    # Direita: Bloco 3 (Pivô de Alta) + Bloco 4 (Radar On-Chain & Valuation) -> 50%
    layout["body"].split_row(
        Layout(name="left_block", ratio=1),
        Layout(name="right_block", ratio=1)
    )

    # Bloco Esquerdo dividido verticalmente: Fatores (topo) e Probabilidades (base)
    layout["left_block"].split_column(
        Layout(name="down_factors", ratio=1),
        Layout(name="order_probs", ratio=1)
    )

    # Bloco Direito dividido verticalmente: Pivô (topo) e On-Chain Valuation (base)
    layout["right_block"].split_column(
        Layout(name="pivot", ratio=1),
        Layout(name="onchain_valuation", ratio=1)
    )

    # Renderiza componentes
    layout["header"].update(make_header_panel(state))
    layout["altseason"].update(make_altseason_panel(state))
    layout["left_block"]["down_factors"].update(Panel(make_down_factors_table(state), title="[bold blue]BLOCO 1A: FATORES DA DESCIDA[/bold blue]", border_style="blue", padding=(0, 0)))
    layout["left_block"]["order_probs"].update(Panel(make_order_probabilities_table(state), title="[bold magenta]BLOCO 1B: PROBABILIDADE DAS ORDENS LIMITE[/bold magenta]", border_style="magenta", padding=(0, 0)))
    layout["right_block"]["pivot"].update(make_pivot_detector_panel(state))
    layout["right_block"]["onchain_valuation"].update(make_onchain_valuation_panel(onchain_state))
    layout["footer_logs"].update(make_logs_panel(state))

    return layout

async def async_main():
    """Loop assíncrono principal com taxa de atualização de 2 Hz (refresh_per_second=2)."""
    console.clear()
    console.print("[bold cyan]Iniciando Terminal Quant Institucional Binance & On-Chain...[/bold cyan]")
    time.sleep(0.5)

    with Live(console=console, screen=True, auto_refresh=False) as live:
        while True:
            try:
                # Obter estado de mercado mais recente (com cache interno de 2s para evitar rate-limit)
                state = quant_engine.get_full_market_state()
                eth_p = state.get("prices", {}).get("eth", 2650.0)
                onchain_state = onchain_engine.get_onchain_state(eth_price_usd=eth_p)
                layout = build_full_layout(state, onchain_state)
                live.update(layout, refresh=True)
            except Exception as e:
                quant_engine._add_log("ERROR", f"Falha no ciclo TUI: {str(e)}")
            
            # Taxa de atualização: 2 vezes por segundo (0.5s)
            await asyncio.sleep(0.5)

def main():
    """Ponto de entrada síncrono que inicia o loop assíncrono."""
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        console.clear()
        console.print("\n[bold yellow]Terminal Quant finalizado pelo usuário. Até logo![/bold yellow]\n")

if __name__ == "__main__":
    main()
