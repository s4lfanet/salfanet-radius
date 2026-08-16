const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const u=await p.adminUser.findFirst({where:{username:"superadmin"},select:{id:true,username:true,password:true,role:true,isActive:true}});
  if(!u){console.log("User not found");return;}
  console.log("ID:",u.id);
  console.log("Username:",u.username);
  console.log("Role:",u.role);
  console.log("Active:",u.isActive);
  console.log("Password hash (first 30 chars):",u.password?u.password.substring(0,30)+"...":"(empty)");
  console.log("Password hash length:",u.password?u.password.length:0);
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
