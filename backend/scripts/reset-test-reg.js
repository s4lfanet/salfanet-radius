const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const regId="94dae3bc-66b4-45d4-a82c-71a41e85cf77";
  const reg=await p.registrationRequest.findUnique({where:{id:regId},include:{pppoeUser:true,invoice:true}});
  if(!reg){console.log("Registration not found");return;}
  console.log("Status:",reg.status);
  console.log("pppoeUserId:",reg.pppoeUserId);
  console.log("invoiceId:",reg.invoiceId);
  // Delete radcheck/radusergroup for the username
  if(reg.pppoeUser){
    const u=reg.pppoeUser.username;
    await p.radcheck.deleteMany({where:{username:u}});
    await p.radusergroup.deleteMany({where:{username:u}});
    console.log("Deleted radcheck/radusergroup for",u);
  }
  // Delete invoice
  if(reg.invoiceId){
    await p.invoice.delete({where:{id:reg.invoiceId}}).catch(()=>{});
    console.log("Deleted invoice");
  }
  // Delete pppoe user
  if(reg.pppoeUserId){
    await p.pppoeUser.delete({where:{id:reg.pppoeUserId}}).catch(()=>{});
    console.log("Deleted pppoe user");
  }
  // Reset registration to PENDING
  await p.registrationRequest.update({where:{id:regId},data:{status:"PENDING",pppoeUserId:null,invoiceId:null,installationFee:0}});
  console.log("Reset registration to PENDING");
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
