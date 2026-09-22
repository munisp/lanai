import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
const advisorPages=["/","/clients","/travel-requests","/members","/member-management","/proposals","/intelligence","/briefing","/suppliers","/supplier-services","/whatsapp","/inbox","/communication-hub","/analytics","/invoicing","/celebrations","/nps","/trip-timeline","/ai-concierge","/member/1","/settings"];
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs:Record<string,string[]>={};
  await p.goto(`${BASE}/api/oauth/dev-login`,{waitUntil:"networkidle"});
  await p.goto(`${BASE}/`,{waitUntil:"networkidle"});await sleep(800);
  for(const pg of advisorPages){
    const e:string[]=[];p.on("pageerror",x=>e.push("PE:"+x.message));p.on("console",m=>{if(m.type()==="error")e.push(m.text())});
    const r=await p.goto(`${BASE}${pg}`,{waitUntil:"networkidle"});await sleep(1500);
    if(e.length)errs[pg]=e.slice(0,2);
  }
  console.log("ADVISOR PAGES WITH ERRORS:",JSON.stringify(errs,null,1));
  console.log("ADVISOR ERROR COUNT:",Object.keys(errs).length,"/",advisorPages.length);
  await b.close();
})();
