(() => {
  'use strict';

  const DB_NAME = 'wa_contact_manager_v6';
  const STORE = 'contacts';
  const PAGE = 25;
  const $ = id => document.getElementById(id);

  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(window.__syncToastTimer);
    window.__syncToastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function getPlugin() {
    return window.Capacitor?.Plugins?.Contacts || null;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function getContactsFromDB(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  function setProgress(text, percent) {
    const wrap = $('syncProgress');
    const label = $('syncText');
    const bar = $('syncBar');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    if (label) label.textContent = text;
    if (bar) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
  }

  async function getNativeContacts(plugin) {
    const result = await plugin.getContacts({
      projection: {
        name: true,
        phones: true
      }
    });
    return result?.contacts || [];
  }

  function nativeNumbers(contact) {
    return (contact?.phones || []).map(p => digits(p?.number)).filter(n => n.length >= 7);
  }

  async function syncAll() {
    const plugin = getPlugin();
    if (!plugin) {
      toast('Native Contacts is available after installing the new APK.');
      return;
    }

    const button = $('syncBtn');
    if (button) button.disabled = true;

    try {
      setProgress('Requesting Contacts permission…', 3);
      let permissions = await plugin.checkPermissions();
      if (permissions?.contacts !== 'granted') {
        permissions = await plugin.requestPermissions();
      }
      if (permissions?.contacts !== 'granted') {
        setProgress('Permission denied', 100);
        await sleep(700);
        $('syncProgress')?.classList.add('hidden');
        toast('Contacts permission is required for phone sync.');
        return;
      }

      setProgress('Reading contacts already on the phone…', 8);
      const nativeContacts = await getNativeContacts(plugin);
      const existing = new Set();
      for (const c of nativeContacts) for (const n of nativeNumbers(c)) existing.add(n);

      setProgress('Reading contacts from this app…', 18);
      const db = await openDB();
      const local = (await getContactsFromDB(db)).filter(c => !c.deleted && digits(c.phone).length >= 7);
      db.close();

      // Deduplicate the app database by normalized phone number before syncing.
      const unique = [];
      const seenLocal = new Set();
      for (const c of local) {
        const n = digits(c.phone);
        if (!seenLocal.has(n)) {
          seenLocal.add(n);
          unique.push(c);
        }
      }

      const missing = unique.filter(c => !existing.has(digits(c.phone)));
      const total = missing.length;
      let created = 0;
      let failed = 0;
      let skipped = unique.length - total;

      if (!total) {
        setProgress('Everything is already in phone contacts.', 100);
        await sleep(700);
        $('syncProgress')?.classList.add('hidden');
        toast(`Sync complete • ${unique.length} already present`);
        return;
      }

      // The native plugin exposes one create operation at a time. A small
      // concurrency window keeps large imports responsive without flooding
      // Android's ContactsProvider.
      for (let start = 0; start < total; start += PAGE) {
        const batch = missing.slice(start, start + PAGE);
        await Promise.all(batch.map(async c => {
          try {
            const name = String(c.name || 'Unnamed Contact').trim() || 'Unnamed Contact';
            await plugin.createContact({
              contact: {
                name: { given: name },
                note: c.note || null,
                phones: [{ type: 'mobile', number: String(c.phone || ''), isPrimary: true }]
              }
            });
            created++;
            existing.add(digits(c.phone));
          } catch (e) {
            failed++;
          }
        }));
        const percent = 20 + ((start + batch.length) / total) * 78;
        setProgress(`Syncing ${Math.min(start + batch.length, total)} of ${total}…`, percent);
        await new Promise(requestAnimationFrame);
      }

      setProgress('Sync complete', 100);
      await sleep(700);
      $('syncProgress')?.classList.add('hidden');
      toast(`Synced ${created} new contacts • ${skipped} already present${failed ? ` • ${failed} failed` : ''}`);
    } catch (error) {
      console.error('Contact sync failed', error);
      $('syncProgress')?.classList.add('hidden');
      toast('Phone contact sync failed. Check Contacts permission.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    $('syncBtn')?.addEventListener('click', syncAll);
  });
})();
