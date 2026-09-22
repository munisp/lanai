import { chromium } from "playwright";
const BASE="http://localhost:3001";
const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
const pages=[
  ["/client/dashboard","Client Dashboard"],
  ["/client/billing","Client Billing"],
  ["/client/profile","Client Profile"],
];
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  const allErrors:Record<string,string[]>={};
  // login member
  await p.goto(`${BASE}/client`,{waitUntil:"networkidle"});
  await sleep(500);
  await p.fill('input[type=email]','eleanor.hart@lanai.demo');
  await p.fill('input[type=password]','123456');
  await p.getByRole("button",{name:/sign in|login/i}).first().click();
  await sleep(2500);
  for(const [path,name] of pages){
    const errs:string[]=[];p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
    const resp=await p.goto(`${BASE}${path}`,{waitUntil:"networkidle"});
    await sleep(800);
    console.log(`MEMBER PAGE ${path} [${name}] status=${resp?.status()} errors=${errs.length} len=${(await p.locator("body").innerText()).length}`);
    if(errs.length)allErrors[path]=errs;
  }
  console.log("MEMBER ERRORS:",JSON.stringify(allErrors));
  await b.close();
})();
