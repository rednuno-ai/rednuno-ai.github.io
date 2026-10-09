const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('#navigation');
toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&toggle?.getAttribute('aria-expanded')==='true'){toggle.setAttribute('aria-expanded','false');nav.classList.remove('open');toggle.focus()}});
const config=window.FIRELINE_CONFIG||{};
const live=config.collectionEnabled&&config.supabaseUrl&&config.publishableKey&&config.turnstileSiteKey;
const forms=[...document.querySelectorAll('form[data-purpose]')];
if(live){
 window.firelineCaptchaReady=()=>forms.forEach(form=>{form.dataset.widget=window.turnstile.render(form.querySelector('[data-captcha]'),{sitekey:config.turnstileSiteKey,action:'fireline_interest'})});
 const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=firelineCaptchaReady&render=explicit';script.async=true;script.onerror=()=>forms.forEach(f=>f.querySelector('[role=status]').textContent='A verificação não carregou. Tenta novamente mais tarde.');document.head.append(script);
 forms.forEach(f=>f.querySelector('.mode').textContent='Registo de interesse · Não introduzas informação de saúde.');
}
forms.forEach(form=>{const status=form.querySelector('[role="status"]');form.addEventListener('submit',async e=>{e.preventDefault();if(!live){status.textContent='Demonstração: os dados não foram enviados nem guardados. A receção de pedidos ainda não está ativa.';return}const token=window.turnstile?.getResponse(form.dataset.widget);if(!token){status.textContent='Conclui a verificação de segurança.';return}const data=Object.fromEntries(new FormData(form));data.purpose=form.dataset.purpose;data.consent=form.elements.consent.checked;data.captchaToken=token;const btn=form.querySelector('button[type="submit"]');btn.disabled=true;status.textContent='A enviar…';try{const response=await fetch(config.supabaseUrl+'/functions/v1/submit-interest',{method:'POST',body:JSON.stringify(data),headers:{'Content-Type':'application/json',apikey:config.publishableKey},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();status.textContent='Pedido recebido. Obrigado pelo teu interesse na FireLine.';form.reset()}catch{status.textContent='Não foi possível confirmar o envio. Tenta novamente mais tarde.'}finally{btn.disabled=false;window.turnstile?.reset(form.dataset.widget)}})});
const tabs=[...document.querySelectorAll('[data-demo-tab]')];
function activate(btn){tabs.forEach(x=>{const selected=x===btn;x.classList.toggle('active',selected);x.setAttribute('aria-selected',String(selected));x.tabIndex=selected?0:-1});document.querySelectorAll('[data-demo-panel]').forEach(p=>p.hidden=p.dataset.demoPanel!==btn.dataset.demoTab)}
tabs.forEach((btn,index)=>{btn.tabIndex=index===0?0:-1;btn.addEventListener('click',()=>activate(btn));btn.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();activate(tabs[next]);tabs[next].focus()}})});
// Keep long explanations available without making them the first thing to read.
if(['/privacidade/','/termos/','/sobre/'].includes(location.pathname)){
 const prose=document.querySelector('.prose');
 if(prose){for(const heading of [...prose.querySelectorAll(':scope > h2,:scope > h3')]){
  if(heading.textContent.startsWith('Os teus dados'))continue;
  const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=heading.textContent;heading.before(detail);detail.append(summary);let next=heading.nextElementSibling;while(next&&!/^H[23]$/.test(next.tagName)){const move=next;next=next.nextElementSibling;if(move.matches('details.refs,a.button'))break;detail.append(move)}heading.remove();
 }}
}
function revealReference(){if(location.hash){const target=document.getElementById(location.hash.slice(1));if(target?.tagName==='DETAILS')target.open=true;}}
revealReference();window.addEventListener('hashchange',revealReference);

// A short action menu is available on every page. Same-page actions keep the session.
const quick=document.createElement('button');quick.className='global-quick';quick.type='button';quick.textContent='＋ Registo rápido';quick.setAttribute('aria-haspopup','dialog');
const quickDialog=document.createElement('dialog');quickDialog.className='quick-dialog';quickDialog.setAttribute('aria-labelledby','quick-title');quickDialog.innerHTML='<button type="button" class="quiet" data-quick-close>Fechar</button><h2 id="quick-title">O que queres registar?</h2><a href="/funcionalidades/#turnos" data-quick-tool="turnos">Turno <small>NFPA 1550 · UE 2003/88/CE</small></a><a href="/funcionalidades/#saude" data-quick-tool="saude">Exposição <small>NFPA 1580 · UE 2004/37/CE</small></a><a href="/funcionalidades/#carreira" data-quick-tool="carreira">Formação <small>NFPA 1010 · UE 89/391/CEE</small></a><p>Referências informativas. Revê os campos antes de guardar.</p>';
document.body.append(quick,quickDialog);quick.onclick=()=>quickDialog.showModal();quickDialog.querySelector('[data-quick-close]').onclick=()=>quickDialog.close();quickDialog.addEventListener('click',e=>{const link=e.target.closest('[data-quick-tool]');if(!link)return;const tab=document.querySelector('[data-tool="'+link.dataset.quickTool+'"]');if(tab){e.preventDefault();quickDialog.close();tab.click();const form=document.querySelector('[data-view="'+link.dataset.quickTool+'"] form');form?.scrollIntoView({behavior:'smooth',block:'center'});form?.querySelector('input,textarea,select')?.focus();}});
