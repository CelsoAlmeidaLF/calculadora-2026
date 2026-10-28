/**
 * Camada de Infraestrutura: CsvExporter
 * Exportador de dados tabulares e indicadores macroeconômicos no padrão RFC 4180 com BOM UTF-8.
 */
export class CsvExporter {
  /**
   * Exporta conjunto de métricas para arquivo CSV e dispara download no navegador
   * @param {Object} data Dados para exportação
   * @param {string} [filename='observatorio_macroeconomico_oficial_brasil.csv']
   */
  static export(data, filename = 'observatorio_macroeconomico_oficial_brasil.csv') {
    let csv = "Indicador,Valor,Unidade,Fonte_Oficial\r\n";

    const rows = [
      ["Populacao_Total", data.populacao, "habitantes", "IBGE SIDRA 6579"],
      ["Eleitorado_Apto", data.eleitores, "eleitores", "TSE Eleicoes 2026 (1o turno, inclui exterior)"],
      ["PIB_Nominal_Base", data.pibBaseTri, "Trilhoes_BRL", "Banco Central do Brasil SGS 4382 (PIB 12 meses)"],
      ["Crescimento_Real_PIB", data.pibReal, "% a.a.", "SPE / Fazenda"],
      ["Carga_Tributaria_Bruta_Governo_Geral", data.taxRatio, "% do PIB", "Secretaria do Tesouro Nacional"],
      ["Taxa_Meta_Selic", data.selic, "% a.a.", "Banco Central do Brasil SGS 432"],
      ["IPCA_Acumulado_12M", data.ipca, "% a.a.", "Banco Central do Brasil SGS 13522"],
      ["Divida_Bruta_Governo_Geral_DBGG", data.dbgg, "% do PIB", "Banco Central do Brasil SGS 13762"],
      ["Divida_Bruta_Governo_Geral_DBGG_Reais", data.dbggTri, "Trilhoes_BRL", "Banco Central do Brasil SGS 13761"],
      ["Juro_Real_Implicito_Fisher", data.juroReal, "% a.a.", "Calculo Implicito Fisher"],
      ["Juros_Pagos_Uniao_12m", data.custoJurosBi, "Bilhoes_BRL", "Tesouro SICONFI RREO Anexo 01"],
      ["Imposto_Federal_Per_Capita_Ano", data.impostoPerCapita, "BRL/hab", "Impostos e contribuicoes federais / Populacao"],
      ["Juros_Divida_Per_Capita_Ano", data.jurosPerCapita, "BRL/hab", "Juros / Populacao"],
      ["Divida_Projetada_Ano_5", data.debtYear5, "% do PIB", "Modelo Sustentabilidade FMI/Tesouro"],
      ...(data.extraRows || [])
    ];

    rows.forEach(([k, v, u, s]) => {
      csv += `${k},${v},${u},${s}\r\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
