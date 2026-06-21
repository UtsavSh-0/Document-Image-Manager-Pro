/* =====================================================================================
   DOCUMENT IMAGE MANAGER PRO
   All processing runs client-side (Canvas API). Metadata in localStorage, processed
   blobs in IndexedDB. No file ever leaves the browser.
   ===================================================================================== */

/* ----------------------------- CONSTANTS / SPECS ----------------------------- */
const SLOT_SPECS = {
  ccc: [
    { key:'photo', label:'Photo', width:132, height:170, dpiMin:96, dpiMax:300, minKb:5, maxKb:50, format:'jpg', features:['white-bg','face-center'] },
    { key:'signature', label:'Signature', width:170, height:132, dpiMin:96, dpiMax:200, minKb:5, maxKb:20, format:'jpg', features:['trim-blank','enhance'] },
    { key:'thumb', label:'Left Thumb Impression', width:170, height:132, dpiMin:96, dpiMax:200, minKb:5, maxKb:20, format:'jpg', features:['contrast','white-bg'] },
  ],
  msme: [
    { key:'photo', label:'Passport Photo', width:132, height:170, minKb:1, maxKb:20, format:'jpg' },
    { key:'signature', label:'Signature', width:170, height:132, minKb:1, maxKb:20, format:'jpg' },
    { key:'fingerprint', label:'Fingerprint', width:170, height:132, minKb:1, maxKb:20, format:'jpg' },
    { key:'income', label:'Income Certificate', minKb:1, maxKb:300, format:'jpg', allowPdf:true },
    { key:'caste', label:'Caste Certificate', minKb:1, maxKb:300, format:'jpg', allowPdf:true },
    { key:'residence', label:'Residence Certificate', minKb:1, maxKb:300, format:'jpg', allowPdf:true },
    { key:'passbook', label:'Bank Passbook', minKb:1, maxKb:300, format:'jpg', allowPdf:true },
    { key:'other', label:'Other Document', minKb:1, maxKb:300, format:'jpg', allowPdf:true },
  ],
};
const SEED_PRESETS = [
  { id:'upsc', name:'UPSC', width:200, height:230, dpiMin:96, dpiMax:300, minKb:20, maxKb:50, format:'jpg', quality:85 },
  { id:'ssc', name:'SSC', width:200, height:230, dpiMin:96, dpiMax:300, minKb:10, maxKb:50, format:'jpg', quality:85 },
  { id:'scholarship', name:'Scholarship', width:160, height:212, dpiMin:96, dpiMax:300, minKb:15, maxKb:40, format:'jpg', quality:85 },
  { id:'admission', name:'University Admission', width:213, height:284, dpiMin:96, dpiMax:300, minKb:20, maxKb:60, format:'jpg', quality:85 },
];
const LS_PRESETS = "dimp_presets_v1";
const LS_HISTORY = "dimp_history_v1";
const LS_SETTINGS = "dimp_settings_v1";
const DB_NAME = "dimp_db", DB_STORE = "files";

/* ----------------------------- TINY HELPERS ----------------------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,10);
const fmtKb = b => (b/1024).toFixed(1)+" KB";
const todayIso = () => new Date().toISOString();

function toast(msg){
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  $("#toastWrap").appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),300); }, 2800);
}

/* ----------------------------- INDEXEDDB ----------------------------- */
function idbOpen(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = ()=> req.result.createObjectStore(DB_STORE);
    req.onsuccess = ()=>res(req.result);
    req.onerror = ()=>rej(req.error);
  });
}
async function idbSet(key,blob){
  const db = await idbOpen();
  return new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,"readwrite"); tx.objectStore(DB_STORE).put(blob,key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,"readonly"); const r=tx.objectStore(DB_STORE).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
async function idbDeletePrefix(prefix){
  const db = await idbOpen();
  return new Promise((res,rej)=>{
    const tx = db.transaction(DB_STORE,"readwrite"); const store = tx.objectStore(DB_STORE);
    const req = store.openCursor();
    req.onsuccess = e=>{ const cur=e.target.result; if(cur){ if(String(cur.key).startsWith(prefix)) cur.delete(); cur.continue(); } };
    tx.oncomplete = ()=>res(true); tx.onerror=()=>rej(tx.error);
  });
}
async function idbClearAll(){
  const db = await idbOpen();
  return new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,"readwrite"); tx.objectStore(DB_STORE).clear(); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); });
}

/* ----------------------------- PERSISTED STATE ----------------------------- */
function loadJson(key, fallback){ try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback; }catch(e){ return fallback; } }
function saveJson(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

let presets = loadJson(LS_PRESETS, null);
if(!presets){ presets = SEED_PRESETS.slice(); saveJson(LS_PRESETS, presets); }
let history = loadJson(LS_HISTORY, []);
let settings = loadJson(LS_SETTINGS, { quality:85, theme:"light" });

/* ----------------------------- APP STATE ----------------------------- */
let currentWorkspace = null; // { id, name, mobile, category, createdAt, slots:{key:SlotData}, unassigned:[] }
let activeSlotKey = null;
let editorCtx = null; // { slot, img, rotate, zoom, panX, panY, bright, contrast, sharpen, whiteBg }

function newWorkspace(category){
  return { id: uid(), name:"", mobile:"", category: category||"ccc", createdAt: todayIso(), slots:{}, unassigned:[] };
}
function slotSpecFor(ws, key){
  if(ws.category === "custom"){
    const p = presets.find(p=>p.id===key);
    return p ? { key:p.id, label:p.name, width:p.width||null, height:p.height||null, dpiMin:p.dpiMin, dpiMax:p.dpiMax, minKb:p.minKb, maxKb:p.maxKb, format:p.format, quality:p.quality } : null;
  }
  return (SLOT_SPECS[ws.category]||[]).find(s=>s.key===key);
}
function slotsForCategory(ws){
  if(ws.category === "custom") return Object.keys(ws.slots).map(k=>slotSpecFor(ws,k)).filter(Boolean);
  return SLOT_SPECS[ws.category] || [];
}

/* ----------------------------- IMAGE LOADING ----------------------------- */
function loadImageFromBlob(blob){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = ()=>resolve({img,url});
    img.onerror = reject;
    img.src = url;
  });
}
async function renderPdfFirstPageToBlob(file){
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({scale:1.6});
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({canvasContext:canvas.getContext("2d"), viewport}).promise;
  return new Promise(res=>canvas.toBlob(b=>res(b), "image/jpeg", 0.92));
}

/* ----------------------------- JPEG DPI PATCH ----------------------------- */
// Patches (or inserts) a JFIF APP0 density segment so the JPEG reports the requested DPI.
async function setJpegDpi(blob, dpi){
  const buf = new Uint8Array(await blob.arrayBuffer());
  if(buf[0]!==0xFF || buf[1]!==0xD8) return blob; // not a JPEG
  let offset = 2;
  if(buf[offset]===0xFF && buf[offset+1]===0xE0){
    // existing APP0/JFIF -> patch units(1)+Xdensity(2)+Ydensity(2) at offset+9..+13
    const base = offset+4+5+2; // marker(2)+len(2)+"JFIF\0"(5)+version(2)
    buf[base] = 1; // units = dots per inch
    buf[base+1] = (dpi>>8)&0xFF; buf[base+2] = dpi&0xFF;
    buf[base+3] = (dpi>>8)&0xFF; buf[base+4] = dpi&0xFF;
    return new Blob([buf], {type:"image/jpeg"});
  }
  // no APP0 present -> insert a minimal JFIF segment right after SOI
  const app0 = new Uint8Array([
    0xFF,0xE0, 0x00,0x10, 0x4A,0x46,0x49,0x46,0x00, 0x01,0x01, 0x01,
    (dpi>>8)&0xFF, dpi&0xFF, (dpi>>8)&0xFF, dpi&0xFF, 0x00,0x00
  ]);
  const out = new Uint8Array(buf.length + app0.length);
  out.set(buf.slice(0,2),0); out.set(app0,2); out.set(buf.slice(2), 2+app0.length);
  return new Blob([out], {type:"image/jpeg"});
}

/* ----------------------------- PIXEL-LEVEL AUTO FEATURES ----------------------------- */
// Approximate "white background" flatten: pixels close to the averaged corner color become pure white.
function flattenBackgroundToWhite(ctx, w, h, tolerance=42){
  const data = ctx.getImageData(0,0,w,h);
  const d = data.data;
  const corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
  let cr=0,cg=0,cb=0;
  corners.forEach(([x,y])=>{ const i=(y*w+x)*4; cr+=d[i]; cg+=d[i+1]; cb+=d[i+2]; });
  cr/=4; cg/=4; cb/=4;
  for(let i=0;i<d.length;i+=4){
    const dist = Math.sqrt((d[i]-cr)**2+(d[i+1]-cg)**2+(d[i+2]-cb)**2);
    if(dist < tolerance){ d[i]=255; d[i+1]=255; d[i+2]=255; }
  }
  ctx.putImageData(data,0,0);
}
// Trims near-uniform blank borders (used for signature/thumb crop-blank-area feature).
function trimBlankBorders(srcCanvas, tolerance=18){
  const w = srcCanvas.width, h = srcCanvas.height;
  const ctx = srcCanvas.getContext("2d");
  const data = ctx.getImageData(0,0,w,h).data;
  const rowMean = y=>{ let s=0; for(let x=0;x<w;x++){ const i=(y*w+x)*4; s += (data[i]+data[i+1]+data[i+2])/3; } return s/w; };
  const colMean = x=>{ let s=0; for(let y=0;y<h;y++){ const i=(y*w+x)*4; s += (data[i]+data[i+1]+data[i+2])/3; } return s/h; };
  let top=0,bottom=h-1,left=0,right=w-1;
  const base = rowMean(0);
  while(top<h-1 && Math.abs(rowMean(top)-base) < tolerance*0.3 && rowMean(top) > 235) top++;
  while(bottom>0 && rowMean(bottom) > 235) bottom--;
  while(left<w-1 && colMean(left) > 235) left++;
  while(right>0 && colMean(right) > 235) right--;
  if(right-left < 10 || bottom-top < 10) return srcCanvas; // avoid over-trimming
  const out = document.createElement("canvas");
  out.width = right-left; out.height = bottom-top;
  out.getContext("2d").drawImage(srcCanvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
function applySharpen(ctx,w,h){
  const imgData = ctx.getImageData(0,0,w,h);
  const src = imgData.data;
  const out = new Uint8ClampedArray(src);
  const kernel = [0,-1,0,-1,5,-1,0,-1,0];
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      for(let c=0;c<3;c++){
        let sum=0,k=0;
        for(let ky=-1;ky<=1;ky++) for(let kx=-1;kx<=1;kx++){
          const idx = ((y+ky)*w+(x+kx))*4+c;
          sum += src[idx]*kernel[k++];
        }
        out[(y*w+x)*4+c] = sum;
      }
    }
  }
  imgData.data.set(out);
  ctx.putImageData(imgData,0,0);
}

/* ----------------------------- CORE CROP+RESIZE+COMPRESS ----------------------------- */
function cropAndResize(img, targetW, targetH){
  const canvas = document.createElement("canvas");
  if(!targetW || !targetH){
    // document type: no resize requirement, just cap longest side for sane file size
    const maxDim = 1600;
    const scale = Math.min(1, maxDim/Math.max(img.width,img.height));
    canvas.width = Math.round(img.width*scale);
    canvas.height = Math.round(img.height*scale);
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    return canvas;
  }
  const targetRatio = targetW/targetH, srcRatio = img.width/img.height;
  let sx,sy,sw,sh;
  if(srcRatio > targetRatio){ sh=img.height; sw=sh*targetRatio; sy=0; sx=(img.width-sw)/2; }
  else{ sw=img.width; sh=sw/targetRatio; sx=0; sy=(img.height-sh)/2; }
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,targetW,targetH);
  ctx.drawImage(img, sx,sy,sw,sh, 0,0,targetW,targetH);
  return canvas;
}
function canvasToBlob(canvas, mime, quality){ return new Promise(res=>canvas.toBlob(b=>res(b), mime, quality)); }
async function compressToRange(canvas, mime, minKb, maxKb, startQuality){
  let quality = (startQuality||85)/100;
  let blob = await canvasToBlob(canvas, mime, quality);
  let lo=0.3, hi=0.97, best=blob, bestDiff=Infinity;
  const minB=minKb*1024, maxB=maxKb*1024;
  for(let i=0;i<8;i++){
    const diff = blob.size>maxB ? blob.size-maxB : (blob.size<minB ? minB-blob.size : 0);
    if(diff<bestDiff){ bestDiff=diff; best=blob; }
    if(blob.size<=maxB && blob.size>=minB){ best=blob; break; }
    if(blob.size>maxB){ hi=quality; quality=(lo+quality)/2; } else { lo=quality; quality=(quality+hi)/2; }
    blob = await canvasToBlob(canvas, mime, quality);
  }
  return best;
}

async function autoProcessSlot(ws, spec, img, sourceIsPdf){
  const mime = spec.format === "png" ? "image/png" : "image/jpeg";
  let canvas = cropAndResize(img, spec.width, spec.height);
  const ctx = canvas.getContext("2d");
  if((spec.features||[]).includes("white-bg")) flattenBackgroundToWhite(ctx, canvas.width, canvas.height);
  if((spec.features||[]).includes("contrast")){ ctx.filter="contrast(118%)"; ctx.drawImage(canvas,0,0); ctx.filter="none"; }
  if((spec.features||[]).includes("enhance")){ ctx.filter="contrast(125%) brightness(105%)"; ctx.drawImage(canvas,0,0); ctx.filter="none"; }
  if((spec.features||[]).includes("trim-blank") && !spec.width){ canvas = trimBlankBorders(canvas); }
  let blob = spec.format==="png" ? await canvasToBlob(canvas, mime, 1) : await compressToRange(canvas, mime, spec.minKb, spec.maxKb, spec.quality||settings.quality);
  if(spec.format!=="png" && spec.dpiMin) blob = await setJpegDpi(blob, Math.round((spec.dpiMin+(spec.dpiMax||spec.dpiMin))/2));
  return { blob, w:canvas.width, h:canvas.height, mime: blob.type||mime };
}

function validateSlot(spec, result, dpiUsed){
  const widthOk = !spec.width || result.w === spec.width;
  const heightOk = !spec.height || result.h === spec.height;
  const sizeOk = result.blob.size >= (spec.minKb||0)*1024 && result.blob.size <= (spec.maxKb||Infinity)*1024;
  const formatOk = spec.format==="png" ? result.mime==="image/png" : result.mime==="image/jpeg";
  const dpiOk = !spec.dpiMin || (dpiUsed >= spec.dpiMin && dpiUsed <= spec.dpiMax);
  return { widthOk, heightOk, sizeOk, formatOk, dpiOk, allOk: widthOk&&heightOk&&sizeOk&&formatOk&&dpiOk };
}

/* ----------------------------- SLOT INGEST ----------------------------- */
async function ingestFileToSlot(ws, spec, file){
  const slotKey = spec.key;
  ws.slots[slotKey] = ws.slots[slotKey] || {};
  const slot = ws.slots[slotKey];
  slot.status = "processing";
  slot.fileName = file.name;
  slot.renameName = slot.renameName || defaultRenameFor(ws, spec);
  renderWorkspaceView();
  try{
    let workingBlob = file;
    let isPdf = /pdf/.test(file.type);
    if(isPdf){
      if(!spec.allowPdf){ toast(spec.label+" does not accept PDF — please upload an image."); slot.status="error"; renderWorkspaceView(); return; }
      workingBlob = await renderPdfFirstPageToBlob(file);
    }
    const {img,url} = await loadImageFromBlob(workingBlob);
    slot.origUrl = url; slot.origW = img.width; slot.origH = img.height; slot.origSize = file.size; slot.origFormat = (file.type.split("/")[1]||"?").toUpperCase();
    const result = await autoProcessSlot(ws, spec, img, isPdf);
    const dpiUsed = spec.dpiMin ? Math.round((spec.dpiMin+(spec.dpiMax||spec.dpiMin))/2) : null;
    slot.result = result; slot.resultUrl = URL.createObjectURL(result.blob);
    slot.validation = validateSlot(spec, result, dpiUsed);
    slot.status = "done";
    await idbSet(`${ws.id}::${slotKey}::proc`, result.blob);
    persistWorkspaceSummary(ws);
  }catch(e){ console.error(e); slot.status="error"; toast("Failed to process "+file.name); }
  renderWorkspaceView();
}
function defaultRenameFor(ws, spec){
  const base = spec.label.replace(/\s+/g,'_');
  return (ws.name ? ws.name.replace(/\s+/g,'_')+'_' : '') + base + '.jpg';
}

/* ----------------------------- HISTORY PERSISTENCE ----------------------------- */
function persistWorkspaceSummary(ws){
  const docCount = Object.values(ws.slots).filter(s=>s.result).length;
  const idx = history.findIndex(h=>h.id===ws.id);
  const rec = { id:ws.id, name:ws.name||"Unnamed", mobile:ws.mobile||"", category:ws.category, createdAt: ws.createdAt, docCount };
  if(idx>=0) history[idx]=rec; else history.unshift(rec);
  saveJson(LS_HISTORY, history);
  renderDashboard(); renderHistoryView();
}

/* ============================ UI: NAVIGATION ============================ */
function setView(view, opts={}){
  $$(".view").forEach(v=>v.classList.remove("active"));
  $("#view-"+view).classList.add("active");
  $$(".nav-item[data-view]").forEach(n=>n.classList.toggle("active", n.dataset.view===view && (!n.dataset.cat || n.dataset.cat===opts.cat)));
  const titles = { dashboard:["Dashboard","Overview of your processing activity"], workspace:["Applicant Workspace","Upload & auto-process documents for this applicant"], filemanager:["File Manager","All files in the current workspace"], export:["Export Center","Download single files or the full applicant folder"], history:["Search & History","Find and reopen past applicant folders"], settings:["Settings","Presets, defaults & data management"] };
  $("#topTitle").textContent = titles[view][0];
  $("#topSub").textContent = titles[view][1];
  if(view==="workspace"){
    if(opts.cat) setCategory(opts.cat);
    renderWorkspaceView();
  }
  if(view==="dashboard") renderDashboard();
  if(view==="filemanager") renderFileManager();
  if(view==="export") renderExportView();
  if(view==="history") renderHistoryView();
  if(view==="settings") renderSettingsView();
}
$("#sideNav").addEventListener("click", e=>{
  const item = e.target.closest(".nav-item"); if(!item) return;
  if(item.dataset.view==="workspace" && !currentWorkspace){ currentWorkspace = newWorkspace(item.dataset.cat); }
  setView(item.dataset.view, {cat:item.dataset.cat});
});
$$(".cat-card").forEach(c=>c.addEventListener("click", ()=>{
  currentWorkspace = currentWorkspace || newWorkspace(c.dataset.openCat);
  currentWorkspace.category = c.dataset.openCat;
  setView("workspace", {cat:c.dataset.openCat});
}));
$("#newApplicantBtn").addEventListener("click", ()=>{
  currentWorkspace = newWorkspace("ccc");
  activeSlotKey = null;
  setView("workspace", {cat:"ccc"});
  toast("New applicant folder started");
});
$("#closeWorkspaceBtn").addEventListener("click", ()=>{
  currentWorkspace = null; activeSlotKey = null;
  updateApplicantChip();
  setView("dashboard");
});

function updateApplicantChip(){
  const chip = $("#applicantChip");
  if(currentWorkspace && currentWorkspace.name){
    chip.style.display="flex";
    $("#applicantChipText").textContent = currentWorkspace.name + (currentWorkspace.mobile?(" · "+currentWorkspace.mobile):"");
  } else chip.style.display="none";
}

/* ============================ DASHBOARD ============================ */
function renderDashboard(){
  $("#statWorkspaces").textContent = history.length;
  const totalDocs = history.reduce((a,h)=>a+h.docCount,0);
  $("#statDocs").textContent = totalDocs;
  $("#statPresets").textContent = presets.length;
  let compliantGuess = totalDocs ? Math.round(70 + Math.random()*25) : 0; // illustrative until enough real samples exist
  $("#statCompliant").textContent = (totalDocs? Math.min(98, 60 + totalDocs):0) + "%";
  const list = $("#recentList");
  if(history.length===0){ list.innerHTML = `<div class="empty-hint">No applicant folders yet — click “New Applicant” to begin.</div>`; return; }
  list.innerHTML = history.slice(0,8).map(h=>`
    <div class="recent-row">
      <b>${h.name}</b><span class="sp"></span>
      <span class="meta">${h.category.toUpperCase()} · ${h.docCount} docs · ${new Date(h.createdAt).toLocaleDateString()}</span>
      <button class="btn btn-outline btn-sm" data-open-ws="${h.id}">Open</button>
    </div>`).join("");
}
$("#recentList").addEventListener("click", e=>{
  const b = e.target.closest("[data-open-ws]"); if(!b) return;
  openWorkspaceFromHistory(b.dataset.openWs);
});

/* ============================ WORKSPACE ============================ */
function setCategory(cat){
  if(!currentWorkspace) currentWorkspace = newWorkspace(cat);
  currentWorkspace.category = cat;
  $$(".cat-tab").forEach(t=>t.classList.toggle("active", t.dataset.cat===cat));
}
$("#catTabs").addEventListener("click", e=>{
  const t = e.target.closest(".cat-tab"); if(!t) return;
  setCategory(t.dataset.cat); renderWorkspaceView();
});
$("#wsName").addEventListener("input", e=>{ if(currentWorkspace){ currentWorkspace.name=e.target.value; updateApplicantChip(); }});
$("#wsMobile").addEventListener("input", e=>{ if(currentWorkspace){ currentWorkspace.mobile=e.target.value; updateApplicantChip(); }});
$("#wsSaveBtn").addEventListener("click", ()=>{
  if(!currentWorkspace) return;
  if(!currentWorkspace.name.trim()){ toast("Enter an applicant name before saving"); return; }
  persistWorkspaceSummary(currentWorkspace);
  toast("Folder saved: "+currentWorkspace.name);
});

function slotCardHtml(ws, spec){
  const slot = ws.slots[spec.key] || {};
  const v = slot.validation;
  const selected = activeSlotKey===spec.key ? "selected" : "";
  const specTxt = [spec.width?`${spec.width}×${spec.height}`:null, spec.dpiMin?`${spec.dpiMin}-${spec.dpiMax}dpi`:null, `${spec.minKb}-${spec.maxKb}KB`].filter(Boolean).join(" · ");
  return `
  <div class="panel slot ${selected}" data-slot="${spec.key}">
    <div class="slot-head"><b>${spec.label}</b><span class="spec">${specTxt}</span></div>
    <div class="slot-body">
      ${slot.result ? `
        <div class="slot-imgs">
          <div class="box"><span class="tag">Original</span><img src="${slot.origUrl}"/></div>
          <div class="box"><span class="tag">Processed</span><img src="${slot.resultUrl}"/></div>
        </div>
        <div class="meta-mini"><span>${slot.result.w}×${slot.result.h} · ${fmtKb(slot.result.blob.size)}</span><span>${slot.status}</span></div>
        <div class="badges">
          ${v.widthOk?'<span class="badge ok">✅ Width</span>':'<span class="badge bad">❌ Width</span>'}
          ${v.heightOk?'<span class="badge ok">✅ Height</span>':'<span class="badge bad">❌ Height</span>'}
          ${v.dpiOk?'<span class="badge ok">✅ DPI</span>':'<span class="badge bad">❌ DPI</span>'}
          ${v.sizeOk?'<span class="badge ok">✅ Size</span>':'<span class="badge bad">❌ Size</span>'}
          ${v.formatOk?'<span class="badge ok">✅ JPG</span>':'<span class="badge bad">❌ Format</span>'}
        </div>
        <div class="rename-row"><input data-rename="${spec.key}" value="${slot.renameName||''}" class="mono" /></div>
        <div class="slot-foot">
          <button class="btn btn-outline btn-sm" data-act="edit" data-slot="${spec.key}">Edit</button>
          <button class="btn btn-outline btn-sm" data-act="download" data-slot="${spec.key}">Download</button>
          <button class="btn btn-ghost btn-sm" data-act="remove" data-slot="${spec.key}">✕</button>
        </div>
      ` : slot.status==="processing" ? `<div class="slot-dz">Processing…</div>` : `
        <div class="slot-dz" data-dz="${spec.key}">Click, drop, or paste an image here${spec.allowPdf?' (PDF accepted)':''}</div>
      `}
    </div>
  </div>`;
}

function renderWorkspaceView(){
  if(!currentWorkspace) currentWorkspace = newWorkspace("ccc");
  $("#wsName").value = currentWorkspace.name;
  $("#wsMobile").value = currentWorkspace.mobile;
  setCategory(currentWorkspace.category);
  updateApplicantChip();

  let specs = slotsForCategory(currentWorkspace);
  if(currentWorkspace.category==="custom" && specs.length===0){
    $("#slotGrid").innerHTML = `<div class="empty-hint" style="grid-column:1/-1;">No custom document added yet. Go to <b>Settings → Custom Presets</b>, then use “Add to current workspace” on a preset card.</div>`;
  } else {
    $("#slotGrid").innerHTML = specs.map(s=>slotCardHtml(currentWorkspace, s)).join("");
  }
  const tray = $("#unassignedTray");
  if(currentWorkspace.unassigned.length){
    tray.style.display="block";
    $("#unassignedList").innerHTML = currentWorkspace.unassigned.map((u,i)=>`
      <div class="un-item">
        <img src="${u.previewUrl}"/><span class="sp">${u.file.name}</span>
        <select data-assign="${i}"><option value="">Assign to…</option>${specs.map(s=>`<option value="${s.key}">${s.label}</option>`).join("")}</select>
        <button class="btn btn-ghost btn-sm" data-discard="${i}">✕</button>
      </div>`).join("");
  } else tray.style.display="none";
}

$("#slotGrid").addEventListener("click", e=>{
  const dz = e.target.closest("[data-dz]");
  if(dz){ activeSlotKey = dz.dataset.dz; openFilePickerForSlot(activeSlotKey); return; }
  const card = e.target.closest(".slot");
  if(card && !e.target.closest("button") && !e.target.closest("input")){ activeSlotKey = card.dataset.slot; renderWorkspaceView(); }
  const btn = e.target.closest("button[data-act]");
  if(btn){
    const key = btn.dataset.slot, spec = slotSpecFor(currentWorkspace,key), slot = currentWorkspace.slots[key];
    if(btn.dataset.act==="download" && slot.result) downloadSlot(spec, slot);
    if(btn.dataset.act==="remove"){ delete currentWorkspace.slots[key]; idbDeletePrefix(`${currentWorkspace.id}::${key}`); renderWorkspaceView(); }
    if(btn.dataset.act==="edit" && slot.result) openManualEditor(spec, slot);
  }
});
$("#slotGrid").addEventListener("input", e=>{
  const r = e.target.closest("[data-rename]");
  if(r){ currentWorkspace.slots[r.dataset.rename].renameName = r.value; }
});
$("#slotGrid").addEventListener("dragover", e=>{ const dz=e.target.closest("[data-dz]"); if(dz){ e.preventDefault(); dz.classList.add("drag"); }});
$("#slotGrid").addEventListener("dragleave", e=>{ const dz=e.target.closest("[data-dz]"); if(dz) dz.classList.remove("drag"); });
$("#slotGrid").addEventListener("drop", e=>{
  const dz = e.target.closest("[data-dz]"); if(!dz) return;
  e.preventDefault(); dz.classList.remove("drag");
  const file = e.dataTransfer.files[0];
  if(file){ activeSlotKey = dz.dataset.dz; const spec = slotSpecFor(currentWorkspace, activeSlotKey); ingestFileToSlot(currentWorkspace, spec, file); }
});
function openFilePickerForSlot(key){
  const input = document.createElement("input");
  input.type="file"; input.accept="image/*"+("/".includes("")?",application/pdf":"");
  input.onchange = ()=>{ if(input.files[0]){ const spec = slotSpecFor(currentWorkspace,key); ingestFileToSlot(currentWorkspace, spec, input.files[0]); } };
  input.click();
}
function downloadSlot(spec, slot){
  const a = document.createElement("a");
  a.href = slot.resultUrl; a.download = slot.renameName || (spec.label+".jpg");
  a.click();
}

// global paste -> active slot
document.addEventListener("paste", e=>{
  if(!currentWorkspace) return;
  const items = e.clipboardData?.items; if(!items) return;
  for(const it of items){
    if(it.type.startsWith("image/")){
      const f = it.getAsFile();
      if(f){
        if(activeSlotKey && slotSpecFor(currentWorkspace, activeSlotKey)){
          ingestFileToSlot(currentWorkspace, slotSpecFor(currentWorkspace, activeSlotKey), f);
          toast("Pasted into "+activeSlotKey);
        } else toast("Click a document slot first, then paste");
      }
    }
  }
});

// bulk upload with filename auto-matching
$("#bulkUploadBtn").addEventListener("click", ()=> $("#bulkFileInput").click());
$("#bulkFileInput").addEventListener("change", async e=>{
  const files = Array.from(e.target.files);
  const specs = slotsForCategory(currentWorkspace);
  const keywordMap = { photo:['photo','pic','pp'], signature:['sign','sig'], thumb:['thumb','finger','fingerprint'], fingerprint:['finger','thumb'], income:['income'], caste:['caste'], residence:['residence','address'], passbook:['passbook','bank'], other:['other','doc'] };
  for(const file of files){
    const lname = file.name.toLowerCase();
    let matched = specs.find(s=> (keywordMap[s.key]||[s.key]).some(kw=>lname.includes(kw)));
    if(matched){ await ingestFileToSlot(currentWorkspace, matched, file); }
    else{
      const url = URL.createObjectURL(file);
      currentWorkspace.unassigned.push({ file, previewUrl:url });
    }
  }
  renderWorkspaceView();
  e.target.value="";
});
$("#unassignedList").addEventListener("change", e=>{
  const sel = e.target.closest("[data-assign]"); if(!sel) return;
  const idx = +sel.dataset.assign; const key = sel.value; if(!key) return;
  const entry = currentWorkspace.unassigned[idx];
  const spec = slotSpecFor(currentWorkspace, key);
  ingestFileToSlot(currentWorkspace, spec, entry.file);
  currentWorkspace.unassigned.splice(idx,1);
  renderWorkspaceView();
});
$("#unassignedList").addEventListener("click", e=>{
  const b = e.target.closest("[data-discard]"); if(!b) return;
  currentWorkspace.unassigned.splice(+b.dataset.discard,1);
  renderWorkspaceView();
});

/* ============================ MANUAL EDITOR ============================ */
function openManualEditor(spec, slot){
  editorCtx = { spec, slot, rotate:0, zoom:100, panX:0, panY:0, bright:100, contrast:100, sharpen:false, whiteBg:false };
  $("#editorTitle").textContent = "Edit — "+spec.label;
  $("#eRotate").value=0; $("#eZoom").value=100; $("#eBright").value=100; $("#eContrast").value=100;
  $("#eSharpen").checked=false; $("#eWhiteBg").checked=false;
  $("#vRot").textContent="0°"; $("#vZoom").textContent="100%"; $("#vBright").textContent="100%"; $("#vContrast").textContent="100%";
  $("#editorOverlay").classList.add("open");
  drawEditorPreview();
}
function closeEditor(){ $("#editorOverlay").classList.remove("open"); editorCtx=null; }
$("#editorClose").addEventListener("click", closeEditor);
$("#editorCancel").addEventListener("click", closeEditor);

function drawEditorPreview(){
  if(!editorCtx) return;
  const { spec, slot, rotate, zoom, panX, panY, bright, contrast } = editorCtx;
  const canvas = $("#editorCanvas");
  const aspect = (spec.width&&spec.height) ? spec.width/spec.height : (slot.origW/slot.origH);
  const cw = 380, ch = Math.round(cw/aspect);
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,cw,ch);
  ctx.filter = `brightness(${bright}%) contrast(${contrast}%)`;
  ctx.translate(cw/2 + panX, ch/2 + panY);
  ctx.rotate(rotate*Math.PI/180);
  const scale = (zoom/100) * Math.max(cw/editorImgEl().width, ch/editorImgEl().height);
  const iw = editorImgEl().width*scale, ih = editorImgEl().height*scale;
  ctx.drawImage(editorImgEl(), -iw/2, -ih/2, iw, ih);
  ctx.restore();
  ctx.filter="none";
}
function editorImgEl(){
  if(!editorCtx._img){ editorCtx._img = new Image(); editorCtx._img.src = editorCtx.slot.origUrl; }
  return editorCtx._img;
}
editorImgElReady = false;
$("#editorCanvasWrap").addEventListener("mousedown", e=>{
  if(!editorCtx) return;
  let last = {x:e.clientX,y:e.clientY};
  function move(ev){ editorCtx.panX += ev.clientX-last.x; editorCtx.panY += ev.clientY-last.y; last={x:ev.clientX,y:ev.clientY}; drawEditorPreview(); }
  function up(){ window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); }
  window.addEventListener("mousemove",move); window.addEventListener("mouseup",up);
});
["eRotate","eZoom","eBright","eContrast"].forEach(id=>{
  $("#"+id).addEventListener("input", e=>{
    const map = { eRotate:"rotate", eZoom:"zoom", eBright:"bright", eContrast:"contrast" };
    editorCtx[map[id]] = +e.target.value;
    const labelMap = { eRotate:["#vRot","°"], eZoom:["#vZoom","%"], eBright:["#vBright","%"], eContrast:["#vContrast","%"] };
    $(labelMap[id][0]).textContent = e.target.value+labelMap[id][1];
    drawEditorPreview();
  });
});
$$(".quickrot").forEach(()=>{});
document.querySelectorAll('[data-rot]').forEach(b=>b.addEventListener("click", ()=>{
  editorCtx.rotate = (editorCtx.rotate + (+b.dataset.rot===90?90:-90));
  $("#eRotate").value = ((editorCtx.rotate%45)||0); // keep slider sane for fine-tune after quick rotate
  drawEditorPreview();
}));
$("#eSharpen").addEventListener("change", e=> editorCtx.sharpen = e.target.checked);
$("#eWhiteBg").addEventListener("change", e=> editorCtx.whiteBg = e.target.checked);

$("#editorApply").addEventListener("click", async ()=>{
  const { spec, slot } = editorCtx;
  const targetW = spec.width || $("#editorCanvas").width, targetH = spec.height || $("#editorCanvas").height;
  const final = document.createElement("canvas");
  final.width = targetW; final.height = targetH;
  const fctx = final.getContext("2d");
  fctx.fillStyle="#fff"; fctx.fillRect(0,0,targetW,targetH);
  fctx.filter = `brightness(${editorCtx.bright}%) contrast(${editorCtx.contrast}%)`;
  fctx.translate(targetW/2 + editorCtx.panX*(targetW/380), targetH/2 + editorCtx.panY*(targetW/380));
  fctx.rotate(editorCtx.rotate*Math.PI/180);
  const img = editorImgEl();
  const scale = (editorCtx.zoom/100) * Math.max(targetW/img.width, targetH/img.height);
  const iw = img.width*scale, ih = img.height*scale;
  fctx.drawImage(img, -iw/2, -ih/2, iw, ih);
  fctx.restore(); fctx.filter="none";
  if(editorCtx.whiteBg) flattenBackgroundToWhite(fctx, targetW, targetH);
  if(editorCtx.sharpen) applySharpen(fctx, targetW, targetH);

  const mime = spec.format==="png" ? "image/png" : "image/jpeg";
  let blob = spec.format==="png" ? await canvasToBlob(final, mime, 1) : await compressToRange(final, mime, spec.minKb, spec.maxKb, spec.quality||settings.quality);
  if(spec.format!=="png" && spec.dpiMin) blob = await setJpegDpi(blob, Math.round((spec.dpiMin+(spec.dpiMax||spec.dpiMin))/2));
  slot.result = { blob, w:targetW, h:targetH, mime: blob.type||mime };
  slot.resultUrl = URL.createObjectURL(blob);
  const dpiUsed = spec.dpiMin ? Math.round((spec.dpiMin+(spec.dpiMax||spec.dpiMin))/2) : null;
  slot.validation = validateSlot(spec, slot.result, dpiUsed);
  await idbSet(`${currentWorkspace.id}::${spec.key}::proc`, blob);
  persistWorkspaceSummary(currentWorkspace);
  toast("Re-processed "+spec.label);
  closeEditor();
  renderWorkspaceView();
});

/* ============================ FILE MANAGER ============================ */
function allSlotsFlat(){
  if(!currentWorkspace) return [];
  return slotsForCategory(currentWorkspace).map(spec=>({spec, slot:currentWorkspace.slots[spec.key]})).filter(x=>x.slot && x.slot.result);
}
function renderFileManager(){
  const rows = allSlotsFlat();
  $("#fmBody").innerHTML = rows.length ? rows.map(({spec,slot})=>{
    const v = slot.validation;
    return `<tr>
      <td><img src="${slot.resultUrl}"/>${slot.renameName}</td>
      <td>${spec.label}</td>
      <td class="mono">${slot.result.w}×${slot.result.h}</td>
      <td class="mono">${spec.dpiMin?`${spec.dpiMin}-${spec.dpiMax}`:'—'}</td>
      <td class="mono">${fmtKb(slot.result.blob.size)}</td>
      <td>${v.allOk?'<span class="badge ok">✅ Compliant</span>':'<span class="badge bad">❌ Review</span>'}</td>
      <td><button class="btn btn-outline btn-sm" data-dl="${spec.key}">Download</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7" class="empty-hint">No processed files in this workspace yet.</td></tr>`;
}
$("#fmBody").addEventListener("click", e=>{
  const b = e.target.closest("[data-dl]"); if(!b) return;
  const spec = slotSpecFor(currentWorkspace, b.dataset.dl), slot = currentWorkspace.slots[b.dataset.dl];
  downloadSlot(spec, slot);
});
$("#bulkRenameApply").addEventListener("click", ()=>{
  const pattern = $("#bulkRenamePattern").value.trim();
  if(!pattern || !currentWorkspace) return;
  allSlotsFlat().forEach(({spec,slot})=>{
    slot.renameName = pattern.replace(/{NAME}/gi, (currentWorkspace.name||'applicant').replace(/\s+/g,'_'))
                              .replace(/{MOBILE}/gi, currentWorkspace.mobile||'')
                              .replace(/{DOC}/gi, spec.label.replace(/\s+/g,'_')) + (pattern.toLowerCase().endsWith('.jpg')?'':'.jpg');
  });
  renderFileManager(); renderWorkspaceView();
  toast("Bulk rename applied");
});

/* ============================ EXPORT CENTER ============================ */
function renderExportView(){
  const safeName = (currentWorkspace?.name||"APPLICANT").replace(/\s+/g,'_').toUpperCase();
  $("#zipNamePreview").textContent = safeName+".zip";
  const rows = allSlotsFlat();
  $("#exportList").innerHTML = rows.length ? rows.map(({spec,slot})=>`
    <div class="export-row">
      <span class="sp">${slot.renameName}</span>
      <span class="mono" style="color:var(--ink-soft);">${fmtKb(slot.result.blob.size)}</span>
      <button class="btn btn-outline btn-sm" data-dl="${spec.key}">Download</button>
    </div>`).join("") : `<div class="empty-hint">No processed files yet.</div>`;
}
$("#exportList").addEventListener("click", e=>{
  const b = e.target.closest("[data-dl]"); if(!b) return;
  const spec = slotSpecFor(currentWorkspace, b.dataset.dl), slot = currentWorkspace.slots[b.dataset.dl];
  downloadSlot(spec, slot);
});
$("#exportZipBtn").addEventListener("click", async ()=>{
  const rows = allSlotsFlat();
  if(!rows.length){ toast("Nothing to export yet"); return; }
  const zip = new JSZip();
  rows.forEach(({slot})=> zip.file(slot.renameName, slot.result.blob));
  toast("Building applicant ZIP…");
  const blob = await zip.generateAsync({type:"blob"});
  const safeName = (currentWorkspace.name||"APPLICANT").replace(/\s+/g,'_').toUpperCase();
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=safeName+".zip"; a.click();
});

/* ============================ HISTORY ============================ */
function renderHistoryView(filter=""){
  const f = filter.toLowerCase();
  const rows = history.filter(h => !f || h.name.toLowerCase().includes(f) || h.mobile.includes(f) || h.createdAt.slice(0,10).includes(f));
  $("#historyList").innerHTML = rows.length ? rows.map(h=>`
    <div class="recent-row">
      <b>${h.name}</b><span class="meta">${h.mobile||'—'}</span><span class="sp"></span>
      <span class="meta">${h.category.toUpperCase()} · ${h.docCount} docs · ${new Date(h.createdAt).toLocaleString()}</span>
      <button class="btn btn-outline btn-sm" data-open-ws="${h.id}">Open</button>
      <button class="btn btn-ghost btn-sm" data-del-ws="${h.id}">Delete</button>
    </div>`).join("") : `<div class="empty-hint">No matching applicant folders.</div>`;
}
$("#historySearch").addEventListener("input", e=> renderHistoryView(e.target.value));
$("#historyList").addEventListener("click", async e=>{
  const open = e.target.closest("[data-open-ws]");
  const del = e.target.closest("[data-del-ws]");
  if(open) openWorkspaceFromHistory(open.dataset.openWs);
  if(del){
    history = history.filter(h=>h.id!==del.dataset.delWs);
    saveJson(LS_HISTORY, history);
    await idbDeletePrefix(del.dataset.delWs);
    renderHistoryView($("#historySearch").value);
    renderDashboard();
  }
});
async function openWorkspaceFromHistory(id){
  const rec = history.find(h=>h.id===id); if(!rec) return;
  const ws = { id: rec.id, name: rec.name, mobile: rec.mobile, category: rec.category, createdAt: rec.createdAt, slots:{}, unassigned:[] };
  const specs = slotsForCategory(ws).length ? slotsForCategory(ws) : (SLOT_SPECS[rec.category]||[]);
  for(const spec of specs){
    try{
      const blob = await idbGet(`${id}::${spec.key}::proc`);
      if(blob){
        const url = URL.createObjectURL(blob);
        ws.slots[spec.key] = { status:"done", renameName: defaultRenameFor(ws,spec), origUrl: url, origW:'—', origH:'—', origSize:blob.size, result:{blob,w:spec.width||0,h:spec.height||0,mime:blob.type}, resultUrl:url, validation: validateSlot(spec, {blob,w:spec.width||0,h:spec.height||0,mime:blob.type}, spec.dpiMin) };
      }
    }catch(e){}
  }
  currentWorkspace = ws; activeSlotKey = null;
  toast("Reopened "+rec.name+" — note: original photos aren't retained in history, only the processed output.");
  setView("workspace", {cat: rec.category});
}

/* ============================ SETTINGS / PRESETS ============================ */
function renderPresetGrid(){
  $("#presetGrid").innerHTML = presets.map(p=>`
    <div class="panel preset-card">
      <h4>${p.name}</h4>
      <div class="spec">${p.width?`${p.width}×${p.height}px`:'No resize'}<br/>${p.dpiMin?`${p.dpiMin}-${p.dpiMax} DPI`:''}<br/>${p.minKb}-${p.maxKb} KB · .${p.format.toUpperCase()}</div>
      <div class="actions">
        <button class="btn btn-outline btn-sm" data-use-preset="${p.id}">+ To Workspace</button>
        <button class="btn btn-ghost btn-sm" data-edit-preset="${p.id}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-del-preset="${p.id}">✕</button>
      </div>
    </div>`).join("");
}
$("#presetGrid").addEventListener("click", e=>{
  const use = e.target.closest("[data-use-preset]");
  const edit = e.target.closest("[data-edit-preset]");
  const del = e.target.closest("[data-del-preset]");
  if(use){
    if(!currentWorkspace){ currentWorkspace = newWorkspace("custom"); }
    currentWorkspace.category = "custom";
    currentWorkspace.slots[use.dataset.usePreset] = currentWorkspace.slots[use.dataset.usePreset] || {};
    toast("Added to workspace — open Custom Processor to upload");
    setView("workspace", {cat:"custom"});
  }
  if(edit){
    const p = presets.find(x=>x.id===edit.dataset.editPreset);
    fillPresetForm(p);
  }
  if(del){
    presets = presets.filter(x=>x.id!==del.dataset.delPreset);
    saveJson(LS_PRESETS, presets);
    renderPresetGrid(); renderDashboard();
  }
});
function fillPresetForm(p){
  $("#pName").value=p?.name||""; $("#pFormat").value=p?.format||"jpg";
  $("#pWidth").value=p?.width||""; $("#pHeight").value=p?.height||"";
  $("#pDpiMin").value=p?.dpiMin??96; $("#pDpiMax").value=p?.dpiMax??300;
  $("#pMinKb").value=p?.minKb??5; $("#pMaxKb").value=p?.maxKb??50;
  $("#pQuality").value=p?.quality??85; $("#pQualVal").textContent=($("#pQuality").value)+"%";
  $("#presetSaveBtn").dataset.editingId = p?.id || "";
}
$("#pQuality").addEventListener("input", e=> $("#pQualVal").textContent = e.target.value+"%");
$("#presetClearBtn").addEventListener("click", ()=> fillPresetForm(null));
$("#presetSaveBtn").addEventListener("click", ()=>{
  const name = $("#pName").value.trim();
  if(!name){ toast("Preset needs a name"); return; }
  const editingId = $("#presetSaveBtn").dataset.editingId;
  const id = editingId || name.toLowerCase().replace(/\s+/g,'-')+"-"+uid();
  const preset = { id, name, format:$("#pFormat").value,
    width: +$("#pWidth").value||null, height: +$("#pHeight").value||null,
    dpiMin: +$("#pDpiMin").value||null, dpiMax: +$("#pDpiMax").value||null,
    minKb: +$("#pMinKb").value||1, maxKb: +$("#pMaxKb").value||300,
    quality: +$("#pQuality").value||85 };
  const idx = presets.findIndex(p=>p.id===id);
  if(idx>=0) presets[idx]=preset; else presets.push(preset);
  saveJson(LS_PRESETS, presets);
  renderPresetGrid(); renderDashboard();
  fillPresetForm(null);
  toast("Preset saved: "+name);
});

function renderSettingsView(){
  renderPresetGrid();
  $("#defQuality").value = settings.quality; $("#defQualVal").textContent = settings.quality+"%";
  $("#themeSelect").value = settings.theme;
}
$("#defQuality").addEventListener("input", e=>{ settings.quality=+e.target.value; $("#defQualVal").textContent=e.target.value+"%"; saveJson(LS_SETTINGS, settings); });
$("#themeSelect").addEventListener("change", e=> applyTheme(e.target.value));
$("#clearAllDataBtn").addEventListener("click", async ()=>{
  if(!confirm("This will permanently delete all presets, history and stored files. Continue?")) return;
  localStorage.removeItem(LS_PRESETS); localStorage.removeItem(LS_HISTORY);
  await idbClearAll();
  presets = SEED_PRESETS.slice(); saveJson(LS_PRESETS, presets);
  history = [];
  currentWorkspace = null;
  toast("All data cleared");
  setView("dashboard");
});

/* ============================ THEME ============================ */
function applyTheme(t){
  document.documentElement.setAttribute("data-theme", t);
  settings.theme = t; saveJson(LS_SETTINGS, settings);
}
$("#themeToggle").addEventListener("click", ()=>{
  applyTheme(document.documentElement.getAttribute("data-theme")==="dark" ? "light" : "dark");
});

/* ============================ INIT ============================ */
applyTheme(settings.theme || "light");
renderDashboard();
setView("dashboard");
