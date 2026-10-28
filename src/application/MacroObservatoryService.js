import { MacroState } from '../domain/MacroState.js?v=20261028-1842';
import { FisherModel } from '../domain/FisherModel.js?v=20261028-1842';
import { DebtTrajectoryModel } from '../domain/DebtTrajectoryModel.js?v=20261028-1842';
import { SensibilityMatrixModel } from '../domain/SensibilityMatrixModel.js?v=20261028-1842';
import { PublicFinanceModel } from '../domain/PublicFinanceModel.js?v=20261028-1842';
import { UnionBudgetModel } from '../domain/UnionBudgetModel.js?v=20261028-1842';
import { CsvExporter } from '../infrastructure/CsvExporter.js?v=20261028-1842';

/**
 * Camada de Aplicação: MacroObservatoryService
 * Orquestra casos de uso, transformações matemáticas e gestão de estado reativo.
 */
export class MacroObservatoryService {
  /**
   * @param {Object} dependencies
   * @param {import('../infrastructure/GovApiGateway.js?v=20261028-1842').GovApiGateway} dependencies.apiGateway
   * @param {MacroState} [dependencies.initialState]
   * @param {import('../infrastructure/LocalSnapshotStore.js?v=20261028-1842').LocalSnapshotStore} [dependencies.cache] Última consulta salva no aparelho
   */
  constructor({ apiGateway, initialState = null, cache = null } = {}) {
    this.apiGateway = apiGateway;
    this.cache = cache;
    this.ignorados = [];
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
    this.ignorados = result.ignorados || [];

    const changes = {
      lastSync: MacroObservatoryService.momento(new Date()),
      fontes: {},
      historicos: {}
    };

    // Só o que veio ao vivo é trocado; o resto continua marcado como valor de referência
    for (const [origem, chave, converter] of MacroObservatoryService.FEEDS) {
      const item = result[origem];
      // Despesas chegam como objeto (R$ por função); os demais, como número
      const valido = item && (typeof item.value === 'object' ? item.value !== null : !isNaN(item.value));
      if (valido) {
        changes[chave] = converter(item.value);
        changes.fontes[chave] = { periodo: chave === 'selic' ? 'vigente' : MacroObservatoryService.periodo(item.date), aoVivo: true };
        if (Array.isArray(item.historico) && item.historico.length > 1) {
          changes.historicos[chave] = item.historico.map(p => ({ data: p.data, valor: converter(p.valor) }));
        }
      }
    }
    if (changes.selic !== undefined) changes.selicOficial = changes.selic;

    this.state = this.state.with(changes);
    if (this.contarAoVivo() > 0 && this.cache) this.cache.salvar(this.snapshot());
    this.notify();
    return result;
  }

  /**
   * Dados ao vivo do estado atual, prontos para guardar no aparelho
   */
  snapshot() {
    const s = this.state;
    const campos = {};
    const fontes = {};
    for (const [, chave] of MacroObservatoryService.FEEDS) {
      if (s.fontes[chave] && s.fontes[chave].aoVivo) {
        campos[chave] = s[chave];
        fontes[chave] = s.fontes[chave];
      }
    }
    return { versao: 1, lastSync: s.lastSync, selicOficial: s.selicOficial, campos, fontes, historicos: s.historicos };
  }

  /**
   * Reabre com a última consulta salva no aparelho (marcada como "salvo", não "ao vivo")
   * @returns {boolean} true se havia algo salvo
   */
  restaurarSalvo() {
    const salvo = this.cache && this.cache.ler();
    if (!salvo || salvo.versao !== 1 || !salvo.campos) return false;
    const fontes = {};
    for (const [chave, f] of Object.entries(salvo.fontes || {})) fontes[chave] = { ...f, aoVivo: false, salvo: true };
    try {
      this.state = this.state.with({
        ...salvo.campos,
        selic: salvo.campos.selic ?? this.state.selic,
        selicOficial: salvo.selicOficial ?? this.state.selicOficial,
        lastSync: salvo.lastSync ? `${salvo.lastSync} (salvo)` : null,
        fontes,
        historicos: salvo.historicos || {}
      });
    } catch {
      return false; // salvo de uma versão incompatível: fica com a referência
    }
    this.notify();
    return true;
  }

  /**
   * Data e hora curtas: "28/10 às 18:40"
   * @param {Date} d
   */
  static momento(d) {
    const dois = n => String(n).padStart(2, '0');
    return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
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

  /** Indicadores que não se atualizam por aqui (Tesouro no navegador): ficam com a referência gerada por script */
  indicadoresIgnorados() {
    return this.ignorados;
  }

  /**
   * Total de indicadores que a sincronização consegue trazer ao vivo
   */
  totalSincronizavel() {
    return MacroObservatoryService.FEEDS.filter(([origem]) => !this.ignorados.includes(origem)).length;
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
      dbgg: s.dbgg,
      dbggTri: s.dbggTri,
      populacao: s.populacao,
      eleitores: s.eleitores,
      despesas: s.despesas,
      orcamento: s.orcamento
    });
  }

  /**
   * Juros pagos pela União em 12 meses (R$ Bi), corrigidos para a Selic em uso
   * (igual ao pago quando a Selic é a oficial; o simulador soma a diferença × custo por ponto)
   */
  jurosNaSelicAtual() {
    const s = this.state;
    const pagos = UnionBudgetModel.resumo(s.orcamento).jurosBi;
    return UnionBudgetModel.jurosCenario(pagos, s.selic, s.selicOficial, s.custoSelicPontoBi);
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
    const orcamento = UnionBudgetModel.resumo(s.orcamento);
    const arrecadacaoBi = orcamento.receitaBi;
    const juroReal = FisherModel.calculateRealRate(s.selic, s.ipca);
    const custoJurosBi = orcamento.jurosBi;

    const impostoPerCapita = (arrecadacaoBi * 1e9) / s.populacao;
    const jurosPerCapita = (custoJurosBi * 1e9) / s.populacao;

    return {
      pibNominalTri: s.pibBaseTri,
      pibReal: s.pibReal,
      taxRatio: s.taxRatio,
      arrecadacaoBi,
      receitaPctPib: Number(((arrecadacaoBi / pibNominalBi) * 100).toFixed(2)),
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
      fontes: s.fontes,
      historicos: s.historicos
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
      custoSelicPontoBi: s.custoSelicPontoBi,
      jurosBaseBi: this.jurosNaSelicAtual()
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
      custoSelicPontoBi: s.custoSelicPontoBi,
      jurosBaseBi: UnionBudgetModel.resumo(s.orcamento).jurosBi,
      selicReferencia: s.selicOficial,
      gruposOrcamento: UnionBudgetModel.resumo(s.orcamento).grupos
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
  & Tesouro Nacional (SICONFI, RREO Anexos 01 e 02 da Uniao: receita realizada e despesa liquidada)
* Origem: ${Object.keys(s.fontes).map(k => `${k} ${s.fontes[k].aoVivo ? 'ao vivo' : 'referencia'} (${s.fontes[k].periodo})`).join(' | ')}
* PIB Nominal Base: R$ ${s.pibBaseTri.toFixed(2).replace('.', ',')} Tri (${s.pibReal > 0 ? '+' : ''}${s.pibReal.toFixed(2).replace('.', ',')}% real a.a.)
* Taxa Meta Selic: ${s.selic.toFixed(2).replace('.', ',')}% a.a. | Inflacao IPCA: ${s.ipca.toFixed(2).replace('.', ',')}% a.a.
* Juro Real Implicito (Equacao de Fisher): ${m.juroReal.toFixed(2).replace('.', ',')}% a.a.
* Carga Tributaria Bruta (Uniao, estados e municipios): ${s.taxRatio.toFixed(2).replace('.', ',')}% do PIB
* Impostos e contribuicoes federais (Uniao, 12 meses): R$ ${(m.arrecadacaoBi / 1000).toFixed(2).replace('.', ',')} Tri = ${m.receitaPctPib.toFixed(1).replace('.', ',')}% do PIB
* Divida Bruta DBGG (Atual): ${s.dbgg.toFixed(2).replace('.', ',')}% do PIB = R$ ${s.dbggTri.toFixed(2).replace('.', ',')} Tri
* Projecao da Divida (Ano 5): ${fiscalData ? fiscalData.debtYear5.toFixed(1).replace('.', ',') : '-'}% do PIB

PERFIL FISCAL PER CAPITA (Populacao: ${s.populacao.toLocaleString('pt-BR')} hab):
* Impostos federais por Habitante: R$ ${m.impostoPerCapita.toLocaleString('pt-BR')} / ano
* Juros pagos pela Uniao por Habitante: R$ ${m.jurosPerCapita.toLocaleString('pt-BR')} / ano
* Juros pagos pela Uniao em 12 meses: R$ ${m.custoJurosBi.toFixed(1).replace('.', ',')} Bi (cada ponto de Selic ~ R$ ${s.custoSelicPontoBi.toFixed(0)} Bi)

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
  ['despesas', 'despesas', v => v],          // R$ por função/subfunção, 12 meses (SICONFI Anexo 02)
  ['orcamento', 'orcamento', v => v]         // receita e despesa por grupo, 12 meses (SICONFI Anexo 01)
]);
