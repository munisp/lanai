import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs:string[]=[];
  p.on("pageerror",e=>errs.push("PE:"+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto(`${BASE}/client`,{waitUntil:"networkidle"});await sleep(400);
  await p.fill('input[type=email]','eleanor.hart@lanai.demo');
  await p.fill('input[type=password]','123456');
  await p.getByRole("button",{name:/sign in|login/i}).first().click();await sleep(2000);
  for(const tab of ["My Trips","Documents","Messages","Billing"]){
    await p.getByRole("button",{name:new RegExp(tab,"i")}).first().click().catch(()=>{});
    await sleep(1500);
    const txt=await p.locator("body").innerText();
    console.log(`TAB ${tab}: len=${txt.length} hasContent=${!/no (trips|data|documents)/i.test(txt)}`);
  }
  console.log("ERRORS:",errs.slice(0,5));
  await b.close();
})();
