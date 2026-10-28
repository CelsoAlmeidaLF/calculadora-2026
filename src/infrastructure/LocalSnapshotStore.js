/**
 * Camada de Infraestrutura: LocalSnapshotStore
 * Guarda no próprio navegador (localStorage) a última consulta bem-sucedida aos dados oficiais,
 * para a página reabrir com esses números enquanto busca os novos. Nada sai do aparelho.
 */
export class LocalSnapshotStore {
  /**
   * @param {Object} [options]
   * @param {string} [options.chave] Chave no localStorage
   * @param {Storage} [options.storage] Armazenamento (padrão: window.localStorage)
   */
  constructor({ chave = 'calculadora.dados.v1', storage } = {}) {
    this.chave = chave;
    try {
      this.storage = storage || globalThis.localStorage || null;
    } catch {
      this.storage = null; // navegação privada ou armazenamento bloqueado
    }
  }

  /** @returns {Object|null} */
  ler() {
    try {
      const bruto = this.storage && this.storage.getItem(this.chave);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  }

  /** @param {Object} dados */
  salvar(dados) {
    try {
      if (this.storage) this.storage.setItem(this.chave, JSON.stringify(dados));
    } catch {
      /* sem espaço ou bloqueado: a página segue funcionando sem o salvo */
    }
  }
}
