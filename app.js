/**
 * Squish — client-side file compressor
 */

const dz  = document.getElementById('dropZone');
const fi  = document.getElementById('fileInput');
const qs  = document.getElementById('queueSection');
const fl  = document.getElementById('fileList');
const qc  = document.getElementById('qCount');
const cb  = document.getElementById('compressBtn');
const clr = document.getElementById('clearBtn');
const rs  = document.getElementById('resultsSection');
const sg  = document.getElementById('statsGrid');
const rl  = document.getElementById('resultList');

let files = [];

// ── Drag & Drop ───────────────────────────────────────────────────────────────

dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
['dragleave', 'dragend'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('over')));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); add([...e.dataTransfer.files]); });
dz.addEventListener('click', e => { if (e.target !== fi) fi.click(); });
fi.addEventListener('change', () => { add([...fi.files]); fi.value = ''; });

// ── Queue ─────────────────────────────────────────────────────────────────────

function thumbClass(ext) {
  if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return 'img';
  if (['js','ts','css','html','htm','json','svg','xml','md'].includes(ext)) return 'code';
  if (['csv','txt','log'].includes(ext)) return 'data';
  return 'zip';
}

function methodLabel(ext) {
  if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return 'Image → WebP';
  if (['js','css','html','htm','json','svg'].includes(ext)) return 'Minify + ZIP';
  return 'ZIP';
}

function add(newFiles) {
  newFiles.forEach(f => files.push({ id: crypto.randomUUID(), file: f }));
  render();
}

function render() {
  fl.innerHTML = '';
  qc.textContent = files.length;
  if (!files.length) { qs.style.display = 'none'; return; }
  qs.style.display = 'flex';

  files.forEach(({ id, file }) => {
    const ext = getExt(file.name).toLowerCase();
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `
      <div class="file-thumb ${thumbClass(ext)}">${(ext.slice(0,4) || 'FILE').toUpperCase()}</div>
      <div class="file-info">
        <span class="file-name" title="${esc(file.name)}">${esc(file.name)}</span>
        <span class="file-meta">${fmtBytes(file.size)} · ${methodLabel(ext)}</span>
      </div>
      <button class="file-rm" title="Remove">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>`;
    row.querySelector('.file-rm').addEventListener('click', () => {
      files = files.filter(f => f.id !== id);
      render();
    });
    fl.appendChild(row);
  });
}

clr.addEventListener('click', () => { files = []; render(); rs.style.display = 'none'; });

// ── Compress ──────────────────────────────────────────────────────────────────

cb.addEventListener('click', async () => {
  if (!files.length) return;
  cb.disabled = true;
  cb.textContent = 'Working…';
  rs.style.display = 'flex';
  sg.innerHTML = '';
  rl.innerHTML = `<div class="loading-row"><div class="spinner"></div>Processing ${files.length} file${files.length > 1 ? 's' : ''}…</div>`;

  const results = [];
  for (const { file } of files) results.push(await compress(file));

  showResults(results);
  cb.disabled = false;
  cb.textContent = 'Compress all';
});

async function compress(file) {
  const ext = getExt(file.name).toLowerCase();
  const orig = file.size;
  try {
    if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return await compressImg(file, orig);
    if (['js','css','html','htm','json','txt','svg','xml','csv','md'].includes(ext)) return await compressText(file, orig);
    return await compressZip(file, orig);
  } catch (e) {
    return { name: file.name, outName: file.name, orig, size: orig, blob: file, err: true };
  }
}

async function compressImg(file, orig) {
  const bm = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bm.width; c.height = bm.height;
  c.getContext('2d').drawImage(bm, 0, 0);
  const blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(), 'image/webp', 0.85));
  if (blob.size >= orig) return { name: file.name, outName: file.name, orig, size: orig, blob: file };
  return { name: file.name, outName: replaceExt(file.name, 'webp'), orig, size: blob.size, blob };
}

async function compressText(file, orig) {
  const ext = getExt(file.name).toLowerCase();
  let t = await file.text();
  try {
    if (ext === 'json') t = JSON.stringify(JSON.parse(t));
    else if (ext === 'js') t = t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/\s+/g,' ').trim();
    else if (ext === 'css') t = t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s*([{};:,>])\s*/g,'$1').replace(/\s+/g,' ').trim();
    else if (['html','htm','svg'].includes(ext)) t = t.replace(/<!--[\s\S]*?-->/g,'').replace(/\s+/g,' ').replace(/>\s+</g,'><').trim();
  } catch (_) {}
  const z = new JSZip();
  z.file(file.name, t);
  const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  return { name: file.name, outName: file.name + '.zip', orig, size: blob.size, blob };
}

async function compressZip(file, orig) {
  const z = new JSZip();
  z.file(file.name, await file.arrayBuffer());
  const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  return { name: file.name, outName: file.name + '.zip', orig, size: blob.size, blob };
}

// ── Results ───────────────────────────────────────────────────────────────────

function showResults(results) {
  rl.innerHTML = '';
  const totalOrig = results.reduce((s,r) => s + r.orig, 0);
  const totalComp = results.reduce((s,r) => s + r.size, 0);
  const saved = totalOrig - totalComp;
  const pct = totalOrig > 0 ? Math.round((saved / totalOrig) * 100) : 0;

  sg.innerHTML = `
    <div class="stat"><span class="stat-v">${fmtBytes(totalOrig)}</span><span class="stat-l">Original</span></div>
    <div class="stat"><span class="stat-v">${fmtBytes(totalComp)}</span><span class="stat-l">Compressed</span></div>
    <div class="stat"><span class="stat-v">${fmtBytes(Math.abs(saved))}</span><span class="stat-l">Saved</span></div>
    <div class="stat"><span class="stat-v">${pct}%</span><span class="stat-l">Reduction</span></div>`;

  results.forEach(r => {
    const savings = r.orig - r.size;
    const sp = r.orig > 0 ? Math.round((savings / r.orig) * 100) : 0;
    const url = URL.createObjectURL(r.blob);
    const ext = getExt(r.name).toLowerCase();
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="file-thumb ${thumbClass(ext)}" style="flex-shrink:0">${(getExt(r.outName || r.name).slice(0,4) || 'FILE').toUpperCase()}</div>
      <div class="file-info" style="flex:1;min-width:0">
        <span class="file-name">${esc(r.outName || r.name)}</span>
        <span class="file-meta" style="display:flex;align-items:center;gap:6px">
          ${fmtBytes(r.size)}
          <span class="badge ${savings > 0 ? '' : 'none'}">${savings > 0 ? '-' + sp + '%' : 'no change'}</span>
        </span>
      </div>
      <a class="dl-btn" href="${url}" download="${esc(r.outName || r.name)}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v7M6 8l-3-3M6 8l3-3M1 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Download
      </a>`;
    rl.appendChild(row);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}
function getExt(n) { return n.includes('.') ? n.split('.').pop() : ''; }
function replaceExt(n, e) { return n.includes('.') ? n.slice(0, n.lastIndexOf('.')) + '.' + e : n + '.' + e; }
function esc(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
