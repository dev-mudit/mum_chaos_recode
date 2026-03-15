
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const W = 480, H = 700;

// Road layout
const RL = 95, RW = 290, RR = RL + RW;
const LW = RW / 4;
const LC = [RL + LW*.5, RL + LW*1.5, RL + LW*2.5, RL + LW*3.5];

const rickshawImg = new Image();
rickshawImg.src = 'auto.png';
const carImg = new Image();
carImg.src = 'car.png';
const busImg = new Image();
busImg.src = 'bus.png';
const bikeImg = new Image();
bikeImg.src = 'bike.png';

//PHASES
const PHASES = [
  {name:'Morning Rush',    minD:0,    spd:1.0, den:1.0, wx:'clear', sky:['#0d0d20','#1a0a05']},
  {name:'Afternoon Rain',  minD:600,  spd:1.0, den:1.4, wx:'rain',  sky:['#050418','#060400']},
  {name:'Evening Frenzy',  minD:1100,  spd:1.25, den:1.75, wx:'heavy', sky:['#020210','#010100']},
  {name:'Midnight Mayhem', minD:1750, spd:1.60, den:2.4, wx:'chaos', sky:['#000008','#000000']},
];

//GAME STATE
let S;

function newState(){
  return {
    run:false, over:false,
    score:0, dist:0, lives:5, phase:0,
    baseSpd:2.5, roadY:0, frame:0,
    px: LC[1], ptLane:1, pLane:1,
    invince:false, invT:0,
    collected:0,
    obstacles:[], collectibles:[],
    particles:[], floats:[],
    rain:[], rainInt:0,
    ability:{idx:0, active:false, aTimer:0, cd:0, blast:false, blastT:0},
    mult:1, multT:0,
    spawnT:0, colT:0,
    spdVar:1, heavyTreads:0, ledLights:0,
    spaceDown:false,
  };
}


//INPUTS
document.addEventListener('keydown',e=>{
  if(!S.run)return;
  if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A'){if(S.ptLane>0)S.ptLane--;}
  if(e.key==='ArrowRight'||e.key==='d'||e.key==='D'){if(S.ptLane<3)S.ptLane++;}
  if(e.key===' '){e.preventDefault();if(!S.spaceDown){S.spaceDown=true;useAbility();}}
});
document.addEventListener('keyup',e=>{if(e.key===' ')S.spaceDown=false;});

//ABILITIES
const ABS=[
  {minScore:0,   phase:-1, name:'HORN BLAST',   dur:1800,  cd:7000},
  {minScore:400, phase:-1, name:'RAIN TIRES',   dur:5000,  cd:11000},
  {minScore:1200,phase:-1, name:'TURBO',        dur:3000,  cd:13000},
];
const PHASE_ABS={
  1: {name:'HEAVY TREADS', dur:3000, cd:9000},
  3: {name:'LED LIGHTS',   dur:5000, cd:12000},
};
function curAb(){
  if(PHASE_ABS[S.phase])return PHASE_ABS[S.phase];
  let a=ABS[0];for(const b of ABS)if(S.score>=b.minScore)a=b;return a;
}
function useAbility(){
  if(S.ability.active||S.ability.cd>0)return;
  const ab=curAb();
  S.ability.active=true;S.ability.aTimer=ab.dur;S.ability.cd=ab.cd;

  if(ab.name==='HORN BLAST'){
    S.obstacles=S.obstacles.filter(o=>!(o.y>S.py-220&&o.y<S.py-30));
    S.ability.blast=true;S.ability.blastT=600;
    
    burst(S.px,S.py-50,'#FFD700',20);
  }else if(ab.name==='RAIN TIRES'){
    S.mult=1.5;S.multT=ab.dur;
  }else if(ab.name==='TURBO'){
    S.mult=3;S.multT=ab.dur;
    burst(S.px,S.py+20,'#FF8C00',28);
  }else if(ab.name==='HEAVY TREADS'){
    S.heavyTreads=ab.dur;
    burst(S.px,S.py,'#888',14);
  }else if(ab.name==='LED LIGHTS'){
    S.ledLights=ab.dur;
    burst(S.px,S.py-40,'#FFFFAA',22);
  }
}

//SPAWN
const OTYPES=[
  {tp:'car',  w:32, h:52, col:'#e05555', beh:'static', pts:10, fr:30},
  {tp:'car',  w:32, h:52, col:'#5588e0', beh:'static', pts:10, fr:25},
  {tp:'taxi', w:32, h:52, col:'#FFD700', beh:'static', pts:10, fr:20},
  {tp:'barricade',w:94,h:16,col:'#FF5500',beh:'static',pts:20, fr:8, lanes:2},
  {tp:'pothole', w:72, h:36, col:'#4488cc', beh:'static', pts:20, fr:20, lanes:1},
  {tp:'bus',  w:38, h:88, col:'#cc2211', beh:'static', pts:20, fr:12, lanes:1},
  {tp:'bike', w:18, h:40, col:'#aaa',    beh:'switch', pts:15, fr:28},
];
const CTYPES=[
  {tp:'chai',   em:'🍵', col:'#FF8C00', pts:0,  heal:true},
  {tp:'coin',   em:'🪙', col:'#FFD700', pts:5},
  {tp:'coin',   em:'🪙', col:'#FFD700', pts:5},
  {tp:'coin',   em:'🪙', col:'#FFD700', pts:5},
  {tp:'vadapav',em:'🥔', col:'#D4A017', pts:20},
];

function spawnObs(){
  const ph=PHASES[S.phase];
  let pool=OTYPES.filter(o=>{
    if(o.tp==='barricade'&&S.phase<2)return false;
    if(o.tp==='pothole'&&S.phase!==1)return false;
    if(o.tp==='bus'&&S.phase>2)return false;
    if(o.tp==='bike'&&S.phase!==3)return false;
    return true;
  });
  // Check recent obstacles to reduce stacking
  let tf=pool.reduce((s,o)=>s+o.fr,0);
  let r=Math.random()*tf;
  let def=pool[0];
  for(const o of pool){r-=o.fr;if(r<=0){def=o;break;}}
  const lc=def.lanes||1;
  const sl=lc===2?Math.floor(Math.random()*3):Math.floor(Math.random()*4);
  const cx=lc===2?(LC[sl]+LC[sl+1])/2:LC[sl];
  // Avoid collision with existing obstacles
  for(const ex of S.obstacles){
    if(Math.abs(ex.x-cx)<50&&Math.abs(ex.y)<80)return;
  }
  const spd2=ph.spd*S.baseSpd*(0.25+Math.random()*.2);
  const obs={...def,x:cx,y:-110,sl,lc,spd:spd2,mvDir:(Math.random()>.5?1:-1)*2,mvT:30+Math.random()*50,alive:true};
  if(def.beh==='switch')obs.targetX=cx;
  S.obstacles.push(obs);
}
function spawnCol(){
  const lane=Math.floor(Math.random()*4);
  const t=CTYPES[Math.floor(Math.random()*CTYPES.length)];
  S.collectibles.push({...t,x:LC[lane],y:-30,alive:true,bob:Math.random()*Math.PI*2});
}

//PARTICLES & FLOAT TEXTS
function burst(x,y,col,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,sp=3+Math.random()*5;
    S.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,col,a:1,sz:2+Math.random()*3,dec:.025+Math.random()*.025});
  }
}
function sparkTrail(x,y,col){
  for(let i=0;i<3;i++){
    const a=Math.PI/2+Math.PI*.2*(Math.random()-.5);
    S.particles.push({x:x+(Math.random()-.5)*10,y,vx:Math.cos(a)*2,vy:Math.sin(a)*2+2,col,a:.7,sz:1.5+Math.random()*2,dec:.04});
  }
}
function floatText(x,y,text,col){S.floats.push({x,y,text,col,a:1,vy:-1.8});}

//PHASE
function checkPhase(){
  for(let i=PHASES.length-1;i>=0;i--){
    if(S.dist>=PHASES[i].minD&&S.phase<i){
      S.phase=i;
      announcePhase();
      const wx=PHASES[i].wx;
      const rv=document.getElementById('rain-veil');
      // Rain only during Afternoon Rain (phase 1), clear after
      if(S.phase===1){
        S.rainInt=0.6;rv.classList.add('on');
      } else {
        S.rainInt=wx==='chaos'?1.6:0;
        S.rain=[];
        rv.classList.remove('on');
      }
      break;
    }
  }
}
function announcePhase(){
  const ph=PHASES[S.phase];
  document.getElementById('phNum').textContent='Phase '+(S.phase+1);
  document.getElementById('phName').textContent=ph.name;
  document.getElementById('hPhase').textContent=ph.name;
  const el=document.getElementById('ph-ann');
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2800);
}

//COLLISION
function colObs(obs){
  return Math.abs(S.px-obs.x)<(30+obs.w/2)*.5&&Math.abs(S.py-obs.y)<(55+obs.h/2)*.55;
}
function colCol(c){return Math.abs(S.px-c.x)<28&&Math.abs(S.py-c.y)<32;}

//UPDATE
const PY = H - 130;

function update(){
  if(!S||!S.run||S.over)return;
  S.frame++;
  const ph=PHASES[S.phase];

  
  if(S.heavyTreads>0)S.heavyTreads-=16;
  if(S.ledLights>0)S.ledLights-=16;

  
  if(S.phase===1&&S.heavyTreads<=0){
    if(S.frame%40===0){
      const prev=S.spdVar;
      S.spdVar=1.0+Math.random()*0.5;
      if(Math.abs(S.spdVar-prev)>0.2){
        
        [-10,10].forEach(wx=>{
          for(let i=0;i<6;i++){
            S.particles.push({
              x:S.px+wx+(Math.random()-.5)*8,
              y:PY+18+(Math.random()*12),
              vx:(Math.random()-.5)*.8,
              vy:Math.random()*1.5+.5,
              col:'#333',
              a:.95,sz:4+Math.random()*4,dec:.018
            });
          }
        });
      }
    }
  } else {
    S.spdVar=1;
  }
  const spd=S.baseSpd*ph.spd*S.spdVar;
  S.roadY=(S.roadY+spd)%2090;
  S.dist+=spd*.09;
  S.score+=spd*.14*S.mult|0;
  if(S.frame%60===0)checkPhase();

  
  const tx=LC[S.ptLane];
  S.px+=(tx-S.px)*.2;
  if(Math.abs(S.px-tx)<.5){S.px=tx;S.pLane=S.ptLane;}

  
  if(S.invince){S.invT-=16;if(S.invT<=0)S.invince=false;}

  // Ability timers
  if(S.ability.active){S.ability.aTimer-=16;if(S.ability.aTimer<=0){S.ability.active=false;S.mult=1;}}
  if(S.ability.cd>0)S.ability.cd-=16;
  if(S.ability.blast){S.ability.blastT-=16;if(S.ability.blastT<=0)S.ability.blast=false;}
  if(S.multT>0){S.multT-=16;if(S.multT<=0)S.mult=1;}

  // Spawn
  const sRate=Math.max(18,75/ph.den);
  S.spawnT++;if(S.spawnT>=sRate){S.spawnT=0;if(Math.random()<.85)spawnObs();}
  S.colT++;if(S.colT>=110){S.colT=0;if(Math.random()<.6)spawnCol();}

  // Obstacles
  S.obstacles=S.obstacles.filter(o=>{
    o.y+=spd;
    if(o.beh==='erratic'){o.x+=o.mvDir;o.mvT--;if(o.mvT<=0){o.mvDir=(Math.random()>.5?1:-1)*(1.5+Math.random()*2);o.mvT=20+Math.random()*40;}o.x=Math.max(RL+o.w/2,Math.min(RR-o.w/2,o.x));}
    if(o.beh==='slow')o.y+=spd*.25;
    if(o.beh==='switch'){
      o.x+=(o.targetX-o.x)*.08;
      if(!o.switchT)o.switchT=60+Math.random()*60;
      o.switchT--;
      const farEnough=Math.abs(o.y-S.py)>150;
      if(o.switchT<=0&&farEnough){
        const newLane=Math.floor(Math.random()*4);
        o.targetX=LC[newLane];
        o.switchT=60+Math.random()*60;
      } else if(o.switchT<=0){
        o.switchT=20; // retry soon
      }
    }
    if(!S.invince&&o.alive&&colObs(o)){o.alive=false;hitPlayer();return false;}
    return o.y<H+130;
  });

  // Collectibles
  S.collectibles=S.collectibles.filter(c=>{
    c.y+=spd;
    if(c.alive&&colCol(c)){c.alive=false;collectItem(c);return false;}
    return c.y<H+50;
  });

  // Particles
  S.particles=S.particles.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=.1;p.a-=p.dec;return p.a>0;});
  S.floats=S.floats.filter(f=>{f.y+=f.vy;f.a-=.022;return f.a>0;});

  // Rain
  if(S.rainInt>0){
    for(let i=0;i<S.rainInt*4;i++)S.rain.push({x:Math.random()*W,y:-10,spd:8+Math.random()*6,len:14+Math.random()*18,a:.15+Math.random()*.35});
    S.rain=S.rain.filter(r=>{r.y+=r.spd;r.x-=2;return r.y<H+30;});
    // Sparks from rain hitting road
    if(S.frame%5===0&&S.rainInt>0)sparkTrail(RL+Math.random()*RW,H-5,'#5599ff');
  }

  // Speed lines (at high phases)
  if(ph.spd>2&&S.frame%3===0)sparkTrail(RL+Math.random()*RW,S.py-80,'rgba(255,255,255,.3)');

  updateHUD();
}

function hitPlayer(){
  S.lives--;
  burst(S.px,S.py,'#FF4444',22);burst(S.px,S.py,'#FF8800',14);
  if(S.lives<=0){gameOver();return;}
  S.invince=true;S.invT=2500;
  
}
function collectItem(c){
  S.collected++;
  burst(c.x,c.y,c.col,8);
  if(c.heal){
    if(S.lives<5){S.lives=Math.min(5,S.lives+1);floatText(c.x,c.y,'+1 ❤','#FF8C00');}
  } else {
    S.score+=Math.round(c.pts*S.mult);
    floatText(c.x,c.y,'+'+c.pts,'#FFD700');
  }
}
function updateHUD(){
  document.getElementById('hScore').textContent=S.score.toLocaleString();
  document.getElementById('hDist').textContent=Math.floor(S.dist)+'m';
  const ls=document.getElementById('hLives').querySelectorAll('.life');
  ls.forEach((l,i)=>l.classList.toggle('gone',i>=S.lives));
  const ab=curAb();
  const ready=!S.ability.active&&S.ability.cd<=0;
  document.getElementById('abName').textContent=ab.name;
  document.getElementById('hAb').style.opacity=ready?'1':'.4';
  const pct=S.ability.cd>0?1-(S.ability.cd/ab.cd):1;
  document.getElementById('abFill').style.width=(pct*100)+'%';
}

//DRAW FUNCTIONS
function drawBG(){
  const ph=PHASES[S.phase];
  const g=ctx.createLinearGradient(0,0,0,H*.45);
  g.addColorStop(0,ph.sky[0]);g.addColorStop(1,ph.sky[1]);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}

function drawSidewalks(){
  ctx.fillStyle='#131008';ctx.fillRect(0,0,RL,H);ctx.fillRect(RR,0,W-RR,H);
  ctx.strokeStyle='rgba(255,140,30,.07)';ctx.lineWidth=1;
  for(let y=(-S.roadY%40);y<H;y+=40){
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(RL,y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(RR,y);ctx.lineTo(W,y);ctx.stroke();
  }
}

function drawRoad(){
  
  const g=ctx.createLinearGradient(RL,0,RR,0);
  g.addColorStop(0,'#1c1c1c');g.addColorStop(.5,'#212121');g.addColorStop(1,'#1c1c1c');
  ctx.fillStyle=g;ctx.fillRect(RL,0,RW,H);
  
  ctx.strokeStyle='rgba(255,200,0,.4)';ctx.lineWidth=3;
  [RL,RR].forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();});
  
  ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=1.5;
  ctx.setLineDash([30,22]);ctx.lineDashOffset=-S.roadY;
  [1,2,3].forEach(l=>{const x=RL+LW*l;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();});
  ctx.setLineDash([]);
  
  drawLamps();
  
  
}

function drawLamps(){
  const sp=190,off=S.roadY%sp;
  for(let y=off;y<H+sp;y+=sp){
    const glow=S.phase>=1;
    
    ctx.strokeStyle='#444';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(RL-14,y+50);ctx.lineTo(RL-14,y);ctx.lineTo(RL-14+18,y);ctx.stroke();
    ctx.fillStyle='#FFE580';ctx.beginPath();ctx.arc(RL+4,y,5,0,Math.PI*2);ctx.fill();
    if(glow){
      const lg=ctx.createRadialGradient(RL+4,y,0,RL+4,y+50,55);
      lg.addColorStop(0,'rgba(255,190,50,.18)');lg.addColorStop(1,'transparent');
      ctx.fillStyle=lg;ctx.fillRect(RL-30,y,80,120);
    }
    
    ctx.strokeStyle='#444';
    ctx.beginPath();ctx.moveTo(RR+14,y+50);ctx.lineTo(RR+14,y);ctx.lineTo(RR+14-18,y);ctx.stroke();
    ctx.fillStyle='#FFE580';ctx.beginPath();ctx.arc(RR-4,y,5,0,Math.PI*2);ctx.fill();
    if(glow){
      const rg=ctx.createRadialGradient(RR-4,y,0,RR-4,y+50,55);
      rg.addColorStop(0,'rgba(255,190,50,.18)');rg.addColorStop(1,'transparent');
      ctx.fillStyle=rg;ctx.fillRect(RR-50,y,80,120);
    }
  }
}


function drawRickshaw(x, y, inv) {
  const blink = inv && Math.floor(Date.now() / 70) % 2 === 0;
  if (blink) return;

  ctx.save();

  
    const imgW = 120;
    const imgH = 80;
    const angle = Math.PI;
    ctx.translate(x, y);
    ctx.rotate((angle * 3) / 2);
    ctx.drawImage(rickshawImg, -imgW / 2, -imgH / 2, imgW, imgH);
  

  ctx.restore();
}

function drawObs(o){
  ctx.save();
  switch(o.tp){
    case 'car': case 'taxi': case 'auto': drawCar(o);break;
    case 'bus':  drawBus(o);break;
    case 'bike': drawBike(o);break;
    case 'barricade':drawBarricade(o);break;
    case 'pothole': drawPothole(o);break;
    default:     drawCar(o);
  }
  ctx.restore();
}

function drawCar(o){
  const {x,y,}=o;
    const imgW = 100;
    const imgH = 80;
    const angle = Math.PI;
    ctx.translate(x, y);
    
    ctx.drawImage(carImg, -imgW / 2, -imgH / 2, imgW, imgH);
}

function drawBus(o){
  const {x,y}=o;
  const imgW = 100;
    const imgH = 80;
    const angle = Math.PI;
    ctx.translate(x, y);
    ctx.rotate((angle * 3) / 2);
    ctx.drawImage(busImg, -imgW / 2, -imgH / 2, imgW, imgH);
}


function drawBike(o){
  const {x,y}=o;
  const imgW = 100;
    const imgH = 80;
    const angle = Math.PI;
    ctx.translate(x, y);
    
    ctx.drawImage(bikeImg, -imgW / 2, -imgH / 2, imgW, imgH);
}


function drawBarricade(o){
  const {x,y,w}=o;const hw=w/2;
  ctx.fillStyle='#FF5500';ctx.fillRect(x-hw,y-7,w,14);
  ctx.fillStyle='rgba(255,255,255,.65)';
  for(let i=-4;i<=4;i++){if(i%2===0)ctx.fillRect(x+i*11-5,y-7,11,14);}
  // Cones
  [-hw+6,hw-6].forEach(cx=>{
    ctx.fillStyle='#FF5500';ctx.beginPath();ctx.moveTo(x+cx,y-22);ctx.lineTo(x+cx-9,y+8);ctx.lineTo(x+cx+9,y+8);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.8)';ctx.fillRect(x+cx-9,y-3,18,4);
    ctx.fillStyle='#2a2a2a';ctx.fillRect(x+cx-11,y+7,22,5);
  });
}

function drawPothole(o){
  const {x,y,w}=o;
 
  ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.ellipse(x,y+12,w/2,14,0,0,Math.PI*2);ctx.fill();
 
  ctx.fillStyle='rgba(40,100,180,.85)';ctx.beginPath();ctx.ellipse(x,y+12,w/2-4,11,0,0,Math.PI*2);ctx.fill();
 
  ctx.fillStyle='rgba(120,180,255,.3)';ctx.beginPath();ctx.ellipse(x-6,y+8,10,4,-.3,0,Math.PI*2);ctx.fill();
 
  ctx.strokeStyle='#555';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(x,y+12,w/2,14,0,0,Math.PI*2);ctx.stroke();
 
  const bw=w-8,by=y-8;
  ctx.fillStyle='#FF5500';ctx.fillRect(x-bw/2,by-5,bw,10);
  ctx.fillStyle='rgba(255,255,255,.7)';
  for(let i=0;i<6;i++){if(i%2===0)ctx.fillRect(x-bw/2+i*(bw/6),by-5,bw/6,10);}
  
  [x-bw/2+8,x+bw/2-8].forEach(lx=>{
    ctx.fillStyle='#333';ctx.fillRect(lx-3,by+5,6,10);
  });
}

function drawCollectibles(){
  S.collectibles.forEach(c=>{
    const bob=Math.sin(S.frame*.08+c.bob)*3;
    ctx.save();ctx.translate(c.x,c.y+bob);
   
    ctx.strokeStyle=c.col+'88';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,14+Math.sin(S.frame*.12+c.bob)*2,0,Math.PI*2);ctx.stroke();
    ctx.font='17px serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(c.em,0,0);
    ctx.restore();
  });
}

function drawParticles(){
  S.particles.forEach(p=>{
    ctx.save();ctx.globalAlpha=p.a;ctx.fillStyle=p.col;
    ctx.beginPath();ctx.arc(p.x,p.y,p.sz,0,Math.PI*2);ctx.fill();
    ctx.restore();
  });
}

function drawFloats(){
  S.floats.forEach(f=>{
    ctx.save();ctx.globalAlpha=f.a;
    ctx.font='bold 26px "Baloo 2",cursive';ctx.textAlign='center';
    ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=4;
    ctx.strokeText(f.text,f.x,f.y);
    ctx.fillStyle=f.col;ctx.fillText(f.text,f.x,f.y);
    ctx.restore();
  });
}

function drawHornBlast(){
  if(!S.ability.blast)return;
  const t=S.ability.blastT/600;
  ctx.save();ctx.globalAlpha=t*.3;
  ctx.fillStyle='#FFD700';ctx.beginPath();
  ctx.ellipse(S.px,S.py-120,55*(1-t*.3),170*(1-t*.2),0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=t;
  ctx.font=`bold ${28+(1-t)*14}px "Baloo 2",cursive`;ctx.textAlign='center';
  ctx.fillStyle='#FFD700';ctx.strokeStyle='#000';ctx.lineWidth=4;
  ctx.strokeText('HONK!',S.px,S.py-100);ctx.fillText('HONK!',S.px,S.py-100);
  ctx.restore();
}

function drawRain(){
  if(S.rainInt<=0||S.rain.length===0)return;
  ctx.save();ctx.strokeStyle='rgba(180,200,255,.4)';ctx.lineWidth=1;
  S.rain.forEach(r=>{
    ctx.globalAlpha=r.a;ctx.beginPath();ctx.moveTo(r.x,r.y);ctx.lineTo(r.x-3,r.y+r.len);ctx.stroke();
  });
  ctx.restore();
}

function drawVignette(){
  const v=ctx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,H*.8);
  v.addColorStop(0,'transparent');v.addColorStop(1,'rgba(0,0,0,.45)');
  ctx.fillStyle=v;ctx.fillRect(0,0,W,H);

  
  if(S.phase===3&&S.ledLights<=0){
    const fogH=H*0.5;
    const fg=ctx.createLinearGradient(0,0,0,fogH);
    fg.addColorStop(0,'rgba(0,0,0,.97)');
    fg.addColorStop(0.6,'rgba(0,0,0,.85)');
    fg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=fg;ctx.fillRect(0,0,W,fogH);
  }
}

//MAIN RENDER
function render(){
  if(!S)return;
  ctx.clearRect(0,0,W,H);
  drawBG();;drawSidewalks();drawRoad();drawCollectibles();S.obstacles.forEach(drawObs);drawRickshaw(S.px,PY,S.invince);
  drawHornBlast();drawParticles();drawFloats();drawRain();drawVignette();
}

//LOOP
let lastT=0;
function loop(ts){
  const dt=ts-lastT;
  lastT=ts;
  update();
  render();
  requestAnimationFrame(loop);
}

//GAME OVER
function gameOver(){
  S.run=false;S.over=true;
  document.getElementById('hud').style.display='none';
  document.getElementById('goScore').textContent=S.score.toLocaleString();
  document.getElementById('goDist').textContent=Math.floor(S.dist)+'m';
  document.getElementById('goCol').textContent=S.collected;
  document.getElementById('goPhase').textContent=S.phase+1;
  document.getElementById('go').style.display='flex';
}

function startGame(){
  ['title','go'].forEach(id=>{document.getElementById(id).style.display='none';});
  document.getElementById('hud').style.display='block';
  document.getElementById('rain-veil').classList.remove('on');
  document.getElementById('ph-ann').classList.remove('show');
  S=newState();S.run=true;S.py=PY;
  document.getElementById('hPhase').textContent='Morning Rush';
}

requestAnimationFrame(loop);
