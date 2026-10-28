import { FisherModel } from '../src/domain/FisherModel.js';
import { DebtTrajectoryModel } from '../src/domain/DebtTrajectoryModel.js';
import { SensibilityMatrixModel } from '../src/domain/SensibilityMatrixModel.js';
import { MacroState } from '../src/domain/MacroState.js';
import { PublicFinanceModel } from '../src/domain/PublicFinanceModel.js';
import { UnionSpendingModel } from '../src/domain/UnionSpendingModel.js';
import { UnionBudgetModel } from '../src/domain/UnionBudgetModel.js';
import { MacroObservatoryService } from '../src/application/MacroObservatoryService.js';
import { GovApiGateway } from '../src/infrastructure/GovApiGateway.js';
import { LocalSnapshotStore } from '../src/infrastructure/LocalSnapshotStore.js';

/**
 * Suite de Testes Unitários: Modelos Econômicos e Matemáticos
 */
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

function assertCloseTo(actual, expected, tolerance = 0.05, message) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${message} (Obtido: ${actual}, Esperado: ${expected}, Dif: ${diff.toFixed(4)})`);
}

console.log('--- Executando Testes de Domínio: Observatório Macroeconômico ---');

// 1. Teste da Equação de Fisher
console.log('\n1. Teste da Equação de Fisher (Juro Real Implícito)');
const realRate = FisherModel.calculateRealRate(10.50, 4.90);
assertCloseTo(realRate, 5.3384, 0.01, 'Juro Real para Selic 10.5% e IPCA 4.9% deve ser ~5,34%');

const realRateZero = FisherModel.calculateRealRate(5.0, 5.0);
assertCloseTo(realRateZero, 0.0, 0.001, 'Juro Real com Selic == IPCA deve ser 0%');

// 2. Teste da Trajetória da Dívida Pública
console.log('\n2. Teste do Modelo de Trajetória da Dívida (FMI / Tesouro)');
const fiscalSim = DebtTrajectoryModel.simulate({
  dbggBase: 78.50,
  pibBaseTri: 12.70,
  growth: 2.0,
  selic: 10.50,
  ipca: 4.90,
  taxRate: 34.20,
  spendVariation: 0.0,
  custoSelicPontoBi: 50.0,
  jurosBaseBi: 500,
  selicReferencia: 10.50,
  gruposOrcamento: [
    { chave: 'previdencia', rotulo: 'Previdência', bi: 1000 },
    { chave: 'juros', rotulo: 'Juros', bi: 500 },
    { chave: 'amortizacao', rotulo: 'Amortização', bi: 300 }
  ],
  horizon: 5
});
assert(fiscalSim.trajectory.length === 5, 'Trajetória deve conter 5 anos projetados');
assert(fiscalSim.trajectory[0] > 70 && fiscalSim.trajectory[0] < 90, 'Dívida no Ano 1 deve estar na faixa razoável (70% - 90%)');
assert(fiscalSim.custoJurosBi === 500, 'Na Selic oficial, os juros do simulador são os pagos de fato (R$ 500 Bi)');
const comp = Object.fromEntries(fiscalSim.composicao.map(g => [g.chave, g.bi]));
assert(comp.previdencia === 1000 && comp.juros === 500 && comp.amortizacao === 300, 'Rosca do simulador usa a composição real da despesa');
const fiscalAperto = DebtTrajectoryModel.simulate({ dbggBase: 78.5, pibBaseTri: 12.7, growth: 2, selic: 11.5, ipca: 4.9, taxRate: 34.2, spendVariation: -10, jurosBaseBi: 500, selicReferencia: 10.5, gruposOrcamento: fiscalSim.composicao });
const compAperto = Object.fromEntries(fiscalAperto.composicao.map(g => [g.chave, g.bi]));
assert(compAperto.juros === 550 && compAperto.previdencia === 900 && compAperto.amortizacao === 300, 'Selic +1 pp soma R$ 50 Bi aos juros; corte de 10% só atinge o gasto primário');

// 3. Teste da Matriz de Sensibilidade do Tesouro
console.log('\n3. Teste da Matriz de Sensibilidade da Selic');
const matrix = SensibilityMatrixModel.generate({
  selicAtual: 10.50,
  ipcaAtual: 4.90,
  populacao: 212583750,
  custoSelicPontoBi: 50.0,
  jurosBaseBi: 500
});
assert(matrix.length === 7, 'Matriz deve possuir 7 cenários (-3 pp a +3 pp)');
const baseline = matrix.find(m => m.isCurrent);
assert(baseline !== undefined, 'Cenário oficial atual deve estar marcado na matriz');
assert(baseline.diffBi === 0.0, 'Variação vs atual no baseline deve ser R$ 0,0 Bi');

assert(baseline.totalJurosBi === 500, 'Cenário atual parte dos juros pagos de fato (R$ 500 Bi)');
const scenarioPlus1 = matrix.find(m => m.delta === 1.0);
assert(scenarioPlus1.diffBi === 50.0 && scenarioPlus1.totalJurosBi === 550, 'Aumento de 1 pp na Selic deve custar +R$ 50 Bi anuais (R$ 550 Bi)');

const scenarioMinus1 = matrix.find(m => m.delta === -1.0);
assert(scenarioMinus1.diffBi === -50.0, 'Redução de 1 pp na Selic deve economizar -R$ 50 Bi anuais');

// 4. Teste de Imutabilidade do MacroState
console.log('\n4. Teste de Imutabilidade da Entidade MacroState');
const state1 = MacroState.createDefault();
const state2 = state1.with({ selic: 12.00 });
assert(state1.selic === MacroState.createDefault().selic, 'state1 deve manter a Selic padrão');
assert(state2.selic === 12.00, 'state2 deve refletir a nova Selic de 12.00%');
assert(Object.isFrozen(state1), 'Instância de MacroState deve estar congelada (Object.freeze)');

// 5. Origem dos indicadores (ao vivo × referência)
console.log('\n5. Teste de Origem dos Indicadores');
assert(state1.fontes.ipca.aoVivo === false && state1.fontes.ipca.periodo === 'set/2026', 'Padrão marca IPCA como referência de set/2026');
const state3 = state1.with({ ipca: 4.6, fontes: { ipca: { periodo: 'out/2026', aoVivo: true } } });
assert(state3.fontes.ipca.aoVivo === true && state3.fontes.selic.aoVivo === false, 'with() troca só a origem informada');
assert(MacroObservatoryService.periodo('01/09/2026') === 'set/2026', 'Data do BCB vira período curto (set/2026)');
assert(MacroObservatoryService.periodo('2026') === '2026', 'Ano do IBGE fica como está');

// 6. Gateway: séries certas e leitura do IBGE SIDRA (fetch simulado, sem rede)
console.log('\n6. Teste do GovApiGateway com fetch simulado');
const urls = [];
// RREO simulado: só existem 2025 (bimestres 4 e 6) e 2026 até o 4º bimestre
const rreo = (total, saude, divida) => ({ items: [
  ['DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)', total], ['Saúde', saude], ['Atenção Básica', 1],
  ['Encargos Especiais', divida], ['Serviço da Dívida Interna', divida]
].map(([conta, valor]) => ({ coluna: 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)', rotulo: 'Total das Despesas Exceto Intra-Orçamentárias', conta, valor })) });
const rreos = { '2025-6': rreo(3600e9, 200e9, 600e9), '2025-4': rreo(2400e9, 130e9, 400e9), '2026-4': rreo(2900e9, 150e9, 700e9) };
// Anexo 01: receita "Até o Bimestre (c)" e despesa liquidada "(h)"; a linha intra-orçamentária tem código próprio
const anexo01 = (impostos, contribuicoes, despesa, juros) => ({ items: [
  { cod_conta: 'ReceitaTributaria', coluna: 'Até o Bimestre (c)', valor: impostos },
  { cod_conta: 'ReceitaDeContribuicoes', coluna: 'Até o Bimestre (c)', valor: contribuicoes },
  { cod_conta: 'ReceitaDeContribuicoesIntra', coluna: 'Até o Bimestre (c)', valor: 999e9 },
  { cod_conta: 'DespesasExcetoIntraOrcamentarias', coluna: 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)', valor: despesa },
  { cod_conta: 'JurosEEncargosDaDivida', coluna: 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (h)', valor: juros },
  { cod_conta: 'JurosEEncargosDaDivida', coluna: 'DESPESAS EMPENHADAS ATÉ O BIMESTRE (f)', valor: 1 }
] });
const anexos01 = { '2025-6': anexo01(1100e9, 1500e9, 3600e9, 360e9), '2025-4': anexo01(750e9, 950e9, 2400e9, 270e9), '2026-4': anexo01(850e9, 1050e9, 2900e9, 410e9) };
globalThis.fetch = async (url) => {
  urls.push(url);
  let body;
  if (url.includes('ibge')) body = [{ resultados: [{ series: [{ serie: { '2026': '214211951' } }] }] }];
  else if (url.includes('siconfi')) {
    const [, ano, bim] = /an_exercicio=(\d+)&nr_periodo=(\d)/.exec(url);
    body = (url.includes('Anexo%2001') ? anexos01 : rreos)[`${ano}-${bim}`] || { items: [] };
  } else body = [{ data: '01/08/2026', valor: '4.44' }, { data: '01/09/2026', valor: '4.58' }];
  return { ok: true, status: 200, json: async () => body };
};
const sync = await new GovApiGateway().syncAll();
const despesasSync = sync.despesas;
assert(despesasSync && despesasSync.ano === 2026 && despesasSync.bimestre === 4 && despesasSync.date === 'set/2025–ago/2026', 'SICONFI: acha o último bimestre publicado (2026, 4º) e rotula set/2025–ago/2026');
assert(despesasSync.value.total === 4100e9 && despesasSync.value.Saúde === 220e9, 'SICONFI: 12 meses = 2025 fechado − 2025 até ago + 2026 até ago');
assert(despesasSync.value['Encargos Especiais/Serviço da Dívida Interna'] === 900e9, 'SICONFI: subfunção fica presa à função de origem');
assert(urls.some(u => u.includes('bcdata.sgs.13522/')) && !urls.some(u => u.includes('bcdata.sgs.433/')), 'IPCA 12m usa a série 13522 (não a 433, que é mensal)');
const orc = sync.orcamento;
assert(orc && orc.date === 'set/2025–ago/2026' && orc.value.impostos === 1200e9 && orc.value.contribuicoes === 1600e9, 'SICONFI Anexo 01: receita federal em 12 meses (sem a linha intra-orçamentária)');
assert(orc.value.juros === 500e9 && orc.value.despesaTotal === 4100e9, 'SICONFI Anexo 01: juros pagos e despesa total em 12 meses (só a coluna liquidada)');
assert(sync.ipca.value === 4.58 && sync.ipca.historico.length === 2 && sync.ipca.historico[0].data === '08/2026', 'SGS: último valor do período e histórico mensal');
const mensal = GovApiGateway.mensal([{ data: '30/09/2026', valor: '15' }, { data: '01/10/2026', valor: '15' }, { data: '31/10/2026', valor: '14.25' }]);
assert(mensal.length === 2 && mensal[1].valor === 14.25, 'Série diária vira um ponto por mês (último valor do mês)');
assert(sync.populacao && sync.populacao.value === 214211951 && sync.populacao.date === '2026', 'População lida do IBGE SIDRA 6579');
const service = new MacroObservatoryService({ apiGateway: new GovApiGateway() });
await service.syncOfficialFeeds();
assert(service.contarAoVivo() === 8 && service.totalSincronizavel() === 8 && service.state.fontes.ipca.periodo === 'set/2026', 'Sincronização marca os 8 indicadores como ao vivo');
assert(service.getPublicFinanceProfile().imposto.bi === 2800 && service.getPublicFinanceProfile().juros.bi === 500, 'Receita e juros ao vivo da União entram no perfil');
assert(service.state.historicos.ipca.length === 2 && service.state.selicOficial === 4.58, 'Sincronização guarda o histórico e a Selic oficial');
assert(service.state.fontes.despesas.periodo === 'set/2025–ago/2026' && service.getPublicFinanceProfile().gastosTotal.bi === 4100, 'Gastos ao vivo do Tesouro entram no perfil');
assert(urls.some(u => u.includes('bcdata.sgs.13761/')) && urls.some(u => u.includes('bcdata.sgs.4382/')), 'Dívida em R$ (SGS 13761) e PIB 12 meses (SGS 4382) são consultados');
assertCloseTo(service.state.dbggTri, 4.58 / 1e6, 1e-9, 'Valor do SGS 13761 em R$ milhões vira R$ Tri');
assert(service.state.fontes.eleitores.aoVivo === false, 'Eleitorado continua como referência do TSE (não há API ao vivo)');
globalThis.fetch = async () => { throw new Error('offline'); };
const offline = new MacroObservatoryService({ apiGateway: new GovApiGateway() });
await offline.syncOfficialFeeds();
assert(offline.contarAoVivo() === 0 && offline.state.selic === MacroState.createDefault().selic, 'Sem rede, mantém os valores de referência');

// 6b. Última consulta salva no aparelho
console.log('\n6b. Teste do LocalSnapshotStore (reabrir com os dados salvos)');
const memoria = new Map();
const storageFalso = { getItem: k => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
const cache = new LocalSnapshotStore({ storage: storageFalso });
const comCache = new MacroObservatoryService({ apiGateway: { syncAll: async () => sync }, cache });
await comCache.syncOfficialFeeds();
assert(memoria.size === 1 && cache.ler().campos.ipca === 4.58, 'Sincronização bem-sucedida grava a consulta no aparelho');
const reaberto = new MacroObservatoryService({ cache });
assert(reaberto.restaurarSalvo() === true && reaberto.state.ipca === 4.58, 'Ao reabrir, os números salvos voltam antes de buscar os novos');
assert(reaberto.state.fontes.ipca.salvo === true && reaberto.state.fontes.ipca.aoVivo === false && reaberto.contarAoVivo() === 0, 'Salvo fica marcado como "salvo", não como atualizado agora');
assert(reaberto.getPublicFinanceProfile().juros.bi === 500, 'Orçamento da União também volta do salvo');
assert(new MacroObservatoryService({ cache: new LocalSnapshotStore({ storage: { getItem: () => '{quebrado', setItem() {} } }) }).restaurarSalvo() === false, 'Salvo corrompido é ignorado');
assert(new LocalSnapshotStore({ storage: null }).ler() === null, 'Sem armazenamento (navegação privada), segue sem salvo');

// 7. Valores por habitante e por eleitor
console.log('\n7. Teste do Perfil por Habitante e por Eleitor');
const despesasTeste = { total: 2000e9, 'Previdência Social': 800e9, 'Saúde': 200e9, 'Encargos Especiais/Serviço da Dívida Interna': 300e9 };
const orcamentoTeste = { impostos: 1000e9, contribuicoes: 2000e9, despesaTotal: 2000e9, juros: 500e9, previdencia: 800e9 };
const perfil = PublicFinanceModel.profile({
  pibBaseTri: 10, dbgg: 80, dbggTri: 8, populacao: 200e6, eleitores: 150e6,
  despesas: despesasTeste, orcamento: orcamentoTeste
});
assert(perfil.imposto.bi === 3000 && perfil.imposto.porHabitante === 15000 && perfil.imposto.porEleitor === 20000, 'Impostos e contribuições federais R$ 3 Tri = R$ 15.000/hab e R$ 20.000/eleitor');
assert(perfil.divida.bi === 8000 && perfil.divida.porHabitante === 40000 && perfil.divida.pctPib === 80, 'Dívida R$ 8 Tri = R$ 40.000/hab (80% do PIB)');
assert(perfil.juros.bi === 500, 'Juros = os pagos pela União (SICONFI Anexo 01), não a estimativa');
assert(perfil.gastosTotal.bi === 2000 && perfil.gastosTotal.porHabitante === 10000, 'Gastos da União R$ 2 Tri = R$ 10.000/hab');
const somaGastos = perfil.gastos.reduce((a, g) => a + g.bi, 0);
assertCloseTo(somaGastos, 2000, 0.05, 'Grupos de gasto + "Demais funções" fecham com o total do Tesouro');
assert(perfil.gastos.find(g => g.chave === 'previdencia').pctGastos === 40, 'Previdência = 40% do gasto da União');
assert(perfil.gastos.find(g => g.chave === 'demais').bi === 700, '"Demais funções" = total − grupos (R$ 700 Bi)');
const resumo = UnionBudgetModel.resumo(orcamentoTeste);
assert(resumo.grupos.find(g => g.chave === 'demais').bi === 700, 'Composição: "Demais despesas" = total − grupos (R$ 700 Bi)');
assert(UnionBudgetModel.jurosCenario(100, 5, 10, 50) === 0, 'Juros do cenário não ficam negativos');
assert(UnionBudgetModel.extrair([]) === null, 'Anexo 01 sem itens vira null');
let erroBase = false;
try { PublicFinanceModel.porPessoa(1, 0); } catch (e) { erroBase = true; }
assert(erroBase, 'Base de cálculo zero é rejeitada');

// 7b. Leitura do RREO do SICONFI
console.log('\n7b. Teste do UnionSpendingModel (RREO Anexo 02)');
assert(UnionSpendingModel.extrair([]) === null, 'Bimestre não publicado (sem itens) vira null');
assert(UnionSpendingModel.periodo(2026, 4) === 'set/2025–ago/2026', 'Período do 4º bimestre: set/2025–ago/2026');
assert(UnionSpendingModel.periodo(2025, 6) === 'jan–dez/2025', 'Período do 6º bimestre: o próprio ano');
const soAno = UnionSpendingModel.acumulado12m({ total: 9 }, null, { total: 5 });
assert(soAno.total === 5, 'No 6º bimestre não há desconto do ano anterior');
const ref = MacroState.createDefault();
assert(ref.despesas.total > 3e12 && ref.fontes.despesas.aoVivo === false, 'Referência do Tesouro vem embutida (funciona offline)');

// 8. Base de cálculo da simulação
console.log('\n8. Teste da Base de Cálculo (habitantes × eleitores)');
const base = new MacroObservatoryService({});
const porHab = base.simulateFiscalModel().porBase;
base.setBaseCalculo('eleitores');
const porEleitor = base.simulateFiscalModel().porBase;
assert(porHab.base === 'populacao' && porEleitor.base === 'eleitores', 'Simulação informa a base usada');
assert(porEleitor.imposto > porHab.imposto, 'Valor por eleitor é maior que por habitante (há menos eleitores)');
assertCloseTo(porEleitor.imposto / porHab.imposto, base.state.populacao / base.state.eleitores, 0.001, 'Razão eleitor/habitante = população/eleitorado');
const matrizEleitor = base.getSensibilityMatrix().find(m => m.delta === 1.0);
assert(matrizEleitor.perCapitaImpact === Math.round(50e9 / base.state.eleitores), 'Matriz da Selic divide pela base escolhida');
let erroEstado = false;
try { MacroState.createDefault().with({ baseCalculo: 'municipios' }); } catch (e) { erroEstado = true; }
assert(erroEstado, 'Base de cálculo desconhecida é rejeitada');
const fiscalTri = DebtTrajectoryModel.simulate({ dbggBase: 80, pibBaseTri: 10, growth: 0, selic: 0, ipca: 0, taxRate: 34.2, spendVariation: 0 });
assert(fiscalTri.trajectoryTri.length === 5 && fiscalTri.debtYear5Tri === fiscalTri.trajectoryTri[4], 'Trajetória também sai em R$ Tri');

console.log(`\n========================================`);
console.log(`Total: ${passed + failed} | Passou: ${passed} | Falhou: ${failed}`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
