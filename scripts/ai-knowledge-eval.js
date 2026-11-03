// uso: sudo node scripts/ai-knowledge-eval.js [kb|rag]  (precisa de root por causa do .env) — mede se a busca devolve o que deveria nos 5 primeiros resultados
const ROOT = require('path').resolve(__dirname, '..');
process.chdir(ROOT + '/backend');
require(ROOT + '/backend/node_modules/ts-node').register({ transpileOnly: true, project: ROOT + '/backend/tsconfig.json' });
require(ROOT + '/backend/node_modules/dotenv').config({ path: ROOT + '/backend/.env', quiet: true });
const mode = process.argv[2] || 'rag';
const CASES = [
  ['por que o unbound fica sem DNS quando recarrega', /auth_zone_reload|SIGHUP|4 s/i],
  ['em que porta roda a API do cafetech', /47160/],
  ['quais timers do systemd existem do sgcg', /sgcg-[a-z-]+\.timer/i],
  ['onde fica a configuração do squid', /squid\.conf/i],
  ['quanta memória tem o servidor e qual o tamanho do swap', /15 ?GB[\s\S]*8 ?GB|8 ?GB[\s\S]*15 ?GB|swap\.img/i],
  ['quais processos rodam no pm2', /bcc-backend[\s\S]*backend-proxy|backend-proxy[\s\S]*bcc-backend/i],
  ['para que serve a tabela ai_models', /ai_models/i],
  ['como o sentinela avisa quando um serviço cai', /telegram[\s\S]*sentinela|sentinela[\s\S]*telegram/i],
  ['qual projeto usa a porta 47140', /orcamentosintea|or[cç]amento/i],
  ['em que pasta fica o projeto anabolos', /projetosjmb\/anabolos/],
  ['quais regras do ufw estão ativas', /ufw/i],
  ['quais bancos de dados existem no postgres', /controlebeckercorp_v8|cnpj_mei|eloeterno/],
];
(async () => {
  let search;
  if (mode === 'kb') search = (await require(ROOT + '/backend/src/modules/ai/ai-knowledge.ts')).searchKnowledge;
  else { const { ragService } = require(ROOT + '/backend/src/modules/control/rag-service.ts'); search = (q, n) => ragService.search(q, n); }
  let ok = 0;
  for (const [q, re] of CASES) {
    const rows = await search(q, 5);
    const hit = rows.findIndex((r) => re.test(`${r.fonte} ${r.titulo} ${r.trecho}`));
    if (hit >= 0) ok++;
    console.log(hit >= 0 ? `OK  (#${hit + 1})` : 'FALHA', '|', q, '|', rows.slice(0, 2).map((r) => r.fonte).join(' ; ') || 'nada');
  }
  console.log(`\nACERTOS: ${ok}/${CASES.length}`); process.exit(0);
})();
