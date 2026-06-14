/* ============================================================
   DocTrack — Document Monitoring & SLA System (Static Demo)
   Pure HTML/CSS/JS. Data persists in localStorage.
   ============================================================ */

// ---------- Storage helpers ----------
const LS = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};

// ---------- Seed data ----------
function seed(){
  if(LS.get('dt_seeded')) return;
  const users = [
    { id:'u1', email:'dataWhs@gmail.com', password:'Mgxpass02', full_name:'Alice Admin', department:'Operations', role:'admin' },
    
  ];
  const today = new Date();
  const d = (offset)=>{ const x=new Date(today); x.setDate(x.getDate()+offset); return x.toISOString().slice(0,10); };
  const docs = [];
  const logs = [];
  const notifs = [];
  void d; // keep helper referenced
  LS.set('dt_users', users);
  LS.set('dt_docs', docs);
  LS.set('dt_logs', logs);
  LS.set('dt_notifs', notifs);
  LS.set('dt_seeded', true);
}
seed();

// ---------- State ----------
let currentUser = LS.get('dt_session', null);
let currentPage = 'dashboard';
let statusFilter = 'all';
let editingId = null;

// ---------- Utils ----------
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), 2500);
}

function computeStatus(doc){
  if(doc.status === 'completed') return 'completed';
  const due = new Date(doc.start); due.setDate(due.getDate()+doc.days);
  const today = new Date(); today.setHours(0,0,0,0); due.setHours(0,0,0,0);
  const diff = Math.round((due - today)/86400000);
  if(diff < 0) return 'overdue';
  if(diff === 0) return 'due_today';
  if(diff <= 1) return 'due_soon';
  return 'ongoing';
}

function dueDate(doc){
  const d = new Date(doc.start); d.setDate(d.getDate()+doc.days);
  return d.toISOString().slice(0,10);
}

function statusBadge(s){
  const map = {
    ongoing:['Ongoing','badge-info'], due_soon:['Due Soon','badge-warning'],
    due_today:['Due Today','badge-warning'], overdue:['Overdue','badge-danger'],
    completed:['Completed','badge-success']
  };
  const [t,cls] = map[s] || ['—','badge-muted'];
  return `<span class="badge ${cls}">${t}</span>`;
}

function log(docId, action, detail){
  const logs = LS.get('dt_logs', []);
  logs.unshift({ id:'l'+Date.now(), doc_id:docId, action, user:currentUser.full_name, at:new Date().toISOString(), detail });
  LS.set('dt_logs', logs);
}

function addNotif(title, message){
  const ns = LS.get('dt_notifs', []);
  ns.unshift({ id:'n'+Date.now(), user_id:currentUser.id, title, message, read:false, at:new Date().toISOString() });
  LS.set('dt_notifs', ns);
}

// ---------- Auth ----------
function showLogin(){ $('#loginPage').classList.remove('hidden'); $('#app').classList.add('hidden'); }
function showApp(){
  $('#loginPage').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#userName').textContent = currentUser.full_name;
  $('#userRole').textContent = currentUser.role;
  $('#userAvatar').textContent = currentUser.full_name.charAt(0).toUpperCase();
  renderPage();
  renderNotifBell();
}

$$('.tab').forEach(b=>b.onclick = ()=>{
  $$('.tab').forEach(x=>x.classList.remove('active'));
  $$('.auth-form').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $('#'+b.dataset.tab+'Form').classList.add('active');
});

$('#loginForm').onsubmit = e=>{
  e.preventDefault();
  const email = $('#loginEmail').value.trim().toLowerCase();
  const pw = $('#loginPassword').value;
  const u = LS.get('dt_users',[]).find(u=>u.email===email && u.password===pw);
  if(!u) return toast('Invalid credentials');
  currentUser = u; LS.set('dt_session', u);
  toast('Welcome, '+u.full_name); showApp();
};

$('#signupForm').onsubmit = e=>{
  e.preventDefault();
  const email = $('#signupEmail').value.trim().toLowerCase();
  const users = LS.get('dt_users',[]);
  if(users.some(u=>u.email===email)) return toast('Email already exists');
  const u = {
    id:'u'+Date.now(), email, password:$('#signupPassword').value,
    full_name:$('#signupName').value, department:$('#signupDept').value,
    role: users.length===0 ? 'admin' : 'user'
  };
  users.push(u); LS.set('dt_users', users);
  currentUser = u; LS.set('dt_session', u);
  toast('Account created'); showApp();
};

$('#logoutBtn').onclick = ()=>{
  currentUser = null; localStorage.removeItem('dt_session'); showLogin();
};

// ---------- Theme ----------
$('#themeToggle').onclick = ()=>{
  document.documentElement.classList.toggle('dark');
  const dark = document.documentElement.classList.contains('dark');
  $('#themeToggle').textContent = dark ? '☀️' : '🌙';
  LS.set('dt_theme', dark ? 'dark':'light');
};
if(LS.get('dt_theme')==='dark'){ document.documentElement.classList.add('dark'); }

// ---------- Notifications ----------
$('#notifBtn').onclick = ()=>{ $('#notifPanel').classList.toggle('hidden'); renderNotifPanel(); };

function renderNotifBell(){
  const ns = LS.get('dt_notifs',[]).filter(n=>n.user_id===currentUser.id && !n.read);
  $('#notifDot').classList.toggle('hidden', ns.length===0);
}
function renderNotifPanel(){
  const list = LS.get('dt_notifs',[]).filter(n=>n.user_id===currentUser.id);
  const el = $('#notifList');
  if(!list.length){ el.innerHTML = '<div class="empty">No notifications</div>'; return; }
  el.innerHTML = list.map(n=>`
    <div class="notif-item" data-id="${n.id}" style="${n.read?'opacity:.55':''}">
      <div class="t">${n.title}</div><div class="m">${n.message}</div>
    </div>`).join('');
  el.querySelectorAll('.notif-item').forEach(it=>it.onclick=()=>{
    const ns = LS.get('dt_notifs',[]);
    const f = ns.find(x=>x.id===it.dataset.id); if(f){ f.read=true; LS.set('dt_notifs',ns); }
    renderNotifBell(); renderNotifPanel();
  });
}

// ---------- Navigation ----------
$$('.nav-link').forEach(a=>a.onclick=()=>{
  $$('.nav-link').forEach(x=>x.classList.remove('active'));
  a.classList.add('active');
  currentPage = a.dataset.page;
  renderPage();
});

function renderPage(){
  const map = { dashboard:renderDashboard, documents:renderDocuments, reports:renderReports, activity:renderActivity };
  (map[currentPage] || renderDashboard)();
}

// ---------- Dashboard ----------
function renderDashboard(){
  const docs = LS.get('dt_docs',[]);
  const counts = { ongoing:0, due_today:0, overdue:0, completed:0 };
  docs.forEach(d=>{ const s=computeStatus(d); counts[s==='due_soon'?'due_today':s] = (counts[s==='due_soon'?'due_today':s]||0)+1; });

  const nearDue = docs.filter(d=>['due_today','due_soon'].includes(computeStatus(d))).slice(0,5);
  const topOverdue = docs.filter(d=>computeStatus(d)==='overdue')
    .sort((a,b)=> new Date(dueDate(a))-new Date(dueDate(b))).slice(0,5);
  const recent = LS.get('dt_logs',[]).slice(0,6);

  $('#pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>Dashboard</h2><p>Overview of document SLAs and recent activity</p></div>
    </div>
    <div class="stats">
      ${statCard('Total Documents', docs.length, '📁')}
      ${statCard('Ongoing', counts.ongoing, '🟢')}
      ${statCard('Due Today / Soon', counts.due_today, '⚠️')}
      ${statCard('Overdue', counts.overdue, '🔴')}
      ${statCard('Completed', counts.completed, '✅')}
    </div>
    <div class="grid-cols-2">
      <div class="card">
        <div class="card-header"><h3>Status Distribution</h3></div>
        <div class="card-body">${donutChart(counts, docs.length)}</div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Documents by Type</h3></div>
        <div class="card-body">${typeChart(docs)}</div>
      </div>
    </div>
    <div class="grid-cols-2">
      <div class="card">
        <div class="card-header"><h3>Nearing Due (24h)</h3></div>
        <div class="card-body">${listDocs(nearDue, 'No documents due soon')}</div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Top Overdue</h3></div>
        <div class="card-body">${listDocs(topOverdue, 'No overdue documents')}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Recent Activity</h3></div>
      <div class="card-body">
        ${recent.length ? recent.map(l=>`
          <div class="activity-item">
            <div class="activity-icon">🕒</div>
            <div class="activity-body">
              <div class="activity-title">${l.detail}</div>
              <div class="activity-meta">${l.user} · ${new Date(l.at).toLocaleString()}</div>
            </div>
          </div>`).join('') : '<div class="empty">No activity yet</div>'}
      </div>
    </div>
  `;
}

function statCard(label,value,icon){
  return `<div class="stat-card"><span class="stat-icon">${icon}</span>
    <div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

function listDocs(arr, emptyMsg){
  if(!arr.length) return `<div class="empty">${emptyMsg}</div>`;
  return arr.map(d=>`
    <div class="activity-item">
      <div class="activity-icon">📄</div>
      <div class="activity-body">
        <div class="activity-title">${d.title}</div>
        <div class="activity-meta">${d.ref||'—'} · Due ${dueDate(d)} · ${statusBadge(computeStatus(d))}</div>
      </div>
    </div>`).join('');
}

function donutChart(counts, total){
  const data = [
    {label:'Ongoing', value:counts.ongoing||0, color:'#3b82f6'},
    {label:'Due Soon/Today', value:counts.due_today||0, color:'#f59e0b'},
    {label:'Overdue', value:counts.overdue||0, color:'#ef4444'},
    {label:'Completed', value:counts.completed||0, color:'#10b981'}
  ];
  const r=60, c=2*Math.PI*r; let offset=0;
  const slices = data.map(d=>{
    const len = total ? (d.value/total)*c : 0;
    const s = `<circle r="${r}" cx="80" cy="80" fill="transparent" stroke="${d.color}" stroke-width="22"
      stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
    offset += len; return s;
  }).join('');
  return `<div class="donut">
    <svg viewBox="0 0 160 160"><circle r="60" cx="80" cy="80" fill="transparent" stroke="#e2e8f0" stroke-width="22"/>${slices}
      <text x="80" y="85" text-anchor="middle" font-size="22" font-weight="700" fill="currentColor">${total}</text></svg>
    <div class="legend">${data.map(d=>`<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>${d.label} <b>(${d.value})</b></div>`).join('')}</div>
  </div>`;
}

function typeChart(docs){
  const types = {};
  docs.forEach(d=>{ types[d.type]=(types[d.type]||0)+1; });
  const max = Math.max(...Object.values(types),1);
  return `<div class="chart">
    ${Object.entries(types).map(([k,v])=>`
      <div class="bar-group">
        <div class="bar-value">${v}</div>
        <div class="bar" style="height:${(v/max)*160}px"></div>
        <div class="bar-label">${k}</div>
      </div>`).join('')}
  </div>`;
}

// ---------- Documents ----------
function renderDocuments(){
  $('#pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>Documents</h2><p>Track and manage all documents</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn-outline" onclick="exportCSV()">⬇ Export CSV</button>
        <button class="btn-primary" onclick="openDocModal()">+ New Document</button>
      </div>
    </div>
    <div class="status-tabs" id="statusTabs">
      ${['all','ongoing','due_today','overdue','completed'].map(s=>`
        <button data-s="${s}" class="${statusFilter===s?'active':''}">${s.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</button>`).join('')}
    </div>
    <div class="filters">
      <input id="fSearch" placeholder="🔍 Search title, ref, assignee..." />
      <select id="fType"><option value="">All Types</option>
        ${['STB','STF','CATALOG REQUEST','IT','Report'].map(t=>`<option>${t}</option>`).join('')}</select>
      <input id="fAssignee" placeholder="Filter assignee" />
      <input id="fFrom" type="date" />
      <input id="fTo" type="date" />
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Title</th><th>Ref</th><th>Type</th><th>Assignee</th>
        <th>Start</th><th>Days</th><th>Due</th><th>Priority</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody id="docRows"></tbody>
    </table></div>
  `;
  ['fSearch','fType','fAssignee','fFrom','fTo'].forEach(id=>$('#'+id).oninput=refreshRows);
  $('#statusTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    statusFilter = b.dataset.s; renderDocuments();
  });
  refreshRows();
}

function refreshRows(){
  let docs = LS.get('dt_docs',[]);
  const q = $('#fSearch')?.value.toLowerCase()||'';
  const t = $('#fType')?.value||'';
  const a = $('#fAssignee')?.value.toLowerCase()||'';
  const from = $('#fFrom')?.value, to = $('#fTo')?.value;
  docs = docs.filter(d=>{
    const s = computeStatus(d);
    if(statusFilter!=='all'){
      if(statusFilter==='due_today' && !['due_today','due_soon'].includes(s)) return false;
      if(['ongoing','overdue','completed'].includes(statusFilter) && s!==statusFilter) return false;
    }
    if(q && !(`${d.title} ${d.ref} ${d.assignee}`.toLowerCase().includes(q))) return false;
    if(t && d.type!==t) return false;
    if(a && !d.assignee.toLowerCase().includes(a)) return false;
    if(from && d.start < from) return false;
    if(to && d.start > to) return false;
    return true;
  });
  const rows = docs.map(d=>`
    <tr>
      <td><b>${d.title}</b><div style="font-size:11px;color:var(--muted)">${d.desc||''}</div></td>
      <td>${d.ref||'—'}</td><td>${d.type}</td><td>${d.assignee}</td>
      <td>${d.start}</td><td>${d.days}d</td><td>${dueDate(d)}</td>
      <td><span class="badge badge-muted">${d.priority}</span></td>
      <td>${statusBadge(computeStatus(d))}</td>
      <td class="row-actions">
        <button class="btn-ghost" onclick="openDocModal('${d.id}')">✏️</button>
        ${d.status!=='completed'?`<button class="btn-ghost" onclick="completeDoc('${d.id}')">✅</button>`:''}
        <button class="btn-ghost" onclick="deleteDoc('${d.id}')">🗑️</button>
      </td>
    </tr>`).join('');
  $('#docRows').innerHTML = rows || `<tr><td colspan="10" class="empty">No documents found</td></tr>`;
}

window.openDocModal = (id)=>{
  editingId = id || null;
  $('#modalTitle').textContent = id ? 'Edit Document' : 'New Document';
  const d = id ? LS.get('dt_docs',[]).find(x=>x.id===id) : null;
  $('#dTitle').value = d?.title||''; $('#dRef').value = d?.ref||'';
  $('#dType').value = d?.type||'Memo'; $('#dAssignee').value = d?.assignee||'';
  $('#dStart').value = d?.start || new Date().toISOString().slice(0,10);
  $('#dDays').value = d?.days||2; $('#dStatus').value = d?.status||'active';
  $('#dPriority').value = d?.priority||'Medium'; $('#dDesc').value = d?.desc||'';
  $('#docModal').classList.remove('hidden');
};
$('#modalClose').onclick = $('#modalCancel').onclick = ()=>$('#docModal').classList.add('hidden');

$('#docForm').onsubmit = e=>{
  e.preventDefault();
  const docs = LS.get('dt_docs',[]);
  const payload = {
    title:$('#dTitle').value, ref:$('#dRef').value, type:$('#dType').value,
    assignee:$('#dAssignee').value, start:$('#dStart').value, days:parseInt($('#dDays').value),
    status:$('#dStatus').value, priority:$('#dPriority').value, desc:$('#dDesc').value
  };
  if(editingId){
    const i = docs.findIndex(x=>x.id===editingId);
    docs[i] = {...docs[i], ...payload};
    log(editingId,'updated',`Updated "${payload.title}"`);
    toast('Document updated');
  } else {
    const id = 'd'+Date.now();
    docs.unshift({ id, ...payload });
    log(id,'created',`Created "${payload.title}"`);
    addNotif('New document', `${payload.title} created`);
    toast('Document created');
  }
  LS.set('dt_docs', docs);
  $('#docModal').classList.add('hidden');
  refreshRows(); renderNotifBell();
};

window.completeDoc = (id)=>{
  const docs = LS.get('dt_docs',[]);
  const d = docs.find(x=>x.id===id); if(!d) return;
  d.status='completed'; LS.set('dt_docs',docs);
  log(id,'completed',`Completed "${d.title}"`);
  toast('Marked completed'); refreshRows();
};
window.deleteDoc = (id)=>{
  if(!confirm('Delete this document?')) return;
  const docs = LS.get('dt_docs',[]).filter(x=>x.id!==id);
  LS.set('dt_docs',docs); log(id,'deleted','Deleted document');
  toast('Deleted'); refreshRows();
};

window.exportCSV = ()=>{
  const docs = LS.get('dt_docs',[]);
  const headers = ['Title','Ref','Type','Assignee','Start','Days','Due','Priority','Status'];
  const rows = docs.map(d=>[d.title,d.ref,d.type,d.assignee,d.start,d.days,dueDate(d),d.priority,computeStatus(d)]);
  const csv = [headers, ...rows].map(r=>r.map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'documents.csv'; a.click();
  toast('Exported CSV');
};

// ---------- Reports ----------
function renderReports(){
  const docs = LS.get('dt_docs',[]);
  const byType = {}, byAssignee = {}, byStatus = {ongoing:0,due_today:0,overdue:0,completed:0};
  docs.forEach(d=>{
    byType[d.type]=(byType[d.type]||0)+1;
    byAssignee[d.assignee]=(byAssignee[d.assignee]||0)+1;
    const s=computeStatus(d); byStatus[s==='due_soon'?'due_today':s]++;
  });
  const total = docs.length, completed = byStatus.completed;
  const onTime = docs.filter(d=>d.status==='completed').length;
  const slaRate = total? Math.round((onTime/total)*100):0;

  $('#pageContent').innerHTML = `
    <div class="page-header"><div><h2>Reports</h2><p>Performance analytics</p></div>
      <button class="btn-outline" onclick="exportCSV()">⬇ Export CSV</button></div>
    <div class="stats">
      ${statCard('SLA Compliance', slaRate+'%', '📊')}
      ${statCard('Total Docs', total, '📁')}
      ${statCard('Completed', completed, '✅')}
      ${statCard('Overdue', byStatus.overdue, '🔴')}
    </div>
    <div class="grid-cols-2">
      <div class="card"><div class="card-header"><h3>By Type</h3></div><div class="card-body">${typeChart(docs)}</div></div>
      <div class="card"><div class="card-header"><h3>By Assignee</h3></div>
        <div class="card-body">${Object.entries(byAssignee).map(([k,v])=>`
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <span>${k}</span><b>${v}</b></div>`).join('')}</div></div>
    </div>
  `;
}

// ---------- Activity ----------
function renderActivity(){
  const logs = LS.get('dt_logs',[]);
  $('#pageContent').innerHTML = `
    <div class="page-header"><div><h2>Activity Log</h2><p>All system actions</p></div></div>
    <div class="card"><div class="card-body">
      ${logs.length ? logs.map(l=>`
        <div class="activity-item">
          <div class="activity-icon">🕒</div>
          <div class="activity-body">
            <div class="activity-title">${l.detail}</div>
            <div class="activity-meta">${l.user} · ${l.action} · ${new Date(l.at).toLocaleString()}</div>
          </div>
        </div>`).join('') : '<div class="empty">No activity yet</div>'}
    </div></div>
  `;
}

// ---------- Boot ----------
if(currentUser) showApp(); else showLogin();

/* ============================================================
   UPLOADS — Supabase real-time DB + Storage (added feature)
   Original code above is unchanged.
   ============================================================ */
(function(){
  const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg";
  const ALLOWED_EXT = ["pdf","doc","docx","xls","xlsx","png","jpg","jpeg","gif","webp","bmp","svg"];

  let sb = null;
  let realtimeBound = false;

  function getClient(){
    if(sb) return sb;
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY
       || window.SUPABASE_URL.includes("YOUR-PROJECT-REF")){
      return null;
    }
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return sb;
  }

  function fmtSize(b){
    if(b == null) return "—";
    if(b < 1024) return b + " B";
    if(b < 1048576) return (b/1024).toFixed(1) + " KB";
    if(b < 1073741824) return (b/1048576).toFixed(1) + " MB";
    return (b/1073741824).toFixed(2) + " GB";
  }
  function extOf(name){ return (name.split(".").pop()||"").toLowerCase(); }

  // Inject the Uploads page renderer into the existing renderPage() map
  // by monkey-patching window.renderPage without removing original behavior.
  const _origRenderPage = window.renderPage || renderPage;
  window.renderPage = function(){
    if(currentPage === "uploads"){ return renderUploads(); }
    return _origRenderPage();
  };

  function renderUploads(){
    const client = getClient();
    $('#pageContent').innerHTML = `
      <div class="page-header">
        <div><h2>Uploads</h2><p>Upload documents to the cloud. Records sync in real time.</p></div>
      </div>
      ${!client ? `<div class="card"><div class="card-body">
        <b>Supabase not configured.</b> Open <code>supabase-config.js</code> and set
        <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>, then refresh.
        See <code>README.md</code> for setup steps.
      </div></div>` : ``}
      <div class="card">
        <div class="card-header"><h3>Upload a file</h3></div>
        <div class="card-body">
          <input type="file" id="upFile" accept="${ACCEPT}" />
          <p class="hint" style="text-align:left;margin-top:8px">
            Allowed: PDF, DOCX, XLSX, images (PNG/JPG/GIF/WEBP/BMP/SVG).
          </p>
          <div class="modal-actions" style="margin-top:10px">
            <button class="btn-primary" id="upBtn" ${!client?'disabled':''}>⬆ Upload</button>
          </div>
          <div id="upStatus" class="hint" style="text-align:left"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Uploaded documents</h3></div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>File Name</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th>
          </tr></thead>
          <tbody id="upRows"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
        </table></div>
      </div>
    `;

    if(!client) return;

    $('#upBtn').onclick = handleUpload;
    loadUploads();
    bindRealtime();
  }

  async function handleUpload(){
    const client = getClient(); if(!client) return;
    const input = $('#upFile');
    const file = input.files && input.files[0];
    const status = $('#upStatus');
    if(!file){ status.textContent = "Please choose a file first."; return; }
    if(!ALLOWED_EXT.includes(extOf(file.name))){
      status.textContent = "Unsupported file type."; return;
    }
    status.textContent = "Uploading…";

    const path = Date.now() + "_" + file.name.replace(/[^\w.\-]+/g,"_");
    const { error: upErr } = await client.storage
      .from(window.SUPABASE_BUCKET).upload(path, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || undefined
      });
    if(upErr){ status.textContent = "Upload failed: " + upErr.message; return; }

    const { data: pub } = client.storage.from(window.SUPABASE_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;

    const { error: dbErr } = await client.from("uploads").insert({
      file_name: file.name,
      file_type: file.type || extOf(file.name),
      file_size: file.size,
      storage_path: path,
      storage_url: url
    });
    if(dbErr){ status.textContent = "Saved file, but DB record failed: " + dbErr.message; return; }

    status.textContent = "";
    input.value = "";
    toast("File uploaded");
    loadUploads();
  }

  async function loadUploads(){
    const client = getClient(); if(!client) return;
    const { data, error } = await client.from("uploads")
      .select("*").order("uploaded_at", { ascending: false });
    const tbody = $('#upRows'); if(!tbody) return;
    if(error){
      tbody.innerHTML = `<tr><td colspan="5" class="empty">Error: ${error.message}</td></tr>`;
      return;
    }
    if(!data || !data.length){
      tbody.innerHTML = `<tr><td colspan="5" class="empty">No uploads yet</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(r => `
      <tr>
        <td><b>${escapeHtml(r.file_name)}</b></td>
        <td>${escapeHtml(r.file_type||extOf(r.file_name))}</td>
        <td>${fmtSize(r.file_size)}</td>
        <td>${new Date(r.uploaded_at).toLocaleString()}</td>
        <td class="row-actions">
          <button class="btn-outline" onclick="downloadUpload('${r.id}')">⬇ Download</button>
          <button class="btn-ghost" onclick="deleteUpload('${r.id}','${encodeURIComponent(r.storage_path)}')">🗑️</button>
        </td>
      </tr>
    `).join("");
  }

  function escapeHtml(s){
    return String(s||"").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }

  window.downloadUpload = async function(id){
    const client = getClient(); if(!client) return;
    const { data, error } = await client.from("uploads").select("*").eq("id", id).single();
    if(error || !data){ toast("Download failed"); return; }
    try{
      const { data: blob, error: dlErr } = await client.storage
        .from(window.SUPABASE_BUCKET).download(data.storage_path);
      if(dlErr) throw dlErr;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = data.file_name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    } catch(e){
      // Fallback to public URL
      const a = document.createElement("a");
      a.href = data.storage_url; a.download = data.file_name;
      a.target = "_blank"; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    }
  };

  window.deleteUpload = async function(id, encodedPath){
    if(!confirm("Delete this file?")) return;
    const client = getClient(); if(!client) return;
    const path = decodeURIComponent(encodedPath);
    await client.storage.from(window.SUPABASE_BUCKET).remove([path]);
    await client.from("uploads").delete().eq("id", id);
    toast("Deleted");
    loadUploads();
  };

  function bindRealtime(){
    if(realtimeBound) return;
    const client = getClient(); if(!client) return;
    client.channel("uploads-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "uploads" },
          () => { if(currentPage === "uploads") loadUploads(); })
      .subscribe();
    realtimeBound = true;
  }
})();
