import { FisherModel } from './FisherModel.js?v=20261028-1838';
import { UnionBudgetModel } from './UnionBudgetModel.js?v=20261028-1838';

/**
 * Camada de Domínio: Matriz de Sensibilidade do Tesouro Nacional
 * Simulação de desvios da taxa Selic sobre a despesa financeira da dívida mobiliária federal.
 * Parte dos juros pagos de fato pela União (SICONFI) e soma a diferença de Selic × custo por ponto.
 */
export class SensibilityMatrixModel {
  /**
   * Gera os cenários de sensibilidade da Selic
   * @param {Object} params
   * @param {number} params.selicAtual Taxa Selic de referência % a.a.
   * @param {number} params.ipcaAtual Inflação IPCA % a.a.
   * @param {number} params.populacao População total consolidada
   * @param {number} params.custoSelicPontoBi Custo da dívida por ponto de Selic (R$ Bi)
   * @param {number} params.jurosBaseBi Juros pagos pela União em 12 meses, na Selic atual (R$ Bi)
   * @param {number[]} [params.deltas=[-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0]] Desvios em pontos percentuais
   * @returns {Array<Object>} Lista de cenários calculados
   */
  static generate({
    selicAtual,
    ipcaAtual,
    populacao,
    custoSelicPontoBi = 50.0,
    jurosBaseBi = Number(selicAtual) * Number(custoSelicPontoBi),
    deltas = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0]
  }) {
    const selic = Number(selicAtual);
    const ipca = Number(ipcaAtual);
    const pop = Number(populacao);
    const custoPonto = Number(custoSelicPontoBi);

    return deltas.map(delta => {
      const simSelic = Math.max(1.0, selic + delta);
      const simJuroReal = FisherModel.calculateRealRate(simSelic, ipca);
      const totalJurosBi = UnionBudgetModel.jurosCenario(jurosBaseBi, simSelic, selic, custoPonto);
      const diffBi = (simSelic - selic) * custoPonto;
      const perCapitaImpact = (diffBi * 1e9) / pop;
      const isCurrent = delta === 0.0;

      const cenarioLabel = isCurrent ? 'Atual' : `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} ponto${Math.abs(delta) === 1 ? '' : 's'}`;

      return {
        delta,
        isCurrent,
        cenarioLabel,
        simSelic: Number(simSelic.toFixed(2)),
        simJuroReal: Number(simJuroReal.toFixed(2)),
        totalJurosBi: Number(totalJurosBi.toFixed(1)),
        diffBi: Number(diffBi.toFixed(1)),
        perCapitaImpact: Math.round(perCapitaImpact)
      };
    });
  }
}
