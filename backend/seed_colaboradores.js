/**
 * seed_colaboradores.js
 * Script autÃ´nomo para inserir/atualizar os 8 colaboradores no banco SQLite.
 * Execute com: node backend/seed_colaboradores.js
 */
'use strict';
const path = require('node:path');
const db = require('./db');
const { seedAll } = require('./seed');

async function main() {
  console.log('ðŸ”„ Iniciando seed dos colaboradores...');
  try {
    await db.init();
    await seedAll(db);
    console.log('âœ… Seed concluÃ­do com sucesso!');
    console.log('ðŸ“‹ Os 8 colaboradores foram inseridos/atualizados no banco.');
    console.log('ðŸ”‘ Login de cada colaborador: CPF (somente nÃºmeros) como usuÃ¡rio e senha.');
    console.log('ðŸ‘‘ Super Admins: dandarafalcao773@gmail.com e sacalao660@gmail.com | Senha: AdminAdmin');
    process.exit(0);
  } catch (err) {
    console.error('âŒ Erro no seed:', err.message);
    process.exit(1);
  }
}

main();
