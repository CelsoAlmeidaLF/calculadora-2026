import { UnionSpendingModel } from './UnionSpendingModel.js?v=20261028-1822';
import { UnionBudgetModel } from './UnionBudgetModel.js?v=20261028-1822';

/**
 * Camada de Domínio: Perfil das Finanças Públicas por Habitante e por Eleitor
 * Converte os agregados fiscais (R$ Bi) em valores por pessoa nas duas bases:
 * população residente (IBGE) e eleitorado apto (TSE).
 * Receita, juros e gastos são todos da União (Tesouro, SICONFI), para que a comparação feche;
 * a dívida bruta é a do governo geral (BCB), que é o indicador oficial de endividamento.
 */
export class PublicFinanceModel {
  /**
   * Valor em R$ por pessoa, a partir de um agregado em R$ Bi
   * @param {number} valorBi
   * @param {number} pessoas
   */
  static porPessoa(valorBi, pessoas) {
    if (!(pessoas > 0)) throw new Error('A base de cálculo precisa ser maior que zero');
    return Math.round((Number(valorBi) * 1e9) / pessoas);
  }

  /**
   * Monta o perfil completo das finanças públicas
   * @param {Object} params
   * @param {number} params.pibBaseTri PIB nominal (R$ Tri)
   * @param {number} params.dbgg Dívida bruta % do PIB
   * @param {number} params.dbggTri Dívida bruta (R$ Tri)
   * @param {number} params.populacao Habitantes
   * @param {number} params.eleitores Eleitores aptos
   * @param {Object<string, number>} params.despesas Despesa liquidada da União em 12 meses (R$, por função/subfunção)
   * @param {Object<string, number>} params.orcamento Receita e despesa por grupo da União em 12 meses (R$, RREO Anexo 01)
   */
  static profile({ pibBaseTri, dbgg, dbggTri, populacao, eleitores, despesas, orcamento }) {
    const pibBi = Number(pibBaseTri) * 1000;
    const dividaBi = Number(dbggTri) * 1000;
    const gastosUniao = UnionSpendingModel.agrupar(despesas);
    const orcamentoUniao = UnionBudgetModel.resumo(orcamento);

    const linha = (chave, rotulo, bi) => ({
      chave,
      rotulo,
      bi: Number(bi.toFixed(2)),
      pctPib: Number(((bi / pibBi) * 100).toFixed(2)),
      porHabitante: PublicFinanceModel.porPessoa(bi, populacao),
      porEleitor: PublicFinanceModel.porPessoa(bi, eleitores)
    });

    return {
      pibBi: Number(pibBi.toFixed(2)),
      populacao: Number(populacao),
      eleitores: Number(eleitores),
      eleitoresPorHabitante: Number((Number(eleitores) / Number(populacao)).toFixed(4)),
      imposto: linha('imposto', 'Impostos e contribuições federais', orcamentoUniao.receitaBi),
      divida: { ...linha('divida', 'Dívida bruta do governo geral (estoque)', dividaBi), pctPib: Number(dbgg) },
      juros: linha('juros', 'Juros da dívida pagos pela União', orcamentoUniao.jurosBi),
      gastosTotal: linha('gastosTotal', 'Gastos da União (total liquidado)', gastosUniao.totalBi),
      gastos: gastosUniao.grupos.map(g => ({
        ...linha(g.chave, g.rotulo, g.bi),
        pctGastos: Number(((g.bi / gastosUniao.totalBi) * 100).toFixed(2))
      }))
    };
  }
}
