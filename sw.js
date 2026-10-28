/**
 * Service Worker da Calculadora (PWA) — mesma estratégia do 8.1. ELEICOES
 * - Pré-carrega o "app shell" para abrir offline.
 * - Páginas (navegação): rede primeiro; sem rede, abre o index.html do cache.
 * - Demais arquivos do próprio site: responde do cache e atualiza em segundo plano (stale-while-revalidate).
 * - APIs do Banco Central e do IBGE (outros domínios) não passam pelo cache: sem rede, a página usa
 *   a última consulta salva no aparelho ou os valores de referência. Zero telemetria.
 * CACHE_VERSION e APP_SHELL são gerados por scripts/versionar.mjs: não edite à mão.
 */
// <versionar>
const CACHE_VERSION = 'calculadora-20261028-1842';
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/app-icon-32.png",
  "icons/app-icon-192.png",
  "icons/apple-touch-icon.png",
  "css/fonts.css?v=20261028-1842",
  "vendor/stk-gov/stk-gov.css?v=20261028-1842",
  "css/style.css?v=20261028-1842",
  "css/analista.css?v=20261028-1842",
  "vendor/chart.js/chart.umd.js",
  "icons/app-icon-64.png",
  "src/Program.js?v=20261028-1842",
  "src/application/MacroObservatoryService.js?v=20261028-1842",
  "src/domain/DebtTrajectoryModel.js?v=20261028-1842",
  "src/domain/FisherModel.js?v=20261028-1842",
  "src/domain/MacroState.js?v=20261028-1842",
  "src/domain/PublicFinanceModel.js?v=20261028-1842",
  "src/domain/SensibilityMatrixModel.js?v=20261028-1842",
  "src/domain/UnionBudgetModel.js?v=20261028-1842",
  "src/domain/UnionSpendingModel.js?v=20261028-1842",
  "src/domain/referencia/DespesasUniaoReferencia.js?v=20261028-1842",
  "src/domain/referencia/OrcamentoUniaoReferencia.js?v=20261028-1842",
  "src/infrastructure/ChartAdapter.js?v=20261028-1842",
  "src/infrastructure/CsvExporter.js?v=20261028-1842",
  "src/infrastructure/GovApiGateway.js?v=20261028-1842",
  "src/infrastructure/LocalSnapshotStore.js?v=20261028-1842",
  "src/ui/CenarioUrl.js?v=20261028-1842",
  "src/ui/ObservatoryView.js?v=20261028-1842",
  "src/ui/SvgIcons.js?v=20261028-1842",
  "vendor/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "vendor/fonts/ibm-plex-mono-latin-500-normal.woff2",
  "vendor/fonts/ibm-plex-mono-latin-600-normal.woff2",
  "vendor/fonts/inter-latin-400-normal.woff2",
  "vendor/fonts/inter-latin-500-normal.woff2",
  "vendor/fonts/inter-latin-600-normal.woff2",
  "vendor/fonts/inter-latin-700-normal.woff2",
  "vendor/fonts/space-grotesk-latin-ext.woff2",
  "vendor/fonts/space-grotesk-latin.woff2",
  "vendor/stk-gov/stk-gov-shell.js?v=20261028-1842",
  "vendor/stk-gov/stk-gov-pwa.js?v=20261028-1842",
  "icons/app-icon-512.png"
];
// </versionar>

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro (HTML sempre atual); sem rede, abre o index.html do shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('index.html', { cacheName: CACHE_VERSION }))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
