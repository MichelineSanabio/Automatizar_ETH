/**
 * Data Análise & Volatilidade Histórica (Binance Terminal)
 * Gerencia requisições assíncronas, renderização de gráficos Chart.js,
 * heatmap interativo e insights estatísticos.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Estado local da tela de análise
  const state = {
    symbol: "ETHUSDT",
    interval: "1h",
    years: 2.0,
    startDate: "",
    endDate: "",
    tzOffset: -3,
    activePreset: "2y",
    charts: {
      periods: null,
      hours: null,
      weekdays: null
    },
    lastData: null
  };

  // Elementos do DOM
  const symbolSelect = document.getElementById("symbolSelect");
  const intervalSelect = document.getElementById("intervalSelect");
  const tzSelect = document.getElementById("tzSelect");
  const startDateInput = document.getElementById("startDateInput");
  const endDateInput = document.getElementById("endDateInput");
  const presetButtons = document.querySelectorAll(".preset-btn");
  const btnRunAnalysis = document.getElementById("btnRunAnalysis");
  const btnExportCSV = document.getElementById("btnExportCSV");
  const btnExportJSON = document.getElementById("btnExportJSON");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingSubtext = document.getElementById("loadingSubtext");

  // Configurar datas iniciais padrão (2 anos atrás até hoje)
  function initDates() {
    const today = new Date();
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(today.getFullYear() - 2);

    endDateInput.value = today.toISOString().split("T")[0];
    startDateInput.value = twoYearsAgo.toISOString().split("T")[0];
    state.startDate = startDateInput.value;
    state.endDate = endDateInput.value;
  }

  // Atualizar presets de período
  presetButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      presetButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const preset = btn.dataset.preset;
      state.activePreset = preset;

      const today = new Date();
      endDateInput.value = today.toISOString().split("T")[0];

      if (preset === "2y") {
        const past = new Date();
        past.setFullYear(today.getFullYear() - 2);
        startDateInput.value = past.toISOString().split("T")[0];
        state.years = 2.0;
      } else if (preset === "1y") {
        const past = new Date();
        past.setFullYear(today.getFullYear() - 1);
        startDateInput.value = past.toISOString().split("T")[0];
        state.years = 1.0;
      } else if (preset === "6m") {
        const past = new Date();
        past.setMonth(today.getMonth() - 6);
        startDateInput.value = past.toISOString().split("T")[0];
        state.years = 0.5;
      } else if (preset === "3m") {
        const past = new Date();
        past.setMonth(today.getMonth() - 3);
        startDateInput.value = past.toISOString().split("T")[0];
        state.years = 0.25;
      }

      state.startDate = startDateInput.value;
      state.endDate = endDateInput.value;
      runAnalysis();
    });
  });

  // Inputs manuais de data
  startDateInput.addEventListener("change", () => {
    state.startDate = startDateInput.value;
    presetButtons.forEach(b => b.classList.remove("active"));
  });

  endDateInput.addEventListener("change", () => {
    state.endDate = endDateInput.value;
    presetButtons.forEach(b => b.classList.remove("active"));
  });

  // Seletor de símbolo, intervalo e fuso
  symbolSelect.addEventListener("change", (e) => {
    state.symbol = e.target.value;
    runAnalysis();
  });

  intervalSelect.addEventListener("change", (e) => {
    state.interval = e.target.value;
    runAnalysis();
  });

  tzSelect.addEventListener("change", (e) => {
    state.tzOffset = parseInt(e.target.value, 10);
    runAnalysis();
  });

  btnRunAnalysis.addEventListener("click", () => {
    runAnalysis();
  });

  // Função principal para carregar dados e calcular
  async function runAnalysis() {
    showLoading(true, `Baixando candles de ${state.symbol} (${state.interval}) e calculando volatilidade...`);

    try {
      const params = new URLSearchParams({
        symbol: state.symbol,
        interval: state.interval,
        start_date: state.startDate,
        end_date: state.endDate,
        years: state.years,
        tz_offset: state.tzOffset
      });

      const response = await fetch(`/api/analysis/volatility?${params.toString()}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Falha na comunicação com a API");
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Dados não retornados");
      }

      state.lastData = data;
      renderAll(data);
    } catch (err) {
      console.error("[!] Erro na análise:", err);
      alert(`Erro ao processar análise: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  function showLoading(show, message = "") {
    if (show) {
      loadingOverlay.classList.add("active");
      loadingSubtext.textContent = message;
    } else {
      loadingOverlay.classList.remove("active");
    }
  }

  // Suporte a Upload de CSV local
  const csvFileInput = document.getElementById("csvFileInput");
  if (csvFileInput) {
    csvFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("tz_offset", state.tzOffset);

      showLoading(true, `Enviando e processando arquivo CSV local (${file.name})...`);
      try {
        const resp = await fetch("/api/analysis/upload-csv", {
          method: "POST",
          body: formData
        });
        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || "Falha ao processar CSV");
        }
        state.lastData = data;
        renderAll(data);
      } catch (err) {
        console.error("[!] Erro no upload CSV:", err);
        alert("Erro no upload do CSV: " + err.message);
      } finally {
        showLoading(false);
      }
    });
  }

  // Renderizar todos os blocos visuais
  function renderAll(data) {
    renderInsightBanner(data);
    renderDirectComparison(data);
    renderKPICards(data);
    renderPeriodCards(data);
    renderPeriodChart(data);
    renderHoursChart(data);
    renderWeekdaysChart(data);
    renderHeatmap(data);
    renderSummaryTable(data);
    renderTopSpikesTable(data);

    // Atualizar ícones Lucide recém-injetados
    if (window.refreshIcons) {
      window.refreshIcons();
    } else if (window.lucide) {
      lucide.createIcons();
    }
  }

  // 1.1 Confronto Direto: Manhã vs Tarde (Prompt Gemini)
  function renderDirectComparison(data) {
    const card = document.getElementById("directComparisonCard");
    if (!card) return;

    const direct = data.insights && data.insights.direct_comparison;
    if (!direct) {
      card.style.display = "none";
      return;
    }
    card.style.display = "flex";

    const m = direct.manha;
    const t = direct.tarde;
    const winner = direct.winner; // "Manhã" ou "Tarde"
    const diff = direct.diff_pct;

    card.innerHTML = `
      <div class="h2h-header">
        <div class="h2h-title">
          <i data-lucide="scale"></i>
          <span>Duelo Direto: Manhã (06h às 11:59) vs Tarde (12h às 17:59)</span>
        </div>
        <div class="h2h-badge-fuso">
          Fuso Adotado: ${direct.fuso_adotado} | Métrica: ${direct.formula}
        </div>
      </div>

      <div class="h2h-verdict-banner">
        <div class="h2h-trophy">🏆</div>
        <div class="h2h-verdict-text">
          ${direct.verdict}
        </div>
      </div>

      <div class="h2h-grid">
        <!-- Coluna Manhã -->
        <div class="h2h-column ${winner === 'Manhã' ? 'winner' : ''}" style="border-top: 3px solid #3498db;">
          <div class="h2h-col-header">
            <div class="h2h-col-title" style="color: #3498db;">
              <i data-lucide="sunrise"></i>
              <span>Manhã</span>
              ${winner === 'Manhã' ? '<span class="badge-kpi yellow">🏆 Vencedor</span>' : ''}
            </div>
            <div class="h2h-col-hours">06:00 - 11:59</div>
          </div>
          <div class="h2h-metrics-list">
            <div class="h2h-metric-row">
              <span class="label">Volatilidade Média:</span>
              <span class="val" style="color: #3498db; font-size: 15px;">${m.media_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Mediana da Volatilidade:</span>
              <span class="val">${m.mediana_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Pico Máximo Registrado:</span>
              <span class="val font-bold">${m.maximo_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Desvio Padrão:</span>
              <span class="val">±${m.desvio_padrao_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Volume Médio (USDT):</span>
              <span class="val">${formatUSD(m.volume_medio_usd)}</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Candles Analisados:</span>
              <span class="val">${m.candles.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <!-- VS Divider -->
        <div class="h2h-vs-divider">
          <div class="h2h-vs-circle">VS</div>
          <div class="h2h-diff-badge">+${diff}%</div>
        </div>

        <!-- Coluna Tarde -->
        <div class="h2h-column ${winner === 'Tarde' ? 'winner' : ''}" style="border-top: 3px solid #f0b90b;">
          <div class="h2h-col-header">
            <div class="h2h-col-title" style="color: #f0b90b;">
              <i data-lucide="sun"></i>
              <span>Tarde</span>
              ${winner === 'Tarde' ? '<span class="badge-kpi yellow">🏆 Vencedor</span>' : ''}
            </div>
            <div class="h2h-col-hours">12:00 - 17:59</div>
          </div>
          <div class="h2h-metrics-list">
            <div class="h2h-metric-row">
              <span class="label">Volatilidade Média:</span>
              <span class="val" style="color: #f0b90b; font-size: 15px;">${t.media_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Mediana da Volatilidade:</span>
              <span class="val">${t.mediana_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Pico Máximo Registrado:</span>
              <span class="val font-bold">${t.maximo_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Desvio Padrão:</span>
              <span class="val">±${t.desvio_padrao_pct}%</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Volume Médio (USDT):</span>
              <span class="val">${formatUSD(t.volume_medio_usd)}</span>
            </div>
            <div class="h2h-metric-row">
              <span class="label">Candles Analisados:</span>
              <span class="val">${t.candles.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 1. Banner de Insight Executivo
  function renderInsightBanner(data) {
    const banner = document.getElementById("executiveInsight");
    if (!banner) return;

    const champ = data.insights.champion_period;
    const calm = data.insights.calmest_period;
    const peak = data.insights.peak_hour;
    const peakDay = data.insights.peak_weekday;
    const diff = data.insights.volatility_premium_pct;

    banner.innerHTML = `
      <div class="insight-icon">
        <i data-lucide="sparkles"></i>
      </div>
      <div class="insight-content">
        <div class="insight-title">
          <span>Insight Algorítmico do Período</span>
          <span class="badge-tag">${data.total_candles.toLocaleString()} candles de ${data.interval} analisados</span>
        </div>
        <div class="insight-text">
          Nos últimos dados históricos de <strong>${data.symbol}</strong> (${data.date_range.start} até ${data.date_range.end}, ${data.timezone.label}), 
          o período com maior volatilidade foi a <strong style="color: ${champ.color}">${champ.name} (${champ.hours_range})</strong> 
          com oscilação média de <strong>${champ.avg_volatility_pct}%</strong> por candle — representando 
          <strong>+${diff}% de amplitude</strong> em relação à <strong style="color: ${calm.color}">${calm.name}</strong> (${calm.avg_volatility_pct}%), que foi o momento mais calmo. 
          O horário pontual mais explosivo é às <strong>${peak.label}</strong> (${peak.avg_volatility_pct}%) e o dia com maior volume/movimento é <strong>${peakDay.name}</strong>.
        </div>
      </div>
    `;
  }

  // 2. Scorecards KPI
  function renderKPICards(data) {
    const kpiWrap = document.getElementById("kpiCards");
    if (!kpiWrap) return;

    const champ = data.insights.champion_period;
    const calm = data.insights.calmest_period;
    const peak = data.insights.peak_hour;
    const peakDay = data.insights.peak_weekday;

    kpiWrap.innerHTML = `
      <div class="kpi-card" style="border-left: 4px solid ${champ.color}">
        <div class="kpi-header">
          <span class="kpi-label">Período Mais Volátil</span>
          <div class="kpi-icon-wrap" style="background: rgba(240, 185, 11, 0.15); color: #f0b90b;">
            <i data-lucide="flame"></i>
          </div>
        </div>
        <div class="kpi-value" style="color: ${champ.color}">${champ.name}</div>
        <div class="kpi-sub">
          <span>Média <strong>${champ.avg_volatility_pct}%</strong> / candle</span>
          <span class="badge-kpi yellow">+${data.insights.volatility_premium_pct}%</span>
        </div>
      </div>

      <div class="kpi-card" style="border-left: 4px solid ${calm.color}">
        <div class="kpi-header">
          <span class="kpi-label">Período Mais Estável / Calmo</span>
          <div class="kpi-icon-wrap" style="background: rgba(155, 89, 182, 0.15); color: #9b59b6;">
            <i data-lucide="shield-check"></i>
          </div>
        </div>
        <div class="kpi-value" style="color: ${calm.color}">${calm.name}</div>
        <div class="kpi-sub">
          <span>Média <strong>${calm.avg_volatility_pct}%</strong> / candle</span>
          <span class="badge-kpi" style="background: rgba(255,255,255,0.08); color: #aaa;">Menor ruído</span>
        </div>
      </div>

      <div class="kpi-card" style="border-left: 4px solid #3498db">
        <div class="kpi-header">
          <span class="kpi-label">Horário de Pico Intraday</span>
          <div class="kpi-icon-wrap" style="background: rgba(52, 152, 219, 0.15); color: #3498db;">
            <i data-lucide="clock"></i>
          </div>
        </div>
        <div class="kpi-value">${peak.label}</div>
        <div class="kpi-sub">
          <span>Amplitude média <strong>${peak.avg_volatility_pct}%</strong></span>
          <span class="badge-kpi green">${data.timezone.label.split(" ")[0]}</span>
        </div>
      </div>

      <div class="kpi-card" style="border-left: 4px solid #0ecb81">
        <div class="kpi-header">
          <span class="kpi-label">Dia da Semana Mais Ativo</span>
          <div class="kpi-icon-wrap" style="background: rgba(14, 203, 129, 0.15); color: #0ecb81;">
            <i data-lucide="calendar"></i>
          </div>
        </div>
        <div class="kpi-value">${peakDay.name.split("-")[0]}</div>
        <div class="kpi-sub">
          <span>Volatilidade <strong>${peakDay.avg_volatility_pct}%</strong></span>
          <span class="badge-kpi green">Pico Semanal</span>
        </div>
      </div>
    `;
  }

  // 3. Cards Comparativos dos 4 Períodos
  function renderPeriodCards(data) {
    const container = document.getElementById("periodCards");
    if (!container) return;

    const champKey = data.insights.champion_period.key;

    container.innerHTML = data.periods.map(p => {
      const isChamp = p.key === champKey;
      return `
        <div class="period-card ${isChamp ? 'champion' : ''}" style="border-top: 3px solid ${p.color};">
          <div class="period-card-top">
            <div class="period-identity">
              <div class="period-badge-icon" style="background: ${p.color}22; color: ${p.color};">
                <i data-lucide="${p.icon}"></i>
              </div>
              <div>
                <div class="period-name">${p.name}</div>
                <div class="period-hours">${p.hours_range}</div>
              </div>
            </div>
            ${isChamp ? '<span class="champion-tag">🏆 Campeão</span>' : ''}
          </div>

          <div class="period-metric-main">
            <span class="period-metric-label">Volatilidade Média</span>
            <span class="period-metric-val" style="color: ${p.color};">${p.avg_volatility_pct}%</span>
          </div>

          <div class="period-stats-list">
            <div class="period-stat-row">
              <span class="stat-label">Oscilação Mediana:</span>
              <span class="stat-val">${p.median_volatility_pct}%</span>
            </div>
            <div class="period-stat-row">
              <span class="stat-label">Desvio Padrão:</span>
              <span class="stat-val">±${p.std_dev_pct}%</span>
            </div>
            <div class="period-stat-row">
              <span class="stat-label">Maior Spike Registrado:</span>
              <span class="stat-val font-bold" style="color: ${p.color};">${p.max_volatility_pct}%</span>
            </div>
            <div class="period-stat-row">
              <span class="stat-label">Share de Volume ($):</span>
              <span class="stat-val">${p.volume_share_pct}% (${formatUSD(p.total_volume_usd)})</span>
            </div>
            <div class="period-stat-row">
              <span class="stat-label">Candles de Alta (Win Rate):</span>
              <span class="stat-val" style="color: ${p.win_rate_bullish_pct >= 50 ? 'var(--green)' : 'var(--red)'};">
                ${p.win_rate_bullish_pct}%
              </span>
            </div>
          </div>

          <div class="period-desc">${p.description}</div>
        </div>
      `;
    }).join("");
  }

  // 4. Gráfico de Comparação dos 4 Períodos (Chart.js)
  function renderPeriodChart(data) {
    const ctx = document.getElementById("chartPeriods");
    if (!ctx) return;

    if (state.charts.periods) {
      state.charts.periods.destroy();
    }

    const labels = data.periods.map(p => `${p.name} (${p.hours_range})`);
    const volData = data.periods.map(p => p.avg_volatility_pct);
    const colors = data.periods.map(p => p.color);

    state.charts.periods = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Volatilidade Média (%)",
          data: volData,
          backgroundColor: colors.map(c => c + "cc"),
          borderColor: colors,
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Amplitude média: ${ctx.parsed.y.toFixed(2)}% por candle`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#848e9c",
              font: { family: "JetBrains Mono" },
              callback: (v) => v + "%"
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: "#eaecef",
              font: { family: "Inter", weight: "600" }
            }
          }
        }
      }
    });
  }

  // 5. Gráfico das 24 Horas do Dia (Curva Intraday)
  function renderHoursChart(data) {
    const ctx = document.getElementById("chartHours");
    if (!ctx) return;

    if (state.charts.hours) {
      state.charts.hours.destroy();
    }

    const labels = data.hours.map(h => h.label);
    const volData = data.hours.map(h => h.avg_volatility_pct);

    state.charts.hours = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Volatilidade (%)",
          data: volData,
          borderColor: "#f0b90b",
          backgroundColor: "rgba(240, 185, 11, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: "#f0b90b",
          pointBorderColor: "#0b0e14",
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Horário ${ctx.label}: ${ctx.parsed.y.toFixed(2)}% oscilação média`
            }
          }
        },
        scales: {
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#848e9c",
              font: { family: "JetBrains Mono" },
              callback: (v) => v + "%"
            }
          },
          x: {
            grid: { color: "rgba(255, 255, 255, 0.03)" },
            ticks: {
              color: "#848e9c",
              font: { family: "JetBrains Mono", size: 10 }
            }
          }
        }
      }
    });
  }

  // 6. Gráfico de Dias da Semana
  function renderWeekdaysChart(data) {
    const ctx = document.getElementById("chartWeekdays");
    if (!ctx) return;

    if (state.charts.weekdays) {
      state.charts.weekdays.destroy();
    }

    const labels = data.weekdays.map(w => w.name);
    const volData = data.weekdays.map(w => w.avg_volatility_pct);

    state.charts.weekdays = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Volatilidade (%)",
          data: volData,
          backgroundColor: volData.map((v, i) => {
            return (i === 5 || i === 6) ? "rgba(155, 89, 182, 0.45)" : "rgba(14, 203, 129, 0.55)";
          }),
          borderColor: volData.map((v, i) => {
            return (i === 5 || i === 6) ? "#9b59b6" : "#0ecb81";
          }),
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Média no dia: ${ctx.parsed.y.toFixed(2)}%`
            }
          }
        },
        scales: {
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#848e9c",
              font: { family: "JetBrains Mono" },
              callback: (v) => v + "%"
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: "#eaecef",
              font: { family: "Inter", size: 11 }
            }
          }
        }
      }
    });
  }

  // 7. Heatmap Interativo (7 Dias x 24 Horas)
  function renderHeatmap(data) {
    const container = document.getElementById("heatmapContainer");
    if (!container) return;

    const matrix = data.heatmap.matrix;
    const hours = data.heatmap.hours;
    const weekdays = data.heatmap.weekdays;

    // Achar máximo e mínimo da matriz para escala de cores
    let maxVal = 0.01;
    let minVal = 999.0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = matrix[d][h];
        if (v > maxVal) maxVal = v;
        if (v < minVal && v > 0) minVal = v;
      }
    }

    let html = `
      <table class="heatmap-table">
        <thead>
          <tr>
            <th style="width: 70px; text-align: left; padding-left: 10px;">Dia / Hora</th>
            ${hours.map(h => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
    `;

    for (let d = 0; d < 7; d++) {
      html += `<tr>`;
      html += `<td class="heatmap-day-label">${weekdays[d]}</td>`;

      for (let h = 0; h < 24; h++) {
        const val = matrix[d][h];
        // Calcular intensidade de 0.0 a 1.0
        const ratio = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal || 1)));
        
        // Cor: de azul escuro / neutro -> âmbar / dourado -> vermelho intenso
        let bgColor;
        if (ratio < 0.4) {
          bgColor = `rgba(52, 152, 219, ${0.15 + ratio * 0.6})`;
        } else if (ratio < 0.75) {
          bgColor = `rgba(240, 185, 11, ${0.3 + (ratio - 0.4) * 1.5})`;
        } else {
          bgColor = `rgba(246, 70, 93, ${0.6 + (ratio - 0.75) * 1.5})`;
        }

        const textColor = ratio > 0.5 ? '#ffffff' : '#b0b8c5';

        html += `
          <td class="heatmap-cell" style="background-color: ${bgColor}; color: ${textColor};"
              title="${weekdays[d]} às ${hours[h]}: ${val.toFixed(2)}% de volatilidade média">
            ${val > 0 ? val.toFixed(1) : '-'}
          </td>
        `;
      }

      html += `</tr>`;
    }

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // 8. Tabela Detalhada de Resumo dos Períodos
  function renderSummaryTable(data) {
    const tbody = document.getElementById("summaryTableBody");
    if (!tbody) return;

    const champKey = data.insights.champion_period.key;

    tbody.innerHTML = data.periods.map(p => {
      const isChamp = p.key === champKey;
      return `
        <tr class="${isChamp ? 'champion-row' : ''}">
          <td style="font-weight: 700; color: ${p.color};">
            ${isChamp ? '⭐ ' : ''}${p.name}
          </td>
          <td class="font-mono">${p.hours_range}</td>
          <td class="font-mono">${p.candle_count.toLocaleString()}</td>
          <td class="font-mono font-bold" style="color: ${p.color};">${p.avg_volatility_pct}%</td>
          <td class="font-mono">${p.median_volatility_pct}%</td>
          <td class="font-mono">±${p.std_dev_pct}%</td>
          <td class="font-mono" style="color: #fff;">${p.max_volatility_pct}%</td>
          <td class="font-mono">${formatUSD(p.total_volume_usd)}</td>
          <td class="font-mono" style="color: ${p.win_rate_bullish_pct >= 50 ? 'var(--green)' : 'var(--red)'};">
            ${p.win_rate_bullish_pct}%
          </td>
          <td class="font-mono">${p.avg_return_pct > 0 ? '+' : ''}${p.avg_return_pct}%</td>
        </tr>
      `;
    }).join("");
  }

  // 9. Tabela dos Top 10 Maiores Spikes
  function renderTopSpikesTable(data) {
    const tbody = document.getElementById("topSpikesBody");
    if (!tbody) return;

    tbody.innerHTML = data.top_spikes.map((s, idx) => {
      const isUp = s.direction === "up";
      return `
        <tr>
          <td class="font-mono font-bold">#${idx + 1}</td>
          <td class="font-mono">${s.datetime_local}</td>
          <td class="font-mono">$${formatNumber(s.open)}</td>
          <td class="font-mono">$${formatNumber(s.high)}</td>
          <td class="font-mono">$${formatNumber(s.low)}</td>
          <td class="font-mono">$${formatNumber(s.close)}</td>
          <td class="font-mono font-bold" style="color: ${isUp ? 'var(--green)' : 'var(--red)'};">
            ${s.amplitude_pct}%
          </td>
          <td class="font-mono">$${formatNumber(s.amplitude_usd)}</td>
          <td class="font-mono">${formatUSD(s.quote_volume)}</td>
          <td>
            <span class="badge-spike ${isUp ? 'up' : 'down'}">
              ${isUp ? 'ALTA ↗' : 'QUEDA ↘'}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Exportações
  btnExportCSV.addEventListener("click", () => {
    const params = new URLSearchParams({
      symbol: state.symbol,
      interval: state.interval,
      start_date: state.startDate,
      end_date: state.endDate,
      years: state.years,
      tz_offset: state.tzOffset
    });
    window.location.href = `/api/analysis/export-csv?${params.toString()}`;
  });

  btnExportJSON.addEventListener("click", () => {
    if (!state.lastData) {
      alert("Nenhum dado disponível para exportar. Execute a análise primeiro.");
      return;
    }
    const blob = new Blob([JSON.stringify(state.lastData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Analise_Volatilidade_${state.symbol}_${state.interval}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Helpers de formatação
  function formatNumber(num) {
    if (num === null || num === undefined) return "--";
    return Number(num).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatUSD(amount) {
    if (!amount) return "$0";
    if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
    if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
    if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
    return `$${amount.toFixed(2)}`;
  }

  // Inicializar
  initDates();
  runAnalysis();
});
