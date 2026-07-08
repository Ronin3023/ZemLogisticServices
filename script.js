/* ============================================================
   SUPABASE CONFIG — fill these in from your Supabase project
   (Project Settings → API → Project URL / anon public key)
   ============================================================ */
const SUPABASE_URL = 'https://voovknlmneyomfmhwsyw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_masBIhBUlPLmy7E1RFqtZg_Up7MJWMk';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ------------ Data (now loaded from Supabase, not hardcoded) ------------ */
const TYPE_LABEL = {vacation:'Vacation', sick:'Sick', personal:'Personal', unpaid:'Unpaid', absent:'Absent'};
const TYPE_COLOR = {vacation:'#2D6A4F', sick:'#D8F0E3', personal:'#226050', unpaid:'#74C69D', absent:'#B0472F'};

let employees = [];
let leaves = [];
let requests = [];

let current = new Date(); // calendar starts on the actual current month

/* ------------ Row <-> app shape mapping ------------
   DB columns use emp_id/start_date/end_date; the UI code (already written)
   expects empId/start/end, so we translate on the way in and out. */
function rowToLeave(r){ return {id:r.id, empId:r.emp_id, type:r.type, start:r.start_date, end:r.end_date, note:r.note||''}; }
function rowToRequest(r){ return {id:r.id, empId:r.emp_id, type:r.type, start:r.start_date, end:r.end_date, note:r.note||'', status:r.status}; }

async function loadEmployees(){
  const {data,error} = await sb.from('employees').select('*').order('id');
  if(error){ toast('Could not load employees'); console.error(error); return; }
  employees = data;
}
async function loadLeaves(){
  const {data,error} = await sb.from('leaves').select('*').order('id');
  if(error){ toast('Could not load leaves'); console.error(error); return; }
  leaves = data.map(rowToLeave);
}
async function loadRequests(){
  const {data,error} = await sb.from('requests').select('*').order('id');
  if(error){ toast('Could not load requests'); console.error(error); return; }
  requests = data.map(rowToRequest);
}
async function loadAllData(){
  await Promise.all([loadEmployees(), loadLeaves(), loadRequests()]);
}

/* ------------ Helpers ------------ */
const fmt = d => d.toISOString().slice(0,10);
const empById = id => employees.find(e => e.id === Number(id));
function parseDate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function daysBetween(a,b){ return Math.round((parseDate(b)-parseDate(a))/86400000)+1; }
function prettyRange(s,e){
  const o={month:'short',day:'numeric'};
  const a=parseDate(s), b=parseDate(e);
  return s===e ? a.toLocaleDateString('en-US',o)
    : a.toLocaleDateString('en-US',o)+' – '+b.toLocaleDateString('en-US',o);
}
function firstName(n){ return n.split(' ')[0]; }

/* ------------ Views ------------ */
const titles={
  calendar:['Leave calendar','Plot and track team leaves and absences at a glance.'],
  requests:['Leave requests','Review, approve, or decline pending requests.'],
  employees:['Employees','Leave balances and current availability.'],
  reports:['Reports','How leave is being used across the team.'],
};
function switchView(v,btn){
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('viewTitle').textContent=titles[v][0];
  document.getElementById('viewSub').textContent=titles[v][1];
  if(v==='reports') renderReports();
}

/* ------------ Stats ------------ */
function renderStats(){
  const today=fmt(new Date());
  const onLeave=new Set(leaves.filter(l=>l.start<=today&&l.end>=today).map(l=>l.empId)).size;
  const pending=requests.filter(r=>r.status==='pending').length;
  const monthStr=fmt(current).slice(0,7);
  const daysThisMonth=leaves.reduce((sum,l)=>{
    let c=0; const d=parseDate(l.start), end=parseDate(l.end);
    for(let x=new Date(d);x<=end;x.setDate(x.getDate()+1))
      if(fmt(x).slice(0,7)===monthStr) c++;
    return sum+c;
  },0);
  const data=[
    [employees.length,'Employees','Active team'],
    [onLeave,'On leave today', onLeave? 'Away now':'Everyone in'],
    [pending,'Pending requests','Needs review'],
    [daysThisMonth,'Leave days this month', current.toLocaleDateString('en-US',{month:'long'})],
  ];
  document.getElementById('statsRow').innerHTML=data.map(([n,l,t])=>`
    <div class="stat"><div class="stat-num">${n}</div>
    <div class="stat-label">${l}</div><span class="stat-tag">${t}</span></div>`).join('');
  document.getElementById('reqBadge').textContent=pending;
  document.getElementById('reqBadge').style.display=pending?'':'none';
}

/* ------------ Calendar ------------ */
function renderCalendar(){
  const y=current.getFullYear(), m=current.getMonth();
  document.getElementById('calTitle').textContent=
    current.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const grid=document.getElementById('calGrid');
  const dows=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  const firstDow=new Date(y,m,1).getDay();
  const daysIn=new Date(y,m+1,0).getDate();
  const prevDays=new Date(y,m,0).getDate();
  const todayStr=fmt(new Date());
  const cells=Math.ceil((firstDow+daysIn)/7)*7;

  for(let i=0;i<cells;i++){
    const dayNum=i-firstDow+1;
    if(dayNum<1){
      html+=`<div class="cal-cell dim"><span class="cal-day-num">${prevDays+dayNum}</span></div>`;
    } else if(dayNum>daysIn){
      html+=`<div class="cal-cell dim"><span class="cal-day-num">${dayNum-daysIn}</span></div>`;
    } else {
      const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      const dow=i%7;
      const dayLeaves=leaves.filter(l=>l.start<=dateStr&&l.end>=dateStr);
      let chips='';
      dayLeaves.slice(0,3).forEach(l=>{
        const e=empById(l.empId);
        if(!e) return;
        chips+=`<span class="chip ${l.type}" title="${e.name} · ${TYPE_LABEL[l.type]}${l.note?' · '+l.note:''}">${firstName(e.name)} · ${TYPE_LABEL[l.type]}</span>`;
      });
      if(dayLeaves.length>3) chips+=`<span class="chip more">+${dayLeaves.length-3} more</span>`;
      html+=`<div class="cal-cell ${dow===0||dow===6?'weekend':''} ${dateStr===todayStr?'today':''}"
        onclick="openModal('${dateStr}')" title="Plot a leave on ${dateStr}">
        <span class="cal-day-num">${dayNum}</span>${chips}</div>`;
    }
  }
  grid.innerHTML=html;
}
function changeMonth(d){ current=new Date(current.getFullYear(),current.getMonth()+d,1); renderCalendar(); renderStats(); }
function goToday(){ const n=new Date(); current=new Date(n.getFullYear(),n.getMonth(),1); renderCalendar(); renderStats(); }

/* ------------ Requests ------------ */
function renderRequests(){
  const list=document.getElementById('reqList');
  if(!requests.length){
    list.innerHTML=`<div class="empty"><h3>No requests</h3>All caught up — new requests will appear here.</div>`;
    return;
  }
  list.innerHTML=requests.map(r=>{
    const e=empById(r.empId);
    if(!e) return '';
    const days=daysBetween(r.start,r.end);
    const pillStyle = r.type==='sick'
      ? 'background:#D8F0E3;color:#1B4D3E'
      : r.type==='personal' ? 'background:#226050;color:#CFE8DA'
      : r.type==='unpaid' ? 'background:#fff;border:1.5px dashed #74C69D;color:#2D6A4F'
      : r.type==='absent' ? 'background:#B0472F;color:#fff'
      : 'background:#2D6A4F;color:#fff';
    const actions = r.status==='pending'
      ? `<div class="req-actions">
           <button class="btn-approve" onclick="decide(${r.id},'approved')">Approve</button>
           <button class="btn-decline" onclick="decide(${r.id},'declined')">Decline</button>
         </div>`
      : `<span class="status-pill status-${r.status}">${r.status[0].toUpperCase()+r.status.slice(1)}</span>`;
    return `<div class="req">
      <div class="avatar">${e.initials}</div>
      <div class="req-info">
        <strong>${e.name}</strong>
        <span>${prettyRange(r.start,r.end)} · ${days} day${days>1?'s':''}${r.note?' · '+r.note:''}</span>
      </div>
      <span class="req-type" style="${pillStyle}">${TYPE_LABEL[r.type]}</span>
      ${actions}</div>`;
  }).join('');
}
async function decide(id,status){
  const r=requests.find(q=>q.id===id);
  if(!r) return;

  const {error:updErr} = await sb.from('requests').update({status}).eq('id',id);
  if(updErr){ toast('Could not update the request'); console.error(updErr); return; }
  r.status=status;

  if(status==='approved'){
    const {data,error} = await sb.from('leaves').insert({
      emp_id:r.empId, type:r.type, start_date:r.start, end_date:r.end, note:r.note
    }).select().single();
    if(error){ toast('Approved, but failed to plot the leave'); console.error(error); renderAll(); return; }
    leaves.push(rowToLeave(data));

    const e=empById(r.empId);
    if(e && r.type!=='unpaid' && r.type!=='absent'){
      e.used=Math.min(e.total,e.used+daysBetween(r.start,r.end));
      await sb.from('employees').update({used:e.used}).eq('id',e.id);
    }
    toast('Approved — plotted on the calendar');
  } else {
    toast('Request declined');
  }
  renderAll();
}

/* ------------ Employees ------------ */
function renderEmployees(){
  const today=fmt(new Date());
  document.getElementById('empCount').textContent=`· ${employees.length}`;
  const body=document.getElementById('empBody');
  if(!employees.length){
    body.innerHTML=`<tr><td colspan="6"><div class="empty"><h3>No employees yet</h3>Add your first team member to start plotting leaves.</div></td></tr>`;
    return;
  }
  body.innerHTML=employees.map(e=>{
    const used=e.used||0;
    const balance=Math.max(0,e.total-used);
    const away=leaves.some(l=>l.empId===e.id&&l.start<=today&&l.end>=today);
    return `<tr>
      <td><div class="emp-name"><div class="avatar">${e.initials}</div>
        <div>${e.name}<small>${e.name.split(' ')[0].toLowerCase()}@zem.app</small></div></div></td>
      <td>${e.role}</td>
      <td><div class="bal-wrap"><div class="bal-bar"><i style="width:${e.total?(balance/e.total)*100:0}%"></i></div>
        ${balance} / ${e.total} days</div></td>
      <td>${used} days</td>
      <td>${away?'<span class="on-leave-pill">On leave</span>':'<span class="available-pill">Available</span>'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="Edit ${e.name}" aria-label="Edit ${e.name}" onclick="openEmpModal(${e.id})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button class="icon-btn danger" title="Remove ${e.name}" aria-label="Remove ${e.name}" onclick="askDelete(${e.id})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ------------ Employee add / edit / delete ------------ */
let editingEmpId=null, deletingEmpId=null;

function makeInitials(name){
  const parts=name.trim().split(/\s+/);
  return (parts[0][0]+(parts[1]?parts[1][0]:parts[0][1]||'')).toUpperCase();
}
function openEmpModal(id){
  editingEmpId=id||null;
  const isEdit=!!id;
  document.getElementById('empModalTitle').textContent=isEdit?'Edit employee':'Add employee';
  document.getElementById('empSaveBtn').textContent=isEdit?'Save changes':'Add employee';
  if(isEdit){
    const e=empById(id);
    document.getElementById('eName').value=e.name;
    document.getElementById('eRole').value=e.role;
    document.getElementById('eUsed').value=e.used||0;
    document.getElementById('eTotal').value=e.total;
  } else {
    document.getElementById('eName').value='';
    document.getElementById('eRole').value='';
    document.getElementById('eUsed').value=0;
    document.getElementById('eTotal').value=5;
  }
  document.getElementById('empOverlay').classList.add('open');
  document.getElementById('eName').focus();
}
function closeEmpModal(){ document.getElementById('empOverlay').classList.remove('open'); editingEmpId=null; }
async function saveEmployee(){
  const name=document.getElementById('eName').value.trim();
  const role=document.getElementById('eRole').value.trim()||'Team member';
  let total=parseInt(document.getElementById('eTotal').value,10);
  let used=parseInt(document.getElementById('eUsed').value,10);
  if(!name){ toast('Enter the employee\u2019s name'); return; }
  if(isNaN(total)||total<0) total=5;
  if(isNaN(used)||used<0) used=0;
  if(used>total) used=total;
  const initials=makeInitials(name);

  if(editingEmpId){
    const {error} = await sb.from('employees')
      .update({name, role, total, used, initials}).eq('id',editingEmpId);
    if(error){ toast('Could not save changes'); console.error(error); return; }
    const e=empById(editingEmpId);
    e.name=name; e.role=role; e.total=total; e.used=used; e.initials=initials;
    toast(`${firstName(name)}\u2019s details updated`);
  } else {
    const {data,error} = await sb.from('employees')
      .insert({name, role, total, used, initials}).select().single();
    if(error){ toast('Could not add employee'); console.error(error); return; }
    employees.push(data);
    toast(`${firstName(name)} added to the team`);
  }
  closeEmpModal();
  renderAll();
}
function askDelete(id){
  deletingEmpId=id;
  const e=empById(id);
  const leaveCount=leaves.filter(l=>l.empId===id).length;
  document.getElementById('delText').textContent=
    `${e.name} will be removed along with ${leaveCount} plotted leave${leaveCount!==1?'s':''} and any pending requests. This can\u2019t be undone.`;
  document.getElementById('delOverlay').classList.add('open');
}
function closeDelModal(){ document.getElementById('delOverlay').classList.remove('open'); deletingEmpId=null; }
async function confirmDelete(){
  const e=empById(deletingEmpId);
  if(!e) return;
  const {error} = await sb.from('employees').delete().eq('id',deletingEmpId);
  if(error){ toast('Could not remove employee'); console.error(error); return; }
  employees=employees.filter(x=>x.id!==deletingEmpId);
  leaves=leaves.filter(l=>l.empId!==deletingEmpId);
  requests=requests.filter(r=>r.empId!==deletingEmpId);
  closeDelModal();
  toast(`${firstName(e.name)} removed`);
  renderAll();
}

/* ------------ Reset annual usage (year-end) ------------ */
function askResetUsage(){
  if(!employees.length){ toast('No employees to reset'); return; }
  document.getElementById('resetOverlay').classList.add('open');
}
function closeResetModal(){ document.getElementById('resetOverlay').classList.remove('open'); }
async function confirmResetUsage(){
  const {error} = await sb.from('employees').update({used:0}).gte('id',0);
  if(error){ toast('Could not reset usage'); console.error(error); return; }
  employees.forEach(e=>{ e.used=0; });
  closeResetModal();
  toast('Days used reset to 0 for all employees');
  renderAll();
}

/* ------------ Search absences ------------ */
function openSearchModal(){
  document.getElementById('searchDate').value=fmt(new Date());
  document.getElementById('searchOverlay').classList.add('open');
  runAbsenceSearch();
}
function closeSearchModal(){ document.getElementById('searchOverlay').classList.remove('open'); }
function runAbsenceSearch(){
  const dateStr=document.getElementById('searchDate').value;
  const results=document.getElementById('searchResults');
  if(!dateStr){
    results.innerHTML=`<div class="empty" style="padding:28px"><h3>Pick a date</h3>Choose a day, month, and year to see who's away.</div>`;
    return;
  }
  const matches=leaves.filter(l=>l.start<=dateStr && l.end>=dateStr);
  const pretty=parseDate(dateStr).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  if(!matches.length){
    results.innerHTML=`<div class="empty" style="padding:28px"><h3>Nobody's away</h3>No one is on leave or absent on ${pretty}.</div>`;
    return;
  }
  results.innerHTML=`<p style="color:#5E7A6E;font-size:.85rem;margin-bottom:10px">${matches.length} ${matches.length===1?'person':'people'} away on ${pretty}</p>` +
    matches.map(l=>{
      const e=empById(l.empId);
      if(!e) return '';
      const pillStyle = l.type==='sick'
        ? 'background:#D8F0E3;color:#1B4D3E'
        : l.type==='personal' ? 'background:#226050;color:#CFE8DA'
        : l.type==='unpaid' ? 'background:#fff;border:1.5px dashed #74C69D;color:#2D6A4F'
        : l.type==='absent' ? 'background:#B0472F;color:#fff'
        : 'background:#2D6A4F;color:#fff';
      return `<div class="req" style="padding:12px 0">
        <div class="avatar">${e.initials}</div>
        <div class="req-info">
          <strong>${e.name}</strong>
          <span>${e.role} · ${prettyRange(l.start,l.end)}${l.note?' · '+l.note:''}</span>
        </div>
        <span class="req-type" style="${pillStyle}">${TYPE_LABEL[l.type]}</span>
      </div>`;
    }).join('');
}

/* ------------ Reports ------------ */
function renderReports(){
  const year=current.getFullYear();
  const perMonth=Array(12).fill(0);
  const perType={vacation:0,sick:0,personal:0,unpaid:0,absent:0};
  leaves.forEach(l=>{
    const s=parseDate(l.start), e=parseDate(l.end);
    for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1)){
      if(d.getFullYear()===year) perMonth[d.getMonth()]++;
      perType[l.type]++;
    }
  });
  const max=Math.max(...perMonth,1);
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('monthBars').innerHTML=perMonth.map((v,i)=>`
    <div class="bar-col">
      <div class="bar" style="height:${Math.max((v/max)*100,3)}%">${v?`<span class="bar-val">${v}</span>`:''}</div>
      <span class="bar-label">${months[i]}</span>
    </div>`).join('');
  const totalDays=Object.values(perType).reduce((a,b)=>a+b,0)||1;
  document.getElementById('typeBreakdown').innerHTML=Object.entries(perType).map(([t,v])=>`
    <div class="type-row"><i class="dot" style="background:${TYPE_COLOR[t]};${t==='sick'?'border:1px solid #B9DECA':''}"></i>
      <span>${TYPE_LABEL[t]}</span><b>${v} day${v!==1?'s':''}</b></div>
    <div class="type-track"><i style="width:${(v/totalDays)*100}%;background:${TYPE_COLOR[t]}"></i></div>`).join('');
}

/* ------------ Modal (plot a leave) ------------ */
function openModal(dateStr){
  if(!employees.length){ toast('Add an employee first'); return; }
  document.getElementById('mEmp').innerHTML=employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  const d=dateStr||fmt(new Date());
  document.getElementById('mStart').value=d;
  document.getElementById('mEnd').value=d;
  document.getElementById('mNote').value='';
  document.getElementById('overlay').classList.add('open');
}
function closeModal(){ document.getElementById('overlay').classList.remove('open'); }
async function saveLeave(){
  const empId=Number(document.getElementById('mEmp').value);
  const type=document.getElementById('mType').value;
  let start=document.getElementById('mStart').value;
  let end=document.getElementById('mEnd').value;
  const note=document.getElementById('mNote').value.trim();
  if(!start||!end){ toast('Pick a start and end date'); return; }
  if(end<start) [start,end]=[end,start];

  const {data,error} = await sb.from('leaves').insert({
    emp_id:empId, type, start_date:start, end_date:end, note
  }).select().single();
  if(error){ toast('Could not plot the leave'); console.error(error); return; }
  leaves.push(rowToLeave(data));

  const e=empById(empId);
  if(e && type!=='unpaid' && type!=='absent'){
    e.used=Math.min(e.total,(e.used||0)+daysBetween(start,end));
    await sb.from('employees').update({used:e.used}).eq('id',e.id);
  }
  closeModal();
  toast(`${firstName(e.name)}'s ${TYPE_LABEL[type].toLowerCase()} leave plotted`);
  renderAll();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeModal(); closeEmpModal(); closeDelModal(); closeResetModal(); closeSearchModal(); }
});

/* ------------ Toast ------------ */
let toastTimer;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2600);
}

/* ------------ Auth (Supabase Auth — no passwords stored in this file) ------------ */
let currentAdmin=null; // {name, email}

function showApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='flex';
}
function showLogin(){
  document.getElementById('app').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginEmail').value='';
  document.getElementById('loginPassword').value='';
  document.getElementById('loginError').classList.remove('show');
}
function adminFromUser(user){
  return { name: (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0], email: user.email };
}

async function attemptLogin(){
  const email=document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass=document.getElementById('loginPassword').value;
  const errBox=document.getElementById('loginError');
  const {data,error} = await sb.auth.signInWithPassword({email, password:pass});
  if(error){
    errBox.textContent='Incorrect email or password. Try again.';
    errBox.classList.add('show');
    return;
  }
  errBox.classList.remove('show');
  currentAdmin=adminFromUser(data.user);
  document.getElementById('loginPassword').value='';
  showApp();
  updateAccountDisplay();
  await loadAllData();
  renderAll();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&document.getElementById('loginScreen').style.display!=='none'){
    if(document.activeElement&&(document.activeElement.id==='loginEmail'||document.activeElement.id==='loginPassword')) attemptLogin();
  }
});

function updateAccountDisplay(){
  if(!currentAdmin) return;
  document.getElementById('acctName').textContent=currentAdmin.name;
  document.getElementById('acctEmail').textContent=currentAdmin.email;
  document.getElementById('acctAvatar').textContent=makeInitials(currentAdmin.name);
}

function toggleAdminMenu(e){
  e.stopPropagation();
  const foot=document.getElementById('acctFoot');
  foot.classList.toggle('open');
  document.getElementById('accountMenu').classList.toggle('open');
}
document.addEventListener('click',()=>{
  document.getElementById('acctFoot').classList.remove('open');
  document.getElementById('accountMenu').classList.remove('open');
});

async function logout(e){
  e.stopPropagation();
  await sb.auth.signOut();
  currentAdmin=null;
  showLogin();
  document.getElementById('accountMenu').classList.remove('open');
  document.getElementById('acctFoot').classList.remove('open');
}

/* ------------ Settings ------------ */
function openSettingsModal(e){
  e.stopPropagation();
  document.getElementById('sName').value=currentAdmin.name;
  document.getElementById('sEmail').value=currentAdmin.email;
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettingsModal(){ document.getElementById('settingsOverlay').classList.remove('open'); }
async function saveSettings(){
  const name=document.getElementById('sName').value.trim();
  const email=document.getElementById('sEmail').value.trim();
  if(!name||!email){ toast('Name and email can\u2019t be empty'); return; }
  const {error} = await sb.auth.updateUser({ email, data:{ full_name:name } });
  if(error){ toast('Could not update account'); console.error(error); return; }
  currentAdmin.name=name; currentAdmin.email=email;
  updateAccountDisplay();
  closeSettingsModal();
  toast(email!==currentAdmin.email ? 'Check your inbox to confirm the new email' : 'Account settings updated');
}

/* ------------ Change password ------------ */
function openPasswordModal(e){
  e.stopPropagation();
  document.getElementById('pCurrent').value='';
  document.getElementById('pNew').value='';
  document.getElementById('pConfirm').value='';
  document.getElementById('passwordError').classList.remove('show');
  document.getElementById('passwordOverlay').classList.add('open');
}
function closePasswordModal(){ document.getElementById('passwordOverlay').classList.remove('open'); }
async function savePassword(){
  const cur=document.getElementById('pCurrent').value;
  const next=document.getElementById('pNew').value;
  const confirmPw=document.getElementById('pConfirm').value;
  const errBox=document.getElementById('passwordError');

  const {error:reauthErr} = await sb.auth.signInWithPassword({email:currentAdmin.email, password:cur});
  if(reauthErr){ errBox.textContent='Current password is incorrect.'; errBox.classList.add('show'); return; }
  if(next.length<6){ errBox.textContent='New password must be at least 6 characters.'; errBox.classList.add('show'); return; }
  if(next!==confirmPw){ errBox.textContent='New passwords don\u2019t match.'; errBox.classList.add('show'); return; }

  const {error} = await sb.auth.updateUser({ password:next });
  if(error){ errBox.textContent='Could not update password. Try again.'; errBox.classList.add('show'); return; }
  closePasswordModal();
  toast('Password updated');
}

/* ------------ Create new admin ------------
   Supabase Auth is designed so ordinary (non-service-role) sign-ups switch
   the browser's session to the new account. Since this app never exposes
   the service-role key (doing so in a public GitHub Pages repo would let
   anyone bypass the database's security rules), creating an admin here
   will sign you out afterwards — sign back in with your own account, or
   invite teammates directly from the Supabase Dashboard
   (Authentication → Users → Add user) to avoid that switch entirely. */
function openNewAdminModal(e){
  e.stopPropagation();
  document.getElementById('naName').value='';
  document.getElementById('naEmail').value='';
  document.getElementById('naPassword').value='';
  document.getElementById('newAdminError').classList.remove('show');
  document.getElementById('newAdminOverlay').classList.add('open');
}
function closeNewAdminModal(){ document.getElementById('newAdminOverlay').classList.remove('open'); }
async function saveNewAdmin(){
  const name=document.getElementById('naName').value.trim();
  const email=document.getElementById('naEmail').value.trim();
  const password=document.getElementById('naPassword').value;
  const errBox=document.getElementById('newAdminError');
  if(!name||!email||!password){ errBox.textContent='Fill in every field to continue.'; errBox.classList.add('show'); return; }
  if(password.length<6){ errBox.textContent='Password must be at least 6 characters.'; errBox.classList.add('show'); return; }

  const {error} = await sb.auth.signUp({ email, password, options:{ data:{ full_name:name } } });
  if(error){ errBox.textContent=error.message; errBox.classList.add('show'); return; }

  closeNewAdminModal();
  await sb.auth.signOut();
  currentAdmin=null;
  showLogin();
  toast(`${firstName(name)} can now sign in — please sign back in to continue`);
}

/* ------------ Init ------------ */
function renderAll(){ renderStats(); renderCalendar(); renderRequests(); renderEmployees(); renderReports(); }

(async function init(){
  const {data:{session}} = await sb.auth.getSession();
  if(session){
    currentAdmin=adminFromUser(session.user);
    showApp();
    updateAccountDisplay();
    await loadAllData();
    renderAll();
  }
})();