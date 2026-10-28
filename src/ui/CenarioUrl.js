/**
 * Camada de UI: CenarioUrl
 * Guarda o cenário do simulador no endereço da página (depois do #), para quem receber o link
 * abrir com os mesmos valores. Ex.: index.html#selic=12&ipca=4.5&base=eleitores&aba=tabFiscal
 * Valores fora da faixa dos controles são ignorados.
 */

/** Campo do cenário → [chave no link, mínimo, máximo] (mesmas faixas dos sliders do index.html) */
const NUMEROS = Object.freeze({
  pib: ['pib', 10, 16],
  crescimento: ['cresc', -2, 5],
  carga: ['carga', 25, 42],
  selic: ['selic', 6, 16],
  ipca: ['ipca', 2, 9],
  gastos: ['gastos', -6, 6]
});
const BASES = ['populacao', 'eleitores'];
const ABAS = ['tabAPIs', 'tabFiscal'];

export class CenarioUrl {
  /**
   * Lê o cenário de um endereço
   * @param {string} href
   * @returns {Object|null} Só os campos válidos; null se não houver nenhum
   */
  static ler(href) {
    const hash = String(href || '').split('#')[1];
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const cenario = {};
    for (const [campo, [chave, min, max]] of Object.entries(NUMEROS)) {
      const bruto = params.get(chave);
      if (bruto === null) continue;
      const v = Number(bruto.replace(',', '.'));
      if (Number.isFinite(v) && v >= min && v <= max) cenario[campo] = v;
    }
    if (BASES.includes(params.get('base'))) cenario.base = params.get('base');
    if (ABAS.includes(params.get('aba'))) cenario.aba = params.get('aba');
    return Object.keys(cenario).length ? cenario : null;
  }

  /**
   * Monta o endereço com o cenário
   * @param {string} href Endereço atual
   * @param {Object} cenario { pib, crescimento, carga, selic, ipca, gastos, base, aba }
   */
  static montar(href, cenario) {
    const params = new URLSearchParams();
    for (const [campo, [chave]] of Object.entries(NUMEROS)) {
      if (cenario[campo] !== undefined) params.set(chave, String(Number(Number(cenario[campo]).toFixed(2))));
    }
    if (cenario.base) params.set('base', cenario.base);
    if (cenario.aba) params.set('aba', cenario.aba);
    return `${String(href).split('#')[0]}#${params.toString()}`;
  }
}
