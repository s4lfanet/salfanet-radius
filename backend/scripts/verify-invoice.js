const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const reg=await p.registrationRequest.findUnique({where:{id:"94dae3bc-66b4-45d4-a82c-71a41e85cf77"},include:{profile:true,invoice:true,pppoeUser:true}});
  if(!reg){console.log("Not found");return;}
  console.log("Profile name:",reg.profile.name);
  console.log("Profile price:",reg.profile.price);
  console.log("Profile ppnActive:",reg.profile.ppnActive);
  console.log("Profile ppnRate:",reg.profile.ppnRate);
  console.log("Invoice amount:",reg.invoice && reg.invoice.amount);
  console.log("Invoice baseAmount:",reg.invoice && reg.invoice.baseAmount);
  console.log("Invoice taxRate:",reg.invoice && reg.invoice.taxRate);
  console.log("Invoice type:",reg.invoice && reg.invoice.invoiceType);
  console.log("pppoeUser status:",reg.pppoeUser && reg.pppoeUser.status);
  console.log("Registration status:",reg.status);
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
