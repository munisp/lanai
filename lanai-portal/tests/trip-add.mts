import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs:string[]=[];
  p.on("pageerror",e=>errs.push("PE:"+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto(`${BASE}/api/oauth/dev-login`,{waitUntil:"networkidle"});
  await p.goto(`${BASE}/trip-timeline`,{waitUntil:"networkidle"});await sleep(1000);
  await p.getByRole("button",{name:/Add Trip/i}).first().click();await sleep(700);
  await p.fill('input[placeholder*="Maldives"]','Bora Bora');
  await p.locator('input[type=date]').first().fill('2026-10-01');
  await p.locator('input[type=date]').nth(1).fill('2026-10-10');
  await p.getByRole("button",{name:/^Add Trip$/i}).first().click();await sleep(2500);
  const txt=await p.locator("body").innerText();
  console.log("HAS Bora Bora:",/Bora Bora/i.test(txt));
  console.log("CATEGORY SHOWN:",/Hotel|Bora/i.test(txt));
  console.log("ERRORS:",errs.slice(0,5));
  await b.close();
})();
