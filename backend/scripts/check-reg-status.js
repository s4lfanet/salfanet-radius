const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  // Get registration
  const reg=await p.registrationRequest.findUnique({where:{id:"94dae3bc-66b4-45d4-a82c-71a41e85cf77"},include:{pppoeUser:true,invoice:true}});
  if(!reg){console.log("Registration not found");return;}
  console.log("Current status:",reg.status);
  console.log("pppoeUserId:",reg.pppoeUserId);
  console.log("invoiceId:",reg.invoiceId);
  if(reg.invoice){
    console.log("Invoice amount:",reg.invoice.amount);
    console.log("Invoice number:",reg.invoice.invoiceNumber);
  }
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
