/**
 * Camada de Domínio: Modelo Econômico da Equação de Fisher
 * Cálculo rigoroso da taxa real de juros implícita:
 * (1 + i_real) = (1 + i_nominal) / (1 + ipca)
 */
export class FisherModel {
  /**
   * Calcula o juro real exato percentual a partir de taxas percentuais
   * @param {number} taxaNominalPct Taxa nominal anual em percentual (ex: 10.5 para 10,50%)
   * @param {number} inflacaoPct Taxa de inflação anual em percentual (ex: 4.9 para 4,90%)
   * @returns {number} Taxa real anual em percentual (ex: 5.3384%)
   */
  static calculateRealRate(taxaNominalPct, inflacaoPct) {
    const nominal = Number(taxaNominalPct) / 100;
    const ipca = Number(inflacaoPct) / 100;

    if (ipca <= -1) {
      throw new Error("Taxa de inflação não pode ser menor ou igual a -100%");
    }

    const realDecimal = ((1 + nominal) / (1 + ipca)) - 1;
    return realDecimal * 100;
  }
}
