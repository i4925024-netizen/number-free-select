(() => {
  'use strict';
  const DB_NAME='wa_contact_manager_v6',STORE='contacts',BATCH=20;
  const $=id=>document.getElementById(id);
  let selectedAccount=null, accounts=[];
  const digits=v=>String(v||'').replace(/\D/g,'');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const toast=m=>{const e=$('toast');if(!e)return;e.textContent=m;e.classList.add('show');clearTimeout(window.__syncToastTimer);window.__syncToastTimer=setTimeout(()=>e.classList.remove('show'),3000)};
  function plugin(){return window.Capacitor?.Plugins?.CapacitorContacts||window.Capacitor?.Plugins?.Contacts||null}
  function progress(text,p){$('syncProgress')?.classList.remove('hidden');if($('syncText'))$('syncText').textContent=text;if($('syncBar'))$('syncBar').style.width=Math.max(0,Math.min(100,p))+'%'}
  function dbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  function dbAll(db){return new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
  function dbPutMany(db,arr){return new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite'),s=t.objectStore(STORE);for(const c of arr)s.put(c);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
  function accountKey(a){return `${a?.type||''}::${a?.name||''}`}
  function accountLabel(a){const n=a?.name||'Unnamed account',t=a?.type||'Account';return `${n} (${t})`}
  async function requestAccess(p){try{let x=await p.checkPermissions?.();const read=x?.readContacts||x?.contacts,write=x?.writeContacts||x?.contacts;if(read!=='granted'||write!=='granted'){x=await p.requestPermissions?.()}return x}catch(e){return null}}
  async function getNative(p){const r=await p.getContacts({fields:['id','givenName','familyName','fullName','note','phoneNumbers','account']});return r?.contacts||[]}
  function nativePhone(c){return (c?.phoneNumbers||c?.phones||[]).map(x=>digits(x?.value??x?.number)).filter(n=>n.length>=7)}
  async function showAccounts(){
    const p=plugin();if(!p)return toast('Install the new APK first.');
    try{
      const perm=await requestAccess(p);const read=perm?.readContacts||perm?.contacts;if(read&&read!=='granted')return toast('Contacts permission is required.');
      const r=await p.getAccounts();accounts=r?.accounts||[];
      const box=$('accountList');if(!box)return;
      if(!accounts.length){box.innerHTML='<div class="muted">No Android contact accounts were returned. Add a Google/device account in Android Contacts settings first.</div>';$('accountModal')?.classList.remove('hidden');return}
      if(!selectedAccount||!accounts.some(a=>accountKey(a)===accountKey(selectedAccount)))selectedAccount=accounts[0];
      box.innerHTML=accounts.map((a,i)=>`<label class="accountOption"><input type="radio" name="syncAccount" value="${i}" ${accountKey(a)===accountKey(selectedAccount)?'checked':''}><span><span class="accountMain">${escapeHtml(a.name||'Unnamed account')}</span><span class="accountType">${escapeHtml(a.type||'Account')}</span></span></label>`).join('');
      box.querySelectorAll('input').forEach(r=>r.addEventListener('change',()=>selectedAccount=accounts[Number(r.value)]));
      $('accountModal')?.classList.remove('hidden');
    }catch(e){console.error(e);toast('Could not read Android contact accounts.')}
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
  async function syncSelected(){
    const p=plugin();if(!p)return toast('Install the new APK first.');if(!selectedAccount)return toast('Select an account first.');
    $('accountModal')?.classList.add('hidden');$('syncBtn')?.setAttribute('disabled','disabled');
    try{
      progress('Checking Contacts permission…',2);const perm=await requestAccess(p);const write=perm?.writeContacts||perm?.contacts;if(write&&write!=='granted')throw new Error('permission');
      progress('Reading phone contacts…',8);const phone=await getNative(p);const existing=new Set();for(const c of phone)for(const n of nativePhone(c))existing.add(n);
      const db=await dbOpen();const local=(await dbAll(db)).filter(c=>!c.deleted&&digits(c.phone).length>=7);const unique=[],seen=new Set();for(const c of local){const n=digits(c.phone);if(!seen.has(n)){seen.add(n);unique.push(c)}}
      const missing=unique.filter(c=>!existing.has(digits(c.phone)));let created=0,failed=0;
      if(!missing.length){progress('Everything is already synced.',100);await sleep(500);$('syncProgress')?.classList.add('hidden');toast(`${unique.length} contacts already present`);return}
      for(let start=0;start<missing.length;start+=BATCH){const batch=missing.slice(start,start+BATCH);for(const c of batch){try{await p.createContact({contact:{givenName:String(c.name||'Unnamed Contact'),note:c.note||'',phoneNumbers:[{type:'MOBILE',value:String(c.phone||''),isPrimary:true}],account:{name:selectedAccount.name,type:selectedAccount.type}}});existing.add(digits(c.phone));created++}catch(e){failed++}}progress(`Saving ${Math.min(start+batch.length,missing.length)} of ${missing.length}…`,15+(Math.min(start+batch.length,missing.length)/missing.length)*82);await new Promise(requestAnimationFrame)}
      progress('Sync complete',100);await sleep(600);$('syncProgress')?.classList.add('hidden');toast(`Saved ${created} to ${accountLabel(selectedAccount)}${failed?` • ${failed} failed`:''}`);
    }catch(e){console.error(e);$('syncProgress')?.classList.add('hidden');toast(e.message==='permission'?'Contacts write permission denied.':'Phone sync failed.')}
    finally{$('syncBtn')?.removeAttribute('disabled')}
  }
  async function importPhone(){
    const p=plugin();if(!p)return toast('Install the new APK first.');$('deviceBtn')?.setAttribute('disabled','disabled');
    try{progress('Requesting Contacts permission…',3);const perm=await requestAccess(p);const read=perm?.readContacts||perm?.contacts;if(read&&read!=='granted')throw new Error('permission');progress('Reading phone contacts…',12);const native=await getNative(p);const db=await dbOpen();const local=await dbAll(db);const seen=new Set(local.map(c=>digits(c.phone)).filter(Boolean));const incoming=[];for(const c of native){const phones=nativePhone(c);if(!phones.length)continue;const name=c.fullName||[c.givenName,c.familyName].filter(Boolean).join(' ')||'Unnamed Contact';for(const n of phones){if(seen.has(n))continue;seen.add(n);incoming.push({id:'c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9),name,phone:n,note:c.note||'',deleted:false,updatedAt:Date.now(),nameLower:name.toLowerCase()})}}if(incoming.length)await dbPutMany(db,incoming);db.close();progress(`Imported ${incoming.length} new phone contacts`,100);await sleep(500);$('syncProgress')?.classList.add('hidden');toast(`Imported ${incoming.length} contacts from phone`);window.dispatchEvent(new Event('contacts:changed'))}catch(e){console.error(e);$('syncProgress')?.classList.add('hidden');toast(e.message==='permission'?'Contacts read permission denied.':'Could not import phone contacts.')}finally{$('deviceBtn')?.removeAttribute('disabled')}
  }
  window.addEventListener('DOMContentLoaded',()=>{
    $('syncBtn')?.addEventListener('click',showAccounts);
    $('accountCancelBtn')?.addEventListener('click',()=>$('accountModal')?.classList.add('hidden'));
    $('accountSyncBtn')?.addEventListener('click',syncSelected);
    $('deviceBtn')?.addEventListener('click',importPhone);
    $('accountModal')?.addEventListener('click',e=>{if(e.target===$('accountModal'))$('accountModal').classList.add('hidden')});
  });
})();
