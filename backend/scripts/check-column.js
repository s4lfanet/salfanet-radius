const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const result=await p["$queryRaw"]`SHOW COLUMNS FROM external_task LIKE 'id'`;
  console.log(JSON.stringify(result,null,2));
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
