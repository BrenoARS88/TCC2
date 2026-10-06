/* ============================= STATE ============================= */
const STORAGE_KEY = 'luna_state_v1';
const DOW = ['dom','seg','ter','qua','qui','sex','sáb'];
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

const FLOW_LEVELS = [
  {id:'none', label:'Sem fluxo'},
  {id:'spotting', label:'Escape'},
  {id:'light', label:'Leve'},
  {id:'moderate', label:'Moderado'},
  {id:'intense', label:'Intenso'},
  {id:'very-intense', label:'Muito intenso'},
];

const SYMPTOMS_PHYSICAL = ['Cólica','Dor abdominal','Dor pélvica','Dor lombar','Dor de cabeça','Enxaqueca','Náusea','Tontura','Fadiga','Inchaço','Sensibilidade nas mamas','Acne','Alterações intestinais','Alteração do apetite','Desejo por alimentos específicos','Alterações urinárias','Ondas de calor','Dor durante relação','Sangramento fora da menstruação','Corrimento'];
const SYMPTOMS_EMOTIONAL = ['Irritabilidade','Ansiedade','Tristeza','Choro fácil','Estresse','Alterações de humor','Dificuldade de concentração','Dificuldade para dormir','Sonolência','Falta de energia','Maior disposição'];

function defaultState(){
  return {
    onboarded:false,
    profile:{ lastPeriodStart:null, periodLength:5, cycleLength:28, regularity:'nao-sei', variation:3, goals:[], contraceptive:'nenhum' },
    days:{}, // 'YYYY-MM-DD' -> {flow, symptoms:[{name,category,intensity}], sex:{happened,protection,note}, notes}
    diary:[], // {id,date,text}
    meds:[], // {id,name,dose,freq,time,start,end,continuous,notes}
    settings:{ theme:'dark', accent:'luna', customColor:null }, // theme: 'dark'|'light'|'system'; accent: preset id or 'custom'
    contraceptive:{ current:null, history:[], logs:[] } // current:{id,methodId,customLabel,startDate,notes}; history:[{...,endDate,reason}]; logs:[{id,date,type,note}]
  };
}
let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      const merged = Object.assign(defaultState(), parsed);
      merged.settings = Object.assign(defaultState().settings, parsed.settings||{});
      return merged;
    }
  }catch(e){ console.warn('storage read failed', e); }
  return defaultState();
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn('storage write failed', e); }
}

function applyTheme(mode){
  const root = document.documentElement;
  if(mode==='dark' || mode==='light') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme'); // 'system' -> follows prefers-color-scheme
}
const ACCENT_PRESETS = [
  {id:'luna', label:'Luna', gold:'#E7B96A', lavender:'#A79AE0', sage:'#8FBA9E'},
  {id:'aurora', label:'Aurora', gold:'#6FC9C0', lavender:'#7FA8E0', sage:'#6FBF9B'},
  {id:'bloom', label:'Bloom', gold:'#E8A87C', lavender:'#D79BC4', sage:'#A8C48A'},
  {id:'midnight', label:'Meia-noite', gold:'#8FA3E8', lavender:'#B08FE0', sage:'#6F9AA8'},
  {id:'terra', label:'Terra', gold:'#D89563', lavender:'#B5A084', sage:'#94A878'},
];
function applyAccent(settings){
  const root = document.documentElement;
  if(settings.accent==='custom' && settings.customColor){
    root.removeAttribute('data-accent');
    root.style.setProperty('--gold', settings.customColor);
  } else {
    root.style.removeProperty('--gold');
    root.setAttribute('data-accent', settings.accent || 'luna');
  }
}
applyTheme(state.settings.theme);
applyAccent(state.settings);

/* ============================= HELPERS ============================= */
function pad(n){return n<10?'0'+n:''+n;}
function toISO(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function fromISO(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function diffDays(a,b){return Math.round((b-a)/86400000);}
function todayISO(){return toISO(new Date());}
function fmtLong(d){return d.getDate()+' de '+MONTHS[d.getMonth()];}
function uid(){return Math.random().toString(36).slice(2,10);}
function showToast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(showToast._t); showToast._t=setTimeout(()=>t.classList.remove('show'),1800);
}

/* infer real period start dates from logged flow (a start = flow!=none preceded by a day with none/undefined, or first ever) */
function loggedPeriodStarts(){
  const dates = Object.keys(state.days).filter(k=>state.days[k].flow && state.days[k].flow!=='none').sort();
  const starts=[];
  let prev=null;
  dates.forEach(dstr=>{
    const d=fromISO(dstr);
    if(!prev || diffDays(prev,d)>1){ starts.push(dstr); }
    prev=d;
  });
  return starts;
}

function cycleStats(){
  const starts = loggedPeriodStarts();
  const p = state.profile;
  let avgCycle = p.cycleLength || 28;
  let avgPeriod = p.periodLength || 5;
  let lastStart = p.lastPeriodStart;
  let source = 'cadastro';
  if(starts.length){
    lastStart = starts[starts.length-1];
    source = starts.length>1 ? 'histórico registrado' : 'primeiro ciclo registrado';
  }
  if(starts.length>=2){
    const diffs=[];
    for(let i=1;i<starts.length;i++) diffs.push(diffDays(fromISO(starts[i-1]),fromISO(starts[i])));
    avgCycle = Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length);
  }
  // recent vs historical deviation
  let deviation=null;
  if(starts.length>=4){
    const diffs=[];
    for(let i=1;i<starts.length;i++) diffs.push(diffDays(fromISO(starts[i-1]),fromISO(starts[i])));
    const recent = diffs.slice(-2);
    const older = diffs.slice(0,-2);
    if(older.length){
      const recentAvg = recent.reduce((a,b)=>a+b,0)/recent.length;
      const olderAvg = older.reduce((a,b)=>a+b,0)/older.length;
      if(Math.abs(recentAvg-olderAvg) >= 5) deviation = {recentAvg:Math.round(recentAvg), olderAvg:Math.round(olderAvg)};
    }
  }
  let nextStart=null, ovulation=null, fertileStart=null, fertileEnd=null;
  if(lastStart){
    nextStart = addDays(fromISO(lastStart), avgCycle);
    ovulation = addDays(nextStart, -14);
    fertileStart = addDays(ovulation, -5);
    fertileEnd = addDays(ovulation, 1);
  }
  return {starts, avgCycle, avgPeriod, lastStart, source, deviation, nextStart, ovulation, fertileStart, fertileEnd};
}

function currentPhase(stats){
  if(!stats.lastStart) return {name:'—', color:'var(--text-muted)'};
  const today = new Date(); today.setHours(0,0,0,0);
  const last = fromISO(stats.lastStart);
  const dayInCycle = diffDays(last, today);
  if(dayInCycle < 0){
    return {name:'antes do início', color:'var(--text-muted)'};
  }
  if(dayInCycle < stats.avgPeriod) return {name:'menstruação', color:'var(--rose)'};
  if(stats.ovulation){
    const ov = diffDays(last, stats.ovulation);
    if(dayInCycle >= ov-5 && dayInCycle <= ov+1) return {name:'período fértil', color:'var(--lavender)'};
    if(dayInCycle > ov+1 && dayInCycle < stats.avgCycle) return {name:'fase lútea', color:'var(--sage)'};
  }
  return {name:'fase folicular', color:'var(--gold)'};
}

/* ============================= RENDER SHELL ============================= */
let activeTab='home';

function render(){
  if(!state.onboarded){
    document.getElementById('topbar').style.display='none';
    document.getElementById('tabbar').style.display='none';
    document.getElementById('fabAdd').style.display='none';
    document.getElementById('app').style.gridTemplateColumns='1fr';
    renderOnboarding();
    return;
  }
  document.getElementById('app').style.gridTemplateColumns='';
  document.getElementById('topbar').style.display='flex';
  document.getElementById('tabbar').style.display='flex';
  document.getElementById('fabAdd').style.display = (activeTab==='settings') ? 'none' : 'flex';
  document.getElementById('main').style.padding='';
  const stats = cycleStats();
  const phase = currentPhase(stats);
  document.getElementById('phaseChip').textContent = phase.name;
  document.getElementById('phaseChip').style.color = phase.color;

  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===activeTab));

  const main = document.getElementById('main');
  main.innerHTML='';
  if(activeTab==='home') renderHome(main, stats, phase);
  else if(activeTab==='symptoms') renderSymptomsTab(main);
  else if(activeTab==='diary') renderDiaryTab(main);
  else if(activeTab==='meds') renderMedsTab(main);
  else if(activeTab==='insights') renderInsightsTab(main, stats);
  else if(activeTab==='method') renderMethodTab(main);
  else if(activeTab==='settings') renderSettingsTab(main);
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{ activeTab=btn.dataset.tab; render(); });
});
document.getElementById('settingsBtn').addEventListener('click', ()=>{ activeTab='settings'; render(); });
document.getElementById('fabAdd').addEventListener('click', ()=>{
  if(activeTab==='diary') openDiaryEntrySheet();
  else if(activeTab==='meds') openMedSheet();
  else if(activeTab==='method') { if(state.contraceptive.current) openMethodLogSheet(); else openMethodSetupSheet(); }
  else openDayLogSheet(todayISO());
});

/* ============================= ONBOARDING ============================= */
let onbStep=0;
let onbDraft=null;

function renderOnboarding(){
  if(!onbDraft) onbDraft = JSON.parse(JSON.stringify(state.profile));
  const main = document.getElementById('main');
  main.style.padding='28px 22px 40px';
  const steps = [stepWelcome, stepLastPeriod, stepDurations, stepRegularity, stepGoals, stepContraceptive];
  main.innerHTML='';
  const wrap = document.createElement('div');
  if(onbStep>0){
    const prog=document.createElement('div'); prog.className='onb-progress';
    for(let i=1;i<steps.length;i++){ const s=document.createElement('span'); if(i<=onbStep) s.classList.add('done'); prog.appendChild(s); }
    wrap.appendChild(prog);
  }
  wrap.appendChild(steps[onbStep]());
  main.appendChild(wrap);
}

function moonIcon(size){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 10.2 4.06 6.8 6.8 0 0 0 20 14.5Z" fill="#E7B96A"/></svg>`;
}

function stepWelcome(){
  const d=document.createElement('div');
  d.innerHTML = `
    <div style="margin-top:8vh;text-align:center;">
      ${moonIcon(52)}
      <h1 class="serif" style="font-size:30px;margin:18px 0 10px;">Luna</h1>
      <p class="muted" style="font-size:15px;line-height:1.6;max-width:320px;margin:0 auto 30px;">
        Um diário para acompanhar seu ciclo, seus sintomas e seu corpo — no seu próprio ritmo, não em médias genéricas.
      </p>
    </div>
    <button class="btn btn-primary btn-block" id="startBtn">Começar cadastro</button>
    <p class="faint small" style="text-align:center;margin-top:16px;">Leva menos de 2 minutos. Você pode alterar tudo depois.</p>
  `;
  d.querySelector('#startBtn').addEventListener('click', ()=>{ onbStep=1; renderOnboarding(); });
  return d;
}

function stepLastPeriod(){
  const d=document.createElement('div');
  d.innerHTML = `
    <h2 class="serif section-title">Quando começou sua última menstruação?</h2>
    <p class="section-sub">Isso ajuda a estimar seu calendário inicial.</p>
    <label>Data de início</label>
    <input type="date" id="lp" value="${onbDraft.lastPeriodStart || todayISO()}" max="${todayISO()}">
    <button class="btn btn-primary btn-block" style="margin-top:26px;" id="next1">Continuar</button>
  `;
  d.querySelector('#next1').addEventListener('click', ()=>{
    onbDraft.lastPeriodStart = d.querySelector('#lp').value;
    onbStep=2; renderOnboarding();
  });
  return d;
}

function stepDurations(){
  const d=document.createElement('div');
  d.innerHTML = `
    <h2 class="serif section-title">Sobre seu ciclo</h2>
    <label>Quantos dias dura sua menstruação, normalmente?</label>
    <input type="number" id="pl" min="1" max="15" value="${onbDraft.periodLength}">
    <label>Aproximadamente quantos dias dura seu ciclo completo?</label>
    <input type="number" id="cl" min="15" max="60" value="${onbDraft.cycleLength}">
    <div style="display:flex;gap:10px;margin-top:26px;">
      <button class="btn btn-ghost" id="back2" style="flex:0 0 auto;">Voltar</button>
      <button class="btn btn-primary" style="flex:1;" id="next2">Continuar</button>
    </div>
  `;
  d.querySelector('#back2').addEventListener('click', ()=>{ onbStep=1; renderOnboarding(); });
  d.querySelector('#next2').addEventListener('click', ()=>{
    onbDraft.periodLength = parseInt(d.querySelector('#pl').value)||5;
    onbDraft.cycleLength = parseInt(d.querySelector('#cl').value)||28;
    onbStep=3; renderOnboarding();
  });
  return d;
}

function stepRegularity(){
  const d=document.createElement('div');
  const opts=[['regular','Regular'],['irregular','Irregular'],['nao-sei','Não sei']];
  d.innerHTML = `
    <h2 class="serif section-title">Seu ciclo costuma ser…</h2>
    <div class="choice-row" id="regRow"></div>
    <label style="margin-top:22px;">Variação aproximada (em dias), se souber</label>
    <input type="number" id="varInp" min="0" max="20" value="${onbDraft.variation}">
    <div style="display:flex;gap:10px;margin-top:26px;">
      <button class="btn btn-ghost" id="back3">Voltar</button>
      <button class="btn btn-primary" style="flex:1;" id="next3">Continuar</button>
    </div>
  `;
  const row = d.querySelector('#regRow');
  opts.forEach(([id,label])=>{
    const c=document.createElement('div'); c.className='choice'+(onbDraft.regularity===id?' selected':''); c.textContent=label;
    c.addEventListener('click', ()=>{ onbDraft.regularity=id; row.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); });
    row.appendChild(c);
  });
  d.querySelector('#back3').addEventListener('click', ()=>{ onbStep=2; renderOnboarding(); });
  d.querySelector('#next3').addEventListener('click', ()=>{
    onbDraft.variation = parseInt(d.querySelector('#varInp').value)||0;
    onbStep=4; renderOnboarding();
  });
  return d;
}

function stepGoals(){
  const d=document.createElement('div');
  const opts=['Apenas menstruação e sintomas','Fertilidade / ovulação','Tentativa de engravidar','Evitar gravidez','Gravidez','Pós-parto'];
  d.innerHTML = `
    <h2 class="serif section-title">O que você deseja acompanhar?</h2>
    <p class="section-sub">Pode escolher mais de uma opção.</p>
    <div class="choice-row" id="goalsRow"></div>
    <div style="display:flex;gap:10px;margin-top:26px;">
      <button class="btn btn-ghost" id="back4">Voltar</button>
      <button class="btn btn-primary" style="flex:1;" id="next4">Continuar</button>
    </div>
  `;
  const row=d.querySelector('#goalsRow');
  opts.forEach(g=>{
    const c=document.createElement('div'); c.className='choice'+(onbDraft.goals.includes(g)?' selected':''); c.textContent=g;
    c.addEventListener('click', ()=>{
      if(onbDraft.goals.includes(g)){ onbDraft.goals=onbDraft.goals.filter(x=>x!==g); c.classList.remove('selected'); }
      else { onbDraft.goals.push(g); c.classList.add('selected'); }
    });
    row.appendChild(c);
  });
  d.querySelector('#back4').addEventListener('click', ()=>{ onbStep=3; renderOnboarding(); });
  d.querySelector('#next4').addEventListener('click', ()=>{ onbStep=5; renderOnboarding(); });
  return d;
}

function stepContraceptive(){
  const d=document.createElement('div');
  const opts=['Nenhum','Preservativo','Pílula anticoncepcional','DIU hormonal','DIU de cobre','Implante','Adesivo','Anel vaginal','Injeção','Outro','Não desejo informar'];
  d.innerHTML = `
    <h2 class="serif section-title">Você utiliza algum método contraceptivo?</h2>
    <div class="choice-row" id="contRow"></div>
    <div style="display:flex;gap:10px;margin-top:26px;">
      <button class="btn btn-ghost" id="back5">Voltar</button>
      <button class="btn btn-primary" style="flex:1;" id="finish">Concluir cadastro</button>
    </div>
    <p class="disclaimer" style="margin-top:22px;">
      As informações do Luna são orientativas e não substituem avaliação médica. Em caso de dúvida ou sintomas preocupantes, procure um profissional de saúde.
    </p>
  `;
  const row=d.querySelector('#contRow');
  let sel = onbDraft.contraceptive || 'nenhum';
  opts.forEach(o=>{
    const val=o.toLowerCase();
    const c=document.createElement('div'); c.className='choice'+(sel===val?' selected':''); c.textContent=o;
    c.addEventListener('click', ()=>{ sel=val; row.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); });
    row.appendChild(c);
  });
  d.querySelector('#back5').addEventListener('click', ()=>{ onbStep=4; renderOnboarding(); });
  d.querySelector('#finish').addEventListener('click', ()=>{
    onbDraft.contraceptive = sel;
    state.profile = onbDraft;
    state.onboarded = true;
    saveState();
    render();
  });
  return d;
}

/* ============================= HOME / CALENDAR ============================= */
let calMonth = new Date(); calMonth.setDate(1);

function renderHome(main, stats, phase){
  const hero = document.createElement('div');
  hero.className='hero';
  let headline, statBlocks='';
  if(stats.nextStart){
    const today=new Date(); today.setHours(0,0,0,0);
    const daysTo = diffDays(today, stats.nextStart);
    if(daysTo>=0 && daysTo<=1 && phase.name!=='menstruação'){
      headline = `Sua próxima menstruação deve chegar <em>${daysTo===0?'hoje':'amanhã'}</em>.`;
    } else if(phase.name==='menstruação'){
      headline = `Você está na fase de <em>menstruação</em>.`;
    } else if(daysTo<0){
      headline = `Sua menstruação prevista já passou — registre quando ela começar.`;
    } else {
      headline = `Faltam <em>${daysTo} dias</em> para sua próxima menstruação prevista.`;
    }
    statBlocks = `
      <div class="hero-stats">
        <div class="hero-stat"><b>${stats.avgCycle}</b><span>dias de ciclo (média)</span></div>
        <div class="hero-stat"><b>${stats.avgPeriod}</b><span>dias de menstruação</span></div>
        <div class="hero-stat"><b>${fmtLong(stats.nextStart)}</b><span>próxima prevista</span></div>
      </div>`;
  } else {
    headline = `Bem-vinda! Registre sua primeira menstruação no calendário para começar as previsões.`;
  }
  hero.innerHTML = `<div class="hero-eyebrow">${fmtLong(new Date())}</div><h2 class="hero-headline">${headline}</h2>${statBlocks}`;
  main.appendChild(hero);

  if(state.contraceptive.current){
    const mNext = methodNextDate();
    if(mNext){
      const today0=new Date(); today0.setHours(0,0,0,0);
      const daysTo = diffDays(today0, mNext);
      if(daysTo<=3){
        const method = getMethod(state.contraceptive.current.methodId);
        const banner=document.createElement('div'); banner.className='card-flat'; banner.style.cssText='margin-bottom:16px;cursor:pointer;display:flex;align-items:center;gap:10px;';
        const label = daysTo<0 ? `${method.nextLabel} já passou da data prevista` : daysTo===0 ? `${method.nextLabel} é hoje` : daysTo===1 ? `${method.nextLabel} é amanhã` : `${method.nextLabel} em ${daysTo} dias`;
        banner.innerHTML = `<span style="font-size:18px;">💊</span><div class="small" style="color:var(--text);">${label} — <span style="color:var(--gold);">toque para abrir Método</span></div>`;
        banner.addEventListener('click', ()=>{ activeTab='method'; render(); });
        main.appendChild(banner);
      }
    }
  }

  // calendar card
  const card=document.createElement('div'); card.className='card';
  const nav=document.createElement('div'); nav.className='cal-nav';
  nav.innerHTML = `
    <button id="prevM">‹</button>
    <div class="cal-month">${MONTHS[calMonth.getMonth()]} ${calMonth.getFullYear()}</div>
    <button id="nextM">›</button>
  `;
  card.appendChild(nav);
  const grid=document.createElement('div'); grid.className='cal-grid';
  DOW.forEach(w=>{ const el=document.createElement('div'); el.className='cal-dow'; el.textContent=w; grid.appendChild(el); });

  const firstDow = calMonth.getDay();
  const gridStart = addDays(calMonth, -firstDow);
  const today=new Date(); today.setHours(0,0,0,0);

  for(let i=0;i<42;i++){
    const d = addDays(gridStart, i);
    const iso = toISO(d);
    const cell=document.createElement('div'); cell.className='cal-day';
    if(d.getMonth()!==calMonth.getMonth()) cell.classList.add('out');
    if(iso===toISO(today)) cell.classList.add('today');

    const rec = state.days[iso];
    if(rec && rec.flow && rec.flow!=='none') cell.classList.add('flow-logged');

    if(stats.nextStart){
      const inPredictedPeriod = d >= stats.nextStart && d < addDays(stats.nextStart, stats.avgPeriod) && !(rec&&rec.flow&&rec.flow!=='none');
      if(inPredictedPeriod) cell.classList.add('predicted-period');
    }
    if(stats.fertileStart && stats.fertileEnd && d>=stats.fertileStart && d<=stats.fertileEnd){
      cell.classList.add('fertile');
    }
    if(stats.ovulation && iso===toISO(stats.ovulation)) cell.classList.add('ovulation');

    cell.innerHTML = `<span>${d.getDate()}</span>`;
    const hasMethodLog = state.contraceptive.logs.some(l=>l.date===iso);
    if((rec && (rec.symptoms&&rec.symptoms.length || (rec.sex&&rec.sex.happened))) || hasMethodLog){
      const dot=document.createElement('span'); dot.className='dot'; dot.style.background='var(--gold)'; cell.appendChild(dot);
    }
    cell.addEventListener('click', ()=>openDayLogSheet(iso));
    grid.appendChild(cell);
  }
  card.appendChild(grid);
  const legend=document.createElement('div'); legend.className='cal-legend';
  legend.innerHTML = `
    <span><span class="legend-swatch" style="background:var(--rose-dim);"></span>menstruação registrada</span>
    <span><span class="legend-swatch" style="background:transparent;border:1.5px dashed var(--rose);"></span>previsão</span>
    <span><span class="legend-swatch" style="background:var(--lavender-dim);"></span>janela fértil</span>
    <span><span class="legend-swatch" style="background:var(--gold);"></span>registro no dia</span>
  `;
  card.appendChild(legend);
  main.appendChild(card);

  nav.querySelector('#prevM').addEventListener('click', ()=>{ calMonth.setMonth(calMonth.getMonth()-1); render(); });
  nav.querySelector('#nextM').addEventListener('click', ()=>{ calMonth.setMonth(calMonth.getMonth()+1); render(); });

  // quick actions
  const quick=document.createElement('div');
  quick.innerHTML = `<h3 class="serif section-title" style="margin-top:4px;">Registrar hoje</h3>`;
  main.appendChild(quick);
  const row=document.createElement('div'); row.style.display='flex'; row.style.gap='10px'; row.style.flexWrap='wrap'; row.style.marginBottom='10px';
  const actions=[['Fluxo / sintomas', ()=>openDayLogSheet(todayISO())],['Relação sexual', ()=>openDayLogSheet(todayISO(),'sex')],['Diário', openDiaryEntrySheet],['Método', ()=>{ activeTab='method'; render(); }]];
  actions.forEach(([label,fn])=>{
    const b=document.createElement('button'); b.className='btn btn-ghost btn-sm'; b.textContent=label; b.addEventListener('click', fn); row.appendChild(b);
  });
  main.appendChild(row);

  main.appendChild(disclaimerBlock());
}

function disclaimerBlock(){
  const p=document.createElement('p'); p.className='disclaimer';
  p.textContent = 'O Luna organiza seus registros e aponta padrões, mas não diagnostica condições nem substitui avaliação médica.';
  return p;
}

/* ============================= DAY LOG SHEET ============================= */
function openDayLogSheet(iso, focus){
  const rec = state.days[iso] || {flow:'none', symptoms:[], sex:{happened:false,protection:'',note:''}, notes:''};
  const draft = JSON.parse(JSON.stringify(rec));
  const d = fromISO(iso);

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      <h3 class="serif" style="margin:0;font-size:18px;">${fmtLong(d)}</h3>
      <button class="sheet-close" id="closeSheet">✕</button>
    </div>
    <label>Fluxo</label>
    <div class="choice-row" id="flowRow"></div>

    <label style="margin-top:20px;">Sintomas</label>
    <div id="symptomChips" style="margin-bottom:6px;"></div>
    <button class="btn btn-ghost btn-sm" id="addSymptomBtn" type="button">+ adicionar sintoma</button>

    <label style="margin-top:20px;">Relação sexual</label>
    <div class="choice-row">
      <div class="choice ${draft.sex&&draft.sex.happened?'selected':''}" id="sexToggle">Registrar relação neste dia</div>
    </div>
    <div id="sexDetails" style="display:${draft.sex&&draft.sex.happened?'block':'none'};margin-top:12px;">
      <label>Proteção utilizada</label>
      <select id="sexProtection">
        <option value="">Não informar</option>
        <option value="preservativo">Preservativo</option>
        <option value="metodo-hormonal">Método hormonal</option>
        <option value="nenhuma">Nenhuma</option>
      </select>
      <label>Observação (opcional)</label>
      <textarea id="sexNote" placeholder="privado, só você vê"></textarea>
    </div>

    <label style="margin-top:20px;">Nota do dia (opcional)</label>
    <textarea id="dayNotes" placeholder="Como foi seu dia?">${draft.notes||''}</textarea>

    <button class="btn btn-primary btn-block" style="margin-top:24px;" id="saveDayBtn">Salvar registro</button>
    ${(state.days[iso]) ? '<button class="btn btn-danger-outline btn-block" style="margin-top:10px;" id="clearDayBtn">Limpar registros do dia</button>' : ''}
  `;

  const flowRow = content.querySelector('#flowRow');
  FLOW_LEVELS.forEach(f=>{
    const c=document.createElement('div'); c.className='choice rose'+(draft.flow===f.id?' selected':''); c.textContent=f.label;
    c.addEventListener('click', ()=>{ draft.flow=f.id; flowRow.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); });
    flowRow.appendChild(c);
  });

  function renderChips(){
    const wrap = content.querySelector('#symptomChips');
    wrap.innerHTML='';
    if(!draft.symptoms.length){ wrap.innerHTML = '<span class="faint small">Nenhum sintoma registrado ainda.</span>'; return; }
    draft.symptoms.forEach((s,idx)=>{
      const chip=document.createElement('span'); chip.className='chip-symptom';
      chip.innerHTML = `${s.name} · ${s.intensity}/5 <span style="cursor:pointer;opacity:.6;" data-idx="${idx}">✕</span>`;
      chip.querySelector('span').addEventListener('click', (e)=>{ draft.symptoms.splice(idx,1); renderChips(); });
      wrap.appendChild(chip);
    });
  }
  renderChips();

  content.querySelector('#addSymptomBtn').addEventListener('click', ()=>{
    openSymptomPicker((name,category,intensity)=>{
      draft.symptoms.push({name,category,intensity});
      renderChips();
    });
  });

  content.querySelector('#sexToggle').addEventListener('click', function(){
    draft.sex.happened = !draft.sex.happened;
    this.classList.toggle('selected', draft.sex.happened);
    content.querySelector('#sexDetails').style.display = draft.sex.happened ? 'block':'none';
  });
  content.querySelector('#sexProtection').value = draft.sex.protection||'';
  content.querySelector('#sexProtection').addEventListener('change', e=>{ draft.sex.protection=e.target.value; });
  content.querySelector('#sexNote').value = draft.sex.note||'';
  content.querySelector('#sexNote').addEventListener('input', e=>{ draft.sex.note=e.target.value; });

  content.querySelector('#saveDayBtn').addEventListener('click', ()=>{
    draft.notes = content.querySelector('#dayNotes').value;
    state.days[iso] = draft;
    saveState();
    closeSheet();
    render();
    showToast('Registro salvo');
  });
  const clearBtn = content.querySelector('#clearDayBtn');
  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    delete state.days[iso]; saveState(); closeSheet(); render(); showToast('Registros do dia removidos');
  });
  content.querySelector('#closeSheet').addEventListener('click', closeSheet);

  openSheet(content);
  if(focus==='sex'){ content.querySelector('#sexToggle').click(); }
}

function openSymptomPicker(onPick){
  const content=document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h3 class="serif" style="margin:0;font-size:18px;">Adicionar sintoma</h3><button class="sheet-close" id="closeSheet2">✕</button></div>
    <input type="text" id="symSearch" placeholder="Buscar sintoma…" style="margin-bottom:14px;">
    <div class="small muted" style="margin:6px 0 6px;">Físicos</div>
    <div class="choice-row" id="physRow"></div>
    <div class="small muted" style="margin:18px 0 6px;">Emocionais</div>
    <div class="choice-row" id="emoRow"></div>
    <div id="intensityBlock" style="display:none;margin-top:22px;">
      <label>Intensidade de <b id="chosenSym"></b></label>
      <div class="intensity-row" id="intRow">
        ${[0,1,2,3,4,5].map(i=>`<div class="intensity-dot" data-i="${i}">${i}</div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:18px;" id="confirmSym">Adicionar</button>
    </div>
  `;
  function buildRow(sel, list, category){
    const row = content.querySelector(sel); row.innerHTML='';
    list.forEach(name=>{
      const c=document.createElement('div'); c.className='choice'; c.textContent=name;
      c.addEventListener('click', ()=>{
        content.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));
        c.classList.add('selected');
        content.querySelector('#chosenSym').textContent = name;
        content.querySelector('#intensityBlock').style.display='block';
        content.querySelector('#intensityBlock')._name=name;
        content.querySelector('#intensityBlock')._cat=category;
      });
      row.appendChild(c);
    });
  }
  buildRow('#physRow', SYMPTOMS_PHYSICAL, 'físico');
  buildRow('#emoRow', SYMPTOMS_EMOTIONAL, 'emocional');

  content.querySelector('#symSearch').addEventListener('input', e=>{
    const q=e.target.value.toLowerCase();
    buildRow('#physRow', SYMPTOMS_PHYSICAL.filter(s=>s.toLowerCase().includes(q)), 'físico');
    buildRow('#emoRow', SYMPTOMS_EMOTIONAL.filter(s=>s.toLowerCase().includes(q)), 'emocional');
  });

  let chosenIntensity=null;
  content.querySelector('#intRow').addEventListener('click', e=>{
    const dot = e.target.closest('.intensity-dot'); if(!dot) return;
    content.querySelectorAll('.intensity-dot').forEach(x=>x.classList.remove('selected'));
    dot.classList.add('selected'); chosenIntensity = parseInt(dot.dataset.i);
  });
  content.querySelector('#confirmSym').addEventListener('click', ()=>{
    const blk = content.querySelector('#intensityBlock');
    if(!blk._name || chosenIntensity===null){ showToast('Escolha um sintoma e a intensidade'); return; }
    onPick(blk._name, blk._cat, chosenIntensity);
    closeSheet();
  });
  content.querySelector('#closeSheet2').addEventListener('click', closeSheet);
  openSheet(content);
}

/* ============================= SYMPTOMS TAB ============================= */
function renderSymptomsTab(main){
  main.insertAdjacentHTML('beforeend', `<h2 class="serif section-title">Sintomas</h2><p class="section-sub">Seus registros recentes, mais recentes primeiro.</p>`);

  const entries = Object.entries(state.days)
    .filter(([,v])=>v.symptoms && v.symptoms.length)
    .sort((a,b)=>b[0].localeCompare(a[0]));

  if(!entries.length){
    main.insertAdjacentHTML('beforeend', emptyStateHTML('Nenhum sintoma registrado ainda','Toque no + para registrar como você está se sentindo hoje.'));
    return;
  }

  const freq = {};
  entries.forEach(([,v])=>v.symptoms.forEach(s=>{ freq[s.name]=(freq[s.name]||0)+1; }));
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(top.length){
    const card=document.createElement('div'); card.className='card';
    card.innerHTML = `<div class="small muted" style="margin-bottom:10px;">Mais frequentes</div>`;
    const wrap=document.createElement('div');
    top.forEach(([name,count])=>{
      const tag=document.createElement('span'); tag.className='chip-symptom'; tag.textContent=`${name} · ${count}x`;
      wrap.appendChild(tag);
    });
    card.appendChild(wrap);
    main.appendChild(card);
  }

  const list=document.createElement('div'); list.className='card';
  entries.forEach(([iso,v])=>{
    const item=document.createElement('div'); item.className='list-item'; item.style.cursor='pointer';
    item.innerHTML = `
      <div class="li-main">
        <div class="li-title">${fmtLong(fromISO(iso))}</div>
        <div class="li-sub">${v.symptoms.map(s=>s.name+' ('+s.intensity+'/5)').join(', ')}</div>
      </div>
      <span class="tag">${v.flow && v.flow!=='none' ? 'menstruação' : ''}</span>
    `;
    item.addEventListener('click', ()=>openDayLogSheet(iso));
    list.appendChild(item);
  });
  main.appendChild(list);
}

/* ============================= DIARY TAB ============================= */
function renderDiaryTab(main){
  main.insertAdjacentHTML('beforeend', `<h2 class="serif section-title">Diário</h2><p class="section-sub">Escreva livremente. Seus registros ficam só com você.</p>`);
  const entries = [...state.diary].sort((a,b)=>b.date.localeCompare(a.date));
  if(!entries.length){
    main.insertAdjacentHTML('beforeend', emptyStateHTML('Seu diário está vazio','Toque no + para escrever sua primeira nota.'));
    return;
  }
  entries.forEach(e=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML = `<div class="small muted" style="margin-bottom:8px;">${fmtLong(fromISO(e.date))}</div><div style="line-height:1.6;font-size:14.5px;">${escapeHtml(e.text).replace(/\n/g,'<br>')}</div>`;
    const del=document.createElement('button'); del.className='btn btn-ghost btn-sm'; del.style.marginTop='12px'; del.textContent='Excluir';
    del.addEventListener('click', ()=>{ state.diary = state.diary.filter(x=>x.id!==e.id); saveState(); render(); });
    card.appendChild(del);
    main.appendChild(card);
  });
}
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function openDiaryEntrySheet(){
  const content=document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h3 class="serif" style="margin:0;font-size:18px;">Nova nota</h3><button class="sheet-close" id="closeSheet3">✕</button></div>
    <label>Data</label>
    <input type="date" id="diaryDate" value="${todayISO()}" max="${todayISO()}">
    <label>Como você está?</label>
    <textarea id="diaryText" placeholder="Hoje acordei cansada, dormi mal e estou com cólica…" style="min-height:140px;"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:20px;" id="saveDiary">Salvar nota</button>
  `;
  content.querySelector('#closeSheet3').addEventListener('click', closeSheet);
  content.querySelector('#saveDiary').addEventListener('click', ()=>{
    const text = content.querySelector('#diaryText').value.trim();
    if(!text){ showToast('Escreva algo antes de salvar'); return; }
    state.diary.push({id:uid(), date:content.querySelector('#diaryDate').value, text});
    saveState(); closeSheet(); render(); showToast('Nota salva no diário');
  });
  openSheet(content);
}

/* ============================= MEDS TAB ============================= */
function renderMedsTab(main){
  main.insertAdjacentHTML('beforeend', `<h2 class="serif section-title">Medicamentos</h2><p class="section-sub">Anticoncepcionais, analgésicos, suplementos — o que você precisar.</p>`);
  if(!state.meds.length){
    main.insertAdjacentHTML('beforeend', emptyStateHTML('Nenhum medicamento cadastrado','Toque no + para adicionar um medicamento e configurar lembretes.'));
    return;
  }
  const list=document.createElement('div'); list.className='card';
  state.meds.forEach(m=>{
    const item=document.createElement('div'); item.className='list-item';
    item.innerHTML = `
      <div class="li-main">
        <div class="li-title">${escapeHtml(m.name)}</div>
        <div class="li-sub">${escapeHtml(m.dose||'')} ${m.freq?'· '+escapeHtml(m.freq):''} ${m.time?'· '+m.time:''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="tag ${m.continuous?'calm':''}">${m.continuous?'contínuo':'temporário'}</span>
      </div>
    `;
    item.addEventListener('click', ()=>openMedSheet(m));
    list.appendChild(item);
  });
  main.appendChild(list);
}

function openMedSheet(existing){
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {id:uid(), name:'', dose:'', freq:'', time:'', start:todayISO(), end:'', continuous:true, notes:''};
  const content=document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h3 class="serif" style="margin:0;font-size:18px;">${existing?'Editar medicamento':'Novo medicamento'}</h3><button class="sheet-close" id="closeSheet4">✕</button></div>
    <label>Nome</label>
    <input type="text" id="mName" value="${escapeHtml(draft.name)}" placeholder="Ex.: Pílula, Ibuprofeno…">
    <label>Dose</label>
    <input type="text" id="mDose" value="${escapeHtml(draft.dose)}" placeholder="Ex.: 20mg, 1 comprimido">
    <label>Frequência</label>
    <input type="text" id="mFreq" value="${escapeHtml(draft.freq)}" placeholder="Ex.: 1x ao dia">
    <label>Horário do lembrete</label>
    <input type="time" id="mTime" value="${draft.time||''}">
    <label>Uso</label>
    <div class="choice-row">
      <div class="choice ${draft.continuous?'selected':''}" id="contChoice">Contínuo</div>
      <div class="choice ${!draft.continuous?'selected':''}" id="tempChoice">Temporário</div>
    </div>
    <div id="endDateWrap" style="display:${draft.continuous?'none':'block'};">
      <label>Data de término</label>
      <input type="date" id="mEnd" value="${draft.end||''}">
    </div>
    <label>Observações</label>
    <textarea id="mNotes">${escapeHtml(draft.notes)}</textarea>
    <button class="btn btn-primary btn-block" style="margin-top:20px;" id="saveMed">Salvar</button>
    ${existing?'<button class="btn btn-danger-outline btn-block" style="margin-top:10px;" id="delMed">Excluir medicamento</button>':''}
  `;
  content.querySelector('#contChoice').addEventListener('click', ()=>{ draft.continuous=true; content.querySelector('#contChoice').classList.add('selected'); content.querySelector('#tempChoice').classList.remove('selected'); content.querySelector('#endDateWrap').style.display='none'; });
  content.querySelector('#tempChoice').addEventListener('click', ()=>{ draft.continuous=false; content.querySelector('#tempChoice').classList.add('selected'); content.querySelector('#contChoice').classList.remove('selected'); content.querySelector('#endDateWrap').style.display='block'; });
  content.querySelector('#closeSheet4').addEventListener('click', closeSheet);
  content.querySelector('#saveMed').addEventListener('click', ()=>{
    draft.name = content.querySelector('#mName').value.trim();
    if(!draft.name){ showToast('Dê um nome ao medicamento'); return; }
    draft.dose = content.querySelector('#mDose').value;
    draft.freq = content.querySelector('#mFreq').value;
    draft.time = content.querySelector('#mTime').value;
    draft.end = content.querySelector('#mEnd') ? content.querySelector('#mEnd').value : '';
    draft.notes = content.querySelector('#mNotes').value;
    const idx = state.meds.findIndex(m=>m.id===draft.id);
    if(idx>=0) state.meds[idx]=draft; else state.meds.push(draft);
    saveState(); closeSheet(); render(); showToast('Medicamento salvo');
  });
  const delBtn = content.querySelector('#delMed');
  if(delBtn) delBtn.addEventListener('click', ()=>{ state.meds = state.meds.filter(m=>m.id!==draft.id); saveState(); closeSheet(); render(); });
  openSheet(content);
}

/* ============================= MÉTODO CONTRACEPTIVO ============================= */
const METHODS = [
  { id:'pilula', label:'Pílula anticoncepcional', interval:1,
    nextLabel:'Próxima dose', logLabel:'Registrar dose de hoje', logVerb:'dose',
    info:{ uso:'Tomada por via oral, um comprimido por dia, sempre no mesmo horário.',
           frequencia:'Diária. Cartelas costumam ter 21, 24 ou 28 comprimidos, dependendo da marca — algumas têm pausa, outras não.',
           cuidados:'Vômitos ou diarreia fortes horas após tomar podem reduzir a proteção. Verifique a bula da sua marca para orientações específicas.' },
    forgot:'Se esqueceu de tomar, a orientação geral é tomar assim que lembrar e seguir a cartela normalmente — mas o prazo de segurança varia conforme o tipo de pílula (combinada ou só de progesterona). Consulte a bula ou um farmacêutico/médico para saber o que fazer no seu caso, e considere usar um método de barreira nos dias seguintes.' },
  { id:'injecao-mensal', label:'Injeção anticoncepcional mensal', interval:30,
    nextLabel:'Próxima aplicação', logLabel:'Registrar aplicação de hoje', logVerb:'aplicação',
    info:{ uso:'Aplicada por injeção intramuscular, geralmente por um profissional de saúde.',
           frequencia:'A cada 30 dias, aproximadamente — o intervalo exato pode variar conforme orientação médica.',
           cuidados:'Alguns dias de atraso costumam ser tolerados, mas atrasos maiores podem reduzir a proteção.' },
    forgot:'Se passou da data prevista, procure aplicar assim que possível e converse com quem te acompanha sobre a necessidade de um método de barreira nesse meio tempo.' },
  { id:'injecao-trimestral', label:'Injeção anticoncepcional trimestral', interval:90,
    nextLabel:'Próxima aplicação', logLabel:'Registrar aplicação de hoje', logVerb:'aplicação',
    info:{ uso:'Aplicada por injeção intramuscular ou subcutânea, por um profissional de saúde.',
           frequencia:'A cada 3 meses (12 a 13 semanas), aproximadamente.',
           cuidados:'Pode causar alterações no padrão de sangramento, especialmente nos primeiros meses de uso.' },
    forgot:'Atrasar a aplicação pode reduzir a proteção contraceptiva. Se passou da janela recomendada, procure orientação antes de aplicar.' },
  { id:'adesivo', label:'Adesivo contraceptivo', interval:7,
    nextLabel:'Próxima troca', logLabel:'Registrar troca de hoje', logVerb:'troca',
    info:{ uso:'Colado na pele (barriga, braço, costas ou nádegas), trocado semanalmente.',
           frequencia:'Um adesivo novo por semana, geralmente por 3 semanas seguidas, com 1 semana de pausa — esse padrão pode variar; ajuste as datas aqui conforme sua orientação médica.',
           cuidados:'Verifique se o adesivo está bem colado todos os dias; se descolar por muito tempo, a proteção pode ser afetada.' },
    forgot:'Se esqueceu de trocar ou o adesivo descolou, a orientação depende de quanto tempo passou. Consulte a bula ou um profissional de saúde para saber os próximos passos.' },
  { id:'anel', label:'Anel vaginal', interval:21,
    nextLabel:'Próxima troca', logLabel:'Registrar troca/colocação de hoje', logVerb:'troca',
    info:{ uso:'Inserido na vagina pela própria usuária, permanece no local por várias semanas.',
           frequencia:'Geralmente 3 semanas de uso contínuo seguidas de 1 semana de pausa — o esquema pode variar conforme o produto; ajuste as datas aqui se for o seu caso.',
           cuidados:'Verifique se o anel permanece no lugar; se sair acidentalmente, lave com água morna e recoloque o quanto antes.' },
    forgot:'Se o anel ficou fora por mais de algumas horas, a proteção pode ser reduzida. Consulte a bula do produto ou um profissional de saúde.' },
  { id:'implante', label:'Implante contraceptivo', interval:1095,
    nextLabel:'Próxima renovação', logLabel:'Registrar renovação/troca', logVerb:'renovação',
    info:{ uso:'Um bastonete pequeno inserido sob a pele do braço por um profissional de saúde.',
           frequencia:'Costuma durar cerca de 3 anos, mas isso pode variar conforme o modelo — confirme com quem fez a aplicação.',
           cuidados:'É comum causar alterações no padrão de sangramento. Procure um profissional se sentir dor, inchaço ou não conseguir localizar o implante sob a pele.' },
    forgot:'Passar da data de validade reduz a proteção contraceptiva. Vale agendar a troca com antecedência.' },
  { id:'diu-hormonal', label:'DIU hormonal', interval:1825,
    nextLabel:'Próxima renovação', logLabel:'Registrar troca/renovação', logVerb:'renovação',
    info:{ uso:'Um pequeno dispositivo inserido no útero por um profissional de saúde.',
           frequencia:'A duração varia conforme o modelo — geralmente entre 3 e 8 anos. Confirme com quem fez a inserção qual é o prazo do seu.',
           cuidados:'Cólicas e sangramento irregular são comuns nos primeiros meses. Procure ajuda se sentir dor forte ou febre.' },
    forgot:'Se passou do prazo de validade, a proteção contraceptiva pode não estar mais garantida — vale agendar a troca.' },
  { id:'diu-cobre', label:'DIU de cobre', interval:3650,
    nextLabel:'Próxima renovação', logLabel:'Registrar troca/renovação', logVerb:'renovação',
    info:{ uso:'Um pequeno dispositivo sem hormônios inserido no útero por um profissional de saúde.',
           frequencia:'Pode durar entre 5 e 10 anos, dependendo do modelo. Confirme o prazo específico com quem fez a inserção.',
           cuidados:'Pode deixar a menstruação mais intensa ou com mais cólica, principalmente no início do uso.' },
    forgot:'Se passou do prazo de validade, procure agendar a avaliação e possível troca.' },
  { id:'preservativo', label:'Preservativo', interval:null,
    nextLabel:null, logLabel:'Registrar uso', logVerb:'uso',
    info:{ uso:'Colocado antes do contato íntimo, um novo a cada relação.',
           frequencia:'Uso a cada relação — não tem data de troca fixa.',
           cuidados:'Verifique a validade e guarde longe de calor. É o único método que também ajuda a prevenir ISTs.' },
    forgot:'Se o preservativo rompeu ou saiu durante a relação, procure orientação sobre contracepção de emergência o quanto antes — a eficácia diminui com o tempo.' },
  { id:'outro', label:'Outros métodos', interval:null,
    nextLabel:null, logLabel:'Registrar uso', logVerb:'uso',
    info:{ uso:'Descreva nas suas anotações como esse método funciona pra você.',
           frequencia:'Depende do método — use as anotações para guardar os detalhes.',
           cuidados:'Consulte um profissional de saúde para orientações específicas sobre o método que você utiliza.' },
    forgot:'Consulte um profissional de saúde para orientações específicas sobre o método que você utiliza.' },
];
function getMethod(id){ return METHODS.find(m=>m.id===id) || METHODS[METHODS.length-1]; }
function methodDisplayLabel(entry){ return entry.methodId==='outro' && entry.customLabel ? entry.customLabel : getMethod(entry.methodId).label; }

function methodNextDate(){
  const cur = state.contraceptive.current;
  if(!cur) return null;
  const method = getMethod(cur.methodId);
  if(!method.interval) return null;
  const relevantLogs = state.contraceptive.logs
    .filter(l=>l.date>=cur.startDate && (l.type==='uso'||l.type==='aplicacao'||l.type==='troca'||l.type==='renovacao'))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const anchor = relevantLogs.length ? relevantLogs[relevantLogs.length-1].date : cur.startDate;
  return addDays(fromISO(anchor), method.interval);
}

function renderMethodTab(main){
  main.insertAdjacentHTML('beforeend', `<h2 class="serif section-title">Método contraceptivo</h2><p class="section-sub">Acompanhe o método que você usa, com lembretes e informações específicas para ele.</p>`);

  const cur = state.contraceptive.current;
  if(!cur){
    main.insertAdjacentHTML('beforeend', emptyStateHTML('Nenhum método cadastrado ainda','Cadastre o método que você usa para acompanhar as próximas datas e receber orientações específicas.'));
    const btnWrap=document.createElement('div'); btnWrap.style.textAlign='center';
    const btn=document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Cadastrar método';
    btn.addEventListener('click', ()=>openMethodSetupSheet());
    btnWrap.appendChild(btn); main.appendChild(btnWrap);
    if(state.contraceptive.history.length){ main.appendChild(renderMethodHistoryCard()); }
    main.appendChild(disclaimerBlock());
    return;
  }

  const method = getMethod(cur.methodId);
  const next = methodNextDate();
  const today = new Date(); today.setHours(0,0,0,0);

  const hero=document.createElement('div'); hero.className='hero';
  let headline;
  if(next){
    const daysTo = diffDays(today, next);
    if(daysTo<0) headline = `A data prevista para ${method.nextLabel.toLowerCase()} já passou — registre quando fizer.`;
    else if(daysTo===0) headline = `${method.nextLabel} é <em>hoje</em>.`;
    else if(daysTo===1) headline = `${method.nextLabel} é <em>amanhã</em>.`;
    else headline = `Faltam <em>${daysTo} dias</em> para ${method.nextLabel.toLowerCase()}.`;
  } else {
    headline = `Você está usando <em>${methodDisplayLabel(cur)}</em>.`;
  }
  hero.innerHTML = `<div class="hero-eyebrow">${methodDisplayLabel(cur)}</div><h2 class="hero-headline">${headline}</h2>` +
    (next ? `<div class="hero-stats"><div class="hero-stat"><b>${fmtLong(next)}</b><span>${method.nextLabel.toLowerCase()}</span></div></div>` : '');
  main.appendChild(hero);

  const actionsRow=document.createElement('div'); actionsRow.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;';
  const logBtn=document.createElement('button'); logBtn.className='btn btn-primary btn-sm'; logBtn.textContent=method.logLabel;
  logBtn.addEventListener('click', ()=>openMethodLogSheet());
  const delayBtn=document.createElement('button'); delayBtn.className='btn btn-ghost btn-sm'; delayBtn.textContent='Atraso ou esquecimento';
  delayBtn.addEventListener('click', ()=>openMethodLogSheet('atraso'));
  actionsRow.appendChild(logBtn); actionsRow.appendChild(delayBtn);
  main.appendChild(actionsRow);

  const infoCard=document.createElement('div'); infoCard.className='card';
  infoCard.innerHTML = `
    <div class="small muted" style="margin-bottom:10px;">Sobre esse método</div>
    <div class="policy-block">
      <h4>Como usar</h4><p>${method.info.uso}</p>
      <h4>Frequência</h4><p>${method.info.frequencia}</p>
      <h4>Cuidados</h4><p>${method.info.cuidados}</p>
    </div>
  `;
  main.appendChild(infoCard);

  const forgotCard=document.createElement('div'); forgotCard.className='card';
  forgotCard.innerHTML = `<div class="small muted" style="margin-bottom:8px;">Se esquecer, atrasar ou algo sair diferente</div><p class="small" style="line-height:1.6;color:var(--text-muted);">${method.forgot}</p>`;
  main.appendChild(forgotCard);

  // registros recentes
  const recentLogs = state.contraceptive.logs.filter(l=>l.date>=cur.startDate).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  if(recentLogs.length){
    const logCard=document.createElement('div'); logCard.className='card';
    logCard.innerHTML = `<div class="small muted" style="margin-bottom:6px;">Registros recentes</div>`;
    recentLogs.forEach(l=>{
      const item=document.createElement('div'); item.className='list-item';
      const typeLabel = {uso:'Uso', aplicacao:'Aplicação', troca:'Troca', renovacao:'Renovação', atraso:'Atraso', esquecimento:'Esquecimento'}[l.type] || l.type;
      item.innerHTML = `<div class="li-main"><div class="li-title">${typeLabel}</div><div class="li-sub">${fmtLong(fromISO(l.date))}${l.note?' · '+escapeHtml(l.note):''}</div></div>` +
        (l.type==='atraso'||l.type==='esquecimento' ? `<span class="tag attention">atenção</span>` : '');
      logCard.appendChild(item);
    });
    main.appendChild(logCard);
  }

  // trocar / parar
  const manageCard=document.createElement('div'); manageCard.className='card';
  const changeRow=document.createElement('div'); changeRow.className='toggle-row';
  changeRow.innerHTML = `<div class="li-main"><div class="li-title">Trocar de método</div><div class="li-sub">O método atual vai para o seu histórico</div></div>`;
  const changeBtn=document.createElement('button'); changeBtn.className='btn btn-ghost btn-sm'; changeBtn.textContent='Trocar';
  changeBtn.addEventListener('click', ()=>openMethodSetupSheet());
  changeRow.appendChild(changeBtn); manageCard.appendChild(changeRow);

  const stopRow=document.createElement('div'); stopRow.className='toggle-row';
  stopRow.innerHTML = `<div class="li-main"><div class="li-title">Parar acompanhamento</div><div class="li-sub">Seus registros anteriores continuam salvos</div></div>`;
  const stopBtn=document.createElement('button'); stopBtn.className='btn btn-danger-outline btn-sm'; stopBtn.textContent='Parar';
  stopBtn.addEventListener('click', stopMethodTracking);
  stopRow.appendChild(stopBtn); manageCard.appendChild(stopRow);
  main.appendChild(manageCard);

  if(state.contraceptive.history.length){ main.appendChild(renderMethodHistoryCard()); }

  main.appendChild(disclaimerBlock());
  const note=document.createElement('p'); note.className='small faint'; note.style.marginTop='-8px';
  note.textContent = 'Os lembretes aqui são uma ferramenta de organização e não substituem orientação médica.';
  main.appendChild(note);
}

function renderMethodHistoryCard(){
  const card=document.createElement('div'); card.className='card';
  card.innerHTML = `<div class="small muted" style="margin-bottom:6px;">Métodos anteriores</div>`;
  [...state.contraceptive.history].reverse().forEach(h=>{
    const item=document.createElement('div'); item.className='list-item';
    const range = fmtLong(fromISO(h.startDate)) + ' – ' + (h.endDate ? fmtLong(fromISO(h.endDate)) : 'hoje');
    item.innerHTML = `<div class="li-main"><div class="li-title">${h.methodId==='outro' && h.customLabel ? h.customLabel : getMethod(h.methodId).label}</div><div class="li-sub">${range}${h.reason?' · '+h.reason:''}</div></div>`;
    card.appendChild(item);
  });
  return card;
}

function openMethodSetupSheet(){
  const cur = state.contraceptive.current;
  const draft = { methodId: cur?cur.methodId:'pilula', startDate: cur?cur.startDate:todayISO(), customLabel: cur?cur.customLabel||'':'', notes: cur?cur.notes||'':'' };
  const content=document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h3 class="serif" style="margin:0;font-size:18px;">${cur?'Trocar de método':'Cadastrar método'}</h3><button class="sheet-close" id="closeMethodSheet">✕</button></div>
    <label>Método</label>
    <div class="choice-row" id="methodRow"></div>
    <div id="customLabelWrap" style="display:${draft.methodId==='outro'?'block':'none'};">
      <label>Qual método?</label>
      <input type="text" id="customLabelInput" value="${escapeHtml(draft.customLabel)}" placeholder="Descreva o método">
    </div>
    <label>Data de início</label>
    <input type="date" id="methodStart" value="${draft.startDate}" max="${todayISO()}">
    <label>Observações (opcional)</label>
    <textarea id="methodNotes" placeholder="Marca, orientação recebida, etc.">${escapeHtml(draft.notes)}</textarea>
    <button class="btn btn-primary btn-block" style="margin-top:20px;" id="saveMethod">Salvar</button>
  `;
  const row = content.querySelector('#methodRow');
  METHODS.forEach(m=>{
    const c=document.createElement('div'); c.className='choice'+(draft.methodId===m.id?' selected':''); c.textContent=m.label;
    c.addEventListener('click', ()=>{
      draft.methodId=m.id; row.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected')); c.classList.add('selected');
      content.querySelector('#customLabelWrap').style.display = m.id==='outro' ? 'block':'none';
    });
    row.appendChild(c);
  });
  content.querySelector('#closeMethodSheet').addEventListener('click', closeSheet);
  content.querySelector('#saveMethod').addEventListener('click', ()=>{
    const startDate = content.querySelector('#methodStart').value;
    const customLabel = content.querySelector('#customLabelInput').value.trim();
    const notes = content.querySelector('#methodNotes').value;
    if(!startDate){ showToast('Escolha a data de início'); return; }
    if(cur && cur.methodId!==draft.methodId){
      state.contraceptive.history.push({ methodId:cur.methodId, customLabel:cur.customLabel||'', startDate:cur.startDate, endDate:todayISO(), reason:'trocado' });
    }
    state.contraceptive.current = { methodId:draft.methodId, customLabel, startDate, notes };
    saveState(); closeSheet(); render(); showToast('Método salvo');
  });
  openSheet(content);
}

function openMethodLogSheet(defaultType){
  const cur = state.contraceptive.current;
  const method = getMethod(cur.methodId);
  const types = [
    {id:'uso', label:'Uso/aplicação de hoje'},
    {id:'atraso', label:'Atraso'},
    {id:'esquecimento', label:'Esquecimento'},
  ];
  let selectedType = defaultType || 'uso';
  const content=document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h3 class="serif" style="margin:0;font-size:18px;">Registrar ${method.logVerb}</h3><button class="sheet-close" id="closeLogSheet">✕</button></div>
    <label>Tipo de registro</label>
    <div class="choice-row" id="typeRow"></div>
    <label>Data</label>
    <input type="date" id="logDate" value="${todayISO()}" max="${todayISO()}">
    <label>Observação (opcional)</label>
    <textarea id="logNote" placeholder="Algo que queira lembrar"></textarea>
    <button class="btn btn-primary btn-block" style="margin-top:20px;" id="saveLog">Salvar registro</button>
  `;
  const typeRow = content.querySelector('#typeRow');
  types.forEach(t=>{
    const c=document.createElement('div'); c.className='choice'+(selectedType===t.id?' selected':''); c.textContent=t.label;
    c.addEventListener('click', ()=>{ selectedType=t.id; typeRow.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected')); c.classList.add('selected'); });
    typeRow.appendChild(c);
  });
  content.querySelector('#closeLogSheet').addEventListener('click', closeSheet);
  content.querySelector('#saveLog').addEventListener('click', ()=>{
    const date = content.querySelector('#logDate').value;
    const note = content.querySelector('#logNote').value;
    state.contraceptive.logs.push({ id:uid(), date, type:selectedType, note });
    saveState(); closeSheet(); render(); showToast('Registro salvo');
  });
  openSheet(content);
}

function stopMethodTracking(){
  const cur = state.contraceptive.current;
  if(!cur) return;
  if(confirm('Isso para o acompanhamento do método atual. Seus registros continuam salvos no histórico. Deseja continuar?')){
    state.contraceptive.history.push({ methodId:cur.methodId, customLabel:cur.customLabel||'', startDate:cur.startDate, endDate:todayISO(), reason:'interrompido' });
    state.contraceptive.current = null;
    saveState(); render(); showToast('Acompanhamento interrompido');
  }
}

/* ============================= INSIGHTS TAB ============================= */
/* ---------- conselhos: por fase e por sintoma recente ---------- */
const SYMPTOM_TIPS = {
  'Cólica': {icon:'🔥', text:'Uma bolsa de água quente ou compressa morna na parte baixa da barriga ajuda a relaxar a musculatura. Alongamentos leves e chás como gengibre ou camomila também costumam aliviar.'},
  'Dor abdominal': {icon:'🔥', text:'Calor local, uma caminhada leve e respiração lenta podem ajudar a relaxar a região. Evite refeições muito pesadas nesses dias.'},
  'Dor pélvica': {icon:'🔥', text:'Descanso em posição confortável (de lado, com um travesseiro entre as pernas) e calor local costumam aliviar a pressão.'},
  'Dor lombar': {icon:'🧘', text:'Alongar a lombar e o quadril com calma, e evitar ficar muito tempo sentada na mesma posição, costuma ajudar.'},
  'Dor de cabeça': {icon:'💧', text:'Hidrate-se bem, procure um ambiente com pouca luz e barulho, e experimente descansar os olhos longe de telas por um tempo.'},
  'Enxaqueca': {icon:'💧', text:'Ambiente escuro e silencioso, hidratação e uma pausa das telas costumam ajudar. Se for forte ou frequente, vale conversar com um profissional de saúde.'},
  'Náusea': {icon:'🍵', text:'Refeições menores e mais frequentes, gengibre e evitar cheiros fortes podem ajudar a controlar o enjoo.'},
  'Tontura': {icon:'💧', text:'Levante-se devagar, beba água e evite ficar muito tempo em pé parada. Se persistir, preste atenção em quando ela costuma aparecer.'},
  'Fadiga': {icon:'😴', text:'Seu corpo está pedindo descanso — durma um pouco mais se der, e prefira atividades físicas mais leves nesses dias.'},
  'Inchaço': {icon:'🥗', text:'Reduzir o sal e beber bastante água (parece contraditório, mas ajuda) costuma diminuir a retenção de líquido.'},
  'Sensibilidade nas mamas': {icon:'👚', text:'Um sutiã mais confortável e evitar cafeína em excesso nesses dias pode reduzir o desconforto.'},
  'Acne': {icon:'🧴', text:'Mantenha a rotina de limpeza de pele de sempre, sem exagerar em produtos novos justo nesses dias — a pele já está mais sensível.'},
  'Alterações intestinais': {icon:'🥗', text:'Fibras, água e evitar excesso de café ajudam a regular o intestino, que costuma ficar mais sensível nessa fase.'},
  'Alteração do apetite': {icon:'🍽️', text:'É normal sentir mais fome nesses dias. Prefira ter por perto opções que te satisfaçam sem deixar você desconfortável depois.'},
  'Ondas de calor': {icon:'🌬️', text:'Vista camadas fáceis de tirar, tenha água por perto e evite ambientes muito abafados.'},
  'Dificuldade para dormir': {icon:'😴', text:'Tente manter um horário regular para dormir, evitar telas antes de deitar e um ambiente mais fresco e escuro.'},
  'Irritabilidade': {icon:'🌬️', text:'Perceber a irritação sem se cobrar por ela já ajuda. Uma pausa curta, respiração lenta ou sair um pouco do ambiente pode aliviar.'},
  'Ansiedade': {icon:'🌬️', text:'Respiração lenta (inspire em 4 tempos, expire em 6) e reduzir cafeína podem ajudar a acalmar. Se for algo frequente, vale conversar com alguém de confiança ou um profissional.'},
  'Tristeza': {icon:'💛', text:'É válido sentir isso — não precisa "resolver" agora. Conversar com alguém querido ou simplesmente descansar pode ajudar a passar.'},
  'Estresse': {icon:'🌬️', text:'Pausas curtas ao longo do dia, mesmo de 5 minutos, ajudam mais do que parecem. Tente reduzir compromissos nesses dias, se for possível.'},
  'Alterações de humor': {icon:'💛', text:'Saber que isso tem explicação hormonal já ajuda a não se cobrar tanto. Durma bem e seja gentil consigo mesma nesses dias.'},
  'Falta de energia': {icon:'😴', text:'Ajuste as expectativas do dia ao seu ritmo atual — não tem problema render menos em alguns dias do ciclo.'},
};
const PHASE_TIPS = {
  'menstruação': [{icon:'🔥', text:'Você está na fase de menstruação — cólica, cansaço e mudanças de humor são esperados. Calor local, hidratação e descanso costumam ajudar bastante nesses dias.'}],
  'período fértil': [{icon:'⚡', text:'Você está no período fértil — é comum sentir mais energia e disposição. Também pode notar uma leve dor de um lado da pelve; é normal e costuma passar sozinha.'}],
  'fase lútea': [{icon:'🌙', text:'Você está na fase lútea, quando a TPM costuma aparecer. Reduzir sal e açúcar, dormir bem e ir com calma ajuda a passar por esses dias.'}],
  'fase folicular': [{icon:'🌱', text:'Você está na fase folicular — a energia tende a subir nos próximos dias. Pode ser um bom momento para atividades mais intensas ou começar algo novo.'}],
};
function getAdvice(stats, phase){
  const tips=[];
  const seen=new Set();
  (PHASE_TIPS[phase.name]||[]).forEach(t=>{ tips.push(t); seen.add(t.text); });

  // sintomas dos últimos 3 dias com registro
  const today=new Date(); today.setHours(0,0,0,0);
  const recentNames=[];
  for(let i=0;i<3;i++){
    const iso = toISO(addDays(today,-i));
    const rec = state.days[iso];
    if(rec && rec.symptoms) rec.symptoms.forEach(s=>{ if(!recentNames.includes(s.name)) recentNames.push(s.name); });
  }
  recentNames.forEach(name=>{
    const tip = SYMPTOM_TIPS[name];
    if(tip && !seen.has(tip.text) && tips.length<5){ tips.push(tip); seen.add(tip.text); }
  });
  return tips;
}

const PHASE_INFO = [
  {name:'Menstruação', color:'var(--rose)', text:'O revestimento do útero é eliminado. É comum sentir cólica, cansaço e variações de humor nos primeiros dias.'},
  {name:'Fase folicular', color:'var(--gold)', text:'Os hormônios começam a subir e muitas mulheres sentem mais energia e disposição conforme os dias avançam.'},
  {name:'Ovulação', color:'var(--lavender)', text:'Estimativa do dia mais fértil do ciclo. Algumas pessoas notam alteração no corrimento ou leve dor pélvica de um lado.'},
  {name:'Fase lútea', color:'var(--sage)', text:'Após a ovulação, é comum surgir TPM: sensibilidade nas mamas, alterações de humor e inchaço nos dias finais.'},
];

function renderInsightsTab(main, stats){
  main.insertAdjacentHTML('beforeend', `<h2 class="serif section-title">Insights</h2><p class="section-sub">Padrões observados nos seus próprios registros — não diagnósticos.</p>`);

  const phaseNow = currentPhase(stats);
  const advice = getAdvice(stats, phaseNow);
  if(advice.length){
    const adviceCard=document.createElement('div'); adviceCard.className='card';
    adviceCard.innerHTML = `<div class="small muted" style="margin-bottom:6px;">Conselhos para agora</div>`;
    adviceCard.insertAdjacentHTML('beforeend', advice.map(t=>insightRow(t.icon,'var(--bg-card-2)',t.text,false)).join(''));
    main.appendChild(adviceCard);
  }

  const card=document.createElement('div'); card.className='card';
  let rows='';
  if(stats.starts.length>=2){
    rows += insightRow('🌙','var(--gold-dim)', `Seu ciclo médio registrado é de ${stats.avgCycle} dias, calculado a partir de ${stats.starts.length} ciclos que você registrou.`, false);
  } else {
    rows += insightRow('🌙','var(--gold-dim)', `Ainda usando ${stats.avgCycle} dias (do seu cadastro) — registre mais ciclos para personalizar essa previsão.`, false);
  }
  if(stats.deviation){
    rows += insightRow('⚠️','var(--rose-dim)', `Seus últimos ciclos têm média de ${stats.deviation.recentAvg} dias, contra ${stats.deviation.olderAvg} dias no seu histórico anterior. Se essa mudança persistir, considere conversar com um profissional de saúde.`, true);
  } else if(stats.starts.length>=4){
    rows += insightRow('🌿','var(--sage-dim)', `Seus ciclos recentes estão dentro do seu padrão habitual.`, false);
  }

  // symptom intensity trend (simple: compare last 3 logs vs prior logs for top symptom)
  const symDays = Object.entries(state.days).filter(([,v])=>v.symptoms&&v.symptoms.length).sort((a,b)=>a[0].localeCompare(b[0]));
  if(symDays.length>=4){
    const bySym={};
    symDays.forEach(([iso,v])=>v.symptoms.forEach(s=>{ (bySym[s.name]=bySym[s.name]||[]).push({iso,intensity:s.intensity}); }));
    const topName = Object.entries(bySym).sort((a,b)=>b[1].length-a[1].length)[0];
    if(topName && topName[1].length>=4){
      const arr=topName[1];
      const recent = arr.slice(-2).map(x=>x.intensity);
      const older = arr.slice(0,-2).map(x=>x.intensity);
      const rAvg = recent.reduce((a,b)=>a+b,0)/recent.length;
      const oAvg = older.reduce((a,b)=>a+b,0)/older.length;
      if(rAvg - oAvg >= 1.5){
        rows += insightRow('📈','var(--rose-dim)', `A intensidade de "${topName[0]}" nos últimos registros está acima do seu padrão histórico (${rAvg.toFixed(1)}/5 vs ${oAvg.toFixed(1)}/5). Considere conversar com um profissional de saúde se isso persistir.`, true);
      } else {
        rows += insightRow('🩶','var(--bg-card-2)', `"${topName[0]}" é seu sintoma mais registrado, com intensidade estável em torno de ${((rAvg+oAvg)/2).toFixed(1)}/5.`, false);
      }
    }
  }
  card.innerHTML = `<div class="small muted" style="margin-bottom:6px;">Seus padrões</div>`;
  card.insertAdjacentHTML('beforeend', rows);
  main.appendChild(card);

  if(symDays.length){
    const freq={};
    symDays.forEach(([,v])=>v.symptoms.forEach(s=>{ freq[s.name]=(freq[s.name]||0)+1; }));
    const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,6);
    if(top.length){
      const freqCard=document.createElement('div'); freqCard.className='card';
      freqCard.innerHTML = `<div class="small muted" style="margin-bottom:10px;">Sintomas mais frequentes</div>`;
      const wrap=document.createElement('div');
      top.forEach(([name,count])=>{
        const tag=document.createElement('span'); tag.className='chip-symptom'; tag.textContent=`${name} · ${count}x`;
        wrap.appendChild(tag);
      });
      freqCard.appendChild(wrap);
      main.appendChild(freqCard);
    }
  }

  const info=document.createElement('div'); info.className='card';
  info.innerHTML = `<div class="small muted" style="margin-bottom:10px;">Fases do ciclo</div>`;
  PHASE_INFO.forEach(p=>{
    const el=document.createElement('div'); el.className='phase-info'; el.style.borderColor=p.color;
    el.innerHTML = `<b style="color:${p.color};">${p.name}</b><div class="small muted" style="margin-top:4px;line-height:1.5;">${p.text}</div>`;
    info.appendChild(el);
  });
  main.appendChild(info);

  main.appendChild(disclaimerBlock());
}
function insightRow(icon,bg,text,attention){
  return `<div class="insight-row"><div class="insight-icon" style="background:${bg};">${icon}</div><div class="small" style="line-height:1.55;padding-top:4px;">${text}</div></div>`;
}

function emptyStateHTML(title, sub){
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/></svg>
    <div style="font-weight:500;color:var(--text);margin-bottom:4px;">${title}</div>
    <div class="small">${sub}</div>
  </div>`;
}

/* ============================= SETTINGS TAB ============================= */
function renderSettingsTab(main){
  main.insertAdjacentHTML('beforeend', `<h2 class="serif section-title">Configurações</h2>`);

  // Aparência
  const appearance = document.createElement('div'); appearance.className='card';
  appearance.innerHTML = `<div class="small muted" style="margin-bottom:10px;">Aparência</div>`;
  const themeRow = document.createElement('div'); themeRow.className='choice-row';
  const themeOpts = [['dark','Escuro'],['light','Claro'],['system','Automático']];
  themeOpts.forEach(([id,label])=>{
    const c=document.createElement('div'); c.className='choice'+(state.settings.theme===id?' selected':''); c.textContent=label;
    c.addEventListener('click', ()=>{
      state.settings.theme = id; saveState(); applyTheme(id);
      themeRow.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected')); c.classList.add('selected');
    });
    themeRow.appendChild(c);
  });
  appearance.appendChild(themeRow);
  appearance.insertAdjacentHTML('beforeend', `<div class="small faint" style="margin-top:10px;">"Automático" segue o tema do seu sistema ou navegador.</div>`);
  main.appendChild(appearance);

  // Tema de cores / personalização
  const colorCard = document.createElement('div'); colorCard.className='card';
  colorCard.innerHTML = `<div class="small muted" style="margin-bottom:12px;">Tema de cores</div>`;
  const grid = document.createElement('div'); grid.className='accent-grid';
  ACCENT_PRESETS.forEach(p=>{
    const isSelected = state.settings.accent===p.id;
    const sw = document.createElement('div'); sw.className='accent-swatch'+(isSelected?' selected':'');
    sw.innerHTML = `<div class="dots"><span style="background:${p.gold};"></span><span style="background:${p.lavender};"></span><span style="background:${p.sage};"></span></div><label>${p.label}</label>`;
    sw.addEventListener('click', ()=>{
      state.settings.accent = p.id; state.settings.customColor = null;
      saveState(); applyAccent(state.settings); render();
    });
    grid.appendChild(sw);
  });
  colorCard.appendChild(grid);

  const customRow = document.createElement('div'); customRow.className='custom-accent-row';
  const isCustom = state.settings.accent==='custom';
  customRow.innerHTML = `
    <div class="color-input-wrap" style="background:${state.settings.customColor||'#E7B96A'};">
      <input type="color" id="customColorInput" value="${state.settings.customColor||'#E7B96A'}">
    </div>
    <div class="li-main">
      <div class="li-title">Cor personalizada</div>
      <div class="li-sub">${isCustom ? 'Aplicada como cor principal' : 'Escolha sua própria cor de destaque'}</div>
    </div>
  `;
  customRow.querySelector('#customColorInput').addEventListener('input', (e)=>{
    state.settings.accent='custom'; state.settings.customColor=e.target.value;
    saveState(); applyAccent(state.settings); render();
  });
  colorCard.appendChild(customRow);
  main.appendChild(colorCard);

  // Dados e privacidade
  const dataCard = document.createElement('div'); dataCard.className='card';
  dataCard.innerHTML = `<div class="small muted" style="margin-bottom:6px;">Seus dados</div>`;
  const exportRow = document.createElement('div'); exportRow.className='toggle-row';
  exportRow.innerHTML = `<div class="li-main"><div class="li-title">Exportar meus dados</div><div class="li-sub">Baixa um arquivo .json com tudo o que você registrou</div></div>`;
  const exportBtn = document.createElement('button'); exportBtn.className='btn btn-ghost btn-sm'; exportBtn.textContent='Exportar';
  exportBtn.addEventListener('click', exportData);
  exportRow.appendChild(exportBtn);
  dataCard.appendChild(exportRow);

  const deleteRow = document.createElement('div'); deleteRow.className='toggle-row';
  deleteRow.innerHTML = `<div class="li-main"><div class="li-title">Apagar todos os dados</div><div class="li-sub">Remove tudo deste navegador. Não pode ser desfeito.</div></div>`;
  const deleteBtn = document.createElement('button'); deleteBtn.className='btn btn-danger-outline btn-sm'; deleteBtn.textContent='Apagar';
  deleteBtn.addEventListener('click', ()=>{
    if(confirm('Isso vai apagar permanentemente todos os seus registros neste navegador. Deseja continuar?')){
      try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
      state = defaultState();
      onbDraft = null; onbStep = 0;
      render();
      showToast('Todos os dados foram apagados');
    }
  });
  deleteRow.appendChild(deleteBtn);
  dataCard.appendChild(deleteRow);

  const exitRow = document.createElement('div'); exitRow.className='toggle-row';
  exitRow.innerHTML = `<div class="li-main"><div class="li-title">Sair do Luna</div><div class="li-sub">Você vai precisar refazer o cadastro inicial. Seus registros (ciclo, sintomas, diário) continuam salvos.</div></div>`;
  const exitBtn = document.createElement('button'); exitBtn.className='btn btn-ghost btn-sm'; exitBtn.textContent='Sair';
  exitBtn.addEventListener('click', ()=>{
    if(confirm('Isso encerra sua sessão — na próxima vez você vai precisar refazer o cadastro inicial. Seus registros continuam salvos. Deseja sair?')){
      state.onboarded = false;
      saveState();
      onbDraft = null; onbStep = 0;
      activeTab='home';
      render();
    }
  });
  exitRow.appendChild(exitBtn);
  dataCard.appendChild(exitRow);

  main.appendChild(dataCard);

  // Termos de uso e privacidade
  const policyCard = document.createElement('div'); policyCard.className='card';
  const policyRow = document.createElement('div'); policyRow.className='toggle-row';
  policyRow.innerHTML = `<div class="li-main"><div class="li-title">Termos de uso e privacidade</div><div class="li-sub">Como cuidamos dos seus dados, em poucas palavras</div></div>`;
  const policyBtn = document.createElement('button'); policyBtn.className='btn btn-ghost btn-sm'; policyBtn.textContent='Ler texto completo';
  policyBtn.addEventListener('click', openPolicySheet);
  policyRow.appendChild(policyBtn);
  policyCard.appendChild(policyRow);
  main.appendChild(policyCard);

  const version = document.createElement('div'); version.className='faint small'; version.style.textAlign='center'; version.style.margin='4px 0 20px';
  version.textContent = 'Luna · versão 1.0 · feito para acompanhar você, não para te vigiar';
  main.appendChild(version);
}

function openPolicySheet(){
  const content=document.createElement('div');
  content.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h3 class="serif" style="margin:0;font-size:18px;">Termos de uso e privacidade</h3><button class="sheet-close" id="closePolicySheet">✕</button></div>
    <div class="policy-block">
      <h4>Onde ficam seus dados</h4>
      <p>Tudo o que você registra no Luna — ciclo, sintomas, diário, medicamentos — fica salvo apenas neste navegador, neste dispositivo. Nada é enviado para nenhum servidor, porque o Luna não tem um. Se você limpar os dados do navegador, desinstalar o app ou trocar de aparelho, esses registros somem — por isso vale usar a opção "Exportar meus dados" de vez em quando.</p>
      <h4>O que o Luna nunca faz</h4>
      <p>O Luna não coleta, não vende e não compartilha suas informações com ninguém — não existe conexão com a internet para isso. Não há anúncios, não há rastreadores e não há conta a ser criada.</p>
      <h4>Sobre as previsões e os insights</h4>
      <p>As previsões de ciclo, ovulação e os padrões mostrados na aba Insights são estimativas calculadas a partir dos seus próprios registros. Eles servem para te ajudar a entender seu corpo, não para diagnosticar doenças nem confirmar gravidez. O Luna não substitui uma consulta médica.</p>
      <h4>Quando procurar ajuda</h4>
      <p>Se você notar dor muito forte, sangramento fora do comum, ou qualquer coisa que te preocupe, procure um profissional de saúde. Em caso de emergência, ligue para o serviço de emergência da sua região.</p>
      <h4>Responsabilidade pelo uso</h4>
      <p>Como os dados moram só no seu dispositivo, você é responsável por cuidar deles — inclusive por quem mais tem acesso físico ao seu navegador. Se isso for uma preocupação, considere usar um perfil de navegador privado ou apagar os dados quando terminar de usar.</p>
    </div>
  `;
  content.querySelector('#closePolicySheet').addEventListener('click', closeSheet);
  openSheet(content);
}

function exportData(){
  try{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'luna-meus-dados-'+todayISO()+'.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Dados exportados');
  }catch(e){
    showToast('Não foi possível exportar agora');
  }
}

/* ============================= SHEET / OVERLAY ============================= */
function openSheet(contentEl){
  const overlay = document.getElementById('overlay');
  const sc = document.getElementById('sheetContent');
  sc.innerHTML=''; sc.appendChild(contentEl);
  overlay.classList.add('open');
}
function closeSheet(){
  document.getElementById('overlay').classList.remove('open');
}
document.getElementById('overlay').addEventListener('click', (e)=>{
  if(e.target.id==='overlay') closeSheet();
});

/* ============================= INIT ============================= */
render();
