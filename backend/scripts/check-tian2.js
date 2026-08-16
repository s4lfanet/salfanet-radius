const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const u=await p.pppoeUser.findUnique({where:{username:"tian2-6282214535152"},select:{id:true,username:true,status:true,createdAt:true}});
  if(u){
    console.log("Found:",JSON.stringify(u));
    // Also check radcheck
    const rc=await p.radcheck.findMany({where:{username:"tian2-6282214535152"}});
    console.log("radcheck:",rc.length,"records");
    const rg=await p.radusergroup.findMany({where:{username:"tian2-6282214535152"}});
    console.log("radusergroup:",rg.length,"records");
    // Check registration status
    const reg=await p.registrationRequest.findUnique({where:{id:"94dae3bc-66b4-45d4-a82c-71a41e85cf77"},select:{status:true,pppoeUserId:true,invoiceId:true}});
    console.log("Registration:",JSON.stringify(reg));
  } else {
    console.log("User tian2 not found");
  }
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
