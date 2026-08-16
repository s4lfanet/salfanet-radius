const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  // Delete orphan pppoe user (no registration linked, no radcheck, no radusergroup)
  const u=await p.pppoeUser.findUnique({where:{username:"tian2-6282214535152"},select:{id:true}});
  if(!u){console.log("Not found");return;}
  // Check if has invoice or registration linked
  const reg=await p.registrationRequest.findFirst({where:{pppoeUserId:u.id}});
  if(reg){console.log("Has registration — abort");return;}
  const inv=await p.invoice.findFirst({where:{userId:u.id}});
  if(inv){console.log("Has invoice — abort");return;}
  await p.pppoeUser.delete({where:{id:u.id}});
  console.log("Deleted orphan user:",u.id);
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
