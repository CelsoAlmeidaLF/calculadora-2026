import { MacroState } from '../domain/MacroState.js';
import { FisherModel } from '../domain/FisherModel.js';
import { DebtTrajectoryModel } from '../domain/DebtTrajectoryModel.js';
import { SensibilityMatrixModel } from '../domain/SensibilityMatrixModel.js';
import { PublicFinanceModel } from '../domain/PublicFinanceModel.js';
import { CsvExporter } from '../infrastructure/CsvExporter.js';

/**
 * Camada de Aplicação: MacroObservatoryService
 * Orquestra casos de uso, transformações matemáticas e gestão de estado reativo.
 */
export class MacroObservatoryService {
  /**
   * @param {Object} dependencies
   * @param {import('../infrastructure/GovApiGateway.js').GovApiGateway} dependencies.apiGateway
   * @param {MacroState} [dependencies.initialState]
   */
  constructor({ apiGateway, initialState = null } = {}) {
    this.apiGateway = apiGateway;
    this.state = initialState || MacroState.createDefault();
    this.listeners = new Set();
  }

  /**
   * Registra listener para reatividade de estado
   * @param {Function} callback
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.state));
  }

  /**
   * Sincroniza dados oficiais com os repositórios governamentais
   */
  async syncOfficialFeeds() {
    if (!this.apiGateway) return;
    const result = await this.apiGateway.syncAll();

    const changes = {
      lastSync: result.syncedAt,
      fontes: {}
    };

    // Só o que veio ao vivo é trocado; o resto continua marcado como valor de referência
    for (const [origem, chave, converter] of MacroObservatoryService.FEEDS) {
      const item = result[origem];
      // Despesas chegam como objeto (R$ por função); os demais, como número
      const valido = item && (typeof item.value === 'object' ? item.value !== null : !isNaN(item.value));
      if (valido) {
        changes[chave] = converter(item.value);
        changes.fontes[chave] = { periodo: chave === 'selic' ? 'vigente' : MacroObservatoryService.periodo(item.date), aoVivo: true };
      }
    }

    this.state = this.state.with(changes);
    this.notify();
    return result;
  }

  /**
   * Converte a data das APIs em período curto: "01/09/2026" → "set/2026"; "2026" fica "2026"
   * @param {string} data
   */
  static periodo(data) {
    const m = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(String(data || ''));
    if (!m) return String(data || '');
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${meses[Number(m[1]) - 1]}/${m[2]}`;
  }

  /**
   * Quantos indicadores vieram ao vivo na última sincronização
   */
  contarAoVivo() {
    return Object.values(this.state.fontes).filter(f => f.aoVivo).length;
  }

  /**
   * Total de indicadores que a sincronização consegue trazer ao vivo
   */
  totalSincronizavel() {
    return MacroObservatoryService.FEEDS.length;
  }

  /**
   * Troca a base dos valores "por pessoa": população (IBGE) ou eleitores (TSE)
   * @param {'populacao'|'eleitores'} base
   */
  setBaseCalculo(base) {
    if (base === this.state.baseCalculo) return;
    this.state = this.state.with({ baseCalculo: base });
    this.notify();
  }

  /**
   * Rótulos da base de cálculo ativa
   */
  getBase() {
    const s = this.state;
    return { chave: s.baseCalculo, pessoas: s.divisor(), ...MacroState.BASES[s.baseCalculo] };
  }

  /**
   * Perfil das finanças públicas (R$ total, por habitante e por eleitor)
   */
  getPublicFinanceProfile() {
    const s = this.state;
    return PublicFinanceModel.profile({
      pibBaseTri: s.pibBaseTri,
      taxRatio: s.taxRatio,
      selic: s.selic,
      custoSelicPontoBi: s.custoSelicPontoBi,
      dbgg: s.dbgg,
      dbggTri: s.dbggTri,
      populacao: s.populacao,
      eleitores: s.eleitores,
      despesas: s.despesas
    });
  }

  /**
   * Atualiza parâmetros fiscais no estado
   */
  updateFiscalParams(params) {
    this.state = this.state.with(params);
    this.notify();
  }

  /**
   * Retorna os indicadores centrais calculados para o Painel Macroeconômico
   */
  getMacroDashboardMetrics() {
    const s = this.state;
    const pibNominalBi = s.pibBaseTri * 1000;
    const arrecadacaoBi = pibNominalBi * (s.taxRatio / 100);
    const juroReal = FisherModel.calculateRealRate(s.selic, s.ipca);
    const custoJurosBi = s.selic * s.custoSelicPontoBi;

    const impostoPerCapita = (arrecadacaoBi * 1e9) / s.populacao;
    const jurosPerCapita = (custoJurosBi * 1e9) / s.populacao;

    return {
      pibNominalTri: s.pibBaseTri,
      pibReal: s.pibReal,
      taxRatio: s.taxRatio,
      arrecadacaoBi,
      selic: s.selic,
      ipca: s.ipca,
      juroReal: Number(juroReal.toFixed(2)),
      custoJurosBi: Number(custoJurosBi.toFixed(1)),
      impostoPerCapita: Math.round(impostoPerCapita),
      jurosPerCapita: Math.round(jurosPerCapita),
      populacao: s.populacao,
      eleitores: s.eleitores,
      dbgg: s.dbgg,
      dbggTri: s.dbggTri,
      lastSync: s.lastSync,
      fontes: s.fontes
    };
  }

  /**
   * Retorna a matriz de sensibilidade da Selic
   */
  getSensibilityMatrix() {
    const s = this.state;
    return SensibilityMatrixModel.generate({
      selicAtual: s.selic,
      ipcaAtual: s.ipca,
      populacao: s.divisor(),
      custoSelicPontoBi: s.custoSelicPontoBi
    });
  }

  /**
   * Simula o modelo fiscal paramétrico
   */
  simulateFiscalModel() {
    const s = this.state;
    const fiscal = DebtTrajectoryModel.simulate({
      dbggBase: s.dbgg,
      pibBaseTri: s.pibBaseTri,
      growth: s.pibReal,
      selic: s.selic,
      ipca: s.ipca,
      taxRate: s.taxRatio,
      spendVariation: s.spendVariation,
      custoSelicPontoBi: s.custoSelicPontoBi
    });

    // Resultado da simulação dividido pela base escolhida (habitante ou eleitor)
    const pessoas = s.divisor();
    fiscal.porBase = {
      base: s.baseCalculo,
      pessoas,
      imposto: PublicFinanceModel.porPessoa(fiscal.arrecadacaoBi, pessoas),
      juros: PublicFinanceModel.porPessoa(fiscal.custoJurosBi, pessoas),
      primario: PublicFinanceModel.porPessoa(fiscal.primarioBi, pessoas),
      dividaAno5: PublicFinanceModel.porPessoa(fiscal.debtYear5Tri * 1000, pessoas)
    };
    return fiscal;
  }

  /**
   * Gera o texto executivo do relatório consolidado
   */
  generateConsolidatedReport({ fiscalData } = {}) {
    const s = this.state;
    const m = this.getMacroDashboardMetrics();
    const p = this.getPublicFinanceProfile();
    const brl = v => `R$ ${v.toLocaleString('pt-BR')}`;
    const tri = bi => `R$ ${(bi / 1000).toFixed(2).replace('.', ',')} Tri`;
    const linhaBase = l => `* ${l.rotulo}: ${tri(l.bi)} | ${brl(l.porHabitante)}/hab | ${brl(l.porEleitor)}/eleitor`;

    return `RELATORIO DO OBSERVATORIO MACROECONOMICO & FISCAL DO BRASIL
----------------------------------------------------------------------
FONTES OFICIAIS SINCRONIZADAS:
* Banco Central do Brasil (SGS 432 / 13522 / 13762 / 13761 / 4382), IBGE (SIDRA 6579), TSE (eleitorado 2026)
  & Tesouro Nacional (SICONFI, RREO Anexo 02 da Uniao, despesa liquidada)
* Origem: ${Object.keys(s.fontes).map(k => `${k} ${s.fontes[k].aoVivo ? 'ao vivo' : 'referencia'} (${s.fontes[k].periodo})`).join(' | ')}
* PIB Nominal Base: R$ ${s.pibBaseTri.toFixed(2).replace('.', ',')} Tri (${s.pibReal > 0 ? '+' : ''}${s.pibReal.toFixed(2).replace('.', ',')}% real a.a.)
* Taxa Meta Selic: ${s.selic.toFixed(2).replace('.', ',')}% a.a. | Inflacao IPCA: ${s.ipca.toFixed(2).replace('.', ',')}% a.a.
* Juro Real Implicito (Equacao de Fisher): ${m.juroReal.toFixed(2).replace('.', ',')}% a.a.
* Carga Tributaria Bruta: ${s.taxRatio.toFixed(2).replace('.', ',')}% do PIB
* Divida Bruta DBGG (Atual): ${s.dbgg.toFixed(2).replace('.', ',')}% do PIB = R$ ${s.dbggTri.toFixed(2).replace('.', ',')} Tri
* Projecao da Divida (Ano 5): ${fiscalData ? fiscalData.debtYear5.toFixed(1).replace('.', ',') : '-'}% do PIB

PERFIL FISCAL PER CAPITA (Populacao: ${s.populacao.toLocaleString('pt-BR')} hab):
* Imposto Medio por Habitante: R$ ${m.impostoPerCapita.toLocaleString('pt-BR')} / ano
* Custo de Juros da Divida por Habitante: R$ ${m.jurosPerCapita.toLocaleString('pt-BR')} / ano
* Despesa Anual com Juros da Divida: R$ ${m.custoJurosBi.toFixed(1).replace('.', ',')} Bi

POR HABITANTE E POR ELEITOR (Eleitorado apto TSE 2026: ${s.eleitores.toLocaleString('pt-BR')}):
${linhaBase(p.imposto)}
${linhaBase(p.divida)}
${linhaBase(p.juros)}

GASTOS REAIS DA UNIAO EM 12 MESES (${s.fontes.despesas.periodo}, despesa liquidada, sem refinanciamento da divida):
${linhaBase(p.gastosTotal)}
${p.gastos.map(linhaBase).join('\n')}
----------------------------------------------------------------------
Para calculos de acao popular e greve de consumo, utilize a aplicacao
independente: PRESSAO-CIVICA (Gene Sharp / Erica Chenoweth - Harvard).
----------------------------------------------------------------------
Gerado pelo Observatorio Macroeconomico Autonomo (Systekna / STK-GOVERNO-BRAZIL).`;
  }

  /**
   * Dispara exportação CSV
   */
  exportCsv({ fiscalData } = {}) {
    const s = this.state;
    const m = this.getMacroDashboardMetrics();

    const p = this.getPublicFinanceProfile();
    const porPessoa = [p.imposto, p.divida, p.juros, p.gastosTotal, ...p.gastos].flatMap(l => {
      const nome = l.chave.replace(/^./, c => c.toUpperCase());
      return [
        [`${nome}_Total`, l.bi, 'Bilhoes_BRL', l.rotulo],
        [`${nome}_Por_Habitante`, l.porHabitante, 'BRL/hab', 'Total / Populacao IBGE'],
        [`${nome}_Por_Eleitor`, l.porEleitor, 'BRL/eleitor', 'Total / Eleitorado TSE']
      ];
    });

    CsvExporter.export({
      populacao: s.populacao,
      eleitores: s.eleitores,
      dbggTri: s.dbggTri,
      extraRows: porPessoa,
      pibBaseTri: s.pibBaseTri,
      pibReal: s.pibReal,
      taxRatio: s.taxRatio,
      selic: s.selic,
      ipca: s.ipca,
      dbgg: s.dbgg,
      juroReal: m.juroReal,
      custoJurosBi: m.custoJurosBi,
      impostoPerCapita: m.impostoPerCapita,
      jurosPerCapita: m.jurosPerCapita,
      debtYear5: fiscalData ? fiscalData.debtYear5 : s.dbgg
    });
  }
}

/** Indicadores sincronizáveis: [chave no gateway, campo do estado, conversão do valor bruto] */
MacroObservatoryService.FEEDS = Object.freeze([
  ['selic', 'selic', v => v],
  ['ipca', 'ipca', v => v],
  ['dbgg', 'dbgg', v => v],
  ['dbggReais', 'dbggTri', v => v / 1e6], // R$ milhões → R$ Tri
  ['pib', 'pibBaseTri', v => v / 1e6],    // R$ milhões → R$ Tri
  ['populacao', 'populacao', v => v],
  ['despesas', 'despesas', v => v]           // R$ por função/subfunção, 12 meses (SICONFI)
]);
