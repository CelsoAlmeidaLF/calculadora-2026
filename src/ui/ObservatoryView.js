import { renderIcons } from './SvgIcons.js?v=20261028-1814';

/** Número no padrão brasileiro com casas fixas: fmt(13.4, 2) → "13,40" */
const fmt = (v, casas) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
/** Valor inteiro em reais: brl(-1234) → "-R$ 1.234" */
const brl = v => `${v < 0 ? '-' : ''}R$ ${Math.abs(Math.round(v)).toLocaleString('pt-BR')}`;
/** Chave do navegador que guarda a barra lateral recolhida ou expandida */
const NAV_PREF_KEY = 'calculadora.nav';

/**
 * Camada de UI: ObservatoryView
 * Gerenciamento de elementos do DOM, bindings de eventos, renderização reativa e toasts.
 */
export class ObservatoryView {
  /**
   * @param {Object} params
   * @param {import('../application/MacroObservatoryService.js?v=20261028-1814').MacroObservatoryService} params.service
   * @param {import('../infrastructure/ChartAdapter.js?v=20261028-1814').ChartAdapter} params.chartAdapter
   */
  constructor({ service, chartAdapter }) {
    this.service = service;
    this.chartAdapter = chartAdapter;

    this.activeTab = 'tabAPIs';
    this.cachedFiscalResult = null;

    this._bindElements();
    this._attachEventListeners();
  }

  _bindElements() {
    // Header & Badges
    this.btnSyncAPI = document.getElementById('btnSyncAPI');
    this.iconSync = document.getElementById('iconSync');
    this.apiStatusBadge = document.getElementById('apiStatusBadge');
    this.lblLastSyncTime = document.getElementById('lblLastSyncTime');

    // Feeds Oficiais
    this.feedValSelic = document.getElementById('feedValSelic');
    this.syncStatusSelic = document.getElementById('syncStatusSelic');
    this.feedValIpca = document.getElementById('feedValIpca');
    this.syncStatusIpca = document.getElementById('syncStatusIpca');
    this.feedValDbgg = document.getElementById('feedValDbgg');
    this.syncStatusDbgg = document.getElementById('syncStatusDbgg');
    this.feedValPop = document.getElementById('feedValPop');
    this.syncStatusPop = document.getElementById('syncStatusPop');
    this.feedValDbggTri = document.getElementById('feedValDbggTri');
    this.feedValPib = document.getElementById('feedValPib');
    this.syncStatusPib = document.getElementById('syncStatusPib');
    this.feedValEleitores = document.getElementById('feedValEleitores');
    this.syncStatusEleitores = document.getElementById('syncStatusEleitores');
    this.feedValGastos = document.getElementById('feedValGastos');
    this.feedValReceita = document.getElementById('feedValReceita');
    this.syncStatusReceita = document.getElementById('syncStatusReceita');
    this.syncStatusGastos = document.getElementById('syncStatusGastos');

    // Cards Macroeconômicos Centrais
    this.macroCargaTrib = document.getElementById('macroCargaTrib');
    this.macroJuroReal = document.getElementById('macroJuroReal');
    this.macroJurosTotal = document.getElementById('macroJurosTotal');
    this.macroTaxPerCapita = document.getElementById('macroTaxPerCapita');
    this.macroDebtPerCapita = document.getElementById('macroDebtPerCapita');
    this.macroArrecadacao = document.getElementById('macroArrecadacao');
    this.macroDividaPerCapita = document.getElementById('macroDividaPerCapita');

    // Perfil fiscal por habitante e por eleitor
    this.tblPerfilFiscal = document.getElementById('tblPerfilFiscal');

    // Resultado da simulação na base escolhida
    this.simImposto = document.getElementById('simImposto');
    this.simImpostoTotal = document.getElementById('simImpostoTotal');
    this.simJuros = document.getElementById('simJuros');
    this.simJurosTotal = document.getElementById('simJurosTotal');
    this.simPrimario = document.getElementById('simPrimario');
    this.simPrimarioTotal = document.getElementById('simPrimarioTotal');
    this.simDividaAno5 = document.getElementById('simDividaAno5');
    this.simDividaAno5Total = document.getElementById('simDividaAno5Total');

    // Tabela Sensibilidade
    this.tblSensibilidadeSelic = document.getElementById('tblSensibilidadeSelic');

    // Controles Fiscais (Sliders)
    this.fInputPib = document.getElementById('fInputPib');
    this.fValPib = document.getElementById('fValPib');
    this.fInputGrowth = document.getElementById('fInputGrowth');
    this.fValGrowth = document.getElementById('fValGrowth');
    this.fInputTax = document.getElementById('fInputTax');
    this.fValTax = document.getElementById('fValTax');
    this.fInputSelic = document.getElementById('fInputSelic');
    this.fValSelic = document.getElementById('fValSelic');
    this.fInputIpca = document.getElementById('fInputIpca');
    this.fValIpca = document.getElementById('fValIpca');
    this.fInputSpend = document.getElementById('fInputSpend');
    this.fValSpend = document.getElementById('fValSpend');
    this.fBadgeAno5 = document.getElementById('fBadgeAno5');

    // Barra lateral de navegação
    this.mainHeader = document.querySelector('.main-header');
    this.sideNav = document.getElementById('sideNav');
    this.btnNavToggle = document.getElementById('btnNavToggle');
    this.btnNavClose = document.getElementById('btnNavClose');
    this.btnNavCollapse = document.getElementById('btnNavCollapse');
    this.navBackdrop = document.getElementById('navBackdrop');
    this.navGaveta = window.matchMedia('(max-width: 639px)');
    this.navTablet = window.matchMedia('(min-width: 640px) and (max-width: 1099px)');
    // Escolha de quem recolheu ou expandiu a barra ('rail' | 'full'); sem escolha, segue a largura
    try { this.navPreferencia = localStorage.getItem(NAV_PREF_KEY); } catch { this.navPreferencia = null; }

    // Toast
    this.toastNotification = document.getElementById('toastNotification');
    this.toastMessage = document.getElementById('toastMessage');
  }

  _attachEventListeners() {
    // Sincronização API
    if (this.btnSyncAPI) {
      this.btnSyncAPI.addEventListener('click', () => this.handleSyncClick());
    }

    // Abas de navegação (barra lateral): clique troca a aba e, no celular, fecha a gaveta
    const abas = [...document.querySelectorAll('[data-tab-target]')];
    abas.forEach((btn, i) => {
      btn.addEventListener('click', e => {
        const target = e.currentTarget.getAttribute('data-tab-target');
        this.switchTab(target);
        this.closeNav();
      });
      // Setas, Home e End movem entre as abas (tablist vertical)
      btn.addEventListener('keydown', e => {
        const destino = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: abas.length - 1 }[e.key];
        if (destino === undefined) return;
        e.preventDefault();
        const proxima = abas[(destino + abas.length) % abas.length];
        proxima.focus();
        this.switchTab(proxima.getAttribute('data-tab-target'));
      });
    });

    // Botão de menu: recolhe e expande a barra (no celular, abre a gaveta); fechar, fundo escuro e Esc fecham a gaveta
    if (this.btnNavToggle) this.btnNavToggle.addEventListener('click', () => this.toggleNav());
    if (this.btnNavCollapse) this.btnNavCollapse.addEventListener('click', () => this.toggleNav());
    if (this.btnNavClose) this.btnNavClose.addEventListener('click', () => this.closeNav());
    if (this.navBackdrop) this.navBackdrop.addEventListener('click', () => this.closeNav());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeNav();
    });
    // Gaveta fechada fica inerte (fora do Tab e do leitor de tela); no desktop e no tablet, nunca
    this.navGaveta.addEventListener('change', () => {
      this.closeNav(false);
      this._atualizarInercia();
      this._aplicarModoNav();
    });
    this.navTablet.addEventListener('change', () => this._aplicarModoNav());
    this._atualizarInercia();
    this._aplicarModoNav();

    // A barra lateral fica logo abaixo do topo, que muda de altura quando os botões quebram linha
    if (this.mainHeader && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty('--header-h', `${this.mainHeader.offsetHeight}px`);
      }).observe(this.mainHeader);
    }

    // Base de cálculo: habitante (IBGE) ou eleitor (TSE)
    document.querySelectorAll('[data-base]').forEach(btn => {
      btn.addEventListener('click', e => {
        this.service.setBaseCalculo(e.currentTarget.getAttribute('data-base'));
      });
    });

    // Sliders Fiscais
    const fiscalInputs = [
      this.fInputPib, this.fInputGrowth, this.fInputTax,
      this.fInputSelic, this.fInputIpca, this.fInputSpend
    ];
    fiscalInputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => this.handleFiscalInputChange());
      }
    });

    // Ações de Relatório e Exportação
    document.querySelectorAll('[data-action="export-csv"]').forEach(btn => {
      btn.addEventListener('click', () => this.handleExportCsv());
    });
    document.querySelectorAll('[data-action="share-whatsapp"]').forEach(btn => {
      btn.addEventListener('click', () => this.handleShareWhatsapp());
    });
    document.querySelectorAll('[data-action="copy-report"]').forEach(btn => {
      btn.addEventListener('click', () => this.handleCopyReport());
    });

    // Inscrição a mudanças no serviço
    this.service.subscribe(() => {
      this.render();
    });
  }

  /**
   * Transição entre abas
   */
  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', '-1');
    });

    const activePane = document.getElementById(tabId);
    if (activePane) activePane.classList.add('active');

    const activeBtn = document.querySelector(`[data-tab-target="${tabId}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.setAttribute('aria-selected', 'true');
      activeBtn.removeAttribute('tabindex');
    }

    // Reajusta dimensões de gráficos ao exibir a aba
    setTimeout(() => {
      this.chartAdapter.resizeAll();
    }, 50);
  }

  /**
   * Botão de menu: no celular abre ou fecha a gaveta; no desktop e no tablet recolhe ou expande a barra
   */
  toggleNav() {
    if (!this.sideNav) return;
    if (this.navGaveta.matches) {
      if (this.sideNav.classList.contains('open')) this.closeNav();
      else this.openNav();
      return;
    }
    this.navPreferencia = this.sideNav.classList.contains('rail') ? 'full' : 'rail';
    try { localStorage.setItem(NAV_PREF_KEY, this.navPreferencia); } catch { /* sem armazenamento: vale só nesta visita */ }
    this._aplicarModoNav();
    // Os gráficos acompanham a nova largura do conteúdo depois da animação
    setTimeout(() => this.chartAdapter.resizeAll(), 250);
  }

  /**
   * Barra expandida ou em trilho de ícones (desktop e tablet); no celular vale a gaveta
   */
  _aplicarModoNav() {
    if (!this.sideNav) return;
    const gaveta = this.navGaveta.matches;
    const rail = !gaveta && (this.navPreferencia ? this.navPreferencia === 'rail' : this.navTablet.matches);
    this.sideNav.classList.toggle('rail', rail);
    if (this.btnNavCollapse) {
      const rotuloBarra = rail ? 'Expandir menu de navegação' : 'Recolher menu de navegação';
      this.btnNavCollapse.setAttribute('aria-expanded', String(!rail));
      this.btnNavCollapse.setAttribute('aria-label', rotuloBarra);
      this.btnNavCollapse.title = rotuloBarra;
    }
    if (!this.btnNavToggle) return;
    const expandida = gaveta ? this.sideNav.classList.contains('open') : !rail;
    this.btnNavToggle.setAttribute('aria-expanded', String(expandida));
    const rotulo = gaveta
      ? (expandida ? 'Fechar menu de navegação' : 'Abrir menu de navegação')
      : (expandida ? 'Recolher menu de navegação' : 'Expandir menu de navegação');
    this.btnNavToggle.setAttribute('aria-label', rotulo);
    this.btnNavToggle.title = rotulo;
  }

  /**
   * Abre a gaveta de navegação (só no celular; no desktop e no tablet a barra é fixa)
   */
  openNav() {
    if (!this.sideNav || !this.navGaveta.matches) return;
    this.sideNav.classList.add('open');
    this._atualizarInercia();
    if (this.navBackdrop) this.navBackdrop.hidden = false;
    this._aplicarModoNav();
    document.body.classList.add('nav-aberta');
    const ativa = this.sideNav.querySelector('.tab-btn.active');
    if (ativa) ativa.focus();
  }

  /**
   * Fecha a gaveta de navegação
   * @param {boolean} [devolverFoco] Volta o foco ao botão de menu
   */
  closeNav(devolverFoco = true) {
    if (!this.sideNav || !this.sideNav.classList.contains('open')) return;
    this.sideNav.classList.remove('open');
    this._atualizarInercia();
    if (this.navBackdrop) this.navBackdrop.hidden = true;
    this._aplicarModoNav();
    document.body.classList.remove('nav-aberta');
    if (devolverFoco && this.btnNavToggle && this.navGaveta.matches) this.btnNavToggle.focus();
  }

  _atualizarInercia() {
    if (this.sideNav) this.sideNav.inert = this.navGaveta.matches && !this.sideNav.classList.contains('open');
  }

  /**
   * Busca os dados oficiais (botão "Atualizar dados" ou automaticamente ao abrir)
   * @param {Object} [opcoes]
   * @param {boolean} [opcoes.silencioso] Ao abrir a página: sem aviso de sucesso
   */
  async handleSyncClick({ silencioso = false } = {}) {
    if (this.btnSyncAPI) this.btnSyncAPI.disabled = true;
    if (this.iconSync) this.iconSync.classList.add('icon-spin');

    if (this.apiStatusBadge) {
      this.apiStatusBadge.className = 'badge-status syncing';
      this.apiStatusBadge.innerHTML = '<span class="badge-pulse"></span> Atualizando...';
    }

    try {
      const result = await this.service.syncOfficialFeeds();

      if (this.apiStatusBadge) {
        const aoVivo = this.service.contarAoVivo();
        const total = this.service.totalSincronizavel();
        this.apiStatusBadge.className = `badge-status ${aoVivo === total ? 'active' : 'idle'}`;
        const salvos = Object.values(this.service.state.fontes).some(f => f.salvo);
        this.apiStatusBadge.innerHTML = aoVivo === 0
          ? `<span class="badge-pulse"></span> Sem conexão · mostrando valores ${salvos ? 'salvos' : 'de referência'}`
          : `<span class="badge-pulse"></span> ${aoVivo} de ${total} atualizados${aoVivo < total ? ' · os demais seguem com o valor anterior' : ''}`;
      }

      // Sincroniza sliders de simulação fiscal com os valores retornados
      if (result.selic && this.fInputSelic) this.fInputSelic.value = result.selic.value;
      if (result.ipca && this.fInputIpca) this.fInputIpca.value = result.ipca.value;
      if (result.pib && this.fInputPib) this.fInputPib.value = this.service.state.pibBaseTri;

      if (!silencioso) this.triggerToast('Dados atualizados.');
    } catch (err) {
      this.triggerToast('Sem conexão: seguem os valores de referência.');
    } finally {
      if (this.btnSyncAPI) this.btnSyncAPI.disabled = false;
      if (this.iconSync) this.iconSync.classList.remove('icon-spin');
    }
  }

  /**
   * Atualização de sliders fiscais
   */
  handleFiscalInputChange() {
    const pibBaseTri = parseFloat(this.fInputPib.value);
    const pibReal = parseFloat(this.fInputGrowth.value);
    const taxRatio = parseFloat(this.fInputTax.value);
    const selic = parseFloat(this.fInputSelic.value);
    const ipca = parseFloat(this.fInputIpca.value);
    const spendVariation = parseFloat(this.fInputSpend.value);

    this.service.updateFiscalParams({
      pibBaseTri,
      pibReal,
      taxRatio,
      selic,
      ipca,
      spendVariation
    });
  }

  handleExportCsv() {
    this.service.exportCsv({
      fiscalData: this.cachedFiscalResult
    });
    this.triggerToast('Planilha baixada.');
  }

  /**
   * Relatório consolidado gerado na hora, com os valores e a simulação atuais
   */
  getReportText() {
    return this.service.generateConsolidatedReport({
      fiscalData: this.cachedFiscalResult
    });
  }

  handleShareWhatsapp() {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(this.getReportText())}`, '_blank');
  }

  async handleCopyReport() {
    try {
      await navigator.clipboard.writeText(this.getReportText());
      this.triggerToast('Resumo copiado.');
    } catch (e) {
      this.triggerToast('Não foi possível copiar: o navegador bloqueou a área de transferência.');
    }
  }

  triggerToast(message) {
    if (!this.toastNotification || !this.toastMessage) return;
    this.toastMessage.textContent = message;
    this.toastNotification.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      this.toastNotification.classList.remove('show');
    }, 3400);
  }

  /**
   * Renderização principal de dados
   */
  render() {
    const m = this.service.getMacroDashboardMetrics();
    const perfil = this.service.getPublicFinanceProfile();
    const base = this.service.getBase();
    const porBase = linha => (base.chave === 'eleitores' ? linha.porEleitor : linha.porHabitante);

    // 0. Base de cálculo: chips, rótulos e quantidades
    document.querySelectorAll('[data-base]').forEach(btn => {
      const ativo = btn.getAttribute('data-base') === base.chave;
      btn.classList.toggle('highlight', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
    });
    document.querySelectorAll('[data-base-label]').forEach(el => { el.textContent = base.singular; });
    document.querySelectorAll('[data-base-plural]').forEach(el => { el.textContent = base.plural; });
    document.querySelectorAll('[data-bind="populacao"]').forEach(el => { el.textContent = m.populacao.toLocaleString('pt-BR'); });
    document.querySelectorAll('[data-bind="eleitores"]').forEach(el => { el.textContent = m.eleitores.toLocaleString('pt-BR'); });
    document.querySelectorAll('[data-bind="pessoas"]').forEach(el => { el.textContent = base.pessoas.toLocaleString('pt-BR'); });

    // 1. Atualizar Feeds Oficiais no topo
    if (this.feedValSelic) this.feedValSelic.textContent = `${m.selic.toFixed(2).replace('.', ',')}%`;
    if (this.feedValIpca) this.feedValIpca.textContent = `${m.ipca.toFixed(2).replace('.', ',')}%`;
    if (this.feedValDbgg) this.feedValDbgg.textContent = `${m.dbgg.toFixed(2).replace('.', ',')}%`;
    if (this.feedValPop) this.feedValPop.textContent = `${(m.populacao / 1e6).toFixed(2).replace('.', ',')}M`;
    if (this.lblLastSyncTime) this.lblLastSyncTime.textContent = m.lastSync || 'ainda não';
    const status = f => `${f.aoVivo ? 'Atualizado' : (f.salvo ? 'Salvo' : 'Referência')} · ${f.periodo}`;
    if (this.syncStatusSelic) this.syncStatusSelic.textContent = status(m.fontes.selic);
    if (this.syncStatusIpca) this.syncStatusIpca.textContent = status(m.fontes.ipca);
    if (this.syncStatusDbgg) this.syncStatusDbgg.textContent = status(m.fontes.dbgg);
    if (this.syncStatusPop) this.syncStatusPop.textContent = status(m.fontes.populacao);
    if (this.feedValDbggTri) this.feedValDbggTri.textContent = `R$ ${fmt(m.dbggTri, 2)}`;
    if (this.feedValPib) this.feedValPib.textContent = `R$ ${fmt(m.pibNominalTri, 2)}`;
    if (this.syncStatusPib) this.syncStatusPib.textContent = status(m.fontes.pibBaseTri);
    if (this.feedValEleitores) this.feedValEleitores.textContent = `${fmt(m.eleitores / 1e6, 2)}M`;
    if (this.feedValGastos) this.feedValGastos.textContent = `R$ ${fmt(perfil.gastosTotal.bi / 1000, 2)}`;
    if (this.syncStatusGastos) this.syncStatusGastos.textContent = status(m.fontes.despesas);
    if (this.feedValReceita) this.feedValReceita.textContent = `R$ ${fmt(perfil.imposto.bi / 1000, 2)}`;
    if (this.syncStatusReceita) this.syncStatusReceita.textContent = status(m.fontes.orcamento);
    document.querySelectorAll('[data-bind="periodoGastos"]').forEach(el => { el.textContent = m.fontes.despesas.periodo; });

    // 2. Indicadores calculados (os dados oficiais ficam nos cards de conexão)
    if (this.macroCargaTrib) this.macroCargaTrib.textContent = `${fmt(m.receitaPctPib, 1)}%`;
    if (this.macroArrecadacao) this.macroArrecadacao.textContent = `R$ ${fmt(perfil.imposto.bi / 1000, 2)} Tri`;
    if (this.macroDividaPerCapita) this.macroDividaPerCapita.textContent = brl(porBase(perfil.divida));
    if (this.macroJuroReal) this.macroJuroReal.textContent = `${fmt(m.juroReal, 2)}% a.a.`;
    if (this.macroJurosTotal) this.macroJurosTotal.textContent = `R$ ${fmt(m.custoJurosBi, 1)} Bi`;
    if (this.macroTaxPerCapita) this.macroTaxPerCapita.textContent = brl(porBase(perfil.imposto));
    if (this.macroDebtPerCapita) this.macroDebtPerCapita.textContent = brl(porBase(perfil.juros));

    // 2b. Impostos, dívida e gastos: tabela (as duas bases) e gráfico (base escolhida)
    this.renderPerfilFiscal(perfil);
    const fluxos = [perfil.imposto, perfil.gastosTotal, ...perfil.gastos];
    this.chartAdapter.updatePerCapita(fluxos.map(l => l.rotulo), fluxos.map(porBase), base.singular);

    // 3. Renderizar Matriz de Sensibilidade do Tesouro
    this.renderSensibilityMatrix();

    // 4. Renderizar Simulação Fiscal
    this.renderFiscalSimulation();
  }

  renderPerfilFiscal(perfil) {
    if (!this.tblPerfilFiscal) return;
    const valorTotal = bi => (bi >= 1000 ? `R$ ${fmt(bi / 1000, 2)} Tri` : `R$ ${fmt(bi, 1)} Bi`);
    const linha = (l, extra = '') => `
      <tr>
        <td class="text-white">${l.rotulo}${extra}</td>
        <td class="text-right">${valorTotal(l.bi)}</td>
        <td class="text-right text-muted">${fmt(l.pctPib, 1)}%</td>
        <td class="text-right">${brl(l.porHabitante)}</td>
        <td class="text-right">${brl(l.porEleitor)}</td>
      </tr>`;
    const grupo = titulo => `<tr class="row-group"><td colspan="5">${titulo}</td></tr>`;

    this.tblPerfilFiscal.innerHTML =
      grupo(`Receita, juros e dívida (${this.service.state.fontes.orcamento.periodo})`) +
      linha(perfil.imposto, ' <span class="text-muted">(por ano)</span>') +
      linha(perfil.divida) +
      linha(perfil.juros, ' <span class="text-muted">(12 meses)</span>') +
      grupo(`Gastos da União em 12 meses (${this.service.state.fontes.despesas.periodo})`) +
      linha(perfil.gastosTotal) +
      perfil.gastos.map(g => linha(g, ` <span class="text-muted">(${fmt(g.pctGastos, 1)}%)</span>`)).join('');
  }

  renderSensibilityMatrix() {
    if (!this.tblSensibilidadeSelic) return;
    const scenarios = this.service.getSensibilityMatrix();
    this.tblSensibilidadeSelic.innerHTML = '';

    scenarios.forEach(sc => {
      const tr = document.createElement('tr');
      if (sc.isCurrent) {
        tr.className = 'baseline-row';
      }

      const diffColorClass = sc.diffBi > 0 ? 'text-down' : (sc.diffBi < 0 ? 'text-up' : 'text-muted');
      const diffPrefix = sc.diffBi > 0 ? '+' : '';

      tr.innerHTML = `
        <td class="${sc.isCurrent ? 'text-accent' : 'text-white'}">
          ${sc.cenarioLabel}
        </td>
        <td class="text-center text-warn">${sc.simSelic.toFixed(2).replace('.', ',')}%</td>
        <td class="text-center text-info">${sc.simJuroReal.toFixed(2).replace('.', ',')}%</td>
        <td class="text-right text-white">R$ ${sc.totalJurosBi.toFixed(1).replace('.', ',')} Bi</td>
        <td class="text-right ${diffColorClass} font-bold">
          ${diffPrefix}R$ ${sc.diffBi.toFixed(1).replace('.', ',')} Bi
        </td>
        <td class="text-right ${diffColorClass}">
          ${diffPrefix}R$ ${sc.perCapitaImpact.toLocaleString('pt-BR')} / ${this.service.getBase().sigla}
        </td>
      `;
      this.tblSensibilidadeSelic.appendChild(tr);
    });
  }

  renderFiscalSimulation() {
    const s = this.service.state;

    // Labels dos sliders fiscais
    if (this.fValPib) this.fValPib.textContent = `R$ ${s.pibBaseTri.toFixed(2).replace('.', ',')} Tri`;
    if (this.fValGrowth) this.fValGrowth.textContent = `${s.pibReal > 0 ? '+' : ''}${s.pibReal.toFixed(2).replace('.', ',')}% a.a.`;
    if (this.fValTax) this.fValTax.textContent = `${s.taxRatio.toFixed(2).replace('.', ',')}%`;
    if (this.fValSelic) this.fValSelic.textContent = `${s.selic.toFixed(2).replace('.', ',')}% a.a.`;
    if (this.fValIpca) this.fValIpca.textContent = `${s.ipca.toFixed(2).replace('.', ',')}% a.a.`;
    if (this.fValSpend) {
      let stTxt = s.spendVariation === 0 ? '(Estável)' : (s.spendVariation < 0 ? '(Ajuste)' : '(Expansão)');
      this.fValSpend.textContent = `${s.spendVariation > 0 ? '+' : ''}${s.spendVariation.toFixed(1).replace('.', ',')}% ${stTxt}`;
    }

    const fiscal = this.service.simulateFiscalModel();
    this.cachedFiscalResult = fiscal;

    if (this.fBadgeAno5) {
      this.fBadgeAno5.textContent = `Ano 5: ${fiscal.debtYear5.toFixed(1).replace('.', ',')}% PIB`;
    }

    // Atualiza gráficos fiscais
    this.chartAdapter.updateDebtTrajectory(fiscal.trajectory, fiscal.trajectoryTri);

    // Resultado na base escolhida (habitante ou eleitor)
    const pb = fiscal.porBase;
    if (this.simImposto) this.simImposto.textContent = brl(pb.imposto);
    if (this.simImpostoTotal) this.simImpostoTotal.textContent = `R$ ${fmt(fiscal.arrecadacaoBi / 1000, 2)} Tri / ano`;
    if (this.simJuros) this.simJuros.textContent = brl(pb.juros);
    if (this.simJurosTotal) this.simJurosTotal.textContent = `R$ ${fmt(fiscal.custoJurosBi, 1)} Bi / ano`;
    if (this.simPrimario) {
      this.simPrimario.textContent = brl(pb.primario);
      this.simPrimario.className = `kpi-value ${pb.primario < 0 ? 'text-down' : 'text-up'}`;
    }
    if (this.simPrimarioTotal) this.simPrimarioTotal.textContent = `${pb.primario < 0 ? 'Déficit' : 'Superávit'} de ${fmt(Math.abs(fiscal.primarioPct), 2)}% do PIB`;
    if (this.simDividaAno5) this.simDividaAno5.textContent = brl(pb.dividaAno5);
    if (this.simDividaAno5Total) this.simDividaAno5Total.textContent = `R$ ${fmt(fiscal.debtYear5Tri, 2)} Tri (${fmt(fiscal.debtYear5, 1)}% do PIB)`;
    this.chartAdapter.updateBudgetBreakdown(fiscal.composicao.map(g => g.rotulo), fiscal.composicao.map(g => g.bi));
  }
}
