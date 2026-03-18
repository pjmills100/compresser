/* Compressor — compress files or a folder, auto-download */

const filesZone  = document.getElementById('filesZone');
const folderZone = document.getElementById('folderZone');
const filesInput = document.getElementById('filesInput');
const folderInput= document.getElementById('folderInput');
const statusArea = document.getElementById('statusArea');

let mode = 'files';

// ── Mode toggle ───────────────────────────────────────────────────────────────

document.getElementById('modeFiles').addEventListener('click', () => setMode('files'));
document.getElementById('modeFolder').addEventListener('click', () => setMode('folder'));

function setMode(m) {
  mode = m;
  document.getElementById('modeFiles').classList.toggle('active', m === 'files');
  document.getElementById('modeFolder').classList.toggle('active', m === 'folder');
  filesZone.style.display  = m === 'files'  ? '' : 'none';
  folderZone.style.display = m === 'folder' ? '' : 'none';
  statusArea.innerHTML = '';
}

// ── Files — drag & drop + click ───────────────────────────────────────────────

filesZone.addEventListener('dragover', e => { e.preventDefault(); filesZone.classList.add('over'); });
['dragleave','dragend'].forEach(ev => filesZone.addEventListener(ev, () => filesZone.classList.remove('over')));
filesZone.addEventListener('drop', e => {
  e.preventDefault(); filesZone.classList.remove('over');
  const files = [...e.dataTransfer.files];
  if (files.length) handleFiles(files);
});
filesZone.addEventListener('click', e => { if (!e.target.closest('label')) filesInput.click(); });
filesInput.addEventListener('change', () => { if (filesInput.files.length) handleFiles([...filesInput.files]); filesInput.value = ''; });

// ── Folder — drag & drop + click ─────────────────────────────────────────────

folderZone.addEventListener('dragover', e => { e.preventDefault(); folderZone.classList.add('over'); });
['dragleave','dragend'].forEach(ev => folderZone.addEventListener(ev, () => folderZone.classList.remove('over')));
folderZone.addEventListener('drop', e => {
  e.preventDefault(); folderZone.classList.remove('over');
  const items = [...(e.dataTransfer.items || [])];
  if (!items.length) return;
  // Use webkitGetAsEntry for full directory traversal
  if (items[0].webkitGetAsEntry) {
    const allFiles = [];
    let pending = items.length;
    items.forEach(item => {
      const entry = item.webkitGetAsEntry();
      if (!entry) { if (!--pending) handleFolder(allFiles); return; }
      readEntry(entry, '', () => { if (!--pending) handleFolder(allFiles); });
    });
    function readEntry(entry, path, done) {
      if (entry.isFile) {
        entry.file(f => {
          // Attach relative path for correct ZIP structure
          f._zipPath = path + f.name;
          allFiles.push(f);
          done();
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        let entries = [];
        const read = () => reader.readEntries(batch => {
          if (!batch.length) {
            let sub = entries.length;
            if (!sub) { done(); return; }
            entries.forEach(e => readEntry(e, path + entry.name + '/', () => { if (!--sub) done(); }));
          } else { entries = entries.concat([...batch]); read(); }
        });
        read();
      } else done();
    }
  } else {
    // Fallback: flat list
    handleFolder([...e.dataTransfer.files]);
  }
});
folderZone.addEventListener('click', e => { if (!e.target.closest('label')) folderInput.click(); });
folderInput.addEventListener('change', () => {
  if (folderInput.files.length) {
    const files = [...folderInput.files].map(f => {
      f._zipPath = f.webkitRelativePath || f.name;
      return f;
    });
    handleFolder(files);
  }
  folderInput.value = '';
});

// ── Handle Files (compress each individually) ─────────────────────────────────

async function handleFiles(files) {
  statusArea.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'status-card';
  statusArea.appendChild(card);

  const stats = { origTotal: 0, compTotal: 0 };

  for (const file of files) {
    const row = makeRow(file.name, file.size, 'pending');
    card.appendChild(row);
    stats.origTotal += file.size;

    try {
      const result = await compressFile(file);
      stats.compTotal += result.size;
      const saved = file.size - result.size;
      const pct = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
      updateRow(row, result.outName, result.size, pct);
      autoDownload(result.blob, result.outName);
    } catch (e) {
      updateRow(row, file.name, file.size, null, true);
      stats.compTotal += file.size;
    }
  }

  // Summary
  if (files.length > 1) {
    const saved = stats.origTotal - stats.compTotal;
    const pct = stats.origTotal > 0 ? Math.round((saved / stats.origTotal) * 100) : 0;
    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.style.marginTop = '10px';
    summary.innerHTML = `
      <div class="stat"><span class="stat-v">${fmtBytes(stats.origTotal)}</span><span class="stat-l">Original</span></div>
      <div class="stat"><span class="stat-v">${fmtBytes(stats.compTotal)}</span><span class="stat-l">Compressed</span></div>
      <div class="stat"><span class="stat-v">${fmtBytes(Math.abs(saved))}</span><span class="stat-l">Saved</span></div>
      <div class="stat"><span class="stat-v">${pct}%</span><span class="stat-l">Reduction</span></div>`;
    statusArea.appendChild(summary);
  }
}

// ── Handle Folder (zip everything into one file) ──────────────────────────────

async function handleFolder(files) {
  if (!files.length) return;
  statusArea.innerHTML = '';

  const folderName = (files[0]._zipPath || files[0].webkitRelativePath || files[0].name).split('/')[0] || 'folder';
  const outName = folderName + '.zip';

  const card = document.createElement('div');
  card.className = 'status-card';

  const row = makeRow(outName, null, 'pending', `Bundling ${files.length} files…`);
  card.appendChild(row);
  statusArea.appendChild(card);

  try {
    const zip = new JSZip();
    let totalSize = 0;
    for (const f of files) {
      zip.file(f._zipPath || f.webkitRelativePath || f.name, await f.arrayBuffer());
      totalSize += f.size;
    }

    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } },
      meta => { updateRowProgress(row, Math.round(meta.percent)); }
    );

    const saved = totalSize - blob.size;
    const pct = totalSize > 0 ? Math.round((saved / totalSize) * 100) : 0;
    updateRow(row, outName, blob.size, pct);
    autoDownload(blob, outName);

    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.style.marginTop = '10px';
    summary.innerHTML = `
      <div class="stat"><span class="stat-v">${fmtBytes(totalSize)}</span><span class="stat-l">Original</span></div>
      <div class="stat"><span class="stat-v">${fmtBytes(blob.size)}</span><span class="stat-l">ZIP size</span></div>
      <div class="stat"><span class="stat-v">${fmtBytes(Math.abs(saved))}</span><span class="stat-l">Saved</span></div>
      <div class="stat"><span class="stat-v">${pct}%</span><span class="stat-l">Reduction</span></div>`;
    statusArea.appendChild(summary);
  } catch (e) {
    updateRow(row, outName, 0, null, true);
  }
}

// ── Compress a single file ────────────────────────────────────────────────────

async function compressFile(file) {
  const ext = getExt(file.name).toLowerCase();
  const orig = file.size;

  // Images → re-encode to WebP
  if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) {
    const bm = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bm.width; c.height = bm.height;
    c.getContext('2d').drawImage(bm, 0, 0);
    const blob = await canvasToBlob(c, 'image/webp', 0.85);
    if (blob.size < orig) return { outName: replaceExt(file.name, 'webp'), size: blob.size, blob };
    return { outName: file.name, size: orig, blob: file };
  }

  // Text/code → minify then ZIP
  if (['js','css','html','htm','json','txt','svg','xml','csv','md'].includes(ext)) {
    let t = await file.text();
    try {
      if (ext === 'json') t = JSON.stringify(JSON.parse(t));
      else if (ext === 'js') t = t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/\s+/g,' ').trim();
      else if (ext === 'css') t = t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s*([{};:,>])\s*/g,'$1').replace(/\s+/g,' ').trim();
      else if (['html','htm','svg'].includes(ext)) t = t.replace(/<!--[\s\S]*?-->/g,'').replace(/\s+/g,' ').replace(/>\s+</g,'><').trim();
    } catch (_) {}
    const z = new JSZip();
    z.file(file.name, t);
    const blob = await z.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{level:9} });
    return { outName: file.name + '.zip', size: blob.size, blob };
  }

  // Everything else → ZIP
  const z = new JSZip();
  z.file(file.name, await file.arrayBuffer());
  const blob = await z.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{level:9} });
  return { outName: file.name + '.zip', size: blob.size, blob };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function thumbClass(name) {
  const ext = getExt(name).toLowerCase();
  if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return 't-img';
  if (['js','ts','css','html','htm','json','svg','xml','md'].includes(ext)) return 't-code';
  if (['csv','txt','log'].includes(ext)) return 't-data';
  return 't-zip';
}

function thumbLabel(name) {
  const ext = getExt(name).toLowerCase();
  if (ext === 'zip') return 'ZIP';
  return (ext.slice(0,4) || '—').toUpperCase();
}

function makeRow(name, size, state, metaText) {
  const row = document.createElement('div');
  row.className = 'status-row';
  row.innerHTML = `
    <div class="file-thumb ${thumbClass(name)}">${thumbLabel(name)}</div>
    <div class="row-info">
      <span class="row-name">${esc(name)}</span>
      <span class="row-meta">${metaText || (size != null ? fmtBytes(size) : '')}</span>
    </div>
    <div class="row-status">${state === 'pending' ? '<div class="spinner"></div>' : ''}</div>`;
  return row;
}

function updateRow(row, outName, size, pctSaved, isError) {
  row.querySelector('.row-name').textContent = outName;
  const meta = row.querySelector('.row-meta');
  if (isError) {
    meta.innerHTML = '<span style="color:var(--red-text)">Failed</span>';
  } else {
    const hasSavings = pctSaved != null && pctSaved > 0;
    meta.innerHTML = `${fmtBytes(size)} <span class="badge ${hasSavings ? '' : 'badge-none'}">${hasSavings ? '-' + pctSaved + '%' : 'no change'}</span>`;
  }
  const statusEl = row.querySelector('.row-status');
  statusEl.innerHTML = isError
    ? `<svg class="check" viewBox="0 0 18 18" fill="none" style="color:var(--red-text)"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
    : `<svg class="check" viewBox="0 0 18 18" fill="none"><path d="M3 9l4.5 4.5L15 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function updateRowProgress(row, pct) {
  const meta = row.querySelector('.row-meta');
  meta.textContent = `Compressing… ${pct}%`;
}

function autoDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function canvasToBlob(canvas, type, quality) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), type, quality));
}

function fmtBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

function getExt(n) { return n.includes('.') ? n.split('.').pop() : ''; }
function replaceExt(n, e) { return n.includes('.') ? n.slice(0, n.lastIndexOf('.')) + '.' + e : n + '.' + e; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
