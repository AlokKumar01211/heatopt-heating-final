/* ===== UI layer: reads the model's outputs and draws them ===== */
const CITY_INFO={Boston:{label:'Boston',region:'Massachusetts',c:'var(--boston)'},Atlanta:{label:'Atlanta',region:'Georgia',c:'var(--atlanta)'},Montreal:{label:'Montreal',region:'Quebec',c:'var(--montreal)'}};
const PICK={cost:{label:'Lowest cost',icon:'$',c:'var(--pick-cost)',hex:'#d98a00',b1:'#a8741c',title:'Lowest annualized cost',why:'Lowest total cost per year, including the heat pump purchase.'},
            balanced:{label:'Optimal',icon:'⚖',c:'var(--pick-bal)',hex:'#6250d6',b1:'#5a4fb8',title:'Optimal balance of cost + CO₂',why:'Best trade-off once carbon is valued at $190 per tonne.'},
            carbon:{label:'Lowest CO₂',icon:'❋',c:'var(--pick-co2)',hex:'#1baf7a',b1:'#2a8a6c',title:'Lowest annual CO₂',why:'Cuts the most emissions, at a higher cost.'}};
const RULE={first:'heat pump always runs first',cost:'heat pump runs only when it is cheaper than the backup',carbon:'heat pump runs only when it is lower-carbon than the backup',balanced:'heat pump runs when it is cheaper once CO₂ is priced at $190/t','backup only':'backup heats the whole home'};
const SHORTFUEL={electric_resistance:'Electric resistance',natural_gas:'Natural gas',heating_oil:'Heating oil',propane:'Propane',wood:'Wood'};
const MONTHS=['J','F','M','A','M','J','J','A','S','O','N','D'],MONTH_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'],MDAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
const kwh=v=>Math.round(v).toLocaleString('en-US'),t2=kg=>(kg/1000).toFixed(2);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let lastInput=null,cityCache={},isExample=true;

/* ---------- city cards built from the model data ---------- */
(function buildCities(){
  $('cities').innerHTML=Object.keys(CITY_INFO).map((c,i)=>{const d=DATA.cities[c];
    return `<label class="city" style="--c:${CITY_INFO[c].c}"><input type="radio" name="city" value="${c}" ${i===0?'checked':''}><span class="nm"><span class="dot"></span>${c}</span><span class="meta">${d.design.toFixed(1)}°C design<br>${Math.round(d.ef.electricity)} g/kWh grid</span></label>`}).join('');
})();
const cityValue=()=>document.querySelector('input[name=city]:checked').value;

/* ---------- re-run one configuration hour by hour for the charts ---------- */
function detail(city,p,cfg){
  const d=DATA.cities[city],n=p.load.length,mHP=new Array(12).fill(0),mBK=new Array(12).fill(0),bins=new Map();
  const priceElec=fuelPrice(city,'electric_resistance'),efElec=emissions(city,'electric_resistance');
  const unitCost=fuelPrice(city,cfg.backup)/EFF[cfg.backup],unitCarbon=emissions(city,cfg.backup)/EFF[cfg.backup];
  let curve=null,ratio=0;
  if(cfg.size>0){curve=DATA.models[cfg.model];ratio=p.design*cfg.size/interpolate(curve.temps,curve.cap,d.design);}
  const monthEnd=[];let acc=0;for(const m of MDAYS){acc+=m*24;monthEnd.push(acc)}
  let month=0,hpHeat=0,elec=0,minT=99,maxT=-99;
  for(let i=0;i<n;i++){
    while(i>=monthEnd[month])month++;
    const load=p.load[i],t=d.t[i]/10;let hp=0,cop=1;
    if(ratio>0&&load>0){
      const cap=Math.max(0,interpolate(curve.temps,curve.cap,t))*ratio,c=interpolate(curve.temps,curve.cop,t);
      const h=cap>0&&c>1?Math.min(load,cap):0,plr=cap>0?h/cap:0,pen=plr<.3?1-.25*(1-plr/.3):1;
      hp=Math.fround(h);cop=Math.fround(Math.max(1,c*pen));
      if(hp>0&&cfg.rule!=='first'){const hc=priceElec/cop,hk=efElec/cop;
        if(cfg.rule==='cost'&&hc>unitCost||cfg.rule==='carbon'&&hk>unitCarbon||cfg.rule==='balanced'&&hc+.00019*hk>unitCost+.00019*unitCarbon)hp=0;}
    }
    const bk=load-hp;mHP[month]+=hp;mBK[month]+=bk;hpHeat+=hp;elec+=hp/cop;
    if(load>0){const b=Math.floor(t/2)*2;minT=Math.min(minT,b);maxT=Math.max(maxT,b);const o=bins.get(b)||{hp:0,bk:0};o.hp+=hp;o.bk+=bk;bins.set(b,o);}
  }
  const binArr=[];for(let b=minT;b<=maxT;b+=2){const o=bins.get(b)||{hp:0,bk:0};binArr.push({t:b,...o})}
  return {mHP,mBK,bins:binArr,scop:elec>0?hpHeat/elec:null};
}

/* ---------- tiny SVG helpers ---------- */
function niceTicks(min,max,count=5){const span=max-min||1,step0=span/count,mag=Math.pow(10,Math.floor(Math.log10(step0))),f=step0/mag,step=(f<1.5?1:f<3?2:f<7?5:10)*mag;
  const lo=Math.floor(min/step)*step,hi=Math.max(lo+step,Math.ceil(max/step)*step),out=[];for(let v=lo;v<=hi+step/2;v+=step)out.push(+v.toFixed(10));return out}
const fmtK=v=>Math.abs(v)>=1000?(v/1000).toFixed(v%1000===0?0:1)+'k':String(Math.round(v));

function drawScatter(x){
  const W=Math.round(Math.max(340,Math.min(680,$('scatter').clientWidth||680))),H=W<500?300:330,m={l:W<500?46:58,r:14,t:14,b:44};$('scatter').setAttribute('viewBox',`0 0 ${W} ${H}`),iw=W-m.l-m.r,ih=H-m.t-m.b;
  const pts=x.configs,xs=pts.map(c=>c.annualized),ys=pts.map(c=>c.carbon/1000);
  const xt=niceTicks(Math.min(...xs),Math.max(...xs)),yt=niceTicks(0,Math.max(...ys));
  const X=v=>m.l+(v-xt[0])/(xt[xt.length-1]-xt[0])*iw,Y=v=>m.t+ih-(v-yt[0])/(yt[yt.length-1]-yt[0])*ih;
  let g='';
  yt.forEach(v=>{g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e8ebf3"/><text x="${m.l-8}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="#6b7590">${v.toFixed(v<10&&yt[1]-yt[0]<1?1:0)}</text>`});
  xt.forEach(v=>{g+=`<text x="${X(v)}" y="${H-m.b+18}" text-anchor="middle" font-size="11" fill="#6b7590">$${fmtK(v)}</text>`});
  g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${m.t+ih}" y2="${m.t+ih}" stroke="#b9c0d2"/>`;
  g+=`<text x="${m.l+iw/2}" y="${H-4}" text-anchor="middle" font-size="11.5" fill="#46526b" font-weight="600">${W<500?'Annualized cost per year':'Annualized cost per year (energy + heat pump capital)'}</text>`;
  g+=`<text transform="translate(13 ${m.t+ih/2}) rotate(-90)" text-anchor="middle" font-size="11.5" fill="#46526b" font-weight="600">Tonnes CO₂e per year</text>`;
  const picks=new Set([x.b.cost,x.b.balanced,x.b.carbon]);
  const tip=c=>`<b>${c.size?`${esc(c.model)} at ${Math.round(c.size*100)}%`:'No heat pump'}</b> + ${esc(SHORTFUEL[c.backup])}<br>${c.size?esc(RULE[c.rule])+'<br>':''}${fmt(c.annualized)}/yr · ${t2(c.carbon)} t CO₂e · ${Math.round(c.hpShare*100)}% from heat pump`;
  pts.forEach(c=>{if(picks.has(c)||c.size===0)return;g+=`<circle cx="${X(c.annualized).toFixed(1)}" cy="${Y(c.carbon/1000).toFixed(1)}" r="4" fill="#fff" stroke="#9aa3b8" stroke-width="1.3" opacity=".75" data-tip="${esc(tip(c))}"/>`});
  pts.filter(c=>c.size===0).forEach(c=>{const cx=X(c.annualized),cy=Y(c.carbon/1000);
    const isPick=picks.has(c),right=cx>W-150;
    g+=`<rect x="${cx-5}" y="${cy-5}" width="10" height="10" transform="rotate(45 ${cx} ${cy})" fill="#fff" stroke="#5d6680" stroke-width="2" data-tip="${esc(tip(c))}"/>`;
    if(!isPick)g+=`<text x="${right?cx-10:cx+10}" y="${cy+4}" text-anchor="${right?'end':'start'}" font-size="10.5" fill="#46526b">${esc(SHORTFUEL[c.backup])} only</text>`});
  const placed=[];
  ['cost','balanced','carbon'].forEach(k=>{const c=x.b[k],cx=X(c.annualized),cy=Y(c.carbon/1000),P=PICK[k];
    let ly=cy-12;placed.forEach(p=>{if(Math.abs(p-ly)<14)ly=p-15});placed.push(ly);
    const right=cx>W-(W<500?110:150);
    g+=`<circle cx="${cx}" cy="${cy}" r="${active===k?9:7}" fill="${P.hex}" stroke="#fff" stroke-width="2.5" data-tip="${esc(`<b>${P.label}</b><br>`+tip(c))}" style="cursor:pointer" data-pick="${k}"/>`;
    const extra=c.size===0?` (${SHORTFUEL[c.backup].toLowerCase()} only)`:'';
    g+=`<text x="${right?cx-12:cx+12}" y="${ly}" text-anchor="${right?'end':'start'}" font-size="11.5" font-weight="800" fill="#16213e" paint-order="stroke" stroke="#fff" stroke-width="3">${P.label}${extra}</text>`;});
  $('scatter').innerHTML=g;
  $('scatter').querySelectorAll('[data-pick]').forEach(el=>el.addEventListener('click',()=>{active=el.dataset.pick;render(current)}));
  const rows=[...pts].sort((a,b)=>a.annualized-b.annualized);
  $('scatterTable').innerHTML='<table class="cmp"><thead><tr><th>System</th><th>Control</th><th>Cost /yr</th><th>CO₂ /yr</th><th>HP share</th></tr></thead><tbody>'+rows.map(c=>`<tr><td>${c.size?`${esc(c.model)} ${Math.round(c.size*100)}%`:'No heat pump'} + ${esc(SHORTFUEL[c.backup])}</td><td>${c.size?c.rule:'—'}</td><td>${fmt(c.annualized)}</td><td>${t2(c.carbon)} t</td><td>${Math.round(c.hpShare*100)}%</td></tr>`).join('')+'</tbody></table>';
}

function stacked(id,labels,a,b,opts){
  const W=400,H=250,m={l:44,r:8,t:10,b:opts.xTitle?38:24},iw=W-m.l-m.r,ih=H-m.t-m.b,n=labels.length;
  const tot=a.map((v,i)=>v+b[i]),yt=niceTicks(0,Math.max(...tot,1),4),Y=v=>m.t+ih-v/yt[yt.length-1]*ih;
  const slot=iw/n,bw=Math.max(3,slot*.68);let g='';
  yt.forEach(v=>{g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e8ebf3"/><text x="${m.l-6}" y="${Y(v)+4}" text-anchor="end" font-size="10.5" fill="#6b7590">${fmtK(v)}</text>`});
  labels.forEach((L,i)=>{const x0=m.l+i*slot+(slot-bw)/2,ha=Y(0)-Y(a[i]),hb=Y(0)-Y(b[i]),r=Math.min(3,bw/2);
    if(a[i]>0)g+=`<rect x="${x0}" y="${Y(a[i])}" width="${bw}" height="${Math.max(0,ha-(b[i]>0?1:0))}" rx="${b[i]>0?0:r}" fill="var(--hp)"/>`;
    if(b[i]>0)g+=`<rect x="${x0}" y="${Y(a[i]+b[i])}" width="${bw}" height="${Math.max(0,hb-(a[i]>0?1:0))}" rx="${r}" fill="var(--backup)"/>`;
    if(opts.showLabel(i))g+=`<text x="${x0+bw/2}" y="${H-m.b+15}" text-anchor="middle" font-size="10.5" fill="#6b7590">${L}</text>`;
    g+=`<rect x="${m.l+i*slot}" y="${m.t}" width="${slot}" height="${ih}" fill="transparent" data-tip="${esc(`<b>${opts.tipTitle(i)}</b><br>Heat pump: ${kwh(a[i])} kWh<br>${opts.bk}: ${kwh(b[i])} kWh`)}"/>`;});
  if(opts.marker!=null){const i=labels.findIndex(v=>v>opts.marker);if(i>0){const xm=m.l+i*slot-slot*((labels[i]-opts.marker)/2);
    g+=`<line x1="${xm}" x2="${xm}" y1="${m.t}" y2="${m.t+ih}" stroke="#16213e" stroke-dasharray="3 3" stroke-width="1"/><text x="${xm+4}" y="${m.t+10}" font-size="10" fill="#16213e" font-weight="700">design ${opts.marker}°C</text>`}}
  g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#b9c0d2"/>`;
  if(opts.xTitle)g+=`<text x="${m.l+iw/2}" y="${H-3}" text-anchor="middle" font-size="11" fill="#46526b" font-weight="600">${opts.xTitle}</text>`;
  $(id).innerHTML=g;
}

/* ---------- city comparison ---------- */
function renderCities(input){
  $('citygrid').innerHTML=Object.keys(CITY_INFO).map(c=>{const r=cityCache[c]||(cityCache[c]=calculate({...input,city:c})),ci=CITY_INFO[c];
    if(!r||r.error)return `<div class="cc" style="--c:${ci.c}"><div class="h">${c}</div><p class="smallprint">${esc(r?r.error:'—')}</p></div>`;
    const v=r.b.balanced,hp=Math.round(v.hpShare*100);
    return `<div class="cc ${c===input.city?'me':''}" style="--c:${ci.c}"><div class="h">${c}${c===input.city?'<span>Your city</span>':''}</div>
      <div class="pick">${v.size?`${Math.round(v.size*100)}% heat pump + ${esc(SHORTFUEL[v.backup].toLowerCase())}`:esc(SHORTFUEL[v.backup])+' only'}</div>
      <dl><dt>Design temp</dt><dd>${DATA.cities[c].design.toFixed(1)}°C</dd><dt>Peak need</dt><dd>${r.p.design.toFixed(1)} kW</dd><dt>Cost /yr</dt><dd>${fmt(v.annualized)}</dd><dt>CO₂ /yr</dt><dd>${t2(v.carbon)} t</dd></dl>
      <div class="bar" data-tip="${hp}% of heat from the heat pump"><i style="width:${hp}%;background:var(--hp)"></i><i style="flex:1;background:var(--backup)"></i></div>
      <div class="smallprint" style="margin-top:4px">${hp}% heat pump · ${100-hp}% backup</div></div>`}).join('');
}

/* ---------- main render ---------- */
function render(x){
  current=x;if(!x||x.error){$('error').textContent=x?x.error:'';return}
  $('error').textContent='';
  const ch=x.b[active],P=PICK[active];
  $('tag').textContent=isExample?'Example home':'Your home';$('tag').classList.toggle('on',!isExample);
  if(document.body.classList.contains('simple')){renderSimple(x);return;}
  // objective cards
  $('choices').innerHTML=['cost','balanced','carbon'].map(k=>{const v=x.b[k],p=PICK[k];
    return `<button type="button" role="tab" aria-selected="${active===k}" data-select="${k}" class="obj ${active===k?'active':''}" style="--c:${p.c}"><span class="k"><i>${p.icon}</i>${p.label}</span><span class="v tnum">${fmt(v.annualized)}<small>/yr</small></span><span class="c tnum">${t2(v.carbon)} t CO₂e/yr</span><span class="w">${v.size?`${Math.round(v.size*100)}% HP + ${esc(SHORTFUEL[v.backup].toLowerCase())}`:esc(SHORTFUEL[v.backup])+' only'}</span></button>`}).join('');
  document.querySelectorAll('[data-select]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.select;render(current)}));
  // banner
  const bn=$('banner');bn.style.setProperty('--b1',P.b1);
  $('recommendLabel').textContent=P.title;
  $('winner').textContent=ch.size===0?FUEL[ch.backup]+' only':`${Math.round(ch.size*100)}% heat pump + ${FUEL[ch.backup].toLowerCase()}`;
  $('reason').textContent=ch.size===0?'Under this goal the model favours a backup-only system.':`${ch.model}, sized to ${Math.round(ch.size*100)}% of the design load. Control: ${RULE[ch.rule]}.`;
  const share=Math.round(ch.hpShare*100);$('donutArc').setAttribute('stroke-dasharray',`${(share/100*100.5).toFixed(1)} 101`);
  $('donutPct').textContent=share+'%';
  // detail run for this configuration
  const det=detail(x.city,x.p,ch);
  // KPIs
  $('size').textContent=ch.size?(ch.peak*ch.size).toFixed(1)+' kW':'No heat pump';
  $('sizeNote').textContent=ch.size?`${Math.round(ch.size*100)}% of ${x.p.design.toFixed(1)} kW design load`:'at winter design temperature';
  $('share').textContent=share+'%';$('scop').textContent=det.scop?`seasonal COP ${det.scop.toFixed(2)}`:'no heat pump in this system';
  $('peak').textContent=x.p.design.toFixed(1)+' kW';$('annualHeat').textContent=kwh(x.p.total)+' kWh of heat a year';
  $('operating').textContent=fmt(ch.annual);$('co2').textContent=t2(ch.carbon)+' t';$('upfront').textContent=fmt(ch.capex);
  const base=x.configs.filter(c=>c.size===0&&c.backup===ch.backup)[0];
  if(base&&ch.size){const dc=ch.annual-base.annual,dk=ch.carbon-base.carbon;
    $('opDelta').textContent=`${dc<=0?'saves':'costs'} ${fmt(Math.abs(dc))}/yr vs ${SHORTFUEL[ch.backup].toLowerCase()} only`;$('opDelta').className=dc<=0?'good':'bad';
    $('co2Delta').textContent=`${dk<=0?'cuts':'adds'} ${t2(Math.abs(dk))} t/yr vs ${SHORTFUEL[ch.backup].toLowerCase()} only`;$('co2Delta').className=dk<=0?'good':'bad';}
  else{$('opDelta').textContent='energy use only';$('opDelta').className='';$('co2Delta').textContent='tonnes CO₂e per year';$('co2Delta').className='';}
  // charts
  drawScatter(x);
  const bkName=SHORTFUEL[ch.backup];$('bkName').textContent=bkName+' backup';
  $('monthSub').textContent=`Heat delivered to the home (kWh) · ${P.label.toLowerCase()} system`;
  stacked('monthly',MONTHS,det.mHP,det.mBK,{bk:bkName,showLabel:()=>true,tipTitle:i=>MONTH_FULL[i]});
  stacked('bins',det.bins.map(b=>b.t),det.bins.map(b=>b.hp),det.bins.map(b=>b.bk),{bk:bkName,xTitle:'Outdoor temperature (°C)',marker:DATA.cities[x.city].design,
    showLabel:i=>det.bins[i].t%10===0,tipTitle:i=>`${det.bins[i].t} to ${det.bins[i].t+2}°C`});
  // comparison table
  const unique=x.configs.filter(c=>c.size===0).sort((a,b)=>a.annualized-b.annualized);
  const rows=[...unique.map(v=>({v,k:null})),...['cost','balanced','carbon'].map(k=>({v:x.b[k],k}))]
    .filter((r,i,a)=>a.findIndex(z=>z.v===r.v)===i);
  $('comparison').innerHTML='<table class="cmp"><thead><tr><th>Strategy</th><th>Cost /yr</th><th>CO₂ /yr</th><th>Heat pump</th></tr></thead><tbody>'+rows.map(({v,k})=>{
    const names=['cost','balanced','carbon'].filter(z=>x.b[z]===v).map(z=>PICK[z].label);
    return `<tr class="${v===ch?'hl':''}"><td><span class="sw" style="--c:${k?PICK[k].c:'#9aa3b8'}"></span>${v.size?`${esc(v.model)} ${Math.round(v.size*100)}%`:'Backup only'} + ${esc(SHORTFUEL[v.backup].toLowerCase())}${names.length?` <span class="smallprint">· ${names.join(', ')}</span>`:''}</td><td class="tnum">${fmt(v.annualized)}</td><td class="tnum">${t2(v.carbon)} t</td><td class="tnum">${Math.round(v.hpShare*100)}%</td></tr>`}).join('')+'</tbody></table>';
  const pr=DATA.cities[x.city].price;
  $('priceNotes').textContent=`${x.city} inputs: electricity $${pr.electricity.v}/kWh (${pr.electricity.note}); grid ${DATA.cities[x.city].ef.electricity} g CO₂e/kWh; heat pump models tested: ${DATA.cities[x.city].models.join(', ')}.`;
  $('missingNote').textContent=x.missing.length?'Local price data unavailable for: '+[...new Set(x.missing)].join(', ')+'. Those choices are excluded from optimization.':'';
  renderCities(lastInput);
  renderSimple(x);
}

/* ---------- simple view ---------- */
const TINY={electric_resistance:'electric',natural_gas:'gas',heating_oil:'oil',propane:'propane',wood:'wood'};
function plainName(v){return v.size?`${(v.peak*v.size).toFixed(1)} kW heat pump + ${TINY[v.backup]}`:`${SHORTFUEL[v.backup]} only`}
function renderSimple(x){
  $('recs').innerHTML=['cost','balanced','carbon'].map(k=>{const v=x.b[k],P=PICK[k],hp=Math.round(v.hpShare*100);
    return `<article class="rec ${k==='balanced'?'star':''}" style="--c:${P.c}">
      <div class="top"><span class="lbl"><i>${P.icon}</i>${P.label}</span>${k==='balanced'?'<span class="badge">Best pick</span>':''}</div>
      <h4>${esc(plainName(v))}</h4>
      <div class="big"><div><b class="tnum">${fmt(v.annualized)}</b><span>per year</span></div><div><b class="tnum">${t2(v.carbon)} t</b><span>CO₂ per year</span></div></div>
      <div class="share" aria-label="${hp}% of heat from the heat pump"><div class="bar"><i style="width:${hp}%;background:var(--hp)"></i><i style="flex:1;background:var(--backup)"></i></div><span>${hp}% heat pump</span></div>
      <div class="more"><button type="button" data-detail="${k}">Details →</button></div></article>`}).join('');
  $('recs').querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.detail;setView('advanced');render(current);$('banner').scrollIntoView({behavior:'smooth',block:'center'})}));
  $('simpleNote').textContent='Yearly cost includes the heat pump spread over 15 years. Screening estimate only.';
}
function setView(v){
  document.body.classList.toggle('simple',v==='simple');
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));
  $('viewSub').textContent=v==='simple'?'Three options for your home':'Every system tested, hourly breakdowns and climates';
  try{localStorage.setItem('heatopt-view',v)}catch(e){}
  if(v==='advanced'&&current&&!current.error)requestAnimationFrame(()=>render(current));
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
setView('simple');

/* ---------- inputs ---------- */
function readInput(){
  const area=Number($('area').value),year=Number($('year').value),people=Number($('people').value);
  const bad=!Number.isFinite(area)||area<300||area>15000?'Home size must be between 300 and 15,000 sq. ft.':
    !Number.isFinite(year)||!Number.isInteger(year)||year<1800||year>2026?'Year built must be between 1800 and 2026.':
    !Number.isFinite(people)||!Number.isInteger(people)||people<1||people>20?'People living here must be between 1 and 20.':
    !selected().length?'Choose at least one heating option.':null;
  return {bad,input:{city:cityValue(),area,year,people,inside:Number($('indoor').value),sources:selected()}};
}
function run(){
  const {bad,input}=readInput();if(bad){$('error').textContent=bad;$('tag').textContent='Check inputs';$('tag').classList.remove('on');return}
  $('results').classList.add('busy');$('results').setAttribute('aria-busy','true');
  setTimeout(()=>{
    lastInput=input;cityCache={};
    cityCache[input.city]=calculate(input);
    const x=cityCache[input.city];
    if(!x.error){const f=Math.round(input.inside*9/5+32);
      $('preview').innerHTML=[CITY_INFO[input.city].label+', '+CITY_INFO[input.city].region,integer(input.area)+' sq. ft.','Built '+input.year,input.people+' occupant'+(input.people>1?'s':''),f+'°F']
        .map(s=>`<span>${s}</span>`).join('');}
    render(x);$('results').classList.remove('busy');$('results').removeAttribute('aria-busy');
  },20);
}
let timer;const soon=()=>{isExample=false;clearTimeout(timer);timer=setTimeout(run,350)};
$('form').addEventListener('submit',e=>{e.preventDefault();isExample=false;clearTimeout(timer);run();
  if(window.innerWidth<980)$('results').scrollIntoView({behavior:'smooth'})});
$('form').addEventListener('input',soon);$('form').addEventListener('change',soon);

/* ---------- tooltip ---------- */
const tipEl=$('tip');
document.addEventListener('mousemove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');
  if(!t){tipEl.style.opacity=0;return}
  tipEl.innerHTML=t.getAttribute('data-tip');tipEl.style.opacity=1;
  const w=tipEl.offsetWidth,h=tipEl.offsetHeight;let lx=e.clientX+14,ly=e.clientY+14;
  if(lx+w>innerWidth-8)lx=e.clientX-w-14;if(ly+h>innerHeight-8)ly=e.clientY-h-14;
  tipEl.style.left=lx+'px';tipEl.style.top=ly+'px';});

run();

let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(current&&!current.error)drawScatter(current)},200)});
