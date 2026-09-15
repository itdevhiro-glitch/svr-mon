import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { auth, ALLOWED_EMAIL } from "../assets/js/firebase-config.js";
const check=document.getElementById('sessionCheck');
onAuthStateChanged(auth,(user)=>{
  if(user && (user.email||'').toLowerCase()===ALLOWED_EMAIL){check.textContent='Verified';check.parentElement.classList.add('done');document.getElementById('account').value=user.email;}
  else{check.textContent='Not authenticated';check.style.color='#ff7d8e';document.getElementById('gateMessage').textContent='Sign in to the monitoring dashboard first, then reopen Remote SSH.';}
});
