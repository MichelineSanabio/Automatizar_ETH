# 🚀 Automatizar ETH & BTC - Flask Binance Market Terminal

Terminal financeiro e toolkit de automação para **Ethereum (ETH)** e **Bitcoin (BTC)** construído com **Python Flask**, **TradingView Lightweight Charts** e a **API Spot da Binance (v3)** com **WebSockets**.

---

## 📁 Estrutura Organizada do Projeto

O projeto segue o padrão profissional de aplicações **Flask**:

```text
Automatizar_ETH/
│
├── app.py                      # Servidor Flask principal (rotas Web e API REST)
├── binance_client.py           # Cliente para consumo da API pública da Binance
├── indicators.py               # Motor de cálculo de indicadores técnicos (EMA, RSI, Bollinger)
├── export_historical.py        # Script CLI para download de dados históricos para CSV
├── stream_realtime.py          # Monitor de cotações e trades em tempo real via WebSocket
│
├── templates/                  # Arquivos de templates HTML (Jinja2)
│   └── index.html              # Interface do terminal financeiro
│
├── static/                     # Arquivos estáticos servidos pelo Flask
│   ├── css/
│   │   └── style.css           # Estilos e design moderno do terminal dark
│   └── js/
│       └── app.js              # Lógica de gráficos TradingView e WebSockets Binance
│
├── requirements.txt            # Dependências do projeto (Flask, requests, pandas, etc.)
├── .gitignore                  # Regras para ignorar arquivos temporários, caches e CSVs
├── .env.example                # Modelo de variáveis de ambiente
└── README.md                   # Documentação completa
```

---

## ⚡ 1. Instalação e Execução Rápida (1 Clique no Windows)

### 🖱️ Em um novo computador:
1. Dê um duplo clique no arquivo:
   👉 **`Instalador.bat`**
   - Ele verifica se o Python está instalado;
   - Instala e atualiza todas as dependências (`requirements.txt`);
   - Gera o arquivo `.env` automaticamente com a chave Etherscan V2 já configurada;
   - Dá a opção de iniciar o servidor na hora.

2. Para iniciar o servidor e abrir o navegador a qualquer momento:
   👉 **`Iniciar_Servidor.bat`**
   - Inicia o servidor Flask em segundo plano;
   - Abre automaticamente a página principal no seu navegador em `http://127.0.0.1:5000`.

3. Para executar o Terminal Quant Institucional em modo Console (Rich TUI):
   👉 **`Iniciar_TUI.bat`**
   - Executa no terminal uma interface institucional com `rich.live.Live` (2Hz);
   - Fatores da Descida, Probabilidade das 4 Ordens Limite, Altseason Index e Recálculo Fibonacci.

---

### 💻 Ou via Terminal Manual:
```bash
pip install -r requirements.txt
pip install rich python-binance pandas-ta yfinance web3 requests
python app.py
```
Acesse no navegador:
👉 **[http://127.0.0.1:5000](http://127.0.0.1:5000)** (Terminal Principal)
👉 **[http://127.0.0.1:5000/tui](http://127.0.0.1:5000/tui)** (TUI Web & Rich Console View)
👉 **[http://127.0.0.1:5000/zscore-blocos](http://127.0.0.1:5000/zscore-blocos)** (Analisador de Blocos & Z-Score)
👉 **[http://127.0.0.1:5000/data-analise](http://127.0.0.1:5000/data-analise)** (Data Análise & Volatilidade)
👉 **[http://127.0.0.1:5000/liquidez](http://127.0.0.1:5000/liquidez)** (Monitor de Liquidez & Stops)

---

## 🛠️ 2. Rotas Backend da API Flask (`app.py`)

Além de servir a interface gráfica, o backend Flask disponibiliza rotas REST prontas para consumo:

| Rota | Método | Descrição |
| :--- | :---: | :--- |
| `/` | `GET` | Renderiza a página principal do terminal (`index.html`). |
| `/tui` ou `/tui.html` | `GET` | Renderiza a interface do Terminal Quant Institucional (`tui.html`). |
| `/api/quant/state` | `GET` | Retorna o estado quantitativo consolidado (ordens, descida, altseason, Fibo). |
| `/api/quant/orders` | `GET` | Lista as 4 ordens limites estratégicas canônicas (A, B, C, D) com probabilidade e distâncias. |
| `/api/quant/onchain` | `GET` | Métricas do Radar On-Chain (Net Issuance EIP-1559, Blobs EIP-4844, Staking Ratio, TVL DefiLlama). |
| `/api/quant/valuation` | `GET` | Matriz de Valuation Macro (MVRV Z-Score, múltiplos TVL, ETH/BTC, Fibo de ciclo e cenários). |
| `/api/quant/macro-summary` | `GET` | Resumo 360° em tempo real para alimentar widgets, TUI e semáforos de topo. |
| `/api/quant/config` | `GET` | Parâmetros canônicos de configuração do motor (`quant_config.json`). |
| `/api/price/<symbol>` | `GET` | Retorna o preço atual do par (ex: `/api/price/ETHUSDT`). |
| `/api/ticker/<symbol>` | `GET` | Retorna métricas de 24 horas (máx, mín, variação, volume). |
| `/api/klines/<symbol>` | `GET` | Retorna candles históricos (`?interval=15m&limit=500`). |
| `/api/depth/<symbol>` | `GET` | Retorna o livro de ofertas (Order Book com bids e asks). |
| `/api/trades/<symbol>` | `GET` | Retorna as negociações recentes a mercado. |
| `/api/indicators/<symbol>` | `GET` | Calcula EMA 20, EMA 50, RSI 14 e Bollinger Bands no servidor. |
| `/api/export/<symbol>` | `GET` | Baixa diretamente uma planilha CSV com os candles solicitados. |

---

## 🐍 3. Scripts de Linha de Comando (CLI)

### A. Teste de Conexão com a Binance
```bash
python binance_client.py
```

### B. Baixar Candles Históricos em Lote para CSV (com Paginação Automática)
```bash
# Formato: python export_historical.py <PAR> <INTERVALO> <QUANTIDADE>
python export_historical.py ETHUSDT 1h 1000
python export_historical.py BTCUSDT 5m 2000
```

### C. Streaming de Dados ao Vivo no Terminal
```bash
python stream_realtime.py ethusdt 1m
```

### D. Análise Técnica Automatizada
```bash
python indicators.py
```

---

## 📦 4. Preparação para Commit e Push no Git

O repositório já foi inicializado (`git init`) com o arquivo [`.gitignore`](file:///c:/Users/cytch/Documents/GitHub/Automatizar_ETH/.gitignore) devidamente configurado para não subir caches (`__pycache__`), arquivos `.env` ou grandes volumes de planilhas locais `.csv`.

Para realizar seu primeiro commit e enviar para o GitHub:

```bash
# 1. Adicionar todos os arquivos organizados
git add .

# 2. Criar o commit inicial
git commit -m "feat: initial commit - flask binance market terminal & toolkit"

# 3. Vincular ao seu repositório remoto no GitHub (substitua pela sua URL)
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/Automatizar_ETH.git

# 4. Enviar os arquivos
git push -u origin main
```
