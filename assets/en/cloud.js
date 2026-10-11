// Session stays in memory unless the user opts into tab-scoped sessionStorage.
(() => {
 const cfg=window.FIRELINE_CONFIG||{};
 const enabled=cfg.cloudEnabled&&cfg.supabaseUrl&&cfg.publishableKey;
 let token=null,refresh=null,expires=0,revision=null,user=null,keep=false,until=0,baseline=null,savedAt='',pending=false;
 const sessionKey='fireline.auth.tab.v1:'+cfg.supabaseUrl;
 const panel=document.querySelector('#cloud-account');if(!panel)return;
 const callback=new URLSearchParams(location.hash.slice(1));
 const returnedFromEmail=callback.has('access_token')||callback.has('error');
 const confirmationFailed=callback.has('error');
 if(returnedFromEmail){history.replaceState(null,'',location.pathname+location.search);panel.open=true;}
 const feedback=panel.querySelector('[role=status]');
 const message=t=>feedback.textContent=t;
 const authForm=panel.querySelector('form');
 const remember=document.createElement('label');remember.className='session-choice';remember.innerHTML="<input type=\"checkbox\" name=\"remember\"> Keep session in this tab (up to 12 hours)<small>Only on a personal device. Signing out removes saved access. The browser may restore closed tabs.</small>";authForm.querySelector('.actions').before(remember);
 const resend=document.createElement('button');resend.type='button';resend.className='quiet';resend.textContent="Resend confirmation";authForm.querySelector('.actions').append(resend);
 const controls=panel.querySelector('[data-cloud-controls]');
 const fingerprint=doc=>JSON.stringify(window.FireLineWorkspace.validate(doc));
 function saveState(){const badge=document.querySelector('.local-badge'),local=document.querySelector('#persist').checked;let text=local?"Saved in this browser":"Only in this tab";const dirty=baseline!==null&&fingerprint(window.FireLineWorkspace.snapshot())!==baseline;if(user)text=baseline===null?"Account connected · load first":dirty?"Unsaved account changes":"Saved to account"+(savedAt?' · '+savedAt:'');if(!navigator.onLine)text+=" · offline";badge.textContent=text;badge.classList.toggle('needs-save',!!user&&dirty);badge.setAttribute('role','status');}
 const announce=()=>{authForm.hidden=!!user;controls.hidden=!user;panel.querySelector('[data-cloud-user]').textContent=user?.email||'';saveState();};
 function forget(){try{sessionStorage.removeItem(sessionKey)}catch{}keep=false;until=0;}
 function clearAuth(){token=refresh=user=null;expires=0;revision=null;baseline=null;savedAt='';forget();announce();}
 window.addEventListener('fireline-records',saveState);window.addEventListener('online',saveState);window.addEventListener('offline',saveState);document.querySelector('#persist').addEventListener('change',saveState);
 window.addEventListener('beforeunload',e=>{const doc=window.FireLineWorkspace.snapshot(),count=doc.shifts.length+doc.exposures.length+doc.training.length,dirty=baseline!==null?fingerprint(doc)!==baseline:count>0;if(dirty&&!document.querySelector('#persist').checked){e.preventDefault();e.returnValue='';}});
 async function request(path,body,auth=false){
  if(!enabled)throw Error("Account connection is not configured yet.");
  if(auth&&keep&&until<=Date.now()){clearAuth();throw Error("This tab’s session ended. Sign in again; on-screen records were preserved.");}
  if(auth&&expires<Date.now()+30000){
   if(!refresh)throw Error("Sign in to continue.");
   const renewed=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:refresh});setSession(renewed);
  }
  const headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
  if(auth)headers.Authorization='Bearer '+token;
  const response=await fetch(cfg.supabaseUrl+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let result=null;try{result=await response.json()}catch{}
  if(!response.ok){
   if(result?.code==='40001')throw Error("A newer version exists in your account. Export local changes and load the account version before saving.");
   if(response.status===401||(path.includes('grant_type=refresh_token')&&response.status===400)){clearAuth();throw Error("Invalid session or credentials. Sign in again; on-screen records were preserved.");}
   if(response.status===429)throw Error("Too many attempts. Wait before trying again.");
   throw Error("Unable to complete. Check the details, email confirmation and project configuration.");
  }
  return result;
 }
 function setSession(result){if(!result?.access_token||!result?.refresh_token||!result?.user||!Number.isFinite(result.expires_in))throw Error("Unable to sign in.");token=result.access_token;refresh=result.refresh_token;expires=Date.now()+result.expires_in*1000;user=result.user;if(keep)try{sessionStorage.setItem(sessionKey,JSON.stringify({token,refresh,expires,until}));}catch{forget();message("The browser could not keep the session on reload.");}announce();}
 async function busy(action){if(pending)return;pending=true;const buttons=[...panel.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);panel.setAttribute('aria-busy','true');message("Connecting…");try{await action()}catch(e){message(e.message||"Connection unavailable. Local records were preserved.");}finally{pending=false;buttons.forEach(b=>b.disabled=!enabled);panel.removeAttribute('aria-busy');saveState();}}
 if(!enabled){message("Online account not enabled. You can keep using local space.");panel.querySelectorAll('input,button').forEach(el=>el.disabled=true);return;}
 resend.onclick=()=>{const email=authForm.elements.email;if(!email.reportValidity())return;busy(async()=>{await request('/auth/v1/resend',{type:'signup',email:email.value.trim(),options:{email_redirect_to:location.origin+"/en/funcionalidades/"}});message("If the account is awaiting confirmation, you will receive a new email link.");});};
 authForm.addEventListener('submit',e=>{e.preventDefault();busy(async()=>{const values=Object.fromEntries(new FormData(authForm)),wantsKeep=authForm.elements.remember.checked;const signup=e.submitter?.value==='signup';const redirect=encodeURIComponent(location.origin+"/en/funcionalidades/");const result=await request(signup?'/auth/v1/signup?redirect_to='+redirect:'/auth/v1/token?grant_type=password',{email:values.email.trim(),password:values.password});authForm.reset();revision=null;baseline=null;if(signup&&!result.access_token){message("Check your email to confirm your account, then sign in here.");return}keep=wantsKeep;until=keep?Date.now()+12*3600000:0;if(!keep)forget();setSession(result);message("Signed in. Load account records before saving changes.");});});
 panel.querySelector('[data-cloud-load]').onclick=()=>busy(async()=>{
  const rows=await request('/rest/v1/fireline_workspaces?select=revision,payload',undefined,true);
  if(!Array.isArray(rows)||rows.length>1)throw Error("Unexpected server response.");
  const snapshot=rows[0];
  if(!snapshot){revision=0;baseline=fingerprint({version:1,shifts:[],exposures:[],training:[]});savedAt='';message("No records in your account yet. You can save those on this screen.");return}
  const clean=window.FireLineWorkspace.validate(snapshot.payload);
  if(!confirm("Load account records and replace those on this screen? Export first to keep local changes.")){message("Loading cancelled.");return;}
  window.FireLineWorkspace.replace(clean);revision=Number(snapshot.revision);baseline=fingerprint(window.FireLineWorkspace.snapshot());savedAt='';message("Records loaded from account.");
 });
 panel.querySelector('[data-cloud-save]').onclick=()=>busy(async()=>{
  if(revision===null)throw Error("Load account records first to check the current version.");
  if(!confirm("Send on-screen records, including exposure, to your FireLine account on Supabase?")){message("Saving cancelled.");return;}
  const document=window.FireLineWorkspace.snapshot(),sent=fingerprint(document);
  const next=await request('/rest/v1/rpc/save_fireline_workspace',{document,expected_revision:revision},true);
  if(!Number.isSafeInteger(Number(next))||Number(next)<=revision)throw Error("Unable to confirm saving. Load the account before trying again.");
  revision=Number(next);baseline=sent;savedAt=new Date().toLocaleTimeString("en-GB",{hour:'2-digit',minute:'2-digit'});message("Records saved to account.");
 });
 panel.querySelector('[data-cloud-logout]').onclick=()=>busy(async()=>{
  if(!confirm("Sign out and clear on-screen records? Saved local copies and drafts will remain in the browser.")){message("You stayed signed in.");return;}
  let revoked=true;try{await request('/auth/v1/logout',{},true)}catch{revoked=false}finally{clearAuth();window.FireLineWorkspace.clearSession();window.dispatchEvent(new Event('fireline-logout'));message(revoked?"Signed out on this screen.":"Access removed from this tab. Server sign-out could not be confirmed.");}
 });
 announce();message(confirmationFailed?"Confirmation link failed or expired. Sign in if already confirmed; otherwise request a new link.":returnedFromEmail?"You returned from email confirmation. Sign in with your email and password.":"Sign in or create an account. Use Load and Save to synchronise.");
 try{const saved=JSON.parse(sessionStorage.getItem(sessionKey));if(saved&&typeof saved.token==='string'&&typeof saved.refresh==='string'&&Number.isFinite(saved.expires)&&saved.until>Date.now()&&saved.until<=Date.now()+12*3600000){token=saved.token;refresh=saved.refresh;expires=saved.expires;until=saved.until;keep=true;busy(async()=>{try{const verified=await request('/auth/v1/user',undefined,true);if(!verified?.id)throw Error("Invalid session.");user=verified;announce();message("Session restored. Load account records to continue.");}catch(error){clearAuth();throw error;}});}else forget();}catch{forget();}
})();
