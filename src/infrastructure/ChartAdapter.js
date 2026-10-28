/**
 * Camada de Infraestrutura: ChartAdapter
 * Adaptador para Chart.js 4.4.1 integrado com os tokens visuais do Design System Systekna.
 */
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
      const texto = `R$ ${Math.round(valores[i]).toLocaleString('pt-BR')}`;
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
   * Inicializa o gráfico de partilha orçamentária (Rosca / Donut)
   */
  initBudgetChart(canvasEl, initialData = [42, 12, 20, 16, 10]) {
    if (!canvasEl || typeof Chart === 'undefined') return;
    if (this.budgetChart) this.budgetChart.destroy();

    const ctx = canvasEl.getContext('2d');
    this.budgetChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [
          'Previdência e Benefícios',
          'Juros da Dívida',
          'Folha de Servidores',
          'Saúde e Educação',
          'Investimentos Livres'
        ],
        datasets: [{
          data: initialData,
          backgroundColor: [
            '#6C9CFF', // info
            '#F1707B', // down
            '#B794F6', // purple
            '#3DD68C', // accent/up
            '#FFD43B'  // gold
          ],
          borderColor: '#1F1F1F',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
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
              label: c => ` ${c.label}: R$ ${c.raw.toFixed(1).replace('.', ',')} Bi`
            }
          }
        },
        cutout: '62%'
      }
    });
  }

  /**
   * Atualiza a partilha orçamentária
   */
  updateBudgetBreakdown(breakdownArray) {
    if (this.budgetChart) {
      this.budgetChart.data.datasets[0].data = breakdownArray;
      this.budgetChart.update();
    }
  }

  /**
   * Inicializa o gráfico de barras horizontais de R$ por pessoa por ano (uma série, cor única)
   */
  initPerCapitaChart(canvasEl) {
    if (!canvasEl || typeof Chart === 'undefined') return;
    if (this.perCapitaChart) this.perCapitaChart.destroy();

    this.perCapitaBase = 'habitante';
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
              label: c => ` R$ ${Math.round(c.raw).toLocaleString('pt-BR')} por ${this.perCapitaBase} / ano`
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
            ticks: { color: '#D6D6D6', font: { family: 'Inter', size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  /**
   * Atualiza as barras de R$ por pessoa
   * @param {string[]} labels
   * @param {number[]} values
   * @param {string} baseSingular 'habitante' ou 'eleitor'
   */
  updatePerCapita(labels, values, baseSingular) {
    this.perCapitaBase = baseSingular;
    if (this.perCapitaChart) {
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
