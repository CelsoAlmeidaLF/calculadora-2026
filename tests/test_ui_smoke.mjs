/**
 * Teste de fumaça da tela, num Chrome de verdade (headless), sem dependências npm.
 * Sobe um servidor local, abre a página e confere: sem erros de JavaScript, números na tela,
 * menu recolhe/expande (desktop), gaveta (tablet), barra inferior (celular), link de cenário,
 * tabelas em cartões no celular, sem rolagem lateral e service worker ativo.
 *
 * Uso: node --experimental-websocket tests/test_ui_smoke.mjs   (Node 22+ dispensa a flag)
 * Sem Chrome instalado, o teste é pulado (sai com código 0 e avisa).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const chromeBin = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  .find(b => spawnSync('which', [b]).status === 0);
if (!chromeBin || typeof WebSocket === 'undefined') {
  console.log(`[PULADO] ${!chromeBin ? 'Chrome não encontrado' : 'WebSocket indisponível (use --experimental-websocket no Node 20)'}`);
  process.exit(0);
}

let passou = 0;
let falhou = 0;
const assert = (cond, msg) => {
  if (cond) { passou++; console.log(`  [PASS] ${msg}`); } else { falhou++; console.error(`  [FAIL] ${msg}`); }
};

// Servidor estático mínimo (o service worker e os módulos ES exigem http)
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const servidor = createServer(async (req, res) => {
  const caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const corpo = await readFile(join(raiz, caminho === '/' ? 'index.html' : caminho));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream' });
    res.end(corpo);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}/index.html`;

const perfil = await mkdtemp(join(tmpdir(), 'calc-ui-'));
const porta = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromeBin, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
const esperar = ms => new Promise(r => setTimeout(r, ms));

let ws;
for (let i = 0; i < 30 && !ws; i++) {
  try {
    const abas = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
    ws = new WebSocket(abas.find(t => t.type === 'page').webSocketDebuggerUrl);
  } catch { await esperar(200); }
}
await new Promise(r => ws.addEventListener('open', r));
let seq = 0;
const pendentes = {};
const erros = [];
ws.addEventListener('message', m => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') erros.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (pendentes[d.id]) { pendentes[d.id](d); delete pendentes[d.id]; }
});
const cdp = (method, params = {}) => new Promise(r => { pendentes[++seq] = r; ws.send(JSON.stringify({ id: seq, method, params })); });
const avaliar = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result.exceptionDetails ? `ERRO ${r.result.exceptionDetails.exception?.description}` : r.result.result.value;
};
const tela = (largura, celular = false) => cdp('Emulation.setDeviceMetricsOverride', { width: largura, height: 900, deviceScaleFactor: 1, mobile: celular });
const abrir = async (url = base) => { await cdp('Page.navigate', { url }); await esperar(2500); };
const estado = async () => JSON.parse(await avaliar(`JSON.stringify({
  largura: appSidebar.offsetWidth,
  recolhida: appSidebar.classList.contains('sidebar-collapsed'),
  aberta: appSidebar.classList.contains('sidebar-open'),
  aba: document.querySelector('.tab-pane.active')?.id,
  barraInferior: getComputedStyle(appBottomNav).display,
  rolagemLateral: document.documentElement.scrollWidth > innerWidth,
  falha: !appFatalError.hidden
})`));

try {
  await cdp('Runtime.enable');

  console.log('\n1. Desktop (1400 px)');
  await tela(1400);
  await abrir();
  await avaliar('localStorage.clear()');
  await abrir();
  let e = await estado();
  assert(!e.falha && e.aba === 'tabAPIs', 'Página abre na aba Painel da economia, sem aviso de falha');
  const numeros = JSON.parse(await avaliar('JSON.stringify([feedValSelic.textContent, feedValReceita.textContent, macroTaxPerCapita.textContent, macroJurosTotal.textContent])'));
  assert(numeros.every(t => /\d/.test(t)), `Cards mostram números (${numeros.join(' · ')})`);
  assert(await avaliar('document.querySelectorAll("#tblPerfilFiscal tr").length') > 10, 'Tabela de impostos e gastos preenchida');
  assert(e.largura === 248 && e.barraInferior === 'none' && !e.rolagemLateral, 'Barra lateral expandida (248 px), sem barra inferior nem rolagem lateral');
  await avaliar('btnToggleSidebar.click()'); await esperar(500);
  e = await estado();
  assert(e.recolhida && e.largura === 64, 'Botão de menu recolhe a barra (64 px)');
  await abrir();
  e = await estado();
  assert(e.recolhida, 'Barra recolhida continua recolhida depois de recarregar');
  await avaliar('btnToggleSidebar.click()'); await esperar(500);
  assert((await estado()).largura === 248, 'Botão de menu expande a barra de novo');
  await avaliar('btnTabFiscal.click()'); await esperar(300);
  assert((await estado()).aba === 'tabFiscal', 'Item da barra lateral troca para o simulador');
  await avaliar('document.querySelector(".action-menu [aria-haspopup]").click()'); await esperar(200);
  assert(await avaliar('document.querySelector(".action-menu").classList.contains("open")'), 'Botão Compartilhar abre o menu');

  console.log('\n2. Tablet (900 px): gaveta');
  await tela(900);
  await abrir();
  e = await estado();
  assert(!e.aberta && await avaliar('appSidebar.inert'), 'Gaveta começa fechada e fora do Tab');
  await avaliar('btnToggleSidebar.click()'); await esperar(400);
  assert((await estado()).aberta, 'Botão de menu abre a gaveta');
  await avaliar('btnTabFiscal.click()'); await esperar(400);
  e = await estado();
  assert(!e.aberta && e.aba === 'tabFiscal', 'Escolher uma aba fecha a gaveta');

  console.log('\n3. Celular (400 px): barra inferior');
  await tela(400, true);
  await abrir();
  e = await estado();
  assert(e.barraInferior === 'grid' && !e.rolagemLateral, 'Barra inferior aparece e não há rolagem lateral');
  await avaliar('document.querySelector(".bottom-nav-item[data-tab=tabFiscal]").click()'); await esperar(300);
  assert((await estado()).aba === 'tabFiscal', 'Barra inferior troca de aba');
  assert(await avaliar('getComputedStyle(document.querySelector("#tblSensibilidadeSelic tr")).display') === 'grid', 'Matriz da Selic vira cartões no celular');

  console.log('\n4. Link de cenário');
  await tela(1400);
  await abrir(`${base}#selic=11&base=eleitores&aba=tabFiscal`);
  await esperar(6000); // a busca automática termina e o cenário é reaplicado
  const cen = JSON.parse(await avaliar('JSON.stringify({aba: document.querySelector(".tab-pane.active").id, selic: fInputSelic.value, base: document.querySelector("[data-base].highlight").dataset.base})'));
  assert(cen.aba === 'tabFiscal' && cen.selic === '11' && cen.base === 'eleitores', 'Link abre o simulador com Selic 11% e base por eleitor');

  console.log('\n5. PWA');
  assert(await avaliar('navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))'), 'Service worker registrado');

  assert(erros.length === 0, `Nenhum erro de JavaScript${erros.length ? `: ${erros.join(' | ')}` : ''}`);
} finally {
  ws.close();
  chrome.kill();
  servidor.close();
  await rm(perfil, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n========================================\nTotal: ${passou + falhou} | Passou: ${passou} | Falhou: ${falhou}\n========================================\n`);
process.exit(falhou ? 1 : 0);
