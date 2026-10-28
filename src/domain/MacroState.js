import { DESPESAS_UNIAO_REFERENCIA } from './referencia/DespesasUniaoReferencia.js?v=20261028-1842';
import { ORCAMENTO_UNIAO_REFERENCIA } from './referencia/OrcamentoUniaoReferencia.js?v=20261028-1842';

/**
 * Camada de Domínio: Entidade MacroState
 * Estado imutável dos indicadores macroeconômicos e fiscais do Brasil.
 * Base de dados oficiais: Banco Central do Brasil (SGS), IBGE, TSE e Secretaria do Tesouro Nacional (STN).
 */
export class MacroState {
  /**
   * @param {Object} params
   * @param {number} params.populacao População residente estimada (IBGE SIDRA 6579)
   * @param {number} params.eleitores Eleitorado apto (TSE, Eleições 2026, 1º turno, inclui exterior)
   * @param {number} params.pibBaseTri PIB nominal acumulado em 12 meses, em Trilhões BRL (BCB SGS 4382)
   * @param {number} params.pibReal Projeção de crescimento real do PIB % a.a. (SPE/Fazenda)
   * @param {number} params.taxRatio Carga tributária bruta do governo geral (União, estados e municípios) % do PIB; usada só no simulador
   * @param {number} params.selic Taxa Selic % a.a. em uso (o simulador pode mudar)
   * @param {number} [params.selicOficial] Meta Selic vigente (Copom / BCB Série 432); referência dos juros pagos
   * @param {number} params.ipca Inflação acumulada 12m % a.a. (IPCA / BCB Série 13522)
   * @param {number} params.dbgg Dívida Bruta do Governo Geral % do PIB (BCB Série 13762)
   * @param {number} params.dbggTri Dívida Bruta do Governo Geral em Trilhões BRL (BCB Série 13761)
   * @param {number} params.custoSelicPontoBi Sensibilidade de despesa da dívida por ponto de Selic (R$ Bi / pp)
   * @param {number} params.spendVariation Variação real de despesas primárias % a.a.
   * @param {Object<string, number>} params.despesas Despesa liquidada da União em 12 meses por função/subfunção, em R$ (Tesouro SICONFI)
   * @param {Object<string, number>} params.orcamento Receita federal e despesa da União por grupo em 12 meses, em R$ (SICONFI, RREO Anexo 01)
   * @param {Object<string, Array<{data: string, valor: number}>>} [params.historicos] Últimos 12 meses de cada indicador do BCB (vazio até sincronizar)
   * @param {'populacao'|'eleitores'} params.baseCalculo Divisor dos valores "por pessoa"
   * @param {string|null} params.lastSync Timestamp da última sincronização oficial
   * @param {Object} [params.fontes] Período e origem de cada indicador → { periodo, aoVivo }
   */
  constructor({
    populacao = 214211951,
    eleitores = 158745502,
    pibBaseTri = 13.40,
    pibReal = 2.00,
    taxRatio = 34.20,
    selic = 13.75,
    selicOficial = selic,
    ipca = 4.58,
    dbgg = 82.87,
    dbggTri = 11.05,
    custoSelicPontoBi = 50.0,
    spendVariation = 0.0,
    despesas = DESPESAS_UNIAO_REFERENCIA.valores,
    orcamento = ORCAMENTO_UNIAO_REFERENCIA.valores,
    historicos = {},
    baseCalculo = 'populacao',
    lastSync = null,
    fontes = MacroState.FONTES_REFERENCIA
  } = {}) {
    if (!MacroState.BASES[baseCalculo]) {
      throw new Error(`Base de cálculo inválida: ${baseCalculo}`);
    }
    this.populacao = Number(populacao);
    this.eleitores = Number(eleitores);
    this.pibBaseTri = Number(pibBaseTri);
    this.pibReal = Number(pibReal);
    this.taxRatio = Number(taxRatio);
    this.selic = Number(selic);
    this.selicOficial = Number(selicOficial);
    this.ipca = Number(ipca);
    this.dbgg = Number(dbgg);
    this.dbggTri = Number(dbggTri);
    this.custoSelicPontoBi = Number(custoSelicPontoBi);
    this.spendVariation = Number(spendVariation);
    this.despesas = Object.freeze({ ...despesas });
    this.orcamento = Object.freeze({ ...orcamento });
    this.historicos = Object.freeze({ ...historicos });
    this.baseCalculo = baseCalculo;
    this.lastSync = lastSync;
    this.fontes = Object.freeze({ ...fontes });

    Object.freeze(this);
  }

  /**
   * Quantidade de pessoas da base de cálculo escolhida (habitantes ou eleitores)
   * @param {'populacao'|'eleitores'} [base]
   */
  divisor(base = this.baseCalculo) {
    return base === 'eleitores' ? this.eleitores : this.populacao;
  }

  /**
   * Cria uma nova instância de MacroState com campos modificados (imutabilidade)
   * @param {Partial<MacroState>} changes
   * @returns {MacroState}
   */
  with(changes) {
    return new MacroState({
      populacao: changes.populacao ?? this.populacao,
      eleitores: changes.eleitores ?? this.eleitores,
      pibBaseTri: changes.pibBaseTri ?? this.pibBaseTri,
      pibReal: changes.pibReal ?? this.pibReal,
      taxRatio: changes.taxRatio ?? this.taxRatio,
      selic: changes.selic ?? this.selic,
      selicOficial: changes.selicOficial ?? this.selicOficial,
      ipca: changes.ipca ?? this.ipca,
      dbgg: changes.dbgg ?? this.dbgg,
      dbggTri: changes.dbggTri ?? this.dbggTri,
      custoSelicPontoBi: changes.custoSelicPontoBi ?? this.custoSelicPontoBi,
      spendVariation: changes.spendVariation ?? this.spendVariation,
      despesas: changes.despesas ?? this.despesas,
      orcamento: changes.orcamento ?? this.orcamento,
      historicos: { ...this.historicos, ...(changes.historicos || {}) },
      baseCalculo: changes.baseCalculo ?? this.baseCalculo,
      lastSync: changes.lastSync ?? this.lastSync,
      fontes: { ...this.fontes, ...(changes.fontes || {}) }
    });
  }

  /**
   * Valores de referência fixos (consultados em 28/10/2026), usados até a sincronização trazer os valores ao vivo
   */
  static createDefault() {
    return new MacroState();
  }
}

/** Bases de cálculo aceitas e seus rótulos */
MacroState.BASES = Object.freeze({
  populacao: Object.freeze({ singular: 'habitante', plural: 'habitantes', sigla: 'hab' }),
  eleitores: Object.freeze({ singular: 'eleitor', plural: 'eleitores', sigla: 'eleitor' })
});

/** Períodos dos valores de referência padrão (BCB SGS, IBGE, TSE e Tesouro consultados em 28/10/2026) */
MacroState.FONTES_REFERENCIA = Object.freeze({
  selic: Object.freeze({ periodo: 'out/2026', aoVivo: false }),
  ipca: Object.freeze({ periodo: 'set/2026', aoVivo: false }),
  dbgg: Object.freeze({ periodo: 'ago/2026', aoVivo: false }),
  dbggTri: Object.freeze({ periodo: 'ago/2026', aoVivo: false }),
  pibBaseTri: Object.freeze({ periodo: 'set/2026', aoVivo: false }),
  populacao: Object.freeze({ periodo: '2026', aoVivo: false }),
  eleitores: Object.freeze({ periodo: 'TSE 2026', aoVivo: false }),
  despesas: Object.freeze({ periodo: DESPESAS_UNIAO_REFERENCIA.periodo, aoVivo: false }),
  orcamento: Object.freeze({ periodo: ORCAMENTO_UNIAO_REFERENCIA.periodo, aoVivo: false })
});
