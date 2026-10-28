/**
 * Camada de Infraestrutura: ChartAdapter
 * Adaptador para Chart.js 4.4.1 integrado com os tokens visuais do Design System Systekna.
 */
/** Formato padrão: reais inteiros (R$ por pessoa) */
const reaisInteiros = v => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

/** Valor em reais escrito ao lado de cada barra horizontal (ou dentro dela, se não couber à direita) */
const rotuloDasBarras = {
  id: 'rotuloDasBarras',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);
    const valores = chart.data.datasets[0].data;
    ctx.save();
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    meta.data.forEach((barra, i) => {
      const texto = (chart.$stkFormatar || reaisInteiros)(valores[i]);
      const largura = ctx.measureText(texto).width;
      const cabeFora = barra.x + 6 + largura <= chartArea.right;
      ctx.textAlign = cabeFora ? 'left' : 'right';
      ctx.fillStyle = cabeFora ? '#D6D6D6' : '#0E1210';
      ctx.fillText(texto, cabeFora ? barra.x + 6 : barra.x - 6, barra.y);
    });
    ctx.restore();
  }
};

export class ChartAdapter {
  constructor() {
    this.debtChart = null;
    this.budgetChart = null;
    this.perCapitaChart = null;
    this.debtTri = [];
  }

  /**
   * Inicializa o gráfico de trajetória da dívida pública (Linha)
   */
  initDebtChart(canvasEl, initialData = [79.0, 79.5, 80.1, 80.6, 81.1]) {
    if (!canvasEl || typeof Chart === 'undefined') return;
    if (this.debtChart) this.debtChart.destroy();

    const ctx = canvasEl.getContext('2d');
    this.debtChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Ano 1', 'Ano 2', 'Ano 3', 'Ano 4', 'Ano 5'],
        datasets: [{
          label: 'Dívida Bruta (% do PIB)',
          data: initialData,
          borderColor: '#FFD43B',
          backgroundColor: 'rgba(255, 212, 59, 0.12)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#FFD43B',
          pointBorderColor: '#1F1F1F',
          pointBorderWidth: 2,
          pointRadius: 4.5,
          pointHoverRadius: 6.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#D6D6D6',
              font: { family: 'Inter', size: 11, weight: '500' }
            }
          },
          tooltip: {
            backgroundColor: '#2B2B2B',
            borderColor: '#3D3D3D',
            borderWidth: 1,
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: c => {
                const tri = this.debtTri[c.dataIndex];
                const reais = tri ? ` · R$ ${tri.toFixed(2).replace('.', ',')} Tri` : '';
                return ` DBGG: ${c.raw.toFixed(2).replace('.', ',')}% do PIB${reais}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#ADADAD', font: { family: 'Inter', size: 10 } },
            grid: { display: false }
          },
          y: {
            ticks: {
              color: '#ADADAD',
              font: { family: 'Inter', size: 10 },
              callback: v => `${v}%`
            },
            grid: { color: '#333333' }
          }
        }
      }
    });
  }

  /**
   * Atualiza os pontos de trajetória da dívida
   */
  updateDebtTrajectory(data, dataTri = []) {
    this.debtTri = dataTri;
    if (this.debtChart) {
      this.debtChart.data.datasets[0].data = data;
      this.debtChart.update();
    }
  }

  /**
   * Inicializa a rosca da composição do gasto da União (rótulos e valores chegam em updateBudgetBreakdown)
   */
  initBudgetChart(canvasEl) {
    if (!canvasEl || typeof Chart === 'undefined') return;
    if (this.budgetChart) this.budgetChart.destroy();

    const ctx = canvasEl.getContext('2d');
    this.budgetChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [
            '#6C9CFF', // previdência
            '#F1707B', // juros
            '#E0A0A6', // amortização
            '#B794F6', // transferências
            '#3DD68C', // pessoal
            '#FFD43B', // investimentos
            '#8A8A8A'  // demais
          ],
          borderColor: '#1F1F1F',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Celular: legenda embaixo da rosca, para a rosca não ficar espremida
        onResize: (chart, tamanho) => {
          const posicao = tamanho.width < 480 ? 'bottom' : 'right';
          if (chart.options.plugins.legend.position !== posicao) {
            chart.options.plugins.legend.position = posicao;
            chart.update('none');
          }
        },
        plugins: {
          legend: {
            position: typeof window !== 'undefined' && window.innerWidth < 640 ? 'bottom' : 'right',
            labels: {
              color: '#D6D6D6',
              font: { family: 'Inter', size: 10 },
              boxWidth: 12,
              padding: 10
            }
          },
          tooltip: {
            backgroundColor: '#2B2B2B',
            borderColor: '#3D3D3D',
            borderWidth: 1,
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: c => {
                const total = c.dataset.data.reduce((a, v) => a + v, 0);
                const pct = total > 0 ? (c.raw / total) * 100 : 0;
                return ` ${c.label}: R$ ${c.raw.toFixed(1).replace('.', ',')} Bi (${pct.toFixed(1).replace('.', ',')}%)`;
              }
            }
          }
        },
        cutout: '62%'
      }
    });
  }

  /**
   * Atualiza a composição do gasto
   * @param {string[]} labels
   * @param {number[]} values R$ Bi
   */
  updateBudgetBreakdown(labels, values) {
    if (this.budgetChart) {
      this.budgetChart.data.labels = labels;
      this.budgetChart.data.datasets[0].data = values;
      this.budgetChart.update();
    }
  }

  /**
   * Inicializa o gráfico de barras horizontais de R$ por pessoa por ano (uma série, cor única)
   */
  initPerCapitaChart(canvasEl) {
    if (!canvasEl || typeof Chart === 'undefined') return;
    if (this.perCapitaChart) this.perCapitaChart.destroy();

    this.perCapitaDescricao = 'por habitante / ano';
    const ctx = canvasEl.getContext('2d');
    this.perCapitaChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'R$ por pessoa por ano',
          data: [],
          backgroundColor: '#3DD68C',
          hoverBackgroundColor: '#6BE3A8',
          borderRadius: 4,
          borderSkipped: 'start',
          barPercentage: 0.7,
          categoryPercentage: 0.9
        }]
      },
      plugins: [rotuloDasBarras],
      options: {
        indexAxis: 'y',
        layout: { padding: { right: 72 } },
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2B2B2B',
            borderColor: '#3D3D3D',
            borderWidth: 1,
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'IBM Plex Mono' },
            callbacks: {
              label: c => ` ${(c.chart.$stkFormatar || reaisInteiros)(c.raw)} ${this.perCapitaDescricao}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            // O valor já vem escrito em cada barra: o eixo fica só com a grade
            ticks: { display: false },
            grid: { color: '#333333' }
          },
          y: {
            ticks: {
              color: '#D6D6D6',
              font: { family: 'Inter', size: 11 },
              // Em tela estreita, nomes longos encurtam; o tooltip mostra o nome inteiro
              callback(valor) {
                const rotulo = this.getLabelForValue(valor);
                return this.chart.width < 480 && rotulo.length > 18 ? `${rotulo.slice(0, 17)}…` : rotulo;
              }
            },
            grid: { display: false }
          }
        }
      }
    });
  }

  /**
   * Atualiza as barras (R$ por pessoa ou valor total)
   * @param {string[]} labels
   * @param {number[]} values
   * @param {Object} [opcoes]
   * @param {(v: number) => string} [opcoes.formatar] Texto do valor (rótulo da barra e tooltip)
   * @param {string} [opcoes.descricao] Complemento do tooltip, ex.: "por habitante / ano"
   */
  updatePerCapita(labels, values, { formatar = reaisInteiros, descricao = 'por ano' } = {}) {
    this.perCapitaDescricao = descricao;
    if (this.perCapitaChart) {
      this.perCapitaChart.$stkFormatar = formatar;
      this.perCapitaChart.data.labels = labels;
      this.perCapitaChart.data.datasets[0].data = values;
      this.perCapitaChart.update();
    }
  }

  resizeAll() {
    if (this.perCapitaChart) this.perCapitaChart.resize();
    if (this.debtChart) this.debtChart.resize();
    if (this.budgetChart) this.budgetChart.resize();
  }
}
