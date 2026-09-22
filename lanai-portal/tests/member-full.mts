import { chromium } from "playwright";
const BASE="http://localhost:3001";
const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
const routes=["/client/dashboard","/client/trips","/client/documents","/client/messages","/client/billing","/client/profile","/client/celebrations"];
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  const allErrors:Record<string,string[]>={};
  await p.goto(`${BASE}/client`,{waitUntil:"networkidle"});await sleep(400);
  await p.fill('input[type=email]','eleanor.hart@lanai.demo');
  await p.fill('input[type=password]','123456');
  await p.getByRole("button",{name:/sign in|login/i}).first().click();await sleep(2000);
  for(const r of routes){
    const errs:string[]=[];p.on("pageerror",e=>errs.push("PE:"+e.message));
    p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
    const resp=await p.goto(`${BASE}${r}`,{waitUntil:"networkidle"});await sleep(700);
    const txt=await p.locator("body").innerText();
    const ok=!/(sign in|login to|unauthorized|not found|error)/i.test(txt)||/welcome|eleanor|trip|invoice|document|message|profile|celebrat/i.test(txt);
    console.log(`${r} status=${resp?.status()} len=${txt.length} ok=${ok} errs=${errs.length}`);
    if(errs.length)allErrors[r]=errs.slice(0,3);
  }
  console.log("ERRORS:",JSON.stringify(allErrors));
  await b.close();
})();
