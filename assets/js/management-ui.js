export function initManagementUI(){
  const sidebar=document.querySelector('.sidebar');
  const toggle=document.getElementById('mobileNavToggle');
  const backdrop=document.getElementById('mobileNavBackdrop');
  const close=()=>{sidebar?.classList.remove('mobile-open');backdrop?.classList.remove('show')};
  toggle?.addEventListener('click',()=>{sidebar?.classList.toggle('mobile-open');backdrop?.classList.toggle('show')});
  backdrop?.addEventListener('click',close);
  document.querySelectorAll('.nav-item').forEach(x=>x.addEventListener('click',close));
  document.getElementById('alertBell')?.addEventListener('click',()=>document.querySelector('.nav-item[data-section="alerts"]')?.click());

  const tabs=[...document.querySelectorAll('[data-storage-jump]')];
  const panels={
    paths:['storagePathsWorkspace'],
    identities:['storageIdentityWorkspace'],
    smb:['storageSmbWorkspace'],
    audit:['storageAuditWorkspace']
  };
  const filesystem=document.querySelector('.storage-filesystem-panel');
  const allPanels=[...document.querySelectorAll('#storage .storage-workspace-panel')];

  function showStorageTab(key){
    tabs.forEach(t=>t.classList.toggle('active',t.dataset.storageJump===key));
    allPanels.forEach(p=>p.classList.remove('storage-panel-active'));
    (panels[key]||panels.paths).forEach(id=>document.getElementById(id)?.classList.add('storage-panel-active'));
    if(key==='paths') filesystem?.classList.add('storage-panel-active');
    try{sessionStorage.setItem('anastudio-storage-tab',key)}catch{}
  }

  tabs.forEach(button=>button.addEventListener('click',()=>showStorageTab(button.dataset.storageJump)));
  let initial='paths';
  try{initial=sessionStorage.getItem('anastudio-storage-tab')||'paths'}catch{}
  if(!panels[initial]) initial='paths';
  showStorageTab(initial);
}
