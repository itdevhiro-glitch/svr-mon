export function initManagementUI(){
  const sidebar=document.querySelector('.sidebar');
  const toggle=document.getElementById('mobileNavToggle');
  const backdrop=document.getElementById('mobileNavBackdrop');
  const close=()=>{sidebar?.classList.remove('mobile-open');backdrop?.classList.remove('show')};
  toggle?.addEventListener('click',()=>{sidebar?.classList.toggle('mobile-open');backdrop?.classList.toggle('show')});
  backdrop?.addEventListener('click',close);
  document.querySelectorAll('.nav-item').forEach(x=>x.addEventListener('click',close));
  document.getElementById('alertBell')?.addEventListener('click',()=>document.querySelector('.nav-item[data-section="alerts"]')?.click());
}

// Storage workspace quick navigation (presentation only; privileged actions stay backend-gated).
document.querySelectorAll('[data-storage-jump]').forEach((button)=>{
  button.addEventListener('click',()=>{
    document.querySelectorAll('[data-storage-jump]').forEach(x=>x.classList.remove('active'));
    button.classList.add('active');
    const map={paths:'storagePathsWorkspace',identities:'storageIdentityWorkspace',smb:'storageSmbWorkspace',audit:'storageAuditWorkspace'};
    document.getElementById(map[button.dataset.storageJump])?.scrollIntoView({behavior:'smooth',block:'start'});
  });
});
