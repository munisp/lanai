import { chromium } from "playwright";
const BASE="http://localhost:3001";
const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  const errs:string[]=[];p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});p.on("pageerror",e=>errs.push("PE:"+e.message));
  // client login page
  await p.goto(`${BASE}/client`,{waitUntil:"networkidle"});
  await sleep(800);
  console.log("LOGIN PAGE BODY:",(await p.locator("body").innerText()).slice(0,200));
  await p.fill('input[type=email]','eleanor.hart@lanai.demo');
  await p.fill('input[type=password]','123456');
  await p.getByRole("button",{name:/sign in|login/i}).first().click();
  await sleep(3000);
  const url=p.url();
  const body=await p.locator("body").innerText();
  console.log("AFTER LOGIN URL:",url);
  console.log("BODY:",body.slice(0,300));
  console.log("ERRORS:",errs.slice(0,5));
  await b.close();
})();
