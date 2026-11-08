
/* ===== Model (unchanged from HeatOpt v12) ===== */

const $=id=>document.getElementById(id), FUEL={electric_resistance:'Electric resistance',natural_gas:'Natural gas furnace',heating_oil:'Heating oil furnace',propane:'Propane furnace',wood:'Wood stove'}, EFF={electric_resistance:1,natural_gas:.95,heating_oil:.85,propane:.95,wood:.70};
const MODELMAP={'Boston':DATA.cities.Boston.models,'Atlanta':DATA.cities.Atlanta.models,'Montreal':DATA.cities.Montreal.models};let active='balanced',current=null;const fmt=v=>'$'+Math.round(v).toLocaleString('en-US'),tons=v=>(v/1000).toFixed(2)+' t',integer=v=>Math.round(v).toLocaleString('en-US');
function selected(){return [...document.querySelectorAll('.checks input:checked')].map(x=>x.value)}
function interpolate(xs,ys,t){if(t<=xs[0])return ys[0];if(t>=xs[xs.length-1])return ys[ys.length-1];let i=Math.floor(t-xs[0]);i=Math.max(0,Math.min(xs.length-2,i));while(xs[i+1]<t)i++;while(xs[i]>t)i--;return ys[i]+(t-xs[i])*(ys[i+1]-ys[i])/(xs[i+1]-xs[i]);}
// Baseline hourly profiles are calibrated to the supplied archetype workbook's TMY annual demand.
let BASE={};function calibrated(city,level){let key=city+'_'+level;if(BASE[key])return BASE[key];let d=DATA.cities[city], a=d.houses[level], t=d.t,ghi=d.ghi;function sum(gains){let x=0;for(let i=0;i<t.length;i++){let q=a.ua*(21-t[i]/10)+a.ground-0.12*ghi[i]-gains;x+=Math.max(0,q)/1000;}return x;}let low=-3000,high=4000;for(let i=0;i<42;i++){let mid=(low+high)/2;if(sum(mid)>a.annual)low=mid;else high=mid;}return BASE[key]=(low+high)/2;}
function houseProfile(city,area,year,people,inside){const d=DATA.cities[city], r=area/d.ref_area; // Building age maps continuously between existing and code, not to an assumed deep retrofit.
const codeWeight=Math.max(0,Math.min(1,(year-1985)/35));const e=d.houses.Existing,c=d.houses.Code,ua=(e.ua*(1-codeWeight)+c.ua*codeWeight)*r, ground=(e.ground*(1-codeWeight)+c.ground*codeWeight)*r;
const gain=(calibrated(city,'Existing')*(1-codeWeight)+calibrated(city,'Code')*codeWeight)*r;
const occupantGain=(people-4)*75*.6; const load=new Array(d.t.length);let total=0,maximum=0;
for(let i=0;i<d.t.length;i++){let v=Math.max(0,(ua*(inside-d.t[i]/10)+ground-.12*d.ghi[i]*r-gain-occupantGain)/1000);load[i]=v;total+=v;maximum=Math.max(maximum,v)}
const design=Math.max(0.5,(ua*(inside-d.design)+ground-gain*.5-occupantGain)/1000);
return {load,total,design,maximum,ua,codeWeight};}
function fuelPrice(city,source){let key=source==='electric_resistance'?'electricity':source;return DATA.cities[city].price[key]?.v??null}
function emissions(city,source){let key=source==='electric_resistance'?'electricity':source;return DATA.cities[city].ef[key]??null}
function calculate(input){const d=DATA.cities[input.city],p=houseProfile(input.city,input.area,input.year,input.people,input.inside);let fuels=input.sources.filter(x=>x!=='hp'),hasHP=input.sources.includes('hp');let configurations=[];let priceElec=fuelPrice(input.city,'electric_resistance'), efElec=emissions(input.city,'electric_resistance');let missing=[];
// Evaluate backup-only alternatives as the counterfactual. A missing city-level fuel price is never guessed.
for(let f of fuels){let price=fuelPrice(input.city,f),ef=emissions(input.city,f);if(price==null||ef==null){missing.push(FUEL[f]);continue}configurations.push({model:'No heat pump',size:0,backup:f,rule:'backup only',annual:p.total/ EFF[f]*price,carbon:p.total/EFF[f]*ef/1000,capital:0,annualized:p.total/ EFF[f]*price,hpShare:0,heat:p.total,capex:0,peak:p.design})}
if(hasHP){let C=MODELMAP[input.city];for(let m of C){let curve=DATA.models[m],rated=interpolate(curve.temps,curve.cap,8.33),designCap=interpolate(curve.temps,curve.cap,d.design);if(designCap<=0)continue;
// Standardized sizing sweep; relative sizing is a modeled scaling of a published reference curve.
for(let factor of [.2,.4,.6,.8,1.0,1.2,1.4]){let ratio=p.design*factor/designCap,installed=Math.max(0,rated*ratio/3.517*d.capex),annualized=installed*(.05*Math.pow(1.05,15))/(Math.pow(1.05,15)-1);
// Precalculate max heat and efficiency for each hour, including a cycling penalty below 30% modulation.
const hpHeat=new Float32Array(p.load.length),effCOP=new Float32Array(p.load.length);
for(let i=0;i<p.load.length;i++){let t=d.t[i]/10,cap=Math.max(0,interpolate(curve.temps,curve.cap,t))*ratio;let cop=interpolate(curve.temps,curve.cop,t);let h=cap>0&&cop>1?Math.min(p.load[i],cap):0,plr=cap>0?h/cap:0;let penalty=plr<.3?1-.25*(1-plr/.3):1;hpHeat[i]=h;effCOP[i]=Math.max(1,cop*penalty);}
for(let f of fuels){let bf=fuelPrice(input.city,f),fe=emissions(input.city,f);if(bf==null||fe==null)continue;let unitCost=bf/EFF[f],unitCarbon=fe/EFF[f];for(let rule of ['first','cost','carbon','balanced']){let op=0,co=0,heat=0,unmet=0;
for(let i=0;i<p.load.length;i++){let load=p.load[i],hp=hpHeat[i],cop=effCOP[i];if(hp>0&&rule!=='first'){let hcost=priceElec/cop,hcarbon=efElec/cop;
if(rule==='cost' && hcost>unitCost || rule==='carbon'&&hcarbon>unitCarbon ||rule==='balanced' && hcost+.00019*hcarbon>unitCost+.00019*unitCarbon)hp=0;}
let bk=load-hp;op+=hp/cop*priceElec+bk*unitCost;co+=(hp/cop*efElec+bk*unitCarbon)/1000;heat+=hp;}
configurations.push({model:m,size:factor,backup:f,rule,annual:op,carbon:co,capital:annualized,annualized:op+annualized,hpShare:heat/p.total,heat:p.total,capex:installed,peak:p.design});}
}
}
}}
// Do not report carbon-only results with unavailable cost data.
if(!configurations.length)return {error:hasHP&&!fuels.length?'Select at least one backup source.':'No selected heating source has usable cost data.'};
const byCost=[...configurations].sort((a,b)=>a.annualized-b.annualized)[0];const byCarbon=[...configurations].sort((a,b)=>a.carbon-b.carbon||a.annualized-b.annualized)[0];
const byBalanced=[...configurations].sort((a,b)=>(a.annualized+.19*a.carbon)-(b.annualized+.19*b.carbon))[0]; // $190/t x kg /1000 = $0.19 per kg
const b={cost:byCost,carbon:byCarbon,balanced:byBalanced};return {p,b,configs:configurations,missing,city:input.city,selected:input.sources};}

