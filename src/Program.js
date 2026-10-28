import { GovApiGateway } from './infrastructure/GovApiGateway.js?v=20261028-1842';
import { ChartAdapter } from './infrastructure/ChartAdapter.js?v=20261028-1842';
import { MacroObservatoryService } from './application/MacroObservatoryService.js?v=20261028-1842';
import { LocalSnapshotStore } from './infrastructure/LocalSnapshotStore.js?v=20261028-1842';
import { ObservatoryView } from './ui/ObservatoryView.js?v=20261028-1842';
import { CenarioUrl } from './ui/CenarioUrl.js?v=20261028-1842';
import { SvgIcons, renderIcons } from './ui/SvgIcons.js?v=20261028-1842';
import { StkGovPwa } from '../vendor/stk-gov/stk-gov-pwa.js?v=20261028-1842';
import { StkGovShell, renderStkIcons } from '../vendor/stk-gov/stk-gov-shell.js?v=20261028-1842';

/**
 * Composition Root da Aplicação
 * Padrão Canônico Systekna: Program.js com Injeção de Dependências
 */
export class Program {
  static async run() {
    console.log('[Observatório Macroeconômico] Inicializando Composition Root...');

    // 1. Ícones: os do conteúdo (data-icon) e os do shell comum (data-stk-icon)
    renderIcons(document);
    renderStkIcons(SvgIcons, document);

    // 2. Instanciar Infraestrutura
    const chartAdapter = new ChartAdapter();

    // Log técnico das requisições às APIs vai para o console do navegador (F12)
    const consoleDe = { info: console.info, warn: console.warn, error: console.error };
    const apiGateway = new GovApiGateway({
      timeoutMs: 6000,
      incluirTesouro: false, // sem CORS no navegador; atualizado por scripts/build_referencia_uniao.mjs
      onLog: (log) => (consoleDe[log.type] || console.log)(`[APIs ${log.timestamp}] ${log.message}`)
    });

    // 3. Instanciar Aplicação
    const service = new MacroObservatoryService({
      apiGateway,
      cache: new LocalSnapshotStore()
    });

    // 4. Instanciar UI / View e o shell comum (topo, barra lateral, barra inferior)
    const viewInstance = new ObservatoryView({
      service,
      chartAdapter
    });
    const shell = new StkGovShell({ app: 'calculadora', onTabChange: aba => viewInstance.aoTrocarAba(aba) });
    shell.iniciar();

    // PWA: abre sem internet e pode ser instalado (botão "Instalar" aparece quando o navegador oferece)
    const pwa = new StkGovPwa('sw.js');
    pwa.init();
    pwa.ligarBotao(document.getElementById('btnInstallApp'));

    // 5. Inicializar Gráficos Chart.js
    const canvasDebt = document.getElementById('chartDebtTraj');
    const canvasBudget = document.getElementById('chartBudgetPie');
    const canvasPerCapita = document.getElementById('chartPerCapita');

    if (canvasDebt) chartAdapter.initDebtChart(canvasDebt);
    if (canvasBudget) chartAdapter.initBudgetChart(canvasBudget);
    if (canvasPerCapita) chartAdapter.initPerCapitaChart(canvasPerCapita);

    // 6. Primeira Renderização: com a última consulta salva no aparelho, se houver
    if (!service.restaurarSalvo()) viewInstance.render();

    // 7. Cenário recebido por link (#selic=...&aba=...)
    const cenario = CenarioUrl.ler(location.href);
    const aba = viewInstance.aplicarCenario(cenario);
    if (aba) shell.trocarAba(aba);

    // 8. Busca os números mais recentes ao abrir (sem rede, seguem os salvos ou os de referência).
    //    Os dados novos não apagam o cenário do link.
    await viewInstance.handleSyncClick({ silencioso: true });
    if (cenario) viewInstance.aplicarCenario(cenario);

    // Link de cenário colado com a página já aberta (só o # muda, a página não recarrega)
    window.addEventListener('hashchange', () => {
      const abaPedida = viewInstance.aplicarCenario(CenarioUrl.ler(location.href));
      if (abaPedida) shell.trocarAba(abaPedida);
    });

    console.log('[Observatório Macroeconômico] Sistema pronto.');
  }
}

/** Mostra o aviso estático do index.html quando a inicialização falha */
function mostrarFalha(err) {
  console.error('[Observatório Macroeconômico] Falha na inicialização:', err);
  const aviso = document.getElementById('appFatalError');
  if (aviso) aviso.hidden = false;
}

// Inicialização automática quando o DOM estiver pronto
const iniciar = () => Program.run().catch(mostrarFalha);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
