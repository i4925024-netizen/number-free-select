(() => {
  'use strict';

  const editor = document.getElementById('editor');
  const gutter = document.getElementById('gutter');
  const status = document.getElementById('status');
  const stats = document.getElementById('stats');
  const fileInput = document.getElementById('fileInput');
  const findPanel = document.getElementById('findPanel');
  const findInput = document.getElementById('findInput');
  const replaceInput = document.getElementById('replaceInput');

  let history = [];
  let historyIndex = -1;
  let lastSavedText = '';

  function getText() { return editor.innerText.replace(/\r\n/g, '\n'); }

  function setText(text, saveHistory = true) {
    editor.textContent = text;
    if (saveHistory) pushHistory();
    updateAll();
  }

  function pushHistory() {
    const text = getText();
    if (history[historyIndex] === text) return;
    history = history.slice(0, historyIndex + 1);
    history.push(text);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
  }

  function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    editor.textContent = history[historyIndex];
    placeCaretAtEndIfNeeded();
    updateAll();
  }

  function undo() { if (historyIndex > 0) restoreHistory(historyIndex - 1); }
  function redo() { if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1); }

  function placeCaretAtEndIfNeeded() {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function selectedText() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return '';
    return sel.toString();
  }

  function selectionLength() { return selectedText().length; }

  async function copySelection() {
    const text = selectedText();
    if (!text) return setStatus('Nothing selected');
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${text.length} characters`);
    } catch (_) {
      document.execCommand('copy');
      setStatus(`Copied ${text.length} characters`);
    }
  }

  function deleteSelection() {
    if (!selectedText()) return setStatus('Nothing selected');
    document.execCommand('delete');
    pushHistory();
    updateAll();
    setStatus('Selection deleted');
  }

  async function pasteText() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return setStatus('Clipboard is empty');
      document.execCommand('insertText', false, text);
      pushHistory();
      updateAll();
      setStatus('Pasted text');
    } catch (_) {
      setStatus('Use Ctrl+V to paste');
    }
  }

  async function cutSelection() {
    const text = selectedText();
    if (!text) return setStatus('Nothing selected');
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    document.execCommand('delete');
    pushHistory();
    updateAll();
    setStatus(`Cut ${text.length} characters`);
  }

  function replaceCurrent() {
    const find = findInput.value;
    const replacement = replaceInput.value;
    if (!find) return setStatus('Enter text to find');
    const current = selectedText();
    if (current === find) {
      document.execCommand('insertText', false, replacement);
      pushHistory(); updateAll(); setStatus('Replaced selection'); return;
    }
    findNext(false);
  }

  function findNext(forward = true) {
    const query = findInput.value;
    if (!query) return setStatus('Enter text to find');
    const text = getText();
    const sel = window.getSelection();
    let start = 0;
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      start = textIndexFromDomPoint(range.endContainer, range.endOffset);
    }
    let idx = forward ? text.indexOf(query, start) : text.lastIndexOf(query, Math.max(0, start - query.length - 1));
    if (idx < 0) idx = forward ? text.indexOf(query) : text.lastIndexOf(query);
    if (idx < 0) return setStatus('Not found');
    selectTextRange(idx, idx + query.length);
    setStatus(`Found at character ${idx + 1}`);
  }

  function textIndexFromDomPoint(node, offset) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    try { range.setEnd(node, offset); } catch (_) { return 0; }
    return range.toString().length;
  }

  function domPointFromTextIndex(index) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let remaining = index;
    let node;
    while ((node = walker.nextNode())) {
      if (remaining <= node.nodeValue.length) return { node, offset: remaining };
      remaining -= node.nodeValue.length;
    }
    return { node: editor, offset: editor.childNodes.length };
  }

  function selectTextRange(start, end) {
    const a = domPointFromTextIndex(start);
    const b = domPointFromTextIndex(end);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    editor.focus();
  }

  function replaceAll() {
    const find = findInput.value;
    if (!find) return setStatus('Enter text to find');
    const replacement = replaceInput.value;
    const text = getText();
    const count = text.split(find).length - 1;
    if (!count) return setStatus('Not found');
    setText(text.split(find).join(replacement));
    setStatus(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`);
  }

  function updateGutter() {
    const lines = Math.max(1, getText().split('\n').length);
    gutter.textContent = Array.from({length: lines}, (_, i) => i + 1).join('\n');
  }

  function updateStats() {
    const text = getText();
    const lines = text ? text.split('\n').length : 0;
    stats.textContent = `Lines: ${lines} | Characters: ${text.length} | Selected: ${selectionLength()}`;
  }

  function updateAll() { updateGutter(); updateStats(); }
  function setStatus(message) { status.textContent = message; updateStats(); }

  editor.addEventListener('input', () => { pushHistory(); updateAll(); setStatus('Edited'); });
  editor.addEventListener('keyup', updateAll);
  editor.addEventListener('mouseup', updateAll);
  editor.addEventListener('touchend', updateAll, {passive: true});

  document.addEventListener('keydown', (e) => {
    if (!editor.contains(document.activeElement) && document.activeElement !== editor) return;
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); redo(); return; }
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '    '); pushHistory(); updateAll(); }
  });

  document.getElementById('openBtn').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    setText(text);
    lastSavedText = text;
    setStatus(`Opened ${file.name}`);
    fileInput.value = '';
  };

  document.getElementById('saveBtn').onclick = () => {
    const blob = new Blob([getText()], {type: 'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'number-free-select.txt';
    a.click();
    URL.revokeObjectURL(a.href);
    lastSavedText = getText();
    setStatus('TXT saved');
  };

  document.getElementById('copyBtn').onclick = copySelection;
  document.getElementById('cutBtn').onclick = cutSelection;
  document.getElementById('pasteBtn').onclick = pasteText;
  document.getElementById('deleteBtn').onclick = deleteSelection;
  document.getElementById('selectAllBtn').onclick = () => { editor.focus(); const r=document.createRange(); r.selectNodeContents(editor); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); updateAll(); setStatus('All text selected'); };
  document.getElementById('clearBtn').onclick = () => { if (confirm('Clear all text?')) { setText(''); setStatus('Editor cleared'); } };
  document.getElementById('findBtn').onclick = () => { findPanel.classList.toggle('hidden'); if (!findPanel.classList.contains('hidden')) findInput.focus(); };
  document.getElementById('closeFindBtn').onclick = () => findPanel.classList.add('hidden');
  document.getElementById('findNextBtn').onclick = () => findNext(true);
  document.getElementById('findPrevBtn').onclick = () => findNext(false);
  document.getElementById('replaceBtn').onclick = replaceCurrent;
  document.getElementById('replaceAllBtn').onclick = replaceAll;
  document.getElementById('themeBtn').onclick = () => { document.body.classList.toggle('dark'); localStorage.setItem('nfs-dark', document.body.classList.contains('dark') ? '1' : '0'); };

  if (localStorage.getItem('nfs-dark') === '1') document.body.classList.add('dark');
  editor.focus();
  pushHistory();
  updateAll();
})();
