import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  await p.goto(`${BASE}/client`,{waitUntil:"networkidle"});await sleep(400);
  await p.fill('input[type=email]','eleanor.hart@lanai.demo');
  await p.fill('input[type=password]','123456');
  await p.getByRole("button",{name:/sign in|login/i}).first().click();await sleep(2000);
  await p.getByRole("button",{name:/My Trips/i}).first().click();await sleep(1500);
  console.log("TRIPS TAB:\n"+(await p.locator("body").innerText()).slice(0,500));
  await b.close();
})();
