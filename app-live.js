const panel = document.querySelector('#stepPanel');
const API = window.HABA_API_URL || (location.hostname === 'haba-app.onrender.com' ? 'https://haba-api-3y14.onrender.com' : '');
const stage = { step: 'loading', challengeId: '', registrationToken: '', applicationId: '', token: sessionStorage.getItem('haba_access_token') || '' };
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field = (label,name,type='text',attrs='') => `<div class="field"><label for="${name}">${label} *</label><input id="${name}" name="${name}" type="${type}" required ${attrs}></div>`;
function shell(kicker,title,copy,body) {
  panel.innerHTML = `<div class="panel-kicker">${kicker}</div><h3 class="panel-title">${title}</h3><p class="panel-copy">${copy}</p>${body}<div class="inline-alert" id="formError" hidden></div>`;
  panel.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) act(form); }));
  panel.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(button.closest('form'), button.dataset.action)));
}
function form(body, submit, back='') { return `<form><div class="field-grid">${body}</div><div class="button-row">${back}<button class="button button-dark" type="submit">${submit}<span aria-hidden="true">→</span></button></div></form>`; }
function error(message) { const target=panel.querySelector('#formError'); if(target){target.hidden=false;target.textContent=message;} }
function setStatus(step, text) { stage.step=step; const count=document.querySelector('#stepCount'); if(count) count.textContent=text; const fill=document.querySelector('#progressFill'); if(fill) fill.style.width=step==='ready'?'100%':'18%'; }
async function request(path, options={}) {
  const headers={ 'Content-Type':'application/json', ...(options.headers||{}) };
  if(stage.token) headers.Authorization=`Bearer ${stage.token}`;
  const response=await fetch(`${API}${path}`,{...options,headers});
  if(response.status===204) return null;
  const payload=await response.json().catch(()=>({error:'service_unavailable'}));
  if(!response.ok) throw new Error(payload.error||'service_unavailable');
  return payload;
}
const explain = code => ({ registration_not_open:'Account registration is not open yet.', lending_not_authorized:'Haba is not yet authorized to accept loan applications in Kenya.', otp_provider_not_configured:'Phone verification is not connected yet.', invalid_or_expired_code:'That code is invalid or has expired. Request a new code.', invalid_login:'The phone number or password is incorrect.', required_consent_missing:'Please review and accept each required data notice before submitting.', references_required:'Add both reference contacts before submitting.', credit_provider_not_configured:'Credit review is not connected yet.', payment_provider_not_configured:'M-Pesa payments are not connected yet.', rate_limited:'Too many attempts. Please wait and try again.' }[code] || 'The service is temporarily unavailable. Please try again later.');
function landing(status) {
  setStatus('ready','STATUS');
  const canRegister=status.registrationEnabled;
  const canSignIn=status.signInEnabled;
  shell('Kenya launch status',canRegister?'Welcome to Haba':'Getting ready for Kenya',canRegister?'Create an account using your Kenyan mobile number, or sign in to continue. No fee is charged to create an account.':'Account access and lending are currently closed while authorization and provider connections are completed.',
    `<div class="data-box"><strong>Service status</strong><p>${status.applicationEnabled?'Applications are open. Loan decisions and payment services require their own active providers.':'Loan applications are not being accepted yet.'}</p></div>${canRegister||canSignIn?`<div class="button-row">${canRegister?'<button class="button button-dark" data-action="register">Create account <span aria-hidden="true">→</span></button>':''}${canSignIn?'<button class="button button-light" data-action="login">Sign in</button>':''}</div>`:''}<p class="fee-note">Haba will not ask for an activation fee to unlock an unapproved loan.</p>`);
}
async function load() {
  try {
    if(stage.token) { await dashboard(); return; }
    landing(await request('/v1/product-status'));
  } catch { setStatus('ready','STATUS'); shell('Service status','Haba is preparing to open','We cannot reach the secure service right now. Please try again later.','<div class="data-box"><p>No personal details or payment have been submitted.</p></div>'); }
}
function startAccount(mode) {
  stage.mode=mode;
  if(mode==='login') {
    shell('Sign in','Welcome back','Use the Kenyan mobile number and password on your account.',form(field('Phone number','phone','tel','inputmode="tel" autocomplete="tel" placeholder="+254700000000"')+field('Password','password','password','autocomplete="current-password"'),'Sign in')+'<button class="button button-light" data-action="register">Create account</button>');
  } else {
    stage.step='ready';
    shell('Create account','Verify your mobile number','We will send a one-time verification code by SMS. Haba will not read your messages.',form(field('Kenyan phone number','phone','tel','inputmode="tel" autocomplete="tel" placeholder="+254700000000"'),'Send code')+'<button class="button button-light" data-action="login">I already have an account</button>');
  }
}
async function act(formEl, action) {
  try {
    if(action==='register'||action==='login') { startAccount(action); return; }
    if(action==='logout') { try{await request('/v1/auth/logout',{method:'POST'});}catch{}sessionStorage.removeItem('haba_access_token');stage.token='';load();return; }
    if(action==='apply') { stage.mode='apply'; stage.step='application'; applicationForm(); return; }
    const data=Object.fromEntries(new FormData(formEl).entries());
    if(stage.mode==='register' && stage.step==='ready') {
      const result=await request('/v1/auth/otp/request',{method:'POST',body:JSON.stringify({phone:data.phone.trim()})});
      stage.challengeId=result.challengeId; stage.step='otp';
      shell('Verify your number','Enter your code','The code expires in five minutes.',form(field('Six-digit code','code','text','inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"'),'Verify code'));
      return;
    }
    if(stage.mode==='register' && stage.step==='otp') {
      const result=await request('/v1/auth/otp/verify',{method:'POST',body:JSON.stringify({challengeId:stage.challengeId,code:data.code})});
      stage.registrationToken=result.registrationToken; stage.step='password';
      shell('Secure your account','Create a password','Use at least 12 characters. Keep it private.',form(field('Password','password','password','minlength="12" autocomplete="new-password"'),'Create account'));
      return;
    }
    if(stage.mode==='register' && stage.step==='password') {
      const result=await request('/v1/auth/register',{method:'POST',body:JSON.stringify({registrationToken:stage.registrationToken,password:data.password})});
      stage.token=result.accessToken; sessionStorage.setItem('haba_access_token',stage.token); await dashboard(); return;
    }
    if(stage.mode==='login') {
      const result=await request('/v1/auth/login',{method:'POST',body:JSON.stringify({phone:data.phone.trim(),password:data.password})});
      stage.token=result.accessToken;sessionStorage.setItem('haba_access_token',stage.token);await dashboard();return;
    }
    if(stage.step==='application') {
      const body={fullName:data.fullName,dateOfBirth:data.dateOfBirth,countyOrRegion:data.countyOrRegion,workStatus:data.workStatus,employer:data.employer,occupation:data.occupation,monthlyIncomeKes:Number(data.monthlyIncomeKes)};
      const result=await request('/v1/applications',{method:'POST',body:JSON.stringify(body)});stage.applicationId=result.id;stage.step='references'; references(); return;
    }
    if(stage.step==='references') {
      const contacts=[1,2].map(n=>({name:data[`name${n}`],phone:data[`phone${n}`],relationship:data[`relationship${n}`]}));
      await request(`/v1/applications/${stage.applicationId}/references`,{method:'PUT',body:JSON.stringify({contacts,applicantsConfirmedPermission:true})});stage.step='consent'; consents(); return;
    }
    if(stage.step==='consent') {
      const purposes=['application_processing','credit_bureau_check','reference_contact'];
      for(const purpose of purposes) await request(`/v1/applications/${stage.applicationId}/consents`,{method:'POST',body:JSON.stringify({purpose,noticeVersion:'ke-2026-01',accepted:data[purpose]==='on'})});
      const result=await request(`/v1/applications/${stage.applicationId}/submit`,{method:'POST',body:'{}'});stage.step='submitted';shell('Application received','Status: '+result.status,'A credit result is shown only after Haba is authorized and a regulated provider has reviewed the application.','<div class="data-box"><p>We do not use SMS or call-log history to score you.</p></div>');return;
    }
  } catch (e) { if(e.message==='unauthorized'){sessionStorage.removeItem('haba_access_token');stage.token='';landing(await request('/v1/product-status'));return;} error(explain(e.message)); }
}
async function dashboard() {
  stage.step='dashboard';setStatus('ready','ACCOUNT');
  let available=false;try{available=(await request('/v1/product-status')).applicationEnabled;}catch{}
  shell('Your account','Account secured','Your sign-in token is stored only for this browser session.',`<div class="data-box"><strong>Loan service</strong><p>${available?'Applications are open. Any credit review or payment depends on a separate provider connection.':'Haba is not yet authorized to accept loan applications in Kenya. No credit check, loan decision, or payment is available.'}</p></div><div class="button-row">${available?'<button class="button button-dark" data-action="apply">Start application</button>':''}<button class="button button-light" data-action="logout">Sign out</button></div>`);
}
function applicationForm() {
  const works='<select id="workStatus" name="workStatus" required><option value="">Choose one</option><option value="employed">Employed</option><option value="self_employed">Self-employed</option><option value="casual">Casual or seasonal</option><option value="student">Student</option><option value="unemployed">Not currently working</option></select>';
  shell('Application · About you','Tell us about yourself','Provide the details needed for this application. Do not submit information about someone else here.',form(`${field('Full legal name','fullName')}${field('Date of birth','dateOfBirth','date')}${field('County or region','countyOrRegion')}${field('Monthly income in KES','monthlyIncomeKes','number','min="0" step="1" inputmode="numeric"')}<div class="field"><label>Work status *</label>${works}</div>${field('Employer or business','employer')}${field('Role or occupation','occupation')}`,'Continue'));
}
function references() {
  const relation='<select name="REL" required><option value="">Choose one</option><option value="family">Family</option><option value="friend">Friend</option><option value="colleague">Colleague</option><option value="neighbour">Neighbour</option><option value="other">Other</option></select>';
  const card=n=>`<fieldset class="ref-card"><legend>Reference ${n}</legend><button type="button" class="button button-light pick-contact" data-contact="${n}">Choose from contacts</button><div class="field-grid">${field('Full name',`name${n}`)}${field('Kenyan mobile number',`phone${n}`,'tel','inputmode="tel" placeholder="+254700000000"')}<div class="field full"><label>Relationship *</label>${relation.replace('REL',`relationship${n}`)}</div></div></fieldset>`;
  shell('References','Two people you trust','Choose two contacts individually from your phone if your browser supports the contact picker, or enter their details. Haba does not upload your address book.',form(card(1)+card(2),'Save references'));
  const pickers=[...panel.querySelectorAll('.pick-contact')];
  if(!('contacts' in navigator) || !window.ContactsManager) pickers.forEach(button=>button.hidden=true);
  for(const button of pickers) button.addEventListener('click',async()=>{
    try {
      const supported=await navigator.contacts.getProperties();
      const props=['name','tel'].filter(p=>supported.includes(p));
      const chosen=await navigator.contacts.select(props,{multiple:true});
      if(!chosen.length)return;
      const index=Number(button.dataset.contact);
      const item=chosen[0];
      const name=panel.querySelector(`[name="name${index}"]`);
      const phone=panel.querySelector(`[name="phone${index}"]`);
      if(name && item.name?.[0])name.value=item.name[0];
      if(phone && item.tel?.[0])phone.value=item.tel[0].replace(/[\s()-]/g,'');
    } catch { error('Contact selection was cancelled or is unavailable. You can enter the details yourself.'); }
  });
}
function consents() {
  const purpose=(key,title,copy)=>`<label class="check-row"><input type="checkbox" name="${key}" required><span><strong>${title}</strong><br>${copy}</span></label>`;
  shell('Review and consent','Choose what you agree to','Each purpose is recorded separately for this application.',form(`<div class="field full">${purpose('application_processing','Application processing','Use my details to process this loan application.')}${purpose('credit_bureau_check','Credit bureau check','Request a credit report from an authorized credit reference bureau.')}${purpose('reference_contact','Reference contacts','Contact the two references I provided for this application.')}</div>`,'Submit application'));
}
load();
