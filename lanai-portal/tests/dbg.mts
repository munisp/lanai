import { chromium } from "playwright";
const BASE="http://localhost:3001";
const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  const resp=await p.goto(`${BASE}/api/oauth/dev-login`,{waitUntil:"networkidle"});
  await sleep(500);
  const cookies=await p.context().cookies();
  console.log("COOKIES:",JSON.stringify(cookies.map(c=>({name:c.name,value:c.value.slice(0,20),sameSite:c.sameSite,secure:c.secure}))));
  await p.goto(`${BASE}/proposals`,{waitUntil:"networkidle"});
  await sleep(1500);
  const body=await p.locator("body").innerText();
  console.log("AFTER NAV BODY:",body.slice(0,120));
  await b.close();
})();
