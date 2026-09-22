import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs:string[]=[];
  p.on("pageerror",e=>errs.push("PE:"+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto(`${BASE}/api/oauth/dev-login`,{waitUntil:"networkidle"});
  await p.goto(`${BASE}/celebrations`,{waitUntil:"networkidle"});await sleep(1000);
  await p.getByRole("button",{name:/Add Celebration/i}).first().click();await sleep(800);
  console.log("DIALOG OPEN, errs:",errs.slice(0,3));
  await p.fill('input[placeholder*="50th"]','Test Birthday Celebration');
  await p.locator('input[type=date]').first().fill('2026-09-15');
  await sleep(300);
  await p.getByRole("button",{name:/^Add Celebration$/i}).first().click();await sleep(2500);
  const txt=await p.locator("body").innerText();
  console.log("AFTER SUBMIT has Test Birthday:",/Test Birthday Celebration/i.test(txt));
  console.log("ERRORS:",errs.slice(0,6));
  await b.close();
})();
