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
 const remember=document.createElement('label');remember.className='session-choice';remember.innerHTML="<input type=\"checkbox\" name=\"remember\"> Mantener sesión en esta pestaña (hasta 12 horas)<small>Solo en un dispositivo personal. Cerrar sesión elimina el acceso guardado. El navegador puede restaurar pestañas cerradas.</small>";authForm.querySelector('.actions').before(remember);
 const resend=document.createElement('button');resend.type='button';resend.className='quiet';resend.textContent="Reenviar confirmación";authForm.querySelector('.actions').append(resend);
 const controls=panel.querySelector('[data-cloud-controls]');
 const fingerprint=doc=>JSON.stringify(window.FireLineWorkspace.validate(doc));
 function saveState(){const badge=document.querySelector('.local-badge'),local=document.querySelector('#persist').checked;let text=local?"Guardado en este navegador":"Solo en esta pestaña";const dirty=baseline!==null&&fingerprint(window.FireLineWorkspace.snapshot())!==baseline;if(user)text=baseline===null?"Cuenta conectada · carga primero":dirty?"Cambios pendientes en la cuenta":"Guardado en la cuenta"+(savedAt?' · '+savedAt:'');if(!navigator.onLine)text+=" · sin conexión";badge.textContent=text;badge.classList.toggle('needs-save',!!user&&dirty);badge.setAttribute('role','status');}
 const announce=()=>{authForm.hidden=!!user;controls.hidden=!user;panel.querySelector('[data-cloud-user]').textContent=user?.email||'';saveState();};
 function forget(){try{sessionStorage.removeItem(sessionKey)}catch{}keep=false;until=0;}
 function clearAuth(){token=refresh=user=null;expires=0;revision=null;baseline=null;savedAt='';forget();announce();}
 window.addEventListener('fireline-records',saveState);window.addEventListener('online',saveState);window.addEventListener('offline',saveState);document.querySelector('#persist').addEventListener('change',saveState);
 window.addEventListener('beforeunload',e=>{const doc=window.FireLineWorkspace.snapshot(),count=doc.shifts.length+doc.exposures.length+doc.training.length,dirty=baseline!==null?fingerprint(doc)!==baseline:count>0;if(dirty&&!document.querySelector('#persist').checked){e.preventDefault();e.returnValue='';}});
 async function request(path,body,auth=false){
  if(!enabled)throw Error("La conexión a la cuenta aún no está configurada.");
  if(auth&&keep&&until<=Date.now()){clearAuth();throw Error("La sesión de esta pestaña terminó. Vuelve a entrar; los registros de pantalla se conservaron.");}
  if(auth&&expires<Date.now()+30000){
   if(!refresh)throw Error("Entra para continuar.");
   const renewed=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:refresh});setSession(renewed);
  }
  const headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
  if(auth)headers.Authorization='Bearer '+token;
  const response=await fetch(cfg.supabaseUrl+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let result=null;try{result=await response.json()}catch{}
  if(!response.ok){
   if(result?.code==='40001')throw Error("Hay una versión más reciente en tu cuenta. Exporta los cambios locales y carga la versión de la cuenta antes de guardar.");
   if(response.status===401||(path.includes('grant_type=refresh_token')&&response.status===400)){clearAuth();throw Error("Sesión o credenciales no válidas. Vuelve a entrar; los registros de pantalla se conservaron.");}
   if(response.status===429)throw Error("Demasiados intentos. Espera antes de volver a intentarlo.");
   throw Error("No se pudo completar. Revisa los datos, confirmación del correo y configuración del proyecto.");
  }
  return result;
 }
 function setSession(result){if(!result?.access_token||!result?.refresh_token||!result?.user||!Number.isFinite(result.expires_in))throw Error("No se pudo iniciar sesión.");token=result.access_token;refresh=result.refresh_token;expires=Date.now()+result.expires_in*1000;user=result.user;if(keep)try{sessionStorage.setItem(sessionKey,JSON.stringify({token,refresh,expires,until}));}catch{forget();message("El navegador no pudo mantener la sesión al recargar.");}announce();}
 async function busy(action){if(pending)return;pending=true;const buttons=[...panel.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);panel.setAttribute('aria-busy','true');message("Conectando…");try{await action()}catch(e){message(e.message||"Conexión no disponible. Los registros locales se conservaron.");}finally{pending=false;buttons.forEach(b=>b.disabled=!enabled);panel.removeAttribute('aria-busy');saveState();}}
 if(!enabled){message("Cuenta en línea sin activar. Puedes seguir usando el espacio local.");panel.querySelectorAll('input,button').forEach(el=>el.disabled=true);return;}
 resend.onclick=()=>{const email=authForm.elements.email;if(!email.reportValidity())return;busy(async()=>{await request('/auth/v1/resend',{type:'signup',email:email.value.trim(),options:{email_redirect_to:location.origin+"/es/funcionalidades/"}});message("Si la cuenta espera confirmación, recibirás otro enlace por correo.");});};
 authForm.addEventListener('submit',e=>{e.preventDefault();busy(async()=>{const values=Object.fromEntries(new FormData(authForm)),wantsKeep=authForm.elements.remember.checked;const signup=e.submitter?.value==='signup';const redirect=encodeURIComponent(location.origin+"/es/funcionalidades/");const result=await request(signup?'/auth/v1/signup?redirect_to='+redirect:'/auth/v1/token?grant_type=password',{email:values.email.trim(),password:values.password});authForm.reset();revision=null;baseline=null;if(signup&&!result.access_token){message("Confirma tu cuenta por correo y entra aquí.");return}keep=wantsKeep;until=keep?Date.now()+12*3600000:0;if(!keep)forget();setSession(result);message("Sesión iniciada. Carga los registros de la cuenta antes de guardar cambios.");});});
 panel.querySelector('[data-cloud-load]').onclick=()=>busy(async()=>{
  const rows=await request('/rest/v1/fireline_workspaces?select=revision,payload',undefined,true);
  if(!Array.isArray(rows)||rows.length>1)throw Error("Respuesta inesperada del servidor.");
  const snapshot=rows[0];
  if(!snapshot){revision=0;baseline=fingerprint({version:1,shifts:[],exposures:[],training:[]});savedAt='';message("Tu cuenta aún no tiene registros. Puedes guardar los de esta pantalla.");return}
  const clean=window.FireLineWorkspace.validate(snapshot.payload);
  if(!confirm("¿Cargar los registros de la cuenta y sustituir los de pantalla? Exporta antes para conservar los cambios locales.")){message("Carga cancelada.");return;}
  window.FireLineWorkspace.replace(clean);revision=Number(snapshot.revision);baseline=fingerprint(window.FireLineWorkspace.snapshot());savedAt='';message("Registros cargados de la cuenta.");
 });
 panel.querySelector('[data-cloud-save]').onclick=()=>busy(async()=>{
  if(revision===null)throw Error("Carga primero los registros de la cuenta para verificar la versión actual.");
  if(!confirm("¿Enviar los registros de pantalla, incluida exposición, a tu cuenta FireLine en Supabase?")){message("Guardado cancelado.");return;}
  const document=window.FireLineWorkspace.snapshot(),sent=fingerprint(document);
  const next=await request('/rest/v1/rpc/save_fireline_workspace',{document,expected_revision:revision},true);
  if(!Number.isSafeInteger(Number(next))||Number(next)<=revision)throw Error("No se pudo confirmar el guardado. Carga la cuenta antes de reintentarlo.");
  revision=Number(next);baseline=sent;savedAt=new Date().toLocaleTimeString("es-ES",{hour:'2-digit',minute:'2-digit'});message("Registros guardados en la cuenta.");
 });
 panel.querySelector('[data-cloud-logout]').onclick=()=>busy(async()=>{
  if(!confirm("¿Cerrar sesión y limpiar los registros de pantalla? Las copias locales y borradores permanecerán en el navegador.")){message("Has mantenido la sesión.");return;}
  let revoked=true;try{await request('/auth/v1/logout',{},true)}catch{revoked=false}finally{clearAuth();window.FireLineWorkspace.clearSession();window.dispatchEvent(new Event('fireline-logout'));message(revoked?"Sesión cerrada en esta pantalla.":"Acceso eliminado de esta pestaña. No se pudo confirmar el cierre en el servidor.");}
 });
 announce();message(confirmationFailed?"El enlace falló o caducó. Entra si ya confirmaste; si no, pide otro enlace.":returnedFromEmail?"Has vuelto de la confirmación por correo. Entra con tu correo y contraseña.":"Entra o crea una cuenta. Usa Cargar y Guardar para sincronizar.");
 try{const saved=JSON.parse(sessionStorage.getItem(sessionKey));if(saved&&typeof saved.token==='string'&&typeof saved.refresh==='string'&&Number.isFinite(saved.expires)&&saved.until>Date.now()&&saved.until<=Date.now()+12*3600000){token=saved.token;refresh=saved.refresh;expires=saved.expires;until=saved.until;keep=true;busy(async()=>{try{const verified=await request('/auth/v1/user',undefined,true);if(!verified?.id)throw Error("Sesión no válida.");user=verified;announce();message("Sesión recuperada. Carga los registros de la cuenta para continuar.");}catch(error){clearAuth();throw error;}});}else forget();}catch{forget();}
})();
