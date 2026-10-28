/**
 * Camada de Domínio: Orçamento da União por natureza (Tesouro Nacional / SICONFI)
 * Lê o RREO Anexo 01 (Balanço Orçamentário) do Governo Federal:
 *   receita realizada até o bimestre (impostos, taxas e contribuições) e
 *   despesa liquidada até o bimestre por grupo (pessoal, juros, previdência, transferências...).
 * O acumulado em 12 meses usa a mesma regra do Anexo 02 (UnionSpendingModel.acumulado12m).
 * Tudo aqui é só da União: compara receita federal com gasto federal.
 */

const PREFIXO_RECEITA = 'Até o Bimestre';
const PREFIXO_DESPESA = 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE';

/** Contas lidas do anexo, pelo cod_conta (estável entre exercícios) */
export const CONTAS_RECEITA = Object.freeze({
  impostos: 'ReceitaTributaria',          // impostos, taxas e contribuições de melhoria
  contribuicoes: 'ReceitaDeContribuicoes' // contribuições sociais e econômicas
});

export const CONTAS_DESPESA = Object.freeze({
  despesaTotal: 'DespesasExcetoIntraOrcamentarias',
  pessoal: 'PessoalEEncargosSociais',
  juros: 'JurosEEncargosDaDivida',
  transferencias: 'TransferenciasAEstadosDistritoFederalEMunicipios',
  previdencia: 'BeneficiosPrevidenciarios',
  investimentos: 'Investimentos',
  amortizacao: 'AmortizacaoDaDivida'
});

/** Fatias da rosca do simulador; o que sobra do total vira "Demais despesas" */
export const GRUPOS_ORCAMENTO = Object.freeze([
  { chave: 'previdencia', rotulo: 'Previdência (benefícios)' },
  { chave: 'juros', rotulo: 'Juros da dívida' },
  { chave: 'amortizacao', rotulo: 'Amortização da dívida' },
  { chave: 'transferencias', rotulo: 'Transferências a estados e municípios' },
  { chave: 'pessoal', rotulo: 'Pessoal e encargos' },
  { chave: 'investimentos', rotulo: 'Investimentos' }
]);

/** Grupos que não são gasto primário (não mudam com a variação real das despesas) */
const FINANCEIROS = new Set(['juros', 'amortizacao']);

export class UnionBudgetModel {
  /**
   * Extrai receita e despesa por grupo dos itens do SICONFI
   * @param {Array<Object>} items Itens de /tt/rreo (RREO-Anexo 01, id_ente=1)
   * @returns {Object<string, number>|null} { impostos, contribuicoes, despesaTotal, juros, ... } em R$, ou null sem dados
   */
  static extrair(items) {
    const valores = {};
    const ler = (contas, prefixo) => {
      for (const [chave, cod] of Object.entries(contas)) {
        // A primeira linha com o código é a "exceto intra-orçamentária"; as intra têm código próprio
        const item = (items || []).find(i => i.cod_conta === cod && String(i.coluna).startsWith(prefixo));
        if (item) valores[chave] = Number(item.valor) || 0;
      }
    };
    ler(CONTAS_RECEITA, PREFIXO_RECEITA);
    ler(CONTAS_DESPESA, PREFIXO_DESPESA);
    if (!(valores.impostos > 0) || !(valores.despesaTotal > 0)) return null;
    return valores;
  }

  /**
   * Resumo em R$ Bi: receita federal (impostos + contribuições), juros pagos e composição da despesa
   * @param {Object<string, number>} valores Saída de extrair() acumulada em 12 meses (R$)
   */
  static resumo(valores) {
    const bi = v => Number(((v || 0) / 1e9).toFixed(2));
    const grupos = GRUPOS_ORCAMENTO.map(g => ({ ...g, bi: bi(valores[g.chave]) }));
    const totalBi = bi(valores.despesaTotal);
    const somados = grupos.reduce((a, g) => a + g.bi, 0);
    grupos.push({ chave: 'demais', rotulo: 'Demais despesas', bi: Number(Math.max(0, totalBi - somados).toFixed(2)) });
    return {
      receitaBi: bi((valores.impostos || 0) + (valores.contribuicoes || 0)),
      impostosBi: bi(valores.impostos),
      contribuicoesBi: bi(valores.contribuicoes),
      jurosBi: bi(valores.juros),
      despesaTotalBi: totalBi,
      grupos
    };
  }

  /**
   * Composição da despesa num cenário do simulador:
   * juros trocados pelos juros simulados e gasto primário corrigido pela variação real
   * @param {Array<{chave:string, rotulo:string, bi:number}>} grupos Saída de resumo().grupos
   * @param {number} jurosSimBi Juros do cenário (R$ Bi)
   * @param {number} spendVariation Variação real das despesas primárias (%)
   */
  static cenario(grupos, jurosSimBi, spendVariation) {
    const fator = 1 + Number(spendVariation) / 100;
    return grupos.map(g => {
      let bi = g.bi;
      if (g.chave === 'juros') bi = jurosSimBi;
      else if (!FINANCEIROS.has(g.chave)) bi = g.bi * fator;
      return { ...g, bi: Number(Math.max(0, bi).toFixed(2)) };
    });
  }

  /**
   * Juros de um cenário de Selic: juros pagos de fato + diferença de Selic × custo por ponto
   * @param {number} jurosBaseBi Juros pagos pela União em 12 meses (R$ Bi)
   * @param {number} selicCenario Selic do cenário (% a.a.)
   * @param {number} selicReferencia Selic vigente (% a.a.)
   * @param {number} custoSelicPontoBi Custo por ponto de Selic (R$ Bi)
   */
  static jurosCenario(jurosBaseBi, selicCenario, selicReferencia, custoSelicPontoBi) {
    const v = Number(jurosBaseBi) + (Number(selicCenario) - Number(selicReferencia)) * Number(custoSelicPontoBi);
    return Number(Math.max(0, v).toFixed(2));
  }
}
