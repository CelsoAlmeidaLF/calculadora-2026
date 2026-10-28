# Observatório Macroeconômico do Brasil (8.2. CALCULADORA)

Selic, inflação, impostos, juros, dívida e gastos públicos do Brasil, por habitante (IBGE) ou por eleitor (TSE 2026), com simulador da trajetória da dívida. Roda no navegador, sem servidor próprio e sem telemetria; instala como app (PWA) e abre sem internet.

Desenvolvido por Celso de Almeida Leite (Systekna), outubro de 2026.

## Fontes dos dados

| Dado | Fonte | Como chega |
|---|---|---|
| Selic meta, IPCA 12 meses, dívida bruta (% do PIB e R$), PIB 12 meses | Banco Central, SGS: séries 432, 13522, 13762, 13761, 4382 | Ao vivo ao abrir a página (com histórico de 12 meses) |
| População residente | IBGE, SIDRA tabela 6579 | Ao vivo |
| Eleitorado apto 2026 (158.745.502, 1º turno, com exterior) | TSE, somado dos dados de `8.1. ELEICOES` | Valor fixo (o TSE não tem API) |
| Gastos da União por função, 12 meses | Tesouro Nacional, SICONFI, RREO Anexo 02 (despesa liquidada) | Referência gerada por script |
| Receita federal (impostos e contribuições) e juros pagos, 12 meses | Tesouro Nacional, SICONFI, RREO Anexo 01 | Referência gerada por script |
| Carga tributária do país (34,2% do PIB), custo de ~R$ 50 Bi por ponto de Selic | Tesouro Nacional | Parâmetros do simulador |

A API do Tesouro não manda cabeçalho CORS, então o navegador não consegue consultá-la. Os dados do SICONFI vêm de `src/domain/referencia/*.js`, gerados com `npm run referencia` (o Node não tem CORS).

A última consulta bem-sucedida fica salva no navegador (`localStorage`); ao reabrir, a página mostra esses números enquanto busca os novos.

## O que a página compara

- **Impostos e gastos são só da União**, dos dois lados: impostos e contribuições federais × despesa liquidada da União. Estados e municípios ficam de fora; a parte dos impostos federais repassada a eles aparece em "Transferências a estados e municípios".
- **Juros** são os pagos pela União em 12 meses (R$ 509,5 Bi no período set/2025–ago/2026). O custo de ~R$ 50 Bi por ponto de Selic só entra na matriz "E se a Selic mudar?" e no simulador, somado aos juros pagos.
- **Dívida bruta** é a do governo geral (União, estados e municípios), o indicador oficial do Banco Central.
- **Simulador**: trajetória da dívida por Δd = d · (r − g)/(1 + g) − s, com juro real pela equação de Fisher. A rosca usa a composição real do gasto da União (Anexo 01), com os juros e o gasto primário ajustados pelo cenário. O imposto do simulador é a carga do país todo (34,2% do PIB), coerente com a dívida do governo geral.
- **Link do cenário**: "Compartilhar → Copiar link deste cenário" gera `index.html#selic=11&base=eleitores&aba=tabFiscal`; quem abre vê os mesmos valores.

## Identidade visual

Usa o design system comum dos projetos 8.X, extraído do `8.1. ELEICOES`: `vendor/stk-gov/` é cópia de `../_design-system/` (não edite a cópia; ver `../_design-system/README.md`). O CSS do conteúdo da calculadora fica em `css/style.css` e `css/analista.css`.

## Estrutura

```
index.html                 Página (topo, barra lateral, abas, barra inferior do celular)
sw.js                      Service worker (lista e versão geradas por scripts/versionar.mjs)
manifest.webmanifest       PWA
icons/                     Ícone oficial (original em JPEG e tamanhos gerados)
css/                       fonts.css, style.css (conteúdo), analista.css (painel, tabelas, minigráficos)
vendor/stk-gov/            Design system comum (cópia)
vendor/chart.js/           Chart.js 4.4.1
vendor/fonts/              Inter e IBM Plex Mono
src/
  Program.js               Composição: injeta dependências, liga shell, PWA e cenário do link
  domain/                  MacroState, FisherModel, DebtTrajectoryModel, SensibilityMatrixModel,
                           PublicFinanceModel, UnionSpendingModel (Anexo 02), UnionBudgetModel (Anexo 01),
                           referencia/ (gerados por script)
  application/             MacroObservatoryService (casos de uso, relatório, CSV, salvar/restaurar)
  infrastructure/          GovApiGateway (BCB, IBGE, SICONFI), LocalSnapshotStore, ChartAdapter, CsvExporter
  ui/                      ObservatoryView, CenarioUrl, SvgIcons
scripts/
  build_referencia_uniao.mjs  Regera as referências do Tesouro (Anexos 01 e 02)
  versionar.mjs               Carimba a mesma versão (?v=) em todos os arquivos e no sw.js
tests/
  test_domain_models.js    Testes de domínio, gateway (fetch simulado) e cache
  test_ui_smoke.mjs        Teste da tela num Chrome headless
```

## Comandos

```bash
python3 -m http.server 8080        # abrir em http://localhost:8080 (módulos ES e service worker exigem http)
npm test                           # testes de domínio
npm run test:ui                    # teste da tela (precisa de Chrome; sem ele, é pulado)
npm run referencia                 # atualiza os dados do Tesouro (rede)
npm run versionar                  # depois de mudar qualquer arquivo da página
npm run design-system              # confere se vendor/stk-gov está igual a ../_design-system
```

Depois de mudar CSS ou JS, rode `npm run versionar`: sem isso o navegador pode misturar arquivos novos com antigos do cache, e a página quebra.
