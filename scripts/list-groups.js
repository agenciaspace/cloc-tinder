#!/usr/bin/env node
/* Lista os grupos do WhatsApp da instância uazapi (nome + JID).
   Use para descobrir o UAZAPI_GROUP_JID do grupo "cloc bate-papo".
   Rode com: npm run wa:groups
*/
const config = require('../config/whatsapp');
const whatsapp = require('../services/whatsapp');

(async () => {
  if (!config.baseUrl || !config.token) {
    console.error('Faltam UAZAPI_BASE_URL e/ou UAZAPI_TOKEN. Configure no .env (veja .env.example).');
    process.exit(1);
  }
  try {
    const groups = await whatsapp.listGroups();
    if (!groups.length) {
      console.log('Nenhum grupo retornado pela instância.');
      return;
    }
    console.log(`\n${groups.length} grupo(s):\n`);
    for (const g of groups) {
      const name = g.Name || g.name || g.subject || '(sem nome)';
      const jid = g.JID || g.jid || g.id || '';
      console.log(`  ${name}`);
      console.log(`    ${jid}\n`);
    }
    console.log('Copie o JID do grupo desejado para UAZAPI_GROUP_JID no .env.\n');
  } catch (err) {
    console.error('Erro ao listar grupos:', err.message);
    process.exit(1);
  }
})();
