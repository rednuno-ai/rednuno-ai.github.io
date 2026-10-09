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
 const remember=document.createElement('label');remember.className='session-choice';remember.innerHTML='<input type="checkbox" name="remember"> Manter sessão neste separador (até 12 horas)<small>Apenas num dispositivo pessoal. Terminar sessão remove o acesso guardado. O browser pode recuperar separadores fechados.</small>';authForm.querySelector('.actions').before(remember);
 const resend=document.createElement('button');resend.type='button';resend.className='quiet';resend.textContent='Reenviar confirmação';authForm.querySelector('.actions').append(resend);
 const controls=panel.querySelector('[data-cloud-controls]');
 const fingerprint=doc=>JSON.stringify(window.FireLineWorkspace.validate(doc));
 function saveState(){const badge=document.querySelector('.local-badge'),local=document.querySelector('#persist').checked;let text=local?'Guardado neste browser':'Só neste separador';const dirty=baseline!==null&&fingerprint(window.FireLineWorkspace.snapshot())!==baseline;if(user)text=baseline===null?'Conta ligada · carregar primeiro':dirty?'Alterações por guardar na conta':'Guardado na conta'+(savedAt?' · '+savedAt:'');if(!navigator.onLine)text+=' · sem ligação';badge.textContent=text;badge.classList.toggle('needs-save',!!user&&dirty);badge.setAttribute('role','status');}
 const announce=()=>{authForm.hidden=!!user;controls.hidden=!user;panel.querySelector('[data-cloud-user]').textContent=user?.email||'';saveState();};
 function forget(){try{sessionStorage.removeItem(sessionKey)}catch{}keep=false;until=0;}
 function clearAuth(){token=refresh=user=null;expires=0;revision=null;baseline=null;savedAt='';forget();announce();}
 window.addEventListener('fireline-records',saveState);window.addEventListener('online',saveState);window.addEventListener('offline',saveState);document.querySelector('#persist').addEventListener('change',saveState);
 window.addEventListener('beforeunload',e=>{const doc=window.FireLineWorkspace.snapshot(),count=doc.shifts.length+doc.exposures.length+doc.training.length,dirty=baseline!==null?fingerprint(doc)!==baseline:count>0;if(dirty&&!document.querySelector('#persist').checked){e.preventDefault();e.returnValue='';}});
 async function request(path,body,auth=false){
  if(!enabled)throw Error('A ligação à conta ainda não está configurada.');
  if(auth&&keep&&until<=Date.now()){clearAuth();throw Error('A sessão neste separador terminou. Entra novamente; os registos do ecrã foram mantidos.');}
  if(auth&&expires<Date.now()+30000){
   if(!refresh)throw Error('Entra na tua conta para continuar.');
   const renewed=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:refresh});setSession(renewed);
  }
  const headers={apikey:cfg.publishableKey,'Content-Type':'application/json'};
  if(auth)headers.Authorization='Bearer '+token;
  const response=await fetch(cfg.supabaseUrl+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  let result=null;try{result=await response.json()}catch{}
  if(!response.ok){
   if(result?.code==='40001')throw Error('Há uma versão mais recente na conta. Exporta as alterações locais e carrega a versão da conta antes de guardar.');
   if(response.status===401||(path.includes('grant_type=refresh_token')&&response.status===400)){clearAuth();throw Error('Sessão ou dados de acesso inválidos. Entra novamente; os registos do ecrã foram mantidos.');}
   if(response.status===429)throw Error('Demasiadas tentativas. Aguarda antes de tentar novamente.');
   throw Error('Não foi possível concluir. Verifica os dados, a confirmação do email e a configuração do projeto.');
  }
  return result;
 }
 function setSession(result){if(!result?.access_token||!result?.refresh_token||!result?.user||!Number.isFinite(result.expires_in))throw Error('Não foi possível iniciar sessão.');token=result.access_token;refresh=result.refresh_token;expires=Date.now()+result.expires_in*1000;user=result.user;if(keep)try{sessionStorage.setItem(sessionKey,JSON.stringify({token,refresh,expires,until}));}catch{forget();message('O browser não permitiu manter a sessão ao recarregar.');}announce();}
 async function busy(action){if(pending)return;pending=true;const buttons=[...panel.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);panel.setAttribute('aria-busy','true');message('A ligar…');try{await action()}catch(e){message(e.message||'Ligação indisponível. Os registos locais foram mantidos.');}finally{pending=false;buttons.forEach(b=>b.disabled=!enabled);panel.removeAttribute('aria-busy');saveState();}}
 if(!enabled){message('Conta online por ativar. Podes continuar a usar o espaço local.');panel.querySelectorAll('input,button').forEach(el=>el.disabled=true);return;}
 resend.onclick=()=>{const email=authForm.elements.email;if(!email.reportValidity())return;busy(async()=>{await request('/auth/v1/resend',{type:'signup',email:email.value.trim(),options:{email_redirect_to:location.origin+'/funcionalidades/'}});message('Se a conta aguardar confirmação, receberás um novo link por email.');});};
 authForm.addEventListener('submit',e=>{e.preventDefault();busy(async()=>{const values=Object.fromEntries(new FormData(authForm)),wantsKeep=authForm.elements.remember.checked;const signup=e.submitter?.value==='signup';const redirect=encodeURIComponent(location.origin+'/funcionalidades/');const result=await request(signup?'/auth/v1/signup?redirect_to='+redirect:'/auth/v1/token?grant_type=password',{email:values.email.trim(),password:values.password});authForm.reset();revision=null;baseline=null;if(signup&&!result.access_token){message('Verifica o teu email para confirmar a conta e depois entra aqui.');return}keep=wantsKeep;until=keep?Date.now()+12*3600000:0;if(!keep)forget();setSession(result);message('Sessão iniciada. Carrega os registos da conta antes de guardar alterações.');});});
 panel.querySelector('[data-cloud-load]').onclick=()=>busy(async()=>{
  const rows=await request('/rest/v1/fireline_workspaces?select=revision,payload',undefined,true);
  if(!Array.isArray(rows)||rows.length>1)throw Error('Resposta inesperada do servidor.');
  const snapshot=rows[0];
  if(!snapshot){revision=0;baseline=fingerprint({version:1,shifts:[],exposures:[],training:[]});savedAt='';message('A conta ainda não tem registos. Podes guardar os registos deste ecrã.');return}
  const clean=window.FireLineWorkspace.validate(snapshot.payload);
  if(!confirm('Carregar os registos da conta e substituir os registos deste ecrã? Exporta primeiro se quiseres conservar alterações locais.')){message('Carregamento cancelado.');return;}
  window.FireLineWorkspace.replace(clean);revision=Number(snapshot.revision);baseline=fingerprint(window.FireLineWorkspace.snapshot());savedAt='';message('Registos carregados da conta.');
 });
 panel.querySelector('[data-cloud-save]').onclick=()=>busy(async()=>{
  if(revision===null)throw Error('Carrega primeiro os registos da conta para verificar a versão atual.');
  if(!confirm('Enviar os registos deste ecrã, incluindo exposição, para a tua conta FireLine no Supabase?')){message('Gravação cancelada.');return;}
  const document=window.FireLineWorkspace.snapshot(),sent=fingerprint(document);
  const next=await request('/rest/v1/rpc/save_fireline_workspace',{document,expected_revision:revision},true);
  if(!Number.isSafeInteger(Number(next))||Number(next)<=revision)throw Error('Não foi possível confirmar a gravação. Carrega a conta antes de tentar novamente.');
  revision=Number(next);baseline=sent;savedAt=new Date().toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'});message('Registos guardados na conta.');
 });
 panel.querySelector('[data-cloud-logout]').onclick=()=>busy(async()=>{
  if(!confirm('Terminar sessão e limpar os registos deste ecrã? Cópias locais e rascunhos guardados permanecem no browser.')){message('Mantiveste a sessão iniciada.');return;}
  let revoked=true;try{await request('/auth/v1/logout',{},true)}catch{revoked=false}finally{clearAuth();window.FireLineWorkspace.clearSession();window.dispatchEvent(new Event('fireline-logout'));message(revoked?'Sessão terminada neste ecrã.':'Acesso removido deste separador. Não foi possível confirmar o encerramento no servidor.');}
 });
 announce();message(confirmationFailed?'O link de confirmação falhou ou expirou. Tenta entrar se já confirmaste a conta; caso contrário, pede um novo link.':returnedFromEmail?'Regressaste da confirmação por email. Entra com o teu email e palavra-passe.':'Entra ou cria a tua conta. A sincronização é feita pelos botões Carregar e Guardar.');
 try{const saved=JSON.parse(sessionStorage.getItem(sessionKey));if(saved&&typeof saved.token==='string'&&typeof saved.refresh==='string'&&Number.isFinite(saved.expires)&&saved.until>Date.now()&&saved.until<=Date.now()+12*3600000){token=saved.token;refresh=saved.refresh;expires=saved.expires;until=saved.until;keep=true;busy(async()=>{try{const verified=await request('/auth/v1/user',undefined,true);if(!verified?.id)throw Error('Sessão inválida.');user=verified;announce();message('Sessão recuperada. Carrega os registos da conta para continuar.');}catch(error){clearAuth();throw error;}});}else forget();}catch{forget();}
})();
