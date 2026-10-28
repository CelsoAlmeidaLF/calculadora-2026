/**
 * Gera as referências offline do Tesouro Nacional (SICONFI), usadas até a sincronização trazer o dado ao vivo:
 *   src/domain/referencia/DespesasUniaoReferencia.js  ← RREO Anexo 02 (despesa liquidada por função)
 *   src/domain/referencia/OrcamentoUniaoReferencia.js ← RREO Anexo 01 (receita federal e despesa por grupo)
 * Ambos acumulados em 12 meses a partir do último bimestre publicado.
 *
 * Uso: node scripts/build_referencia_uniao.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GovApiGateway } from '../src/infrastructure/GovApiGateway.js';

const gateway = new GovApiGateway({ onLog: l => console.log(`[${l.type}] ${l.message}`) });
const consultadoEm = new Date().toISOString().slice(0, 10);

const ARQUIVOS = [
  {
    buscar: () => gateway.fetchDespesasUniao(),
    arquivo: 'DespesasUniaoReferencia.js',
    constante: 'DESPESAS_UNIAO_REFERENCIA',
    descricao: 'Despesa liquidada da União (exceto intra-orçamentária, sem refinanciamento da dívida), em R$,\n * acumulada em 12 meses. Fonte: Tesouro Nacional, SICONFI, RREO Anexo 02, id_ente=1.'
  },
  {
    buscar: () => gateway.fetchOrcamentoUniao(),
    arquivo: 'OrcamentoUniaoReferencia.js',
    constante: 'ORCAMENTO_UNIAO_REFERENCIA',
    descricao: 'Receita realizada (impostos e contribuições) e despesa liquidada por grupo da União, em R$,\n * acumuladas em 12 meses. Fonte: Tesouro Nacional, SICONFI, RREO Anexo 01, id_ente=1.'
  }
];

let falhas = 0;
for (const { buscar, arquivo, constante, descricao } of ARQUIVOS) {
  const r = await buscar();
  if (!r) {
    console.error(`SICONFI indisponível: ${arquivo} não foi alterado.`);
    falhas++;
    continue;
  }
  const valores = Object.fromEntries(Object.entries(r.value).map(([k, v]) => [k, Number(v.toFixed(2))]));
  const destino = fileURLToPath(new URL(`../src/domain/referencia/${arquivo}`, import.meta.url));
  writeFileSync(destino, `/**
 * ${descricao}
 * ARQUIVO GERADO por scripts/build_referencia_uniao.mjs em ${consultadoEm} - não editar à mão.
 */
export const ${constante} = Object.freeze({
  periodo: ${JSON.stringify(r.date)},
  ano: ${r.ano},
  bimestre: ${r.bimestre},
  consultadoEm: ${JSON.stringify(consultadoEm)},
  valores: Object.freeze(${JSON.stringify(valores, null, 2).replace(/\n/g, '\n  ')})
});
`);
  console.log(`Gravado ${destino} (${r.date})`);
}
process.exit(falhas ? 1 : 0);
