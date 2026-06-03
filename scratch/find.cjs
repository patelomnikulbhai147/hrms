const { PrismaClient } = require('./backend/node_modules/@prisma/client');
const p = new PrismaClient();
p.branch.findMany().then(b => { 
  console.log(b.map(x => x.id + ' : ' + x.branchName)); 
}).finally(() => {
  p.$disconnect();
});
