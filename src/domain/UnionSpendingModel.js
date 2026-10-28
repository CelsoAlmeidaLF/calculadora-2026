/**
 * Camada de Domínio: Gastos Reais da União (Tesouro Nacional / SICONFI)
 * Lê o RREO Anexo 02 (despesa por função e subfunção) do Governo Federal,
 * usa a despesa LIQUIDADA (exceto intra-orçamentária) e monta o acumulado em 12 meses:
 *   12m = ano anterior fechado − ano anterior até o bimestre + ano corrente até o bimestre
 * O total do anexo já exclui o refinanciamento da dívida.
 */

export const COLUNA_LIQUIDADA = 'DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)';
export const ROTULO_EXCETO_INTRA = 'Total das Despesas Exceto Intra-Orçamentárias';
export const CONTA_TOTAL = 'DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)';

/** As 28 funções de governo da classificação funcional (Portaria MOG 42/1999) */
export const FUNCOES = Object.freeze([
  'Legislativa', 'Judiciária', 'Essencial à Justiça', 'Administração', 'Defesa Nacional',
  'Segurança Pública', 'Relações Exteriores', 'Assistência Social', 'Previdência Social', 'Saúde',
  'Trabalho', 'Educação', 'Cultura', 'Direitos da Cidadania', 'Urbanismo', 'Habitação', 'Saneamento',
  'Gestão Ambiental', 'Ciência e Tecnologia', 'Agricultura', 'Organização Agrária', 'Indústria',
  'Comércio e Serviços', 'Comunicações', 'Energia', 'Transporte', 'Desporto e Lazer', 'Encargos Especiais'
]);

/**
 * Grupos exibidos no painel. Cada grupo soma funções inteiras ("Função") ou
 * subfunções de uma função ("Função/Subfunção"). O que não entra em nenhum vira "Demais funções".
 */
export const GRUPOS_GASTOS = Object.freeze([
  { chave: 'previdencia', rotulo: 'Previdência Social', contas: ['Previdência Social'] },
  { chave: 'servicoDivida', rotulo: 'Serviço da dívida (juros e amortização)', contas: ['Encargos Especiais/Serviço da Dívida Interna', 'Encargos Especiais/Serviço da Dívida Externa'] },
  { chave: 'transferencias', rotulo: 'Transferências a estados e municípios', contas: ['Encargos Especiais/Transferências', 'Encargos Especiais/Transferências para a Educação Básica'] },
  { chave: 'outrosEncargos', rotulo: 'Outros encargos especiais', contas: ['Encargos Especiais/Outros Encargos Especiais'] },
  { chave: 'assistencia', rotulo: 'Assistência Social', contas: ['Assistência Social'] },
  { chave: 'saude', rotulo: 'Saúde', contas: ['Saúde'] },
  { chave: 'educacao', rotulo: 'Educação', contas: ['Educação'] },
  { chave: 'trabalho', rotulo: 'Trabalho', contas: ['Trabalho'] },
  { chave: 'defesa', rotulo: 'Defesa Nacional', contas: ['Defesa Nacional'] },
  { chave: 'justica', rotulo: 'Judiciário, Legislativo e Justiça', contas: ['Judiciária', 'Legislativa', 'Essencial à Justiça'] }
]);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export class UnionSpendingModel {
  /**
   * Extrai a despesa liquidada por função e subfunção dos itens do SICONFI
   * @param {Array<Object>} items Itens de /tt/rreo (RREO-Anexo 02, id_ente=1)
   * @returns {Object<string, number>|null} { 'Saúde': R$, 'Encargos Especiais/Transferências': R$, total: R$ }, ou null sem dados
   */
  static extrair(items) {
    const linhas = (items || []).filter(i => i.coluna === COLUNA_LIQUIDADA && i.rotulo === ROTULO_EXCETO_INTRA);
    if (linhas.length === 0) return null;

    const valores = {};
    let funcaoAtual = null;
    for (const { conta, valor } of linhas) {
      const v = Number(valor) || 0;
      if (conta === CONTA_TOTAL) {
        valores.total = v;
      } else if (FUNCOES.includes(conta)) {
        funcaoAtual = conta;
        valores[conta] = v;
      } else if (funcaoAtual) {
        // Subfunções vêm logo depois da função a que pertencem
        valores[`${funcaoAtual}/${conta}`] = v;
      }
    }
    if (!(valores.total > 0)) return null;
    return valores;
  }

  /**
   * Acumulado em 12 meses: anoAnteriorFechado − anoAnteriorAteBimestre + anoCorrenteAteBimestre
   * Se o bimestre do ano corrente for o 6º, devolve o próprio ano.
   */
  static acumulado12m(anoAnteriorFechado, anoAnteriorAteBimestre, anoCorrenteAteBimestre) {
    if (!anoAnteriorAteBimestre) return { ...anoCorrenteAteBimestre };
    const chaves = new Set([...Object.keys(anoAnteriorFechado), ...Object.keys(anoCorrenteAteBimestre)]);
    const r = {};
    for (const k of chaves) {
      r[k] = (anoAnteriorFechado[k] || 0) - (anoAnteriorAteBimestre[k] || 0) + (anoCorrenteAteBimestre[k] || 0);
    }
    return r;
  }

  /**
   * Agrupa os valores (R$) nos grupos do painel, em R$ Bi
   * @returns {{ totalBi: number, grupos: Array<{chave:string, rotulo:string, bi:number}> }}
   */
  static agrupar(valores) {
    const grupos = GRUPOS_GASTOS.map(g => ({
      chave: g.chave,
      rotulo: g.rotulo,
      bi: g.contas.reduce((a, c) => a + (valores[c] || 0), 0) / 1e9
    }));
    const totalBi = valores.total / 1e9;
    const somados = grupos.reduce((a, g) => a + g.bi, 0);
    grupos.push({ chave: 'demais', rotulo: 'Demais funções', bi: Math.max(0, totalBi - somados) });
    return {
      totalBi: Number(totalBi.toFixed(2)),
      grupos: grupos.map(g => ({ ...g, bi: Number(g.bi.toFixed(2)) }))
    };
  }

  /**
   * Rótulo do período coberto: bimestre 4 de 2026 → "set/2025–ago/2026"; bimestre 6 → "jan–dez/2026"
   */
  static periodo(ano, bimestre) {
    const ultimoMes = bimestre * 2;
    if (ultimoMes === 12) return `jan–dez/${ano}`;
    return `${MESES[ultimoMes]}/${ano - 1}–${MESES[ultimoMes - 1]}/${ano}`;
  }
}
