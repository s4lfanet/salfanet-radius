const{PrismaClient}=require("@prisma/client");
const bcrypt=require("bcryptjs");
const p=new PrismaClient();
(async()=>{
  const u=await p.adminUser.findFirst({where:{username:"superadmin"},select:{password:true}});
  if(!u){console.log("User not found");return;}
  const candidates=["superadmin","admin","password","admin123","salfanet","123456","salfa","radius","salfanet123","superadmin123","Salfanet1","S@lfanet","admin1234","password123"];
  for(const c of candidates){
    const ok=await bcrypt.compare(c,u.password);
    if(ok){console.log("MATCH FOUND:",c);await p["$disconnect"]();return;}
  }
  console.log("No match found from common passwords");
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
