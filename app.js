
const PARTS = [
  "torso","head",
  "left_upper_arm","left_forearm","left_hand",
  "right_upper_arm","right_forearm","right_hand",
  "left_thigh","left_shin","left_foot",
  "right_thigh","right_shin","right_foot",
  "tail"
];

const RENDER_ORDER = [
  "tail",
  "left_upper_arm","left_forearm","left_hand",
  "left_thigh","left_shin","left_foot",
  "torso","head",
  "right_thigh","right_shin","right_foot",
  "right_upper_arm","right_forearm","right_hand"
];

const $ = id => document.getElementById(id);

const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const fileInput = $("fileInput");
const rigInput = $("rigInput");
const partSelect = $("partSelect");
const boxModeBtn = $("boxModeBtn");
const pivotModeBtn = $("pivotModeBtn");
const generateBtn = $("generateBtn");
const previewBtn = $("previewBtn");
const exportBtn = $("exportBtn");
const saveRigBtn = $("saveRigBtn");
const clearPartBtn = $("clearPartBtn");
const statusEl = $("status");
const frameStrip = $("frameStrip");
const hint = $("hint");

PARTS.forEach(p=>{
  const o=document.createElement("option");
  o.value=p;o.textContent=p;
  partSelect.appendChild(o);
});

let sourceImage = null;
let sourceName = "";
let rig = {};
let mode = "box";
let dragStart = null;
let dragCurrent = null;
let generatedFrames = [];
let previewTimer = null;
let previewIndex = 0;

function setStatus(msg){ statusEl.textContent = msg; }

function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width*dpr);
  canvas.height = Math.round(rect.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  draw();
}
window.addEventListener("resize", resizeCanvas);
new ResizeObserver(resizeCanvas).observe(canvas);

function viewTransform(){
  if(!sourceImage) return {scale:1,ox:0,oy:0};
  const w=canvas.clientWidth, h=canvas.clientHeight;
  const scale=Math.min((w-24)/sourceImage.width,(h-24)/sourceImage.height,4);
  return {
    scale,
    ox:(w-sourceImage.width*scale)/2,
    oy:(h-sourceImage.height*scale)/2
  };
}

function screenToImage(clientX, clientY){
  const rect=canvas.getBoundingClientRect();
  const x=clientX-rect.left, y=clientY-rect.top;
  const {scale,ox,oy}=viewTransform();
  return {
    x:Math.max(0,Math.min(sourceImage.width-1,Math.round((x-ox)/scale))),
    y:Math.max(0,Math.min(sourceImage.height-1,Math.round((y-oy)/scale)))
  };
}

function imageToScreen(x,y){
  const {scale,ox,oy}=viewTransform();
  return {x:ox+x*scale,y:oy+y*scale};
}

function draw(frameCanvas=null){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#0b0d11";ctx.fillRect(0,0,w,h);

  if(!sourceImage){ hint.style.display="block"; return; }
  hint.style.display="none";

  const img = frameCanvas || sourceImage;
  const {scale,ox,oy}=viewTransform();
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(img,ox,oy,sourceImage.width*scale,sourceImage.height*scale);

  if(frameCanvas) return;

  for(const [name,data] of Object.entries(rig)){
    if(!data.bbox) continue;
    const [x1,y1,x2,y2]=data.bbox;
    const p1=imageToScreen(x1,y1),p2=imageToScreen(x2,y2);
    ctx.strokeStyle=name===partSelect.value?"#58e1a3":"#49c989";
    ctx.lineWidth=name===partSelect.value?3:1;
    ctx.strokeRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);
    ctx.fillStyle="#fff";ctx.font="11px -apple-system";
    ctx.fillText(name,p1.x+4,p1.y+13);

    if(data.pivot){
      const p=imageToScreen(data.pivot[0],data.pivot[1]);
      ctx.strokeStyle="#ffdd33";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(p.x-8,p.y);ctx.lineTo(p.x+8,p.y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(p.x,p.y-8);ctx.lineTo(p.x,p.y+8);ctx.stroke();
    }
  }

  if(dragStart && dragCurrent){
    const a=imageToScreen(dragStart.x,dragStart.y);
    const b=imageToScreen(dragCurrent.x,dragCurrent.y);
    ctx.strokeStyle="#ff4d73";ctx.lineWidth=2;
    ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
  }
}

function setMode(next){
  mode=next;
  boxModeBtn.classList.toggle("active",mode==="box");
  pivotModeBtn.classList.toggle("active",mode==="pivot");
  setStatus(mode==="box"?"Drag around the selected body part.":"Tap the joint/pivot for the selected part.");
}
boxModeBtn.onclick=()=>setMode("box");
pivotModeBtn.onclick=()=>setMode("pivot");

fileInput.onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  sourceName=f.name;
  const url=URL.createObjectURL(f);
  const img=new Image();
  img.onload=()=>{
    sourceImage=img; rig={}; generatedFrames=[];
    setStatus(`Loaded ${f.name} — ${img.width}×${img.height}`);
    URL.revokeObjectURL(url); draw(); renderFrameStrip();
  };
  img.src=url;
};

canvas.addEventListener("pointerdown",e=>{
  if(!sourceImage)return;
  canvas.setPointerCapture(e.pointerId);
  const p=screenToImage(e.clientX,e.clientY);
  const part=partSelect.value;
  if(mode==="pivot"){
    rig[part] = rig[part] || {};
    rig[part].pivot=[p.x,p.y];
    setStatus(`${part}: pivot set at ${p.x}, ${p.y}`);
    draw();
    return;
  }
  dragStart=p;dragCurrent=p;draw();
});

canvas.addEventListener("pointermove",e=>{
  if(!sourceImage || mode!=="box" || !dragStart)return;
  dragCurrent=screenToImage(e.clientX,e.clientY);
  draw();
});

canvas.addEventListener("pointerup",e=>{
  if(!sourceImage || mode!=="box" || !dragStart)return;
  const p=screenToImage(e.clientX,e.clientY);
  let x1=Math.min(dragStart.x,p.x), x2=Math.max(dragStart.x,p.x);
  let y1=Math.min(dragStart.y,p.y), y2=Math.max(dragStart.y,p.y);
  if(x2-x1>2 && y2-y1>2){
    const part=partSelect.value;
    rig[part]=rig[part]||{};
    rig[part].bbox=[x1,y1,x2+1,y2+1];
    if(!rig[part].pivot) rig[part].pivot=[Math.round((x1+x2)/2),Math.round((y1+y2)/2)];
    setStatus(`${part}: box saved`);
  }
  dragStart=null;dragCurrent=null;draw();
});

clearPartBtn.onclick=()=>{
  delete rig[partSelect.value];
  setStatus(`${partSelect.value} cleared.`);
  draw();
};

function slider(id,valueId){
  const el=$(id), out=$(valueId);
  el.addEventListener("input",()=>out.textContent=el.value);
}
slider("legSwing","legValue");
slider("kneeBend","kneeValue");
slider("armSwing","armValue");
slider("bodyBob","bobValue");
slider("tailSwing","tailValue");

function transformsForFrame(i){
  const phase=2*Math.PI*i/8;
  const leg=+$("legSwing").value;
  const knee=+$("kneeBend").value;
  const arm=+$("armSwing").value;
  const bob=+$("bodyBob").value;
  const tail=+$("tailSwing").value;
  const s=Math.sin(phase);
  const so=Math.sin(phase+Math.PI);
  const bendL=Math.max(0,Math.sin(phase-Math.PI/2));
  const bendR=Math.max(0,Math.sin(phase+Math.PI/2));
  const bodyBob=-Math.abs(Math.sin(phase))*bob;
  return {
    torso:[1.5*Math.sin(phase*2),0,bodyBob],
    head:[-1*Math.sin(phase*2),0,bodyBob],
    left_thigh:[-leg*s,0,bodyBob],
    right_thigh:[-leg*so,0,bodyBob],
    left_shin:[knee*bendL-.35*leg*s,0,bodyBob],
    right_shin:[knee*bendR-.35*leg*so,0,bodyBob],
    left_foot:[-8*s,0,bodyBob],
    right_foot:[-8*so,0,bodyBob],
    left_upper_arm:[arm*s,0,bodyBob],
    right_upper_arm:[arm*so,0,bodyBob],
    left_forearm:[.65*arm*s,0,bodyBob],
    right_forearm:[.65*arm*so,0,bodyBob],
    left_hand:[.4*arm*s,0,bodyBob],
    right_hand:[.4*arm*so,0,bodyBob],
    tail:[tail*Math.sin(phase+Math.PI/2),0,bodyBob]
  };
}

function cropPartCanvas(part){
  const data=rig[part]; if(!data?.bbox)return null;
  const [x1,y1,x2,y2]=data.bbox;
  const c=document.createElement("canvas");
  c.width=sourceImage.width;c.height=sourceImage.height;
  const cctx=c.getContext("2d");
  cctx.drawImage(sourceImage,x1,y1,x2-x1,y2-y1,x1,y1,x2-x1,y2-y1);
  return c;
}

function transformedLayer(part, angleDeg, dx, dy){
  const data=rig[part]; if(!data?.bbox || !data?.pivot)return null;
  const base=cropPartCanvas(part);
  const out=document.createElement("canvas");
  out.width=sourceImage.width;out.height=sourceImage.height;
  const o=out.getContext("2d");
  const [px,py]=data.pivot;
  o.save();
  o.translate(px+dx,py+dy);
  o.rotate(angleDeg*Math.PI/180);
  o.translate(-px,-py);
  o.drawImage(base,0,0);
  o.restore();
  return out;
}

function generateWalk(){
  if(!sourceImage){setStatus("Load a character PNG first.");return;}
  const valid=PARTS.filter(p=>rig[p]?.bbox && rig[p]?.pivot);
  if(valid.length===0){setStatus("Rig at least one body part first.");return;}

  generatedFrames=[];
  for(let i=0;i<8;i++){
    const f=document.createElement("canvas");
    f.width=sourceImage.width;f.height=sourceImage.height;
    const fctx=f.getContext("2d");
    const t=transformsForFrame(i);
    const ordered=[...RENDER_ORDER.filter(p=>valid.includes(p)),...valid.filter(p=>!RENDER_ORDER.includes(p))];
    for(const p of ordered){
      const [a=0,dx=0,dy=0]=t[p]||[0,0,0];
      const layer=transformedLayer(p,a,dx,dy);
      if(layer)fctx.drawImage(layer,0,0);
    }
    generatedFrames.push(f);
  }
  setStatus("Generated 8-frame walk cycle.");
  renderFrameStrip();
  draw(generatedFrames[0]);
}

generateBtn.onclick=generateWalk;

function renderFrameStrip(){
  frameStrip.innerHTML="";
  generatedFrames.forEach((f,i)=>{
    const card=document.createElement("div");card.className="frame-card";
    const c=document.createElement("canvas");c.width=f.width;c.height=f.height;
    c.getContext("2d").drawImage(f,0,0);
    const label=document.createElement("div");label.textContent=`Frame ${i+1}`;
    card.appendChild(c);card.appendChild(label);
    frameStrip.appendChild(card);
  });
}

previewBtn.onclick=()=>{
  if(!generatedFrames.length)generateWalk();
  if(!generatedFrames.length)return;
  if(previewTimer){
    clearInterval(previewTimer);previewTimer=null;draw();
    setStatus("Preview stopped.");return;
  }
  previewIndex=0;
  setStatus("Previewing walk — tap Preview again to stop.");
  previewTimer=setInterval(()=>{
    draw(generatedFrames[previewIndex]);
    previewIndex=(previewIndex+1)%generatedFrames.length;
  },120);
};

function downloadBlob(blob,name){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

saveRigBtn.onclick=()=>{
  if(!sourceImage){setStatus("Load a character first.");return;}
  const payload={
    version:1,
    source_name:sourceName,
    source_size:[sourceImage.width,sourceImage.height],
    parts:rig
  };
  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"fatal_instinct_rig.json");
  setStatus("Rig file created.");
};

rigInput.onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{
    const data=JSON.parse(await f.text());
    rig=data.parts||{};
    setStatus(`Loaded rig: ${f.name}`);draw();
  }catch(err){setStatus("Could not read rig JSON.");}
};

exportBtn.onclick=()=>{
  if(!generatedFrames.length)generateWalk();
  if(!generatedFrames.length)return;
  const w=sourceImage.width,h=sourceImage.height;
  const sheet=document.createElement("canvas");
  sheet.width=w*generatedFrames.length;sheet.height=h;
  const sctx=sheet.getContext("2d");
  generatedFrames.forEach((f,i)=>sctx.drawImage(f,i*w,0));
  sheet.toBlob(blob=>{
    if(blob){
      downloadBlob(blob,"walk_sheet.png");
      setStatus("Sprite sheet exported. On iPhone, check Downloads in Files.");
    }
  },"image/png");
};

resizeCanvas();
