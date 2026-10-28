import { UnionSpendingModel } from '../domain/UnionSpendingModel.js';

/**
 * Camada de Infraestrutura: GovApiGateway
 * Gateway de integração REST com webservices abertos do Banco Central (SGS) e IBGE.
 * Implementa estratégia Local-First com tolerância a falhas (CORS/Offline fallback) e telemetria de logs.
 */
export class GovApiGateway {
  /**
   * @param {Object} options
   * @param {number} [options.timeoutMs=10000] Timeout para requisições
   * @param {number} [options.siconfiTimeoutMs=20000] Timeout das consultas ao SICONFI (respostas de ~1 MB)
   * @param {Function} [options.onLog] Callback para streaming de logs técnicos
   */
  constructor({ timeoutMs = 10000, siconfiTimeoutMs = 20000, onLog = null } = {}) {
    this.timeoutMs = timeoutMs;
    this.siconfiTimeoutMs = siconfiTimeoutMs;
    this.onLog = onLog || (() => {});
  }

  log(message, type = 'info') {
    this.onLog({
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      message,
      type
    });
  }

  /**
   * Executa requisição fetch com timeout protegido via AbortController
   * @private
   */
  async _fetchWithTimeout(url, options = {}, timeoutMs = this.timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * Último valor de uma série do BCB SGS
   * @private
   * @param {number} serie Código da série
   * @param {string} nome Rótulo para os logs
   * @param {string} unidade Unidade para os logs (ex: '% a.a.')
   * @returns {Promise<{value: number, date: string, source: string}|null>}
   */
  async _fetchSgs(serie, nome, unidade) {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`;
    this.log(`Requisitando BCB SGS Série ${serie} (${nome})...`, 'info');
    // O SGS às vezes demora ou falha em uma chamada isolada: tenta mais uma vez antes de usar a referência
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const res = await this._fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const val = parseFloat(data[0].valor);
          if (!isNaN(val)) {
            this.log(`BCB SGS ${serie} retornado: ${nome} = ${val.toFixed(2)}${unidade} (${data[0].data})`, 'info');
            return { value: val, date: data[0].data, source: `BCB SGS Série ${serie}` };
          }
        }
        throw new Error('Payload inválido');
      } catch (err) {
        const motivo = err.name === 'AbortError' ? `sem resposta em ${this.timeoutMs / 1000} s` : err.message;
        if (tentativa < 2) {
          this.log(`BCB SGS ${serie}: falha na 1ª tentativa (${motivo}). Tentando de novo...`, 'warn');
        } else {
          this.log(`BCB SGS ${serie} indisponível (${motivo}). Mantendo valor de referência.`, 'warn');
        }
      }
    }
    return null;
  }

  /**
   * Consulta Selic Meta (BCB SGS Série 432)
   */
  fetchSelicMeta() {
    return this._fetchSgs(432, 'Taxa Meta Selic', '% a.a.');
  }

  /**
   * Consulta IPCA acumulado em 12 meses (BCB SGS Série 13522).
   * A série 433 é a variação mensal, não o acumulado.
   */
  fetchIpca12m() {
    return this._fetchSgs(13522, 'IPCA acumulado 12 meses', '%');
  }

  /**
   * Consulta Dívida Bruta DBGG % PIB (BCB SGS Série 13762)
   */
  fetchDividaBruta() {
    return this._fetchSgs(13762, 'Dívida Bruta DBGG', '% do PIB');
  }

  /**
   * Consulta Dívida Bruta DBGG em R$ milhões (BCB SGS Série 13761)
   */
  fetchDividaBrutaReais() {
    return this._fetchSgs(13761, 'Dívida Bruta DBGG em R$ milhões', '');
  }

  /**
   * Consulta PIB acumulado em 12 meses, valores correntes em R$ milhões (BCB SGS Série 4382)
   */
  fetchPibNominal12m() {
    return this._fetchSgs(4382, 'PIB acumulado 12 meses em R$ milhões', '');
  }

  /**
   * Consulta a estimativa oficial de população do Brasil (IBGE SIDRA, tabela 6579, variável 9324).
   * O antigo endpoint /api/v1/projecoes/populacao responde 404.
   */
  async fetchPopulacaoIbge() {
    const url = 'https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N1[all]';
    this.log('Consultando IBGE SIDRA 6579 (População residente estimada)...', 'info');
    try {
      const res = await this._fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const serie = data?.[0]?.resultados?.[0]?.series?.[0]?.serie;
      const ano = serie && Object.keys(serie)[0];
      const pop = ano ? Number(serie[ano]) : NaN;
      if (pop > 0) {
        this.log(`IBGE retornado com sucesso: População ${ano} = ${pop.toLocaleString('pt-BR')} hab`, 'info');
        return { value: pop, date: ano, source: 'IBGE SIDRA 6579' };
      }
      throw new Error('Formato inesperado');
    } catch (err) {
      this.log(`IBGE indisponível (${err.message}). Mantendo estimativa de referência.`, 'warn');
      return null;
    }
  }

  /**
   * Despesa liquidada da União por função num bimestre (Tesouro Nacional, SICONFI, RREO Anexo 02)
   * @private
   * @returns {Promise<Object<string, number>|null>} null quando o bimestre ainda não foi publicado
   */
  async _fetchRreoUniao(ano, bimestre) {
    const url = `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?an_exercicio=${ano}&nr_periodo=${bimestre}`
      + '&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2002&id_ente=1';
    const res = await this._fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.siconfiTimeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return UnionSpendingModel.extrair(data.items);
  }

  /**
   * Gastos reais da União acumulados em 12 meses, a partir do último bimestre publicado
   * @param {number} [anoAtual] Ano corrente (padrão: o do relógio)
   * @returns {Promise<{value: Object<string, number>, date: string, ano: number, bimestre: number, source: string}|null>}
   */
  async fetchDespesasUniao(anoAtual = new Date().getFullYear()) {
    this.log('Consultando Tesouro Nacional SICONFI (RREO Anexo 02 da União, despesa liquidada)...', 'info');
    try {
      // Procura o bimestre mais recente publicado: ano corrente do 6º ao 1º, depois o ano anterior fechado
      let ano = anoAtual;
      let bimestre = 6;
      let corrente = null;
      while (!corrente && ano >= anoAtual - 1) {
        corrente = await this._fetchRreoUniao(ano, bimestre);
        if (!corrente) {
          bimestre -= 1;
          if (bimestre === 0) { ano -= 1; bimestre = 6; }
        }
      }
      if (!corrente) throw new Error('nenhum bimestre publicado');

      let valores = corrente;
      if (bimestre < 6) {
        const [fechado, mesmoPeriodo] = await Promise.all([
          this._fetchRreoUniao(ano - 1, 6),
          this._fetchRreoUniao(ano - 1, bimestre)
        ]);
        if (!fechado || !mesmoPeriodo) throw new Error(`RREO de ${ano - 1} incompleto`);
        valores = UnionSpendingModel.acumulado12m(fechado, mesmoPeriodo, corrente);
      }

      const periodo = UnionSpendingModel.periodo(ano, bimestre);
      this.log(`SICONFI retornado: despesa da União em 12 meses (${periodo}) = R$ ${(valores.total / 1e12).toFixed(2)} Tri`, 'info');
      return { value: valores, date: periodo, ano, bimestre, source: 'Tesouro Nacional SICONFI RREO Anexo 02' };
    } catch (err) {
      const motivo = err.name === 'AbortError' ? `sem resposta em ${this.siconfiTimeoutMs / 1000} s` : err.message;
      this.log(`SICONFI indisponível (${motivo}). Mantendo gastos de referência.`, 'warn');
      return null;
    }
  }

  /**
   * Sincronização em lote com execução paralela resiliente
   */
  async syncAll() {
    this.log('Iniciando sincronização completa com os repositórios oficiais...', 'info');
    const [selic, ipca, dbgg, dbggReais, pib, pop, despesas] = await Promise.allSettled([
      this.fetchSelicMeta(),
      this.fetchIpca12m(),
      this.fetchDividaBruta(),
      this.fetchDividaBrutaReais(),
      this.fetchPibNominal12m(),
      this.fetchPopulacaoIbge(),
      this.fetchDespesasUniao()
    ]);
    const valor = r => (r.status === 'fulfilled' ? r.value : null);

    return {
      selic: valor(selic),
      ipca: valor(ipca),
      dbgg: valor(dbgg),
      dbggReais: valor(dbggReais),
      pib: valor(pib),
      populacao: valor(pop),
      despesas: valor(despesas),
      syncedAt: new Date().toLocaleTimeString('pt-BR')
    };
  }
}
