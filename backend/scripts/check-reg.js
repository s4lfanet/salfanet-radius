const{PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const r=await p.registrationRequest.findUnique({where:{id:"94dae3bc-66b4-45d4-a82c-71a41e85cf77"},include:{profile:true,area:true}});
  if(!r){console.log("Not found");return;}
  console.log("Status:",r.status);
  console.log("Name:",r.name);
  console.log("Phone:",r.phone);
  console.log("Profile:",r.profile && r.profile.name);
  console.log("idCardNumber:",r.idCardNumber);
  console.log("idCardPhoto:",r.idCardPhoto ? "(has photo)" : "(no photo)");
  console.log("areaId:",r.areaId);
  const username=r.name.split(" ")[0].toLowerCase().replace(/[^a-z]/g,"")+"-"+r.phone;
  const existing=await p.pppoeUser.findUnique({where:{username}});
  console.log("Generated username:",username);
  console.log("Username exists:",!!existing);
  if(existing) console.log("Existing user status:",existing.status);
  await p["$disconnect"]();
})().catch(e=>console.error(e.message));
