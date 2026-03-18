/* ═══════════════════════════════════════════════
   Compressor — app.js
   Compress tab + Convert tab (Image, Data, Doc, Encode)
   ═══════════════════════════════════════════════ */

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById('tab-' + target).style.display = 'flex';
    document.getElementById('tab-' + target).style.flexDirection = 'column';
    document.getElementById('tab-' + target).style.gap = '1.25rem';
  });
});

// ── Converter card switching ──────────────────────────────────────────────────

document.querySelectorAll('.converter-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.converter-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    document.querySelectorAll('.converter-panel').forEach(p => p.style.display = 'none');
    document.getElementById('converter-' + card.dataset.converter).style.display = 'flex';
    document.getElementById('converter-' + card.dataset.converter).style.flexDirection = 'column';
    document.getElementById('converter-' + card.dataset.converter).style.gap = '1rem';
  });
});

// ════════════════════════════════════════════════
// COMPRESS TAB
// ════════════════════════════════════════════════

// ── Compress mode toggle (Files / Folder) ────────────────────────────────────

let compressMode = 'files';

document.getElementById('modeFiles').addEventListener('click', () => setCompressMode('files'));
document.getElementById('modeFolder').addEventListener('click', () => setCompressMode('folder'));

function setCompressMode(mode) {
  compressMode = mode;
  document.getElementById('modeFiles').classList.toggle('active', mode === 'files');
  document.getElementById('modeFolder').classList.toggle('active', mode === 'folder');
  document.getElementById('compressDropZone').style.display = mode === 'files' ? '' : 'none';
  document.getElementById('folderDropZone').style.display  = mode === 'folder' ? '' : 'none';
  // Reset both queues/results when switching
  compressFiles = [];
  renderCompressQueue();
  crs.style.display = 'none';
}

// Folder input
document.getElementById('folderInput').addEventListener('change', function() {
  if (!this.files.length) return;
  handleFolderFiles([...this.files]);
  this.value = '';
});

// Folder drag & drop
const fdz = document.getElementById('folderDropZone');
fdz.addEventListener('dragover', e => { e.preventDefault(); fdz.classList.add('over'); });
['dragleave','dragend'].forEach(ev => fdz.addEventListener(ev, () => fdz.classList.remove('over')));
fdz.addEventListener('drop', e => {
  e.preventDefault(); fdz.classList.remove('over');
  // Try to get files from dataTransfer (works for folders dropped in browser)
  const items = [...(e.dataTransfer.items || [])];
  const fileEntries = [];
  let pending = 0;
  const collected = [];
  if (items.length && items[0].webkitGetAsEntry) {
    items.forEach(item => {
      const entry = item.webkitGetAsEntry();
      if (!entry) return;
      pending++;
      readEntry(entry, '', () => { pending--; if (pending === 0) handleFolderFiles(collected); });
    });
    function readEntry(entry, path, done) {
      if (entry.isFile) {
        entry.file(f => { Object.defineProperty(f, 'relativePath', { value: path + f.name }); collected.push(f); done(); });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = () => reader.readEntries(entries => {
          if (!entries.length) { done(); return; }
          let sub = entries.length;
          entries.forEach(e => readEntry(e, path + entry.name + '/', () => { sub--; if (!sub) readAll(); }));
        });
        readAll();
      } else done();
    }
  } else {
    // Fallback: flat file list from drag
    handleFolderFiles([...e.dataTransfer.files]);
  }
});
fdz.addEventListener('click', e => { if (!e.target.closest('label')) document.getElementById('folderInput').click(); });

async function handleFolderFiles(files) {
  if (!files.length) return;
  // Show queue
  cqs.style.display = 'flex';
  cqc.textContent = files.length;
  cfl.innerHTML = '';
  // Preview list
  const folderName = (files[0].webkitRelativePath || files[0].relativePath || files[0].name).split('/')[0] || 'folder';
  const header = document.createElement('div');
  header.className = 'file-row';
  header.style.background = 'var(--surface-2)';
  header.innerHTML = `
    <div class="file-thumb zip" style="flex-shrink:0">ZIP</div>
    <div class="file-info">
      <span class="file-name">${esc(folderName)}.zip</span>
      <span class="file-meta">${files.length} file${files.length!==1?'s':''} will be bundled</span>
    </div>`;
  cfl.appendChild(header);

  // Action buttons
  document.getElementById('compressAllBtn').onclick = async () => {
    document.getElementById('compressAllBtn').disabled = true;
    document.getElementById('compressAllBtn').textContent = 'Zipping…';
    crs.style.display = 'flex'; crs.style.flexDirection = 'column'; crs.style.gap = '10px';
    csg.innerHTML = '';
    crl.innerHTML = `<div class="loading-row"><div class="spinner"></div>Bundling ${files.length} files into ZIP…</div>`;

    const zip = new JSZip();
    let totalSize = 0;
    for (const f of files) {
      const rel = f.webkitRelativePath || f.relativePath || f.name;
      zip.file(rel, await f.arrayBuffer());
      totalSize += f.size;
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const saved = totalSize - blob.size;
    const pct = totalSize > 0 ? Math.round((saved / totalSize) * 100) : 0;
    csg.innerHTML = `
      <div class="stat"><span class="stat-v">${fmtBytes(totalSize)}</span><span class="stat-l">Original</span></div>
      <div class="stat"><span class="stat-v">${fmtBytes(blob.size)}</span><span class="stat-l">ZIP size</span></div>
      <div class="stat"><span class="stat-v">${fmtBytes(Math.abs(saved))}</span><span class="stat-l">Saved</span></div>
      <div class="stat"><span class="stat-v">${pct}%</span><span class="stat-l">Reduction</span></div>`;
    const url = URL.createObjectURL(blob);
    crl.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="file-thumb zip" style="flex-shrink:0">ZIP</div>
      <div class="file-info" style="flex:1;min-width:0">
        <span class="file-name">${esc(folderName)}.zip</span>
        <span class="file-meta">${fmtBytes(blob.size)} <span class="badge">${files.length} files · -${pct}%</span></span>
      </div>
      <a class="dl-btn" href="${url}" download="${esc(folderName)}.zip">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M6 8l-3-3M6 8l3-3M1 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Download ZIP
      </a>`;
    crl.appendChild(row);
    document.getElementById('compressAllBtn').disabled = false;
    document.getElementById('compressAllBtn').textContent = 'Compress all';
  };
}

// ── Compress files ────────────────────────────────────────────────────────────

const cdz  = document.getElementById('compressDropZone');
const cfi  = document.getElementById('compressFileInput');
const cqs  = document.getElementById('compressQueue');
const cfl  = document.getElementById('compressFileList');
const cqc  = document.getElementById('compressCount');
const cab  = document.getElementById('compressAllBtn');
const ccl  = document.getElementById('compressClearBtn');
const crs  = document.getElementById('compressResults');
const csg  = document.getElementById('compressStats');
const crl  = document.getElementById('compressResultList');

let compressFiles = [];

cdz.addEventListener('dragover', e => { e.preventDefault(); cdz.classList.add('over'); });
['dragleave','dragend'].forEach(ev => cdz.addEventListener(ev, () => cdz.classList.remove('over')));
cdz.addEventListener('drop', e => { e.preventDefault(); cdz.classList.remove('over'); addCompressFiles([...e.dataTransfer.files]); });
cdz.addEventListener('click', e => { if (e.target !== cfi) cfi.click(); });
cfi.addEventListener('change', () => { addCompressFiles([...cfi.files]); cfi.value = ''; });

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

function addCompressFiles(newFiles) {
  newFiles.forEach(f => compressFiles.push({ id: crypto.randomUUID(), file: f }));
  renderCompressQueue();
}

function renderCompressQueue() {
  cfl.innerHTML = '';
  cqc.textContent = compressFiles.length;
  if (!compressFiles.length) { cqs.style.display = 'none'; return; }
  cqs.style.display = 'flex';
  compressFiles.forEach(({ id, file }) => {
    const ext = getExt(file.name).toLowerCase();
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `
      <div class="file-thumb ${thumbClass(ext)}">${(ext.slice(0,4)||'FILE').toUpperCase()}</div>
      <div class="file-info">
        <span class="file-name" title="${esc(file.name)}">${esc(file.name)}</span>
        <span class="file-meta">${fmtBytes(file.size)} · ${methodLabel(ext)}</span>
      </div>
      <button class="file-rm" title="Remove">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>`;
    row.querySelector('.file-rm').addEventListener('click', () => {
      compressFiles = compressFiles.filter(f => f.id !== id);
      renderCompressQueue();
    });
    cfl.appendChild(row);
  });
}

ccl.addEventListener('click', () => {
  compressFiles = [];
  renderCompressQueue();
  crs.style.display = 'none';
  // restore default files-mode handler in case folder mode overwrote it
  cab.onclick = null;
});

async function compressAllHandler() {
  if (!compressFiles.length) return;
  cab.disabled = true; cab.textContent = 'Working…';
  crs.style.display = 'flex'; crs.style.flexDirection = 'column'; crs.style.gap = '10px';
  csg.innerHTML = '';
  crl.innerHTML = `<div class="loading-row"><div class="spinner"></div>Processing ${compressFiles.length} file${compressFiles.length > 1 ? 's' : ''}…</div>`;
  const results = [];
  for (const { file } of compressFiles) results.push(await compressFile(file));
  renderCompressResults(results);
  cab.disabled = false; cab.textContent = 'Compress all';
}
cab.addEventListener('click', compressAllHandler);

async function compressFile(file) {
  const ext = getExt(file.name).toLowerCase();
  const orig = file.size;
  try {
    if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return await compressImg(file, orig);
    if (['js','css','html','htm','json','txt','svg','xml','csv','md'].includes(ext)) return await compressText(file, orig);
    return await compressZip(file, orig);
  } catch (e) {
    return { name: file.name, outName: file.name, orig, size: orig, blob: file };
  }
}

async function compressImg(file, orig) {
  const bm = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bm.width; c.height = bm.height;
  c.getContext('2d').drawImage(bm, 0, 0);
  const blob = await canvasToBlob(c, 'image/webp', 0.85);
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

function renderCompressResults(results) {
  crl.innerHTML = '';
  const totalOrig = results.reduce((s,r) => s + r.orig, 0);
  const totalComp = results.reduce((s,r) => s + r.size, 0);
  const saved = totalOrig - totalComp;
  const pct = totalOrig > 0 ? Math.round((saved / totalOrig) * 100) : 0;
  csg.innerHTML = `
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
      <div class="file-thumb ${thumbClass(ext)}" style="flex-shrink:0">${(getExt(r.outName||r.name).slice(0,4)||'FILE').toUpperCase()}</div>
      <div class="file-info" style="flex:1;min-width:0">
        <span class="file-name">${esc(r.outName||r.name)}</span>
        <span class="file-meta">${fmtBytes(r.size)} <span class="badge ${savings>0?'':'none'}">${savings>0?'-'+sp+'%':'no change'}</span></span>
      </div>
      <a class="dl-btn" href="${url}" download="${esc(r.outName||r.name)}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M6 8l-3-3M6 8l3-3M1 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Download
      </a>`;
    crl.appendChild(row);
  });
}

// ════════════════════════════════════════════════
// CONVERT — IMAGE
// ════════════════════════════════════════════════

let imageFiles = [];
let imageTargetFmt = { mime: 'image/jpeg', ext: 'jpg' };
let imageQuality = 0.90;

const imgDz   = document.getElementById('imageDropZone');
const imgFi   = document.getElementById('imageFileInput');
const imgList = document.getElementById('imageConvertList');
const imgFoot = document.getElementById('imageConvertFoot');
const imgConv = document.getElementById('imageConvertBtn');
const imgClr  = document.getElementById('imageClearBtn');
const imgRes  = document.getElementById('imageResultList');
const imgQSlider = document.getElementById('imageQuality');
const imgQVal    = document.getElementById('imageQualityVal');
const imgQRow    = document.getElementById('imageQualityRow');

imgDz.addEventListener('dragover', e => { e.preventDefault(); imgDz.classList.add('over'); });
['dragleave','dragend'].forEach(ev => imgDz.addEventListener(ev, () => imgDz.classList.remove('over')));
imgDz.addEventListener('drop', e => { e.preventDefault(); imgDz.classList.remove('over'); addImageFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))); });
imgDz.addEventListener('click', e => { if (e.target !== imgFi) imgFi.click(); });
imgFi.addEventListener('change', () => { addImageFiles([...imgFi.files]); imgFi.value = ''; });

imgQSlider.addEventListener('input', () => {
  imageQuality = parseInt(imgQSlider.value) / 100;
  imgQVal.textContent = imgQSlider.value + '%';
});

// Hide quality for PNG (lossless)
document.getElementById('imageFormatGroup').querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('imageFormatGroup').querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    imageTargetFmt = { mime: btn.dataset.fmt, ext: btn.dataset.ext };
    imgQRow.style.display = btn.dataset.ext === 'png' ? 'none' : 'flex';
  });
});

function addImageFiles(files) {
  files.forEach(f => imageFiles.push({ id: crypto.randomUUID(), file: f }));
  renderImageQueue();
}

function renderImageQueue() {
  imgList.innerHTML = '';
  if (!imageFiles.length) { imgList.style.display = 'none'; imgFoot.style.display = 'none'; imgRes.style.display = 'none'; return; }
  imgList.style.display = '';
  imgFoot.style.display = 'flex';
  imageFiles.forEach(({ id, file }) => {
    const row = document.createElement('div');
    row.className = 'image-queue-row';
    const src = URL.createObjectURL(file);
    row.innerHTML = `
      <img class="img-preview" src="${src}" alt="" />
      <div class="file-info" style="flex:1;min-width:0">
        <span class="file-name">${esc(file.name)}</span>
        <span class="file-meta" style="font-size:11px;color:var(--text-3)">${fmtBytes(file.size)}</span>
      </div>
      <button class="file-rm" data-id="${id}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>`;
    row.querySelector('.file-rm').addEventListener('click', () => {
      imageFiles = imageFiles.filter(f => f.id !== id);
      renderImageQueue();
    });
    imgList.appendChild(row);
  });
}

imgClr.addEventListener('click', () => { imageFiles = []; renderImageQueue(); });

imgConv.addEventListener('click', async () => {
  if (!imageFiles.length) return;
  imgConv.disabled = true; imgConv.textContent = 'Converting…';
  imgRes.style.display = '';
  imgRes.innerHTML = `<div class="loading-row"><div class="spinner"></div>Converting ${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''}…</div>`;
  const results = [];
  for (const { file } of imageFiles) {
    try {
      const bm = await createImageBitmap(file);
      const c = document.createElement('canvas');
      c.width = bm.width; c.height = bm.height;
      c.getContext('2d').drawImage(bm, 0, 0);
      const quality = imageTargetFmt.ext === 'png' ? undefined : imageQuality;
      const blob = await canvasToBlob(c, imageTargetFmt.mime, quality);
      results.push({ name: file.name, outName: replaceExt(file.name, imageTargetFmt.ext), origSize: file.size, newSize: blob.size, blob });
    } catch (e) {
      results.push({ name: file.name, outName: file.name, origSize: file.size, newSize: file.size, blob: file, err: true });
    }
  }
  imgRes.innerHTML = '';
  results.forEach(r => {
    const url = URL.createObjectURL(r.blob);
    const savings = r.origSize - r.newSize;
    const sp = r.origSize > 0 ? Math.round((savings / r.origSize) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="file-thumb img" style="flex-shrink:0">${imageTargetFmt.ext.toUpperCase()}</div>
      <div class="file-info" style="flex:1;min-width:0">
        <span class="file-name">${esc(r.outName)}</span>
        <span class="file-meta">${fmtBytes(r.newSize)} <span class="badge ${savings>0?'':'none'}">${savings>0?'-'+sp+'%':'no change'}</span></span>
      </div>
      <a class="dl-btn" href="${url}" download="${esc(r.outName)}">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M6 8l-3-3M6 8l3-3M1 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Download
      </a>`;
    imgRes.appendChild(row);
  });
  imgConv.disabled = false; imgConv.textContent = 'Convert all';
});

// ════════════════════════════════════════════════
// CONVERT — DATA (CSV ↔ JSON ↔ XML)
// ════════════════════════════════════════════════

let dataInputFmt = 'csv';
let dataOutputFmt = 'xml';

setupFmtGroup('dataInputGroup',  v => { dataInputFmt = v;  syncDataFormats(); });
setupFmtGroup('dataOutputGroup', v => { dataOutputFmt = v; });

function syncDataFormats() {
  // Prevent same input/output
  document.getElementById('dataOutputGroup').querySelectorAll('.fmt-btn').forEach(b => {
    b.disabled = b.dataset.fmt === dataInputFmt;
    if (b.dataset.fmt === dataInputFmt && b.classList.contains('active')) {
      b.classList.remove('active');
      const first = [...document.getElementById('dataOutputGroup').querySelectorAll('.fmt-btn')].find(x => x.dataset.fmt !== dataInputFmt);
      if (first) { first.classList.add('active'); dataOutputFmt = first.dataset.fmt; }
    }
  });
}

document.getElementById('dataFileInput').addEventListener('change', async function() {
  if (!this.files[0]) return;
  document.getElementById('dataInput').value = await this.files[0].text();
  this.value = '';
});

document.getElementById('dataConvertBtn').addEventListener('click', () => {
  const input = document.getElementById('dataInput').value.trim();
  const errEl = document.getElementById('dataError');
  const dlBtn = document.getElementById('dataDownloadBtn');
  errEl.textContent = '';
  if (!input) { errEl.textContent = 'Paste some data first.'; return; }
  try {
    let parsed;
    if (dataInputFmt === 'csv') parsed = csvToObj(input);
    else if (dataInputFmt === 'json') parsed = JSON.parse(input);
    else if (dataInputFmt === 'xml') parsed = xmlToObj(input);

    let output;
    if (dataOutputFmt === 'json') output = JSON.stringify(parsed, null, 2);
    else if (dataOutputFmt === 'csv') output = objToCsv(parsed);
    else if (dataOutputFmt === 'xml') output = objToXml(parsed);

    document.getElementById('dataOutput').value = output;
    dlBtn.style.display = '';
    dlBtn.onclick = () => downloadText(output, 'converted.' + dataOutputFmt, mimeForFmt(dataOutputFmt));
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
  }
});

// CSV helpers
function csvToObj(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new Error('Empty CSV');
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] ?? '');
    return obj;
  });
}

function parseCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function objToCsv(data) {
  if (!Array.isArray(data) || !data.length) throw new Error('Expected an array of objects for CSV output');
  const headers = Object.keys(data[0]);
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  return [headers.join(','), ...data.map(row => headers.map(h => escape(row[h])).join(','))].join('\n');
}

// XML helpers
function objToXml(data, rootTag = 'root', itemTag = 'item') {
  const toXml = (val, tag) => {
    if (Array.isArray(val)) return val.map(v => toXml(v, itemTag)).join('\n');
    if (typeof val === 'object' && val !== null) {
      const inner = Object.entries(val).map(([k, v]) => toXml(v, k)).join('\n');
      return `<${tag}>\n${inner}\n</${tag}>`;
    }
    return `<${tag}>${escXml(String(val ?? ''))}</${tag}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${toXml(data, rootTag)}`;
}

function escXml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function xmlToObj(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML');
  const nodeToObj = node => {
    const children = [...node.children];
    if (!children.length) return node.textContent.trim();
    const names = children.map(c => c.tagName);
    const unique = [...new Set(names)];
    if (unique.length === 1 && names.length > 1) return children.map(nodeToObj);
    const obj = {};
    children.forEach(c => {
      const k = c.tagName;
      const v = nodeToObj(c);
      if (obj[k] !== undefined) {
        if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
        obj[k].push(v);
      } else obj[k] = v;
    });
    return obj;
  };
  return nodeToObj(doc.documentElement);
}

// ════════════════════════════════════════════════
// CONVERT — DOCUMENT (Markdown / HTML / Text)
// ════════════════════════════════════════════════

let docInputFmt = 'markdown';
let docOutputFmt = 'html';

setupFmtGroup('docInputGroup',  v => { docInputFmt = v;  syncDocFormats(); });
setupFmtGroup('docOutputGroup', v => { docOutputFmt = v; });

function syncDocFormats() {
  document.getElementById('docOutputGroup').querySelectorAll('.fmt-btn').forEach(b => {
    b.disabled = b.dataset.fmt === docInputFmt;
    if (b.dataset.fmt === docInputFmt && b.classList.contains('active')) {
      b.classList.remove('active');
      const first = [...document.getElementById('docOutputGroup').querySelectorAll('.fmt-btn')].find(x => x.dataset.fmt !== docInputFmt);
      if (first) { first.classList.add('active'); docOutputFmt = first.dataset.fmt; }
    }
  });
}

document.getElementById('docFileInput').addEventListener('change', async function() {
  if (!this.files[0]) return;
  document.getElementById('docInput').value = await this.files[0].text();
  this.value = '';
});

document.getElementById('docConvertBtn').addEventListener('click', () => {
  const input = document.getElementById('docInput').value.trim();
  const errEl = document.getElementById('docError');
  const dlBtn = document.getElementById('docDownloadBtn');
  errEl.textContent = '';
  if (!input) { errEl.textContent = 'Paste a document first.'; return; }
  try {
    let output;
    if (docInputFmt === 'markdown' && docOutputFmt === 'html') output = markdownToHtml(input);
    else if (docInputFmt === 'markdown' && docOutputFmt === 'text') output = stripMarkdown(input);
    else if (docInputFmt === 'html' && docOutputFmt === 'text') output = htmlToText(input);
    else if (docInputFmt === 'html' && docOutputFmt === 'markdown') output = htmlToMarkdown(input);
    else if (docInputFmt === 'text' && docOutputFmt === 'html') output = textToHtml(input);
    else if (docInputFmt === 'text' && docOutputFmt === 'markdown') output = input; // plain text is valid markdown
    else output = input;

    document.getElementById('docOutput').value = output;
    const ext = docOutputFmt === 'html' ? 'html' : docOutputFmt === 'markdown' ? 'md' : 'txt';
    dlBtn.style.display = '';
    dlBtn.onclick = () => downloadText(output, 'converted.' + ext, mimeForFmt(ext));
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
  }
});

// Markdown → HTML
function markdownToHtml(md) {
  let html = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^#{6} (.+)$/gm,'<h6>$1</h6>')
    .replace(/^#{5} (.+)$/gm,'<h5>$1</h5>')
    .replace(/^#{4} (.+)$/gm,'<h4>$1</h4>')
    .replace(/^#{3} (.+)$/gm,'<h3>$1</h3>')
    .replace(/^#{2} (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/!\[(.+?)\]\((.+?)\)/g,'<img alt="$1" src="$2" />')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>')
    .replace(/^---+$/gm,'<hr />')
    .replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm,'<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
    .replace(/```[\w]*\n([\s\S]*?)```/g,'<pre><code>$1</code></pre>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>\n' + m + '</ul>\n');
  // Paragraphs
  html = html.split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr)/.test(block)) return block;
    return '<p>' + block.replace(/\n/g,' ') + '</p>';
  }).join('\n');
  return html;
}

function stripMarkdown(md) {
  return md
    .replace(/^#{1,6} /gm,'')
    .replace(/\*\*(.+?)\*\*/g,'$1')
    .replace(/\*(.+?)\*/g,'$1')
    .replace(/`(.+?)`/g,'$1')
    .replace(/!\[(.+?)\]\(.+?\)/g,'$1')
    .replace(/\[(.+?)\]\(.+?\)/g,'$1')
    .replace(/^[-*] /gm,'• ')
    .replace(/```[\w]*\n([\s\S]*?)```/g,'$1')
    .trim();
}

function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.innerText || d.textContent || '';
}

function htmlToMarkdown(html) {
  return htmlToText(html); // Basic fallback
}

function textToHtml(text) {
  return text.split(/\n{2,}/).map(p => '<p>' + esc(p.replace(/\n/g,' ')) + '</p>').join('\n');
}

// ════════════════════════════════════════════════
// CONVERT — ENCODE
// ════════════════════════════════════════════════

let encodeMode = 'base64-encode';
setupFmtGroup('encodeGroup', v => { encodeMode = v; });

document.getElementById('encodeConvertBtn').addEventListener('click', () => {
  const input = document.getElementById('encodeInput').value;
  const errEl = document.getElementById('encodeError');
  const dlBtn = document.getElementById('encodeDownloadBtn');
  errEl.textContent = '';
  if (!input) { errEl.textContent = 'Paste some text first.'; return; }
  try {
    let output;
    if (encodeMode === 'base64-encode') output = btoa(unescape(encodeURIComponent(input)));
    else if (encodeMode === 'base64-decode') output = decodeURIComponent(escape(atob(input)));
    else if (encodeMode === 'url-encode') output = encodeURIComponent(input);
    else if (encodeMode === 'url-decode') output = decodeURIComponent(input);
    else if (encodeMode === 'html-encode') output = input.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    else if (encodeMode === 'html-decode') {
      const t = document.createElement('textarea'); t.innerHTML = input; output = t.value;
    }
    document.getElementById('encodeOutput').value = output;
    dlBtn.style.display = '';
    dlBtn.onclick = () => downloadText(output, 'encoded.txt', 'text/plain');
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
  }
});

// ════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════

function setupFmtGroup(groupId, onChange) {
  document.getElementById(groupId).querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(groupId).querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.fmt);
    });
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), type, quality));
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mimeForFmt(fmt) {
  const map = { json: 'application/json', csv: 'text/csv', xml: 'application/xml', html: 'text/html', md: 'text/markdown', txt: 'text/plain' };
  return map[fmt] || 'text/plain';
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
