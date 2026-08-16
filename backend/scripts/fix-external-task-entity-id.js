const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  await p["$executeRaw"]`ALTER TABLE external_task MODIFY COLUMN entity_id VARCHAR(191) NOT NULL`;
  console.log("entity_id altered to VARCHAR(191)");
  const result=await p["$queryRaw"]`SHOW COLUMNS FROM external_task LIKE 'entity_id'`;
  console.log(JSON.stringify(result,null,2));
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
