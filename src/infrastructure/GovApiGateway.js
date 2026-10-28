import { UnionSpendingModel } from '../domain/UnionSpendingModel.js?v=20261028-1838';
import { UnionBudgetModel } from '../domain/UnionBudgetModel.js?v=20261028-1838';

/**
 * Camada de Infraestrutura: GovApiGateway
 * Gateway de integração REST com webservices abertos do Banco Central (SGS), IBGE e Tesouro (SICONFI).
 * Implementa estratégia Local-First com tolerância a falhas (CORS/Offline fallback) e telemetria de logs.
 */
export class GovApiGateway {
  /**
   * @param {Object} options
   * @param {number} [options.timeoutMs=10000] Timeout para requisições
   * @param {number} [options.siconfiTimeoutMs=20000] Timeout das consultas ao SICONFI (respostas de ~1 MB)
   * @param {Function} [options.onLog] Callback para streaming de logs técnicos
   * @param {boolean} [options.incluirTesouro=true] Consulta o SICONFI. No navegador use false: a API do Tesouro
   *   não manda cabeçalho CORS, então só funciona no Node (scripts/build_referencia_uniao.mjs)
   */
  constructor({ timeoutMs = 10000, siconfiTimeoutMs = 20000, onLog = null, incluirTesouro = true } = {}) {
    this.timeoutMs = timeoutMs;
    this.incluirTesouro = incluirTesouro;
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
   * Último valor de uma série do BCB SGS e o histórico dos últimos 12 meses (um ponto por mês)
   * @private
   * @param {number} serie Código da série
   * @param {string} nome Rótulo para os logs
   * @param {string} unidade Unidade para os logs (ex: '% a.a.')
   * @returns {Promise<{value: number, date: string, historico: Array<{data: string, valor: number}>, source: string}|null>}
   */
  async _fetchSgs(serie, nome, unidade) {
    // Período de 1 ano: séries diárias (como a 432) não aceitam /ultimos/N com N > 1 de forma estável
    const fim = new Date();
    const inicio = new Date(fim.getFullYear() - 1, fim.getMonth(), fim.getDate());
    const br = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${br(inicio)}&dataFinal=${br(fim)}`;
    this.log(`Requisitando BCB SGS Série ${serie} (${nome})...`, 'info');
    // O SGS às vezes demora ou falha em uma chamada isolada: tenta mais uma vez antes de usar a referência
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const res = await this._fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const ultimo = data[data.length - 1];
          const val = parseFloat(ultimo.valor);
          if (!isNaN(val)) {
            this.log(`BCB SGS ${serie} retornado: ${nome} = ${val.toFixed(2)}${unidade} (${ultimo.data})`, 'info');
            return { value: val, date: ultimo.data, historico: GovApiGateway.mensal(data), source: `BCB SGS Série ${serie}` };
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
   * Reduz uma série do SGS a um ponto por mês (o último valor de cada mês)
   * @param {Array<{data: string, valor: string}>} dados Datas em dd/mm/aaaa
   * @returns {Array<{data: string, valor: number}>} Datas em mm/aaaa
   */
  static mensal(dados) {
    const porMes = new Map();
    for (const { data, valor } of dados) {
      const v = parseFloat(valor);
      if (!isNaN(v)) porMes.set(String(data).slice(3), v);
    }
    return [...porMes].map(([data, valor]) => ({ data, valor }));
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
   * Um anexo do RREO da União num bimestre (Tesouro Nacional, SICONFI)
   * @private
   * @param {string} anexo Ex.: 'RREO-Anexo 02'
   * @param {Function} extrair Leitor dos itens do anexo → valores, ou null se o bimestre não foi publicado
   */
  async _fetchRreoUniao(ano, bimestre, anexo, extrair) {
    const url = `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo?an_exercicio=${ano}&nr_periodo=${bimestre}`
      + `&co_tipo_demonstrativo=RREO&no_anexo=${encodeURIComponent(anexo)}&id_ente=1`;
    const res = await this._fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.siconfiTimeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return extrair(data.items);
  }

  /**
   * Valores de um anexo do RREO da União acumulados em 12 meses, a partir do último bimestre publicado
   * @private
   */
  async _rreoUniao12m({ anexo, extrair, descricao, anoAtual }) {
    this.log(`Consultando Tesouro Nacional SICONFI (${anexo} da União, ${descricao})...`, 'info');
    try {
      // Procura o bimestre mais recente publicado: ano corrente do 6º ao 1º, depois o ano anterior fechado
      let ano = anoAtual;
      let bimestre = 6;
      let corrente = null;
      while (!corrente && ano >= anoAtual - 1) {
        corrente = await this._fetchRreoUniao(ano, bimestre, anexo, extrair);
        if (!corrente) {
          bimestre -= 1;
          if (bimestre === 0) { ano -= 1; bimestre = 6; }
        }
      }
      if (!corrente) throw new Error('nenhum bimestre publicado');

      let valores = corrente;
      if (bimestre < 6) {
        const [fechado, mesmoPeriodo] = await Promise.all([
          this._fetchRreoUniao(ano - 1, 6, anexo, extrair),
          this._fetchRreoUniao(ano - 1, bimestre, anexo, extrair)
        ]);
        if (!fechado || !mesmoPeriodo) throw new Error(`RREO de ${ano - 1} incompleto`);
        valores = UnionSpendingModel.acumulado12m(fechado, mesmoPeriodo, corrente);
      }

      const periodo = UnionSpendingModel.periodo(ano, bimestre);
      this.log(`SICONFI retornado: ${anexo} da União em 12 meses (${periodo})`, 'info');
      return { value: valores, date: periodo, ano, bimestre, source: `Tesouro Nacional SICONFI ${anexo}` };
    } catch (err) {
      const motivo = err.name === 'AbortError' ? `sem resposta em ${this.siconfiTimeoutMs / 1000} s` : err.message;
      this.log(`SICONFI ${anexo} indisponível (${motivo}). Mantendo valores de referência.`, 'warn');
      return null;
    }
  }

  /**
   * Gastos reais da União por função em 12 meses (RREO Anexo 02, despesa liquidada)
   * @param {number} [anoAtual] Ano corrente (padrão: o do relógio)
   * @returns {Promise<{value: Object<string, number>, date: string, ano: number, bimestre: number, source: string}|null>}
   */
  fetchDespesasUniao(anoAtual = new Date().getFullYear()) {
    return this._rreoUniao12m({
      anexo: 'RREO-Anexo 02', extrair: items => UnionSpendingModel.extrair(items),
      descricao: 'despesa liquidada por função', anoAtual
    });
  }

  /**
   * Receita federal e despesa da União por grupo em 12 meses (RREO Anexo 01, Balanço Orçamentário)
   * @param {number} [anoAtual] Ano corrente (padrão: o do relógio)
   */
  fetchOrcamentoUniao(anoAtual = new Date().getFullYear()) {
    return this._rreoUniao12m({
      anexo: 'RREO-Anexo 01', extrair: items => UnionBudgetModel.extrair(items),
      descricao: 'receita realizada e despesa por grupo', anoAtual
    });
  }

  /**
   * Sincronização em lote com execução paralela resiliente
   */
  async syncAll() {
    this.log('Iniciando sincronização completa com os repositórios oficiais...', 'info');
    const [selic, ipca, dbgg, dbggReais, pib, pop, despesas, orcamento] = await Promise.allSettled([
      this.fetchSelicMeta(),
      this.fetchIpca12m(),
      this.fetchDividaBruta(),
      this.fetchDividaBrutaReais(),
      this.fetchPibNominal12m(),
      this.fetchPopulacaoIbge(),
      this.incluirTesouro ? this.fetchDespesasUniao() : null,
      this.incluirTesouro ? this.fetchOrcamentoUniao() : null
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
      orcamento: valor(orcamento),
      ignorados: this.incluirTesouro ? [] : ['despesas', 'orcamento'],
      syncedAt: new Date().toLocaleTimeString('pt-BR')
    };
  }
}
