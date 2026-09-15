import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { auth } from "../assets/js/firebase-config.js";

const LOGIN_EMAIL = 'admin@ana.studio';
const OTP_EMAIL = 'atlantiscorp.top1@gmail.com';
// Set this to the secure HTTPS gateway origin when the OTP backend is deployed.
const SECURITY_API = '';
const $ = id => document.getElementById(id);
const loginForm = $('loginForm'), otpForm = $('otpForm'), authorizeView = $('authorizeView');
const password = $('password'), loginButton = $('loginButton'), loginMessage = $('loginMessage');
const otpInputs = [...document.querySelectorAll('#otpInputs input')];

function message(el, text, type=''){ el.textContent=text; el.className=`form-message ${type}`; }
function stage(n){
  ['progressLogin','progressOtp','progressDone'].forEach((id,i)=>{const el=$(id); el.classList.toggle('active',i===n-1); el.classList.toggle('done',i<n-1);});
  $('authCard').classList.remove('stage-enter'); void $('authCard').offsetWidth; $('authCard').classList.add('stage-enter');
}
function showOtp(){
  loginForm.classList.add('hidden'); authorizeView.classList.add('hidden'); otpForm.classList.remove('hidden');
  $('authTitle').textContent='Verify your identity'; $('authSubtitle').textContent='A second verification is required before SSH authorization.'; stage(2); otpInputs[0].focus();
}
function showAuthorize(){
  loginForm.classList.add('hidden'); otpForm.classList.add('hidden'); authorizeView.classList.remove('hidden');
  $('authTitle').textContent='SSH authorization'; $('authSubtitle').textContent='Authentication complete.'; stage(3);
}

$('togglePassword').addEventListener('click',()=>{ const visible=password.type==='text'; password.type=visible?'password':'text'; $('togglePassword').textContent=visible?'Show':'Hide'; });

loginForm.addEventListener('submit', async e=>{
  e.preventDefault(); if(!password.value) return;
  loginButton.disabled=true; loginButton.textContent='Signing in…'; message(loginMessage,'Verifying admin@ana.studio…');
  try{
    if(auth.currentUser && (auth.currentUser.email||'').toLowerCase()===LOGIN_EMAIL){
      const cred=EmailAuthProvider.credential(LOGIN_EMAIL,password.value); await reauthenticateWithCredential(auth.currentUser,cred);
    } else { await signInWithEmailAndPassword(auth,LOGIN_EMAIL,password.value); }
    password.value=''; showOtp(); message($('otpMessage'),`Send a 6-digit code to ${OTP_EMAIL}.`);
  }catch(err){ message(loginMessage,'Sign-in failed. Check the password and try again.','error'); }
  finally{ loginButton.disabled=false; loginButton.textContent='Sign in securely'; }
});

otpInputs.forEach((input,i)=>{
  input.addEventListener('input',()=>{ input.value=input.value.replace(/\D/g,'').slice(0,1); if(input.value&&i<5) otpInputs[i+1].focus(); $('verifyOtp').disabled=otpInputs.map(x=>x.value).join('').length!==6; });
  input.addEventListener('keydown',e=>{ if(e.key==='Backspace'&&!input.value&&i>0) otpInputs[i-1].focus(); });
  input.addEventListener('paste',e=>{ const code=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,6); if(code.length){e.preventDefault(); code.split('').forEach((c,j)=>{if(otpInputs[j])otpInputs[j].value=c}); $('verifyOtp').disabled=code.length!==6; otpInputs[Math.min(code.length,5)].focus();} });
});

$('sendOtp').addEventListener('click', async ()=>{
  const btn=$('sendOtp'); btn.disabled=true; btn.textContent='Sending…';
  try{
    if(!SECURITY_API) throw new Error('backend-unavailable');
    const token=await auth.currentUser.getIdToken(true);
    const r=await fetch(`${SECURITY_API}/api/ssh/otp/request`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({purpose:'remote-ssh'})});
    if(!r.ok) throw new Error('request-failed'); message($('otpMessage'),`Code sent to ${OTP_EMAIL}. It expires in 5 minutes.`,'success');
  }catch(err){ message($('otpMessage'),'OTP backend belum terhubung. Tampilan sudah siap; server mail/OTP perlu diaktifkan.','error'); }
  finally{ btn.disabled=false; btn.textContent='Send verification code'; }
});

otpForm.addEventListener('submit', async e=>{
  e.preventDefault(); const code=otpInputs.map(x=>x.value).join(''); if(code.length!==6)return;
  const btn=$('verifyOtp'); btn.disabled=true; btn.textContent='Verifying…';
  try{
    if(!SECURITY_API) throw new Error('backend-unavailable');
    const token=await auth.currentUser.getIdToken();
    const r=await fetch(`${SECURITY_API}/api/ssh/otp/verify`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({code,purpose:'remote-ssh'})});
    if(!r.ok) throw new Error('verify-failed'); showAuthorize();
  }catch(err){ message($('otpMessage'),'Verification service belum tersedia. OTP tidak disimulasikan di frontend.','error'); btn.disabled=false; btn.textContent='Verify & authorize'; }
});

$('backLogin').addEventListener('click',()=>{ otpForm.classList.add('hidden'); loginForm.classList.remove('hidden'); $('authTitle').textContent='Sign in to Remote SSH'; $('authSubtitle').textContent='Authenticate with the privileged SSH workspace account.'; stage(1); password.focus(); });
