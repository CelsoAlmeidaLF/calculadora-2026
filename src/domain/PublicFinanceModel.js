import { UnionSpendingModel } from './UnionSpendingModel.js';

/**
 * Camada de Domínio: Perfil das Finanças Públicas por Habitante e por Eleitor
 * Converte os agregados fiscais (R$ Bi) em valores por pessoa nas duas bases:
 * população residente (IBGE) e eleitorado apto (TSE).
 */

/**
 * Partilha paramétrica da receita tributária entre as grandes despesas (usada no simulador).
 * Os gastos reais do painel vêm do Tesouro (UnionSpendingModel).
 * Os juros não entram aqui: vêm de Selic × custo por ponto (Tesouro).
 * "Outros e investimentos" é o que sobra da arrecadação.
 */
export const PARTILHA_GASTOS = Object.freeze({
  previdencia: 0.42,
  servidores: 0.20,
  saudeEducacao: 0.16
});

export class PublicFinanceModel {
  /**
   * Distribui a arrecadação entre as despesas
   * @param {number} arrecadacaoBi Receita tributária anual (R$ Bi)
   * @param {number} jurosBi Despesa anual com juros (R$ Bi)
   * @returns {{previdencia:number, jurosDivida:number, servidores:number, saudeEducacao:number, outros:number}}
   */
  static partilha(arrecadacaoBi, jurosBi) {
    const previdencia = arrecadacaoBi * PARTILHA_GASTOS.previdencia;
    const servidores = arrecadacaoBi * PARTILHA_GASTOS.servidores;
    const saudeEducacao = arrecadacaoBi * PARTILHA_GASTOS.saudeEducacao;
    const outros = Math.max(0, arrecadacaoBi - (previdencia + jurosBi + servidores + saudeEducacao));
    return { previdencia, jurosDivida: jurosBi, servidores, saudeEducacao, outros };
  }

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
   * @param {number} params.taxRatio Carga tributária % do PIB
   * @param {number} params.selic Selic % a.a.
   * @param {number} params.custoSelicPontoBi Custo por ponto de Selic (R$ Bi)
   * @param {number} params.dbgg Dívida bruta % do PIB
   * @param {number} params.dbggTri Dívida bruta (R$ Tri)
   * @param {number} params.populacao Habitantes
   * @param {number} params.eleitores Eleitores aptos
   * @param {Object<string, number>} params.despesas Despesa liquidada da União em 12 meses (R$, por função/subfunção)
   */
  static profile({ pibBaseTri, taxRatio, selic, custoSelicPontoBi, dbgg, dbggTri, populacao, eleitores, despesas }) {
    const pibBi = Number(pibBaseTri) * 1000;
    const arrecadacaoBi = pibBi * (Number(taxRatio) / 100);
    const jurosBi = Number(selic) * Number(custoSelicPontoBi);
    const dividaBi = Number(dbggTri) * 1000;
    const gastosUniao = UnionSpendingModel.agrupar(despesas);

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
      imposto: linha('imposto', 'Impostos arrecadados', arrecadacaoBi),
      divida: { ...linha('divida', 'Dívida bruta (estoque)', dividaBi), pctPib: Number(dbgg) },
      juros: linha('juros', 'Juros da dívida (Selic × custo por ponto)', jurosBi),
      gastosTotal: linha('gastosTotal', 'Gastos da União (total liquidado)', gastosUniao.totalBi),
      gastos: gastosUniao.grupos.map(g => ({
        ...linha(g.chave, g.rotulo, g.bi),
        pctGastos: Number(((g.bi / gastosUniao.totalBi) * 100).toFixed(2))
      }))
    };
  }
}
