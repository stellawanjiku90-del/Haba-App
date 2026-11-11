const panel = document.querySelector('#stepPanel');
const progress = document.querySelector('#progressFill');
const count = document.querySelector('#stepCount');
const stepLabels = [...document.querySelectorAll('#stepNav span')];

const countries = [
  ['Kenya','+254','KES'],['Nigeria','+234','NGN'],['Ghana','+233','GHS'],['Uganda','+256','UGX'],['Tanzania','+255','TZS'],['South Africa','+27','ZAR'],['Rwanda','+250','RWF'],['Senegal','+221','XOF'],['Côte d’Ivoire','+225','XOF'],['Cameroon','+237','XAF'],['Zambia','+260','ZMW'],['Other','+','USD']
];
const state = { step: 0, values: {}, country: 0 };
const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currencyName = () => countries[state.country][2];
const money = (value) => new Intl.NumberFormat('en', {style:'currency',currency:currencyName(),maximumFractionDigits:0}).format(value);
const field = (label,name,options={}) => `<div class="field ${options.full?'full':''}"><label for="${name}">${label}${options.required===false?'':' *'}</label>${options.select?`<select id="${name}" name="${name}" ${options.required===false?'':'required'}>${options.select.map((v)=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>`:`<input id="${name}" name="${name}" type="${options.type||'text'}" ${options.attr||''} ${options.required===false?'':'required'} value="${escapeHtml(state.values[name]||'')}" placeholder="${options.placeholder||''}" autocomplete="${options.autocomplete||'off'}" />`}</div>`;
function formShell(kicker,title,copy,fields,buttons='') {
  return `<div class="panel-kicker">${kicker}</div><h3 class="panel-title">${title}</h3><p class="panel-copy">${copy}</p><form id="stepForm" novalidate><div class="field-grid">${fields}</div>${buttons}<div class="inline-alert" id="formError" hidden></div></form>`;
}
function buttons(back=false,next='Continue') {
  return `<div class="button-row">${back?'<button class="button button-light" type="button" data-back>Back</button>':'<span></span>'}<button class="button button-dark" type="submit">${next}<span aria-hidden="true">→</span></button></div>`;
}
function updateProgress() {
  const visualStep = Math.min(state.step, 6);
  count.textContent = `${String(visualStep+1).padStart(2,'0')} / 07`;
  progress.style.width = `${((visualStep+1)/7)*100}%`;
  stepLabels.forEach((label,index)=>label.classList.toggle('active',index===visualStep));
}
function render() {
  updateProgress();
  if(state.step===0) {
    const opts=countries.map((c,i)=>`<option value="${i}" ${i===state.country?'selected':''}>${c[0]} (${c[1]})</option>`).join('');
    panel.innerHTML=formShell('Step 1 · Phone','What’s your mobile number?','We’ll use it to identify your account. This prototype does not send a text message.',`<div class="field full"><label for="country">Country *</label><select id="country" name="country">${opts}</select></div>${field('Phone number','phone',{type:'tel',attr:'inputmode="tel"',placeholder:'700 000 000',autocomplete:'tel-national',full:true})}`,buttons(false,'Send demo code'));
  } else if(state.step===1) {
    panel.innerHTML=formShell('Step 1 · Verify','Enter your one-time code','A live app can send a verification code through an SMS provider and let you enter it here, without reading your inbox. For this demo, enter 246810; no SMS is sent.',field('6-digit demo code','otp',{type:'text',attr:'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"',placeholder:'246810',full:true}),buttons(true,'Verify number'));
  } else if(state.step===2) {
    panel.innerHTML=formShell('Step 2 · Secure','Create a password','Use at least 8 characters. Passwords in this demo stay in this page only and are cleared when you leave.',`${field('Password','password',{type:'password',attr:'minlength="8"',autocomplete:'new-password'})}${field('Confirm password','passwordConfirm',{type:'password',attr:'minlength="8"',autocomplete:'new-password'})}`,buttons(true,'Create account'));
  } else if(state.step===3) {
    panel.innerHTML=formShell('Step 3 · About you','Tell us a little about yourself','A real lender should explain why each detail is needed and how long it is kept.',`${field('Full name','fullName',{autocomplete:'name'})}${field('Date of birth','dob',{type:'date',autocomplete:'bday'})}${field('Country or region','region',{placeholder:'City or region'})}${field('Preferred language','language',{select:['English','French','Swahili','Arabic','Portuguese','Other']})}`,buttons(true,'Continue'));
  } else if(state.step===4) {
    panel.innerHTML=formShell('Step 4 · Work','What does your work look like?','Income is one part of an affordability review; this demo does not make a real credit decision.',`${field('Work status','workStatus',{select:['Employed','Self-employed','Casual or seasonal','Student','Not currently working']})}${field('Monthly income (approx.)','income',{type:'number',attr:'min="0" inputmode="decimal"',placeholder:'e.g. 50000'})}${field('Employer or business','employer',{required:false,placeholder:'Name of workplace or business'})}${field('Role or type of work','role',{required:false,placeholder:'e.g. shop owner'})}`,buttons(true,'Continue'));
  } else if(state.step===5) {
    panel.innerHTML=`<div class="panel-kicker">Step 5 · References</div><h3 class="panel-title">Two people you trust.</h3><p class="panel-copy">Add two reference contacts. This web demo cannot open your phonebook. In a real app, use a user-selected contact picker and tell each person how their details may be used.</p><form id="stepForm"><div class="ref-grid">${[1,2].map((n)=>`<fieldset class="ref-card"><legend>Reference ${n} <span>Required</span></legend><div class="field-grid">${field('Full name',`ref${n}Name`)}${field('Phone number',`ref${n}Phone`,{type:'tel',attr:'inputmode="tel"',placeholder:'+254 …'})}${field('Relationship',`ref${n}Relation`,{select:['Family','Friend','Colleague','Neighbour','Other'],full:true})}</div></fieldset>`).join('')}</div><label class="check-row"><input type="checkbox" name="refConsent" required /> <span>I have permission to share these people’s details and understand the lender may contact them.</span></label>${buttons(true,'Continue')}</form>`;
  } else if(state.step===6) {
    panel.innerHTML=`<div class="panel-kicker">Step 6 · Review and consent</div><h3 class="panel-title">Your data, your choice.</h3><p class="panel-copy">A real lender would need to describe the data it uses, why it needs it, and what happens if you decline before asking you to agree.</p><div class="data-box"><strong>SMS and phone signals</strong><p>This prototype does not access messages, call logs, contacts, installed apps, or other device data. Google Play restricts SMS and call-log permissions to narrow uses; broad SMS access for loan scoring may not qualify. A live app should verify OTP without inbox access and use an approved credit-data source for assessment.</p></div><div class="data-box"><strong>Credit review</strong><p>No credit bureau or phone-based score is checked here. Any real limit requires a validated model, affordability safeguards, local disclosures, and a way to challenge an outcome.</p></div><form id="stepForm"><label class="check-row"><input type="checkbox" name="dataConsent" required /> <span>I understand the limits of this demo and consent to continue through a simulated review. This does not grant access to my phone data.</span></label><label class="check-row"><input type="checkbox" name="refConsentConfirm" required /> <span>I have permission to provide the two reference contacts entered above.</span></label>${buttons(true,'See sample limit')}</form>`;
  } else {
    const phone=escapeHtml(state.values.phone||'');
    panel.innerHTML=`<div class="panel-kicker">Step 7 · Sample result</div><h3 class="panel-title">Here’s a demo limit.</h3><p class="panel-copy">This is a fixed example, not an assessment of your credit history or an offer to lend.</p><div class="limit-card"><label>Illustrative loan limit · ${currencyName()}</label><div class="limit-value">${money(25000)}</div><p>A real limit would be determined by the licensed lender using disclosed, permitted credit and affordability checks. Possible product range: ${money(500)} to ${money(100000)}.</p></div><div class="fee-row"><span>Example activation fee</span><strong>${money(100)}</strong></div><p class="fee-note">No payment is taken here. A real fee must be reviewed for your country, clearly disclosed with the total cost of credit, and processed by a secure payment provider. Do not pay a fee to unlock a loan until you have verified the lender and the terms.</p><div class="button-row"><button class="button button-light" type="button" data-back>Back</button><button class="button button-dark" type="button" disabled>Payment unavailable in demo</button></div><p class="helper">Account preview for ${phone}. Reload this page to clear the demo session.</p>`;
  }
  panel.querySelectorAll('[data-back]').forEach((button)=>button.addEventListener('click',()=>{state.step=Math.max(0,state.step-1);render()}));
  const form=panel.querySelector('#stepForm');
  if(form) form.addEventListener('submit',(event)=>{event.preventDefault();handleSubmit(form)});
  const countrySelect=panel.querySelector('#country');
  if(countrySelect) countrySelect.addEventListener('change',()=>{state.country=Number(countrySelect.value)});
}
function handleSubmit(form) {
  const error=form.querySelector('#formError');
  if(!form.reportValidity()) return;
  const values=Object.fromEntries(new FormData(form).entries());
  if(state.step===0){state.country=Number(values.country);state.values.phone=values.phone.trim();state.step=1;render();return}
  if(state.step===1){if(values.otp!=='246810'){error.hidden=false;error.textContent='That demo code does not match. Enter 246810 to continue.';return}state.step=2;render();return}
  if(state.step===2){if(values.password!==values.passwordConfirm){error.hidden=false;error.textContent='The passwords do not match.';return}if(!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(values.password)){error.hidden=false;error.textContent='For this demo, use 8 or more characters with at least one letter and one number.';return}state.step=3;render();return}
  for(const [key,value] of Object.entries(values)){if(!['password','passwordConfirm','otp','refConsent','dataConsent','refConsentConfirm'].includes(key))state.values[key]=value}
  if(state.step===3)state.step=4;else if(state.step===4)state.step=5;else if(state.step===5)state.step=6;else if(state.step===6)state.step=7;
  render();
}
render();

