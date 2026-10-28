# Observatório Fiscal & Macroeconômico do Brasil

MVP de alta precisão técnica e visual do **Observatório Macroeconômico e Calculadora de Impacto Fiscal da Selic sobre a Dívida Pública**, integrado com modelos matemáticos de dinâmica de dívida (FMI/Tesouro) e mobilização econômica não violenta (Gene Sharp & Erica Chenoweth - Harvard).

Desenvolvido para operar em arquitetura **Local-First / Zero-Knowledge**, com autonomia total offline, conformidade rigorosa com o **Design System Canônico Systekna** (`financ-ui.css`), tipografia **Space Grotesk** e **IBM Plex Mono**, estética **Glassmorphism 2.0 / Aero 3.0** e **isenção absoluta de emojis em ícones** (100% vetorizado em SVG).

---

## 🏛️ Repositórios e Webservices Governamentais Conectados

1. **Banco Central do Brasil (SGS - Sistema Gerenciador de Séries Temporais):**
   - **Série 432:** Taxa de juros - Selic fixada pelo Copom (% a.a.)
   - **Série 13522:** IPCA acumulado em 12 meses (%). A série 433 é a variação mensal e não serve para isso.
   - **Série 13762:** Dívida Bruta do Governo Geral (% do PIB)
   - **Série 13761:** Dívida Bruta do Governo Geral (R$ milhões)
   - **Série 4382:** PIB acumulado em 12 meses, valores correntes (R$ milhões)
2. **Instituto Brasileiro de Geografia e Estatística (IBGE):**
   - População residente estimada (SIDRA, tabela 6579, variável 9324)
3. **Tribunal Superior Eleitoral (TSE):**
   - Eleitorado apto das Eleições 2026 (1º turno, inclui exterior): 158.745.502. Valor de referência tirado dos dados do `8.1. ELEICOES` (o TSE não tem API ao vivo para isso)
4. **Secretaria do Tesouro Nacional (STN):**
   - Carga Tributária Bruta (% do PIB)
   - Sensibilidade da despesa financeira da dívida mobiliária federal (~R$ 50 Bi / ponto percentual de Selic)
   - Gastos reais da União: despesa liquidada por função e subfunção (SICONFI, RREO Anexo 02, `id_ente=1`), acumulada em 12 meses (ano anterior fechado − ano anterior até o bimestre + ano corrente até o bimestre). Exclui intra-orçamentárias e refinanciamento da dívida. A referência offline é gerada por `node scripts/build_despesas_uniao.mjs` em `src/domain/referencia/DespesasUniaoReferencia.js` (não editar à mão)

---

## 📐 Modelos Matemáticos e Econômicos Implementados

### 1. Equação de Fisher (Juro Real Implícito)
$$\left(1 + i_{\text{real}}\right) = \frac{1 + i_{\text{nominal}}}{1 + \pi} \implies i_{\text{real}} = \frac{1 + i_{\text{nominal}}}{1 + \pi} - 1$$

### 2. Sustentabilidade da Dívida Pública (FMI / Tesouro Nacional)
$$\Delta d_t = d_{t-1} \cdot \left(\frac{r - g}{1 + g}\right) - s_t$$
Onde:
- $d_{t-1}$: Dívida Bruta como proporção do PIB
- $r$: Taxa real implícita de juros
- $g$: Crescimento real do PIB
- $s_t$: Superávit ou déficit primário como proporção do PIB

### 3. Matriz de Sensibilidade da Selic
Projeta cenários de $-3.0\text{ pp}$ a $+3.0\text{ pp}$ em torno da taxa Selic vigente, calculando o impacto financeiro global e a variação da despesa anual por habitante.

### 4. Valores por Habitante e por Eleitor
Imposto arrecadado, dívida bruta (estoque), juros estimados (Selic × custo por ponto) e os gastos reais da União em 12 meses (Previdência, serviço da dívida, transferências a estados e municípios, assistência, saúde, educação, trabalho, defesa, Judiciário/Legislativo e demais funções) divididos pela população (IBGE) ou pelo eleitorado (TSE). O seletor "Por habitante / Por eleitor" vale para o painel, o gráfico de barras, a matriz da Selic e o simulador. Os gastos vêm da execução orçamentária do Tesouro (`UnionSpendingModel`); a partilha paramétrica da arrecadação (`PARTILHA_GASTOS`) ficou só no simulador.

### 5. Módulo de Pressão Cívica Desacoplado
O modelo de **Pressão Econômica Não Violenta & Retenção Cívica** (Gene Sharp & Erica Chenoweth - Harvard) foi segregado em um projeto autônomo e independente:
👉 **[PRESSAO-CIVICA](../8.3.%20PRESSAO-CIVICA/README.md)**: Aplicação cívica dedicada com cálculo $V = P \cdot G \cdot D$, decomposição tributária federativa (ICMS/PIS/COFINS/IPI/ISS), notas técnicas e suíte de 23 testes unitários.

---

## 🧱 Arquitetura Hexagonal (Ports & Adapters)

```
8. STK-GOVERNO-BRAZIL/8.2. CALCULADORA/
├── index.html                   # Entrypoint Web semântico e acessível
├── css/
│   ├── fonts.css                # Fontes canônicas locais (Space Grotesk, IBM Plex Mono)
│   ├── style.css                # Design System (idêntico ao do 8.3. PRESSAO-CIVICA)
│   └── analista.css             # Seletor de base, gráfico de barras e tabela por pessoa
├── src/
│   ├── Program.js               # Composition Root & Injeção de Dependências
│   ├── program.js               # Symlink canônico de entrypoint
│   ├── domain/                  # Lógica pura de negócio e modelos matemáticos
│   │   ├── MacroState.js        # Entidade de estado macroeconômico imutável
│   │   ├── FisherModel.js       # Equação de Fisher
│   │   ├── DebtTrajectoryModel.js # Dinâmica e partilha da dívida pública
│   │   ├── SensibilityMatrixModel.js # Matriz de sensibilidade do Tesouro
│   │   ├── PublicFinanceModel.js # Impostos, dívida e gastos por habitante e por eleitor
│   │   ├── UnionSpendingModel.js # Gastos reais da União (RREO Anexo 02, 12 meses)
│   │   └── referencia/DespesasUniaoReferencia.js # Referência offline gerada pelo script
│   ├── application/             # Casos de uso e orquestração
│   │   └── MacroObservatoryService.js
│   ├── infrastructure/          # Adapters externos
│   │   ├── GovApiGateway.js     # Conector REST com timeout e fallback seguro
│   │   ├── CsvExporter.js       # Exportador CSV RFC 4180 UTF-8 BOM
│   │   └── ChartAdapter.js      # Adaptador encapsulado para Chart.js 4.4.1
│   └── ui/                      # Camada de apresentação e interface
│       ├── SvgIcons.js          # Ícones vetorizados Lucide / FinancIcons
│       └── ObservatoryView.js   # Controle reativo do DOM, abas e toasts
├── scripts/
│   └── build_despesas_uniao.mjs # Regera a referência dos gastos da União a partir do SICONFI
├── vendor/
│   ├── chart.js/chart.umd.js    # Chart.js 4.4.1 vendored localmente
│   └── fonts/                   # Arquivos .woff2 de Space Grotesk e IBM Plex Mono
└── tests/
    └── test_domain_models.js    # 49 testes unitários automatizados
```

---

## 🚀 Execução e Testes

### Execução dos Testes Unitários
```bash
node tests/test_domain_models.js
```

### Visualização no Navegador
Abra o arquivo `index.html` em qualquer navegador moderno ou sirva via servidor local HTTP:
```bash
python3 -m http.server 8080
```
Acesse `http://localhost:8080`.
