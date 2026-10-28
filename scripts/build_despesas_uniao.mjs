/**
 * Gera src/domain/referencia/DespesasUniaoReferencia.js com a despesa liquidada da União
 * em 12 meses (Tesouro Nacional, SICONFI, RREO Anexo 02). É o valor usado até a
 * sincronização trazer o dado ao vivo.
 *
 * Uso: node scripts/build_despesas_uniao.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GovApiGateway } from '../src/infrastructure/GovApiGateway.js';

const destino = fileURLToPath(new URL('../src/domain/referencia/DespesasUniaoReferencia.js', import.meta.url));

const gateway = new GovApiGateway({ onLog: l => console.log(`[${l.type}] ${l.message}`) });
const r = await gateway.fetchDespesasUniao();
if (!r) {
  console.error('SICONFI indisponível: arquivo de referência não foi alterado.');
  process.exit(1);
}

const consultadoEm = new Date().toISOString().slice(0, 10);
const valores = Object.fromEntries(Object.entries(r.value).map(([k, v]) => [k, Number(v.toFixed(2))]));

writeFileSync(destino, `/**
 * Despesa liquidada da União (exceto intra-orçamentária, sem refinanciamento da dívida), em R$,
 * acumulada em 12 meses. Fonte: Tesouro Nacional, SICONFI, RREO Anexo 02, id_ente=1.
 * ARQUIVO GERADO por scripts/build_despesas_uniao.mjs em ${consultadoEm} - não editar à mão.
 */
export const DESPESAS_UNIAO_REFERENCIA = Object.freeze({
  periodo: ${JSON.stringify(r.date)},
  ano: ${r.ano},
  bimestre: ${r.bimestre},
  consultadoEm: ${JSON.stringify(consultadoEm)},
  valores: Object.freeze(${JSON.stringify(valores, null, 2).replace(/\n/g, '\n  ')})
});
`);
console.log(`Gravado ${destino} (${r.date}, total R$ ${(r.value.total / 1e12).toFixed(2)} Tri)`);
