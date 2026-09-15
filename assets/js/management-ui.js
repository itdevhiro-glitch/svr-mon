import { toast } from "./utils.js";

function showPending(name){ toast(`${name}: management backend belum diaktifkan.`); }

export function initManagementUI(){
  const sidebar=document.querySelector('.sidebar');
  const toggle=document.getElementById('mobileNavToggle');
  const backdrop=document.getElementById('mobileNavBackdrop');
  const close=()=>{sidebar?.classList.remove('mobile-open');backdrop?.classList.remove('show')};
  toggle?.addEventListener('click',()=>{sidebar?.classList.toggle('mobile-open');backdrop?.classList.toggle('show')});
  backdrop?.addEventListener('click',close);
  document.querySelectorAll('.nav-item').forEach(x=>x.addEventListener('click',close));
  document.getElementById('alertBell')?.addEventListener('click',()=>document.querySelector('.nav-item[data-section="alerts"]')?.click());
  document.querySelectorAll('[data-demo-action]').forEach(b=>b.addEventListener('click',()=>showPending(b.dataset.demoAction)));
  document.querySelectorAll('[data-copy-smb]').forEach(b=>b.addEventListener('click',()=>{
    const user=document.getElementById('smbUserSelect')?.value || 'admin';
    const address=`smb://${user}@ZEROTIER-IP/${b.dataset.copySmb}`;
    navigator.clipboard?.writeText(address).then(()=>toast('SMB address copied. Connect ZeroTier first.')).catch(()=>showPending('Clipboard'));
    const preview=document.getElementById('smbPreview'); if(preview) preview.textContent=address;
  }));
  document.getElementById('copySmbPreview')?.addEventListener('click',()=>{
    const text=document.getElementById('smbPreview')?.textContent || '';
    navigator.clipboard?.writeText(text).then(()=>toast('SMB address copied. ZeroTier VPN is required.')).catch(()=>{});
  });
  document.getElementById('smbUserSelect')?.addEventListener('change',(e)=>{
    const preview=document.getElementById('smbPreview'); if(preview) preview.textContent=`smb://${e.target.value}@ZEROTIER-IP/Content`;
  });
}
