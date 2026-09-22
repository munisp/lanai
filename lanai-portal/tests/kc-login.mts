import { chromium } from "playwright";
const BASE="http://localhost:3001";const sleep=(m:number)=>new Promise(r=>setTimeout(r,m));
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();const errs:string[]=[];
  p.on("pageerror",e=>errs.push("PE:"+e.message));p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  // Click sign in from landing page (not dev-login). Go to a protected page to trigger gate.
  await p.goto(`${BASE}/`,{waitUntil:"networkidle"});await sleep(800);
  const urlBefore=p.url();
  console.log("LANDING URL:",urlBefore);
  // try clicking a sign-in button if present
  const signIn=p.getByRole("button",{name:/sign in/i});
  let clicked=false;
  if(await signIn.count()){ await signIn.first().click(); clicked=true; }
  await sleep(2500);
  console.log("AFTER CLICK url:",p.url(),"clicked:",clicked);
  // If on keycloak login, fill creds
  if(/8080|keycloak/i.test(p.url())){
    await p.fill('input[name=username]','dev').catch(()=>{});
    await p.fill('input[name=password]','dev123!').catch(()=>{});
    await p.getByRole("button",{name:/sign in|log in|submit/i}).first().click().catch(()=>{});
    await sleep(3500);
  }
  console.log("FINAL url:",p.url());
  const txt=await p.locator("body").innerText().catch(()=>"");
  console.log("HAS DASHBOARD:",/Dashboard|Morning Briefing|Lanai/i.test(txt));
  console.log("ERRORS:",errs.slice(0,5));
  await b.close();
})();
