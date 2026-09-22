import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs:string[]=[];
  p.on("pageerror",e=>errs.push("PE:"+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  await p.goto(`${BASE}/api/oauth/dev-login`,{waitUntil:"networkidle"});
  await p.goto(`${BASE}/member-management`,{waitUntil:"networkidle"});await sleep(1000);
  await p.getByRole("button",{name:/Invite Member/i}).first().click();await sleep(700);
  await p.locator('input[type=email]').first().fill('invitee@lanai.demo');
  await p.locator('input[placeholder*="James Whitfield"]').first().fill('Invitee Test');
  await p.getByRole("button",{name:/Send Invitation/i}).first().click();
  await sleep(2500);
  const txt=await p.locator("body").innerText();
  console.log("INVITE SUCCESS SHOWN:",/Invitation created successfully|invite link/i.test(txt));
  console.log("ERRORS:",errs.slice(0,5));
  await b.close();
})();
