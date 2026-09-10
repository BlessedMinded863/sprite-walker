/* Fatal Instinct V29.3 — Character Reference Camera
 * Character-agnostic capture layer for 2.5D / Sprite Walker reference frames.
 * Kaelor can use it for the side project without hard-coding the production
 * pipeline to Kaelor, Duroc, Marius, or any other fighter.
 */

const FI_REF_CAM = {
  captures: [],
  observer: null,
  busy: false,
  autoSeen: new Set(),
  stageNames: [
    'contact', 'down', 'passing', 'high_step',
    'opposite_contact', 'opposite_down', 'opposite_passing', 'opposite_high_step'
  ]
};

const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);

function safeName(value){
  return String(value || 'character')
    .trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'character';
}

function inferredCharacterName(){
  try {
    const k = window.FIProgressiveSketch?.characterKey?.();
    if(k) return String(k);
  } catch(_) {}
  const chip = $('fi25dModelChip')?.textContent?.trim();
  if(chip && !/proxy rig/i.test(chip)) return chip.replace(/\.[^.]+$/,'');
  return 'Kaelor';
}

function sourceCanvas(){
  const source = $('fiRefSource')?.value || '3d';
  if(source === '2d') return $('mainCanvas') || $('fiSketchCanvas') || $('fiPoseReviewCanvas');
  return $('fi25dViewport') || $('mainCanvas') || $('fiSketchCanvas');
}

function stageFromChip(){
  const txt = $('fi25dFrameChip')?.textContent || '';
  const m = txt.match(/FRAME\s+(\d+)\s*\/\s*8(?:\s*[·-]\s*(.*))?/i);
  if(m){
    const i = Math.max(0, Math.min(7, Number(m[1]) - 1));
    return { index:i, label:safeName(m[2] || FI_REF_CAM.stageNames[i]) };
  }
  return { index: Math.max(0, FI_REF_CAM.captures.length % 8), label:'reference' };
}

function setStatus(msg){
  if($('fiRefStatus')) $('fiRefStatus').textContent = msg;
}

function canvasToWorkingCanvas(src){
  const c = document.createElement('canvas');
  c.width = src.width || Math.max(1, src.clientWidth);
  c.height = src.height || Math.max(1, src.clientHeight);
  const ctx = c.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Edge-connected background removal. Unlike a global chroma key, this only
// clears pixels connected to the outer border, which protects similarly
// colored details inside the character.
function makeEdgeBackgroundTransparent(canvas, tolerance=38){
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  const w = canvas.width, h = canvas.height;
  if(!w || !h) return;
  const image = ctx.getImageData(0,0,w,h), d=image.data;
  const samples = [[0,0],[w-1,0],[0,h-1],[w-1,h-1],[w>>1,0],[w>>1,h-1]];
  let br=0,bg=0,bb=0,count=0;
  for(const [x,y] of samples){
    const p=(y*w+x)*4; br+=d[p]; bg+=d[p+1]; bb+=d[p+2]; count++;
  }
  br/=count; bg/=count; bb/=count;
  const visited = new Uint8Array(w*h), qx=new Int32Array(w*h), qy=new Int32Array(w*h);
  let head=0,tail=0;
  const push=(x,y)=>{ if(x<0||y<0||x>=w||y>=h)return; const n=y*w+x; if(visited[n])return; visited[n]=1; qx[tail]=x; qy[tail]=y; tail++; };
  for(let x=0;x<w;x++){ push(x,0); push(x,h-1); }
  for(let y=1;y<h-1;y++){ push(0,y); push(w-1,y); }
  const t2=tolerance*tolerance*3;
  while(head<tail){
    const x=qx[head], y=qy[head++], p=(y*w+x)*4;
    const dr=d[p]-br,dg=d[p+1]-bg,db=d[p+2]-bb;
    if(dr*dr+dg*dg+db*db>t2) continue;
    d[p+3]=0;
    push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1);
  }
  ctx.putImageData(image,0,0);
}

function toBlob(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG capture failed.')),'image/png'));
}

function renderGallery(){
  const g=$('fiRefGallery'); if(!g) return;
  g.innerHTML='';
  FI_REF_CAM.captures.forEach((c,i)=>{
    const card=document.createElement('div'); card.className='fiRefThumb';
    const img=document.createElement('img'); img.src=c.url; img.alt=c.filename;
    const label=document.createElement('div'); label.textContent=`${i+1}. ${c.stage}`;
    const del=document.createElement('button'); del.type='button'; del.textContent='×'; del.title='Remove capture';
    del.addEventListener('click',()=>{ URL.revokeObjectURL(c.url); FI_REF_CAM.captures.splice(i,1); renderGallery(); updateCount(); });
    card.append(img,label,del); g.appendChild(card);
  });
}

function updateCount(){ if($('fiRefCount')) $('fiRefCount').textContent=String(FI_REF_CAM.captures.length); }

async function captureFrame(options={}){
  if(FI_REF_CAM.busy) return null;
  const src=sourceCanvas();
  if(!src){ setStatus('No character viewport is available yet.'); return null; }
  FI_REF_CAM.busy=true;
  try{
    if(($('fiRefLockFightCamera')?.checked ?? true) && $('fi25dCameraSide')){
      $('fi25dCameraSide').click();
      await wait(32);
    }
    const stage=options.stage || stageFromChip();
    const working=canvasToWorkingCanvas(src);
    if($('fiRefTransparent')?.checked) makeEdgeBackgroundTransparent(working, Number($('fiRefTolerance')?.value||38));
    const blob=await toBlob(working);
    const character=safeName($('fiRefCharacter')?.value || inferredCharacterName());
    const n=String((stage.index ?? FI_REF_CAM.captures.length)+1).padStart(2,'0');
    const label=safeName(stage.label || 'reference');
    const filename=`${character}_walk_${n}_${label}.png`;
    const item={blob,url:URL.createObjectURL(blob),filename,stage:label,index:stage.index ?? 0,createdAt:new Date().toISOString()};
    FI_REF_CAM.captures.push(item);
    renderGallery(); updateCount();
    setStatus(`Captured ${filename}`);
    return item;
  }catch(err){
    setStatus(`Capture failed: ${err?.message || err}`);
    return null;
  }finally{ FI_REF_CAM.busy=false; }
}

async function captureWalk8(){
  if(FI_REF_CAM.busy) return;
  const buttons=[...document.querySelectorAll('#fi25dTimeline button')].slice(0,8);
  if(buttons.length<8){ setStatus('The 8-stage walk timeline is not ready yet.'); return; }
  const autoWas=$('fiRefAuto')?.checked;
  if($('fiRefAuto')) $('fiRefAuto').checked=false;
  setStatus('Capturing 8 walk reference stages…');
  for(let i=0;i<8;i++){
    buttons[i].click();
    await wait(150);
    await captureFrame({stage:{index:i,label:FI_REF_CAM.stageNames[i]}});
    await wait(30);
  }
  if($('fiRefAuto')) $('fiRefAuto').checked=!!autoWas;
  setStatus('8-stage walk reference capture complete.');
}

function downloadBlob(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

async function exportCaptures(){
  if(!FI_REF_CAM.captures.length){ setStatus('Capture at least one frame first.'); return; }
  const character=safeName($('fiRefCharacter')?.value || inferredCharacterName());
  if(window.JSZip){
    const zip=new window.JSZip();
    FI_REF_CAM.captures.forEach(c=>zip.file(c.filename,c.blob));
    zip.file(`${character}_reference_manifest.json`,JSON.stringify({
      schema:'fatal-instinct-reference-camera/v1',character,
      source:$('fiRefSource')?.value||'3d',
      transparent:!!$('fiRefTransparent')?.checked,
      captures:FI_REF_CAM.captures.map(c=>({file:c.filename,stage:c.stage,index:c.index,createdAt:c.createdAt}))
    },null,2));
    const blob=await zip.generateAsync({type:'blob'});
    downloadBlob(blob,`${character}_walk_reference_frames.zip`);
    setStatus(`Exported ${FI_REF_CAM.captures.length} reference frames as ZIP.`);
  }else{
    FI_REF_CAM.captures.forEach((c,i)=>setTimeout(()=>downloadBlob(c.blob,c.filename),i*160));
    setStatus(`Exporting ${FI_REF_CAM.captures.length} PNG files.`);
  }
}

function clearCaptures(){
  FI_REF_CAM.captures.forEach(c=>URL.revokeObjectURL(c.url));
  FI_REF_CAM.captures=[]; FI_REF_CAM.autoSeen.clear(); renderGallery(); updateCount();
  setStatus('Reference camera cleared.');
}

function armAutoCapture(){
  FI_REF_CAM.observer?.disconnect();
  const chip=$('fi25dFrameChip'); if(!chip) return;
  let last='';
  FI_REF_CAM.observer=new MutationObserver(async()=>{
    if(!$('fiRefAuto')?.checked || FI_REF_CAM.busy) return;
    const txt=chip.textContent||''; if(!/FRAME\s+\d+\s*\/\s*8/i.test(txt) || txt===last) return; last=txt;
    const stage=stageFromChip();
    const key=`${stage.index}:${stage.label}`;
    if($('fiRefOnePerStage')?.checked && FI_REF_CAM.autoSeen.has(key)) return;
    FI_REF_CAM.autoSeen.add(key);
    await wait(60); await captureFrame({stage});
  });
  FI_REF_CAM.observer.observe(chip,{childList:true,characterData:true,subtree:true});
}

function injectStyles(){
  if($('fiRefCameraStyles')) return;
  const s=document.createElement('style'); s.id='fiRefCameraStyles';
  s.textContent=`
  .fiRefCamera{margin:12px 0;padding:14px;border:1px solid #343c4e;border-radius:14px;background:#121722;color:#f6f7fb}
  .fiRefCamera h3{margin:0 0 4px;font-size:15px}.fiRefCamera p{margin:0 0 10px;color:#a7afbf;font-size:12px;line-height:1.35}
  .fiRefGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fiRefGrid label{font-size:11px;color:#a7afbf}
  .fiRefGrid input,.fiRefGrid select{width:100%;margin-top:4px}.fiRefActions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}
  .fiRefActions button{min-height:42px}.fiRefGallery{display:flex;gap:7px;overflow-x:auto;margin-top:10px;padding-bottom:4px}.fiRefThumb{position:relative;min-width:92px;width:92px;border:1px solid #343c4e;border-radius:10px;padding:4px;background:#090b0f}
  .fiRefThumb img{width:82px;height:82px;object-fit:contain;display:block;background:repeating-conic-gradient(#202631 0 25%,#141923 0 50%) 50%/12px 12px}.fiRefThumb div{font-size:9px;color:#a7afbf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}.fiRefThumb button{position:absolute;right:3px;top:3px;padding:1px 5px;border-radius:999px;font-size:11px}
  .fiRefStatus{font-size:11px;color:#a7afbf;margin-top:8px;min-height:16px}.fiRefChecks{display:flex;gap:12px;flex-wrap:wrap;margin-top:9px;font-size:11px;color:#a7afbf}.fiRefChecks label{display:flex;align-items:center;gap:5px}
  @media(max-width:560px){.fiRefGrid{grid-template-columns:1fr}.fiRefActions{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(s);
}

function injectPanel(){
  if($('fiReferenceCamera')) return true;
  const host=$('fi25dPanel') || $('fiProductionWizard') || document.querySelector('main');
  if(!host) return false;
  injectStyles();
  const wrap=document.createElement('section'); wrap.id='fiReferenceCamera'; wrap.className='fiRefCamera';
  wrap.innerHTML=`
    <h3>REFERENCE CAMERA <span style="font-size:10px;color:#62e7ad">V29.3</span></h3>
    <p>Capture consistent character reference frames while any fighter walks. Designed for Kaelor side-project testing and reusable for the Fatal Instinct roster.</p>
    <div class="fiRefGrid">
      <label>Character name<input id="fiRefCharacter" value="${inferredCharacterName().replace(/"/g,'&quot;')}"></label>
      <label>Capture source<select id="fiRefSource"><option value="3d">2.5D Viewport</option><option value="2d">2D Sprite / Motion Canvas</option></select></label>
      <label>Background tolerance<input id="fiRefTolerance" type="range" min="8" max="90" value="38"></label>
      <label>Captured frames <input id="fiRefCount" value="0" readonly></label>
    </div>
    <div class="fiRefChecks">
      <label><input id="fiRefTransparent" type="checkbox" checked> Transparent edge background</label>
      <label><input id="fiRefLockFightCamera" type="checkbox" checked> Lock fight camera before capture</label>
      <label><input id="fiRefAuto" type="checkbox"> Auto-capture walk frames</label>
      <label><input id="fiRefOnePerStage" type="checkbox" checked> One per stage</label>
    </div>
    <div class="fiRefActions">
      <button id="fiRefCapture" type="button">📷 Capture Frame</button>
      <button id="fiRefCapture8" type="button">📸 Capture 8-Stage Walk</button>
      <button id="fiRefExport" type="button">Export Reference Pack</button>
      <button id="fiRefClear" type="button">Clear Captures</button>
    </div>
    <div id="fiRefGallery" class="fiRefGallery"></div>
    <div id="fiRefStatus" class="fiRefStatus">Reference Camera ready.</div>`;
  const controls=host.querySelector('.fi25dControls');
  if(controls) controls.prepend(wrap); else host.appendChild(wrap);
  $('fiRefCapture')?.addEventListener('click',()=>captureFrame());
  $('fiRefCapture8')?.addEventListener('click',captureWalk8);
  $('fiRefExport')?.addEventListener('click',exportCaptures);
  $('fiRefClear')?.addEventListener('click',clearCaptures);
  $('fiRefAuto')?.addEventListener('change',()=>{FI_REF_CAM.autoSeen.clear(); armAutoCapture();});
  armAutoCapture();
  window.FIReferenceCamera={capture:captureFrame,captureWalk8,export:exportCaptures,clear:clearCaptures,state:FI_REF_CAM};
  return true;
}

function boot(){
  if(injectPanel()) return;
  let tries=0; const timer=setInterval(()=>{ if(injectPanel() || ++tries>80) clearInterval(timer); },100);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
