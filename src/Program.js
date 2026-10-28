import { GovApiGateway } from './infrastructure/GovApiGateway.js';
import { ChartAdapter } from './infrastructure/ChartAdapter.js?v=20261028d';
import { MacroObservatoryService } from './application/MacroObservatoryService.js';
import { ObservatoryView } from './ui/ObservatoryView.js?v=20261028d';
import { renderIcons } from './ui/SvgIcons.js?v=20261028d';

/**
 * Composition Root da Aplicação
 * Padrão Canônico Systekna: Program.js com Injeção de Dependências
 */
export class Program {
  static async run() {
    console.log('[Observatório Macroeconômico] Inicializando Composition Root...');

    // 1. Renderizar Ícones SVG Canônicos
    renderIcons(document);

    // 2. Instanciar Infraestrutura
    const chartAdapter = new ChartAdapter();

    // Log técnico das requisições às APIs vai para o console do navegador (F12)
    const consoleDe = { info: console.info, warn: console.warn, error: console.error };
    const apiGateway = new GovApiGateway({
      timeoutMs: 6000,
      onLog: (log) => (consoleDe[log.type] || console.log)(`[APIs ${log.timestamp}] ${log.message}`)
    });

    // 3. Instanciar Aplicação
    const service = new MacroObservatoryService({
      apiGateway
    });

    // 4. Instanciar UI / View
    const viewInstance = new ObservatoryView({
      service,
      chartAdapter
    });

    // 5. Inicializar Gráficos Chart.js
    const canvasDebt = document.getElementById('chartDebtTraj');
    const canvasBudget = document.getElementById('chartBudgetPie');
    const canvasPerCapita = document.getElementById('chartPerCapita');

    if (canvasDebt) chartAdapter.initDebtChart(canvasDebt);
    if (canvasBudget) chartAdapter.initBudgetChart(canvasBudget);
    if (canvasPerCapita) chartAdapter.initPerCapitaChart(canvasPerCapita);

    // 6. Primeira Renderização
    viewInstance.render();

    console.log('[Observatório Macroeconômico] Sistema pronto.');
  }
}

// Inicialização automática quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Program.run());
} else {
  Program.run();
}
