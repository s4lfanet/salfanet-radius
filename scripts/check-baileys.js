const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.whatsapp_providers.findMany().then(r => {
  r.forEach(prov => {
    console.log(JSON.stringify({ id: prov.id, name: prov.name, type: prov.type, isActive: prov.isActive, apiUrl: prov.apiUrl, senderNumber: prov.senderNumber }));
  });
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
