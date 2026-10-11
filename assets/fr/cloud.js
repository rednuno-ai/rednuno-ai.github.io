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
 const remember=document.createElement('label');remember.className='session-choice';remember.innerHTML="<input type=\"checkbox\" name=\"remember\"> Garder la session dans cet onglet (12 heures maximum)<small>Uniquement sur un appareil personnel. La déconnexion supprime l’accès enregistré. Le navigateur peut restaurer des onglets fermés.</small>";authForm.querySelector('.actions').before(remember);
 const resend=document.createElement('button');resend.type='button';resend.className='quiet';resend.textContent="Renvoyer la confirmation";authForm.querySelector('.actions').append(resend);
 const controls=panel.querySelector('[data-cloud-controls]');
 const fingerprint=doc=>JSON.stringify(window.FireLineWorkspace.validate(doc));
 function saveState(){const badge=document.querySelector('.local-badge'),local=document.querySelector('#persist').checked;let text=local?"Enregistré dans ce navigateur":"Uniquement dans cet onglet";const dirty=baseline!==null&&fingerprint(window.FireLineWorkspace.snapshot())!==baseline;if(user)text=baseline===null?"Compte connecté · charger d’abord":dirty?"Modifications non enregistrées sur le compte":"Enregistré sur le compte"+(savedAt?' · '+savedAt:'');if(!navigator.onLine)text+=" · hors connexion";badge.textContent=text;badge.classList.toggle('needs-save',!!user&&dirty);badge.setAttribute('role','status');}
 const announce=()=>{authForm.hidden=!!user;controls.hidden=!user;panel.querySelector('[data-cloud-user]').textContent=user?.email||'';saveState();};
 function forget(){try{sessionStorage.removeItem(sessionKey)}catch{}keep=false;until=0;}
 function clearAuth(){token=refresh=user=null;expires=0;revision=null;baseline=null;savedAt='';forget();announce();}
 window.addEventListener('fireline-records',saveState);window.addEventListener('online',saveState);window.addEventListener('offline',saveState);document.querySelector('#persist').addEventListener('change',saveState);
 window.addEventListener('beforeunload',e=>{const doc=window.FireLineWorkspace.snapshot(),count=doc.shifts.length+doc.exposures.length+doc.training.length,dirty=baseline!==null?fingerprint(doc)!==baseline:count>0;if(dirty&&!document.querySelector('#persist').checked){e.preventDefault();e.returnValue='';}});
 async function request(path,body,auth=false){
  if(!enabled)throw Error("La connexion au compte n’est pas encore configurée.");
  if(auth&&keep&&until<=Date.now()){clearAuth();throw Error("La session de cet onglet a expiré. Reconnecte-toi ; les données affichées sont conservées.");}
  if(auth&&expires<Date.now()+30000){
   if(!refresh)throw Error("Connecte-toi pour continuer.");
   const renewed=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:refresh});setSession(renewed);
  }
  const headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
  if(auth)headers.Authorization='Bearer '+token;
  const response=await fetch(cfg.supabaseUrl+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let result=null;try{result=await response.json()}catch{}
  if(!response.ok){
   if(result?.code==='40001')throw Error("Une version plus récente existe sur ton compte. Exporte tes modifications locales et charge la version du compte avant d’enregistrer.");
   if(response.status===401||(path.includes('grant_type=refresh_token')&&response.status===400)){clearAuth();throw Error("Session ou identifiants invalides. Reconnecte-toi ; les données affichées sont conservées.");}
   if(response.status===429)throw Error("Trop de tentatives. Attends avant de réessayer.");
   throw Error("Impossible de terminer. Vérifie les données, la confirmation e-mail et la configuration du projet.");
  }
  return result;
 }
 function setSession(result){if(!result?.access_token||!result?.refresh_token||!result?.user||!Number.isFinite(result.expires_in))throw Error("Connexion impossible.");token=result.access_token;refresh=result.refresh_token;expires=Date.now()+result.expires_in*1000;user=result.user;if(keep)try{sessionStorage.setItem(sessionKey,JSON.stringify({token,refresh,expires,until}));}catch{forget();message("Le navigateur n’a pas pu conserver la session au rechargement.");}announce();}
 async function busy(action){if(pending)return;pending=true;const buttons=[...panel.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);panel.setAttribute('aria-busy','true');message("Connexion…");try{await action()}catch(e){message(e.message||"Connexion indisponible. Les données locales sont conservées.");}finally{pending=false;buttons.forEach(b=>b.disabled=!enabled);panel.removeAttribute('aria-busy');saveState();}}
 if(!enabled){message("Compte en ligne non activé. Tu peux continuer en local.");panel.querySelectorAll('input,button').forEach(el=>el.disabled=true);return;}
 resend.onclick=()=>{const email=authForm.elements.email;if(!email.reportValidity())return;busy(async()=>{await request('/auth/v1/resend',{type:'signup',email:email.value.trim(),options:{email_redirect_to:location.origin+"/fr/funcionalidades/"}});message("Si le compte attend confirmation, tu recevras un nouveau lien par e-mail.");});};
 authForm.addEventListener('submit',e=>{e.preventDefault();busy(async()=>{const values=Object.fromEntries(new FormData(authForm)),wantsKeep=authForm.elements.remember.checked;const signup=e.submitter?.value==='signup';const redirect=encodeURIComponent(location.origin+"/fr/funcionalidades/");const result=await request(signup?'/auth/v1/signup?redirect_to='+redirect:'/auth/v1/token?grant_type=password',{email:values.email.trim(),password:values.password});authForm.reset();revision=null;baseline=null;if(signup&&!result.access_token){message("Confirme ton compte par e-mail puis connecte-toi ici.");return}keep=wantsKeep;until=keep?Date.now()+12*3600000:0;if(!keep)forget();setSession(result);message("Connecté. Charge les données du compte avant d’enregistrer des modifications.");});});
 panel.querySelector('[data-cloud-load]').onclick=()=>busy(async()=>{
  const rows=await request('/rest/v1/fireline_workspaces?select=revision,payload',undefined,true);
  if(!Array.isArray(rows)||rows.length>1)throw Error("Réponse inattendue du serveur.");
  const snapshot=rows[0];
  if(!snapshot){revision=0;baseline=fingerprint({version:1,shifts:[],exposures:[],training:[]});savedAt='';message("Ton compte n’a pas encore de données. Tu peux enregistrer celles de cet écran.");return}
  const clean=window.FireLineWorkspace.validate(snapshot.payload);
  if(!confirm("Charger les données du compte et remplacer celles de cet écran ? Exporte d’abord pour conserver les modifications locales.")){message("Chargement annulé.");return;}
  window.FireLineWorkspace.replace(clean);revision=Number(snapshot.revision);baseline=fingerprint(window.FireLineWorkspace.snapshot());savedAt='';message("Données chargées depuis le compte.");
 });
 panel.querySelector('[data-cloud-save]').onclick=()=>busy(async()=>{
  if(revision===null)throw Error("Charge d’abord les données du compte pour vérifier la version.");
  if(!confirm("Envoyer les données affichées, dont l’exposition, à ton compte FireLine sur Supabase ?")){message("Enregistrement annulé.");return;}
  const document=window.FireLineWorkspace.snapshot(),sent=fingerprint(document);
  const next=await request('/rest/v1/rpc/save_fireline_workspace',{document,expected_revision:revision},true);
  if(!Number.isSafeInteger(Number(next))||Number(next)<=revision)throw Error("Impossible de confirmer l’enregistrement. Charge le compte avant de réessayer.");
  revision=Number(next);baseline=sent;savedAt=new Date().toLocaleTimeString("fr-FR",{hour:'2-digit',minute:'2-digit'});message("Données enregistrées sur le compte.");
 });
 panel.querySelector('[data-cloud-logout]').onclick=()=>busy(async()=>{
  if(!confirm("Te déconnecter et effacer les données affichées ? Les copies locales et brouillons restent dans le navigateur.")){message("Tu es resté connecté.");return;}
  let revoked=true;try{await request('/auth/v1/logout',{},true)}catch{revoked=false}finally{clearAuth();window.FireLineWorkspace.clearSession();window.dispatchEvent(new Event('fireline-logout'));message(revoked?"Déconnecté sur cet écran.":"Accès supprimé de cet onglet. Déconnexion du serveur non confirmée.");}
 });
 announce();message(confirmationFailed?"Le lien de confirmation a échoué ou expiré. Connecte-toi si le compte est confirmé ; sinon demande un nouveau lien.":returnedFromEmail?"De retour de la confirmation e-mail. Connecte-toi avec ton e-mail et mot de passe.":"Connecte-toi ou crée un compte. Utilise Charger et Enregistrer pour synchroniser.");
 try{const saved=JSON.parse(sessionStorage.getItem(sessionKey));if(saved&&typeof saved.token==='string'&&typeof saved.refresh==='string'&&Number.isFinite(saved.expires)&&saved.until>Date.now()&&saved.until<=Date.now()+12*3600000){token=saved.token;refresh=saved.refresh;expires=saved.expires;until=saved.until;keep=true;busy(async()=>{try{const verified=await request('/auth/v1/user',undefined,true);if(!verified?.id)throw Error("Session invalide.");user=verified;announce();message("Session récupérée. Charge les données du compte pour continuer.");}catch(error){clearAuth();throw error;}});}else forget();}catch{forget();}
})();
