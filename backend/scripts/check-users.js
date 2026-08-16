const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const users=await p.user.findMany({select:{id:true,username:true,role:true,isActive:true}});
  console.log("Users:",JSON.stringify(users,null,2));
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
