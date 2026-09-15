import { onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { auth, ALLOWED_EMAIL } from "../assets/js/firebase-config.js";

const $ = (id) => document.getElementById(id);
const check = $('sessionCheck');
const account = $('account');
const password = $('password');
const reauthButton = $('reauthButton');
const reauthState = $('reauthState');
const reauthMessage = $('reauthMessage');
const gateMessage = $('gateMessage');
const progressText = $('progressText');
const progressBar = $('progressBar');
let currentUser = null;
const AUTHORIZATION_EMAIL = 'atlantiscorp.top1@gmail.com';

function setProgress(step){
  progressText.textContent = `${step} / 4`;
  progressBar.style.width = `${step * 25}%`;
  const titles = [
    'Waiting for dashboard session',
    'Confirm your identity',
    'Request email security code',
    'Approve SSH authorization'
  ];
  const subtitles = [
    'Your active ANASTUDIO dashboard identity must be verified first.',
    'Re-enter your dashboard password before requesting privileged access.',
    `The next security code will be routed to ${AUTHORIZATION_EMAIL}.`,
    'Final RBAC and short-lived gateway authorization are required before terminal access.'
  ];
  const active = Math.min(Math.max(step + (step < 4 ? 1 : 0), 1), 4);
  document.querySelectorAll('.journey-node').forEach((node, index) => {
    node.classList.toggle('done', index + 1 <= step);
    node.classList.toggle('active', index + 1 === active && step < 4);
  });
  document.querySelectorAll('.journey > b').forEach((line, index) => line.classList.toggle('done', index < step));
  document.querySelectorAll('.checkpoint').forEach((el, index) => el.classList.toggle('active-step', index + 1 === active && step < 4));
  const title = document.getElementById('checkpointTitle');
  const subtitle = document.getElementById('checkpointSubtitle');
  if (title) title.textContent = titles[Math.min(active - 1, 3)];
  if (subtitle) subtitle.textContent = subtitles[Math.min(active - 1, 3)];
  const panel = document.querySelectorAll('.checkpoint')[active - 1];
  if (panel && step < 4) { panel.classList.remove('flash-in'); void panel.offsetWidth; panel.classList.add('flash-in'); }
}


onAuthStateChanged(auth, (user) => {
  const allowed = user && (user.email || '').toLowerCase() === String(ALLOWED_EMAIL || '').toLowerCase();
  if (allowed) {
    currentUser = user;
    check.textContent = 'Verified';
    check.className = 'step-state verified';
    $('stepSession').classList.add('complete');
    account.value = user.email;
    password.disabled = false;
    reauthButton.disabled = false;
    reauthState.textContent = 'Required';
    reauthMessage.textContent = 'Confirm your identity to continue to the email security checkpoint.';
    gateMessage.textContent = 'Dashboard session verified. Re-authentication is required.';
    setProgress(1);
  } else {
    currentUser = null;
    check.textContent = 'Not authenticated';
    check.className = 'step-state failed';
    account.value = user?.email || 'No authorized session';
    password.disabled = true;
    reauthButton.disabled = true;
    reauthState.textContent = 'Locked';
    reauthMessage.textContent = 'Sign in with the authorized dashboard account first.';
    gateMessage.textContent = 'Return to the monitoring dashboard and sign in before opening Remote SSH.';
    setProgress(0);
  }
});

reauthButton.addEventListener('click', async () => {
  if (!currentUser || !password.value) return;
  reauthButton.disabled = true;
  password.disabled = true;
  reauthState.textContent = 'Verifying…';
  reauthState.className = 'step-state checking';
  reauthMessage.textContent = 'Verifying credentials with Firebase Authentication…';
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password.value);
    await reauthenticateWithCredential(currentUser, credential);
    password.value = '';
    reauthState.textContent = 'Verified';
    reauthState.className = 'step-state verified';
    $('stepReauth').classList.add('complete');
    $('stepOtp').classList.remove('locked');
    reauthMessage.textContent = 'Identity verified. Password was not stored.';
    gateMessage.textContent = `Identity verified. Authorization code must be requested through ${AUTHORIZATION_EMAIL}.`;
    $('otpState').textContent = 'Mail service required';
    $('otpMessage').textContent = `Authorization destination locked to ${AUTHORIZATION_EMAIL}. Connect the server-side OTP mail service to enable Request code.`;
    $('gateTitle').textContent = '2 of 4 checkpoints verified';
    setProgress(2);
  } catch (err) {
    reauthState.textContent = 'Failed';
    reauthState.className = 'step-state failed';
    reauthMessage.textContent = 'Re-authentication failed. Check the password and try again.';
    password.disabled = false;
    reauthButton.disabled = false;
    password.focus();
  }
});
