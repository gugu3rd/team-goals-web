import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://rerhcinproqbmlhoqvoe.supabase.co'
const SUPABASE_KEY = 'sb_publishable_AvA4Ig1E8P9de1Lw3oGqtg_PsZX4zj7'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const RANGE_START = new Date('2026-09-01T00:00:00+09:00')
const RANGE_END = new Date('2027-03-31T23:59:59+09:00')
const DAY_MS = 86400000
const TOTAL_DAYS = Math.round((RANGE_END - RANGE_START) / DAY_MS) + 1
const MONTHS = ['9월','10월','11월','12월','1월','2월','3월']

const state = {
  session: null, me: null, profiles: [], projects: [], members: [], workItems: [],
  page: 'all', view: 'timeline', query: '', assignee: '', status: '', project: '',
  expanded: new Set(), selectedWorkId: null, editing: false, profileOpen: false,
  modal: null,
}

const app = document.getElementById('app')
const esc = (s='') => String(s ?? '').replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
const byId = (id)=>document.getElementById(id)
const profileMap = ()=>Object.fromEntries(state.profiles.map(p=>[p.id,p]))
const projectMap = ()=>Object.fromEntries(state.projects.map(p=>[p.id,p]))
const memberRole = (projectId, profileId)=>state.members.find(m=>m.project_id===projectId && m.profile_id===profileId)?.role
const isOwner = (projectId)=>memberRole(projectId,state.me?.id)==='owner'
const canEditWork = (w)=>!!state.me && (state.me.is_admin || w.assignee_id===state.me.id || isOwner(w.project_id))
const canDeleteWork = (w)=>!!state.me && (state.me.is_admin || isOwner(w.project_id) || (w.assignee_id===state.me.id && w.created_by===state.me.id))
const canEditProject = (p)=>!!state.me && (state.me.is_admin || isOwner(p.id))
const isNew = (w)=>Date.now()-new Date(w.created_at).getTime() <= 7*DAY_MS

function dateToPct(dateStr){
  if(!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00+09:00`)
  const idx=(d-RANGE_START)/DAY_MS
  return Math.max(0,Math.min(100,(idx/TOTAL_DAYS)*100))
}
function rangeStyle(start,end){
  if(!start || !end) return ''
  const l=dateToPct(start), r=dateToPct(end)
  const width=Math.max(.6,r-l + 100/TOTAL_DAYS)
  return `left:${l}%;width:${width}%;`
}
function fmtDate(s){ if(!s) return '일정 미정'; const [y,m,d]=s.split('-'); return `${Number(m)}/${Number(d)}` }
function projectDates(id){
  const items=state.workItems.filter(w=>w.project_id===id && w.start_date && w.end_date)
  if(!items.length) return {start:null,end:null}
  return {start:items.map(x=>x.start_date).sort()[0], end:items.map(x=>x.end_date).sort().at(-1)}
}
function projectMembers(id){
  const pm=profileMap(); return state.members.filter(m=>m.project_id===id).map(m=>({...m,profile:pm[m.profile_id]}))
}
function filteredItems(){
  const pm=profileMap(), prj=projectMap();
  const q=state.query.trim().toLowerCase()
  return state.workItems.filter(w=>{
    const p=pm[w.assignee_id], pj=prj[w.project_id]
    if(state.page==='mine' && w.assignee_id!==state.me.id) return false
    if(state.assignee && w.assignee_id!==state.assignee) return false
    if(state.status && w.status!==state.status) return false
    if(state.project && w.project_id!==state.project) return false
    if(q){
      const hay=[w.title,pj?.name,p?.full_name,p?.nickname].filter(Boolean).join(' ').toLowerCase()
      if(!hay.includes(q)) return false
    }
    return true
  })
}

async function loadData(){
  const [{data:profiles,error:e1},{data:projects,error:e2},{data:members,error:e3},{data:work,error:e4}] = await Promise.all([
    supabase.from('profiles').select('*').order('nickname'),
    supabase.from('projects').select('*').order('name'),
    supabase.from('project_members').select('*'),
    supabase.from('work_items').select('*').order('start_date',{ascending:true,nullsFirst:false}),
  ])
  if(e1||e2||e3||e4) throw e1||e2||e3||e4
  state.profiles=profiles||[]; state.projects=projects||[]; state.members=members||[]; state.workItems=work||[]
  state.me=state.profiles.find(p=>p.id===state.session.user.id)
}

function renderLogin(msg=''){
  app.innerHTML=`<div class="login-shell"><div class="login-card">
    <div class="login-brand">TWOSUN · WORKSHOP</div><h1>팀 업무 계획</h1><p>회사 이메일로 로그인하세요.</p>
    <form id="loginForm">
      <div class="field"><label>이메일</label><input id="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>비밀번호</label><input id="password" type="password" autocomplete="current-password" required /></div>
      <button class="btn btn-primary btn-block" type="submit">로그인</button>
      ${msg?`<div class="error">${esc(msg)}</div>`:''}
    </form>
  </div></div>`
  byId('loginForm').onsubmit=async e=>{e.preventDefault(); const email=byId('email').value.trim(),password=byId('password').value; const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) renderLogin(error.message)}
}

function render(){
  if(!state.session || !state.me){renderLogin();return}
  const name=state.me.nickname||state.me.full_name||state.me.email
  app.innerHTML=`<div class="app-shell">
    <header class="topbar"><div class="top-left"><div class="brand">팀 업무 계획</div><nav class="topnav">
      <button class="nav-btn ${state.page==='all'?'active':''}" data-page="all">전체 업무</button>
      <button class="nav-btn ${state.page==='mine'?'active':''}" data-page="mine">내 업무</button>
    </nav></div>
    <div class="profile-menu"><button id="profileTrigger" class="profile-trigger"><span class="avatar">${esc(name.slice(0,1))}</span>${esc(name)} ▾</button>${state.profileOpen?profilePopup():''}</div></header>
    <main class="page">${mainContent()}</main>
    ${state.selectedWorkId?detailPanel():''}
    ${state.modal?modalMarkup():''}
  </div>`
  bindEvents()
}
function profilePopup(){return `<div class="profile-pop"><strong>${esc(state.me.full_name||'')}</strong><div>${esc(state.me.nickname||'')}</div><div class="muted">${esc(state.me.email||'')}</div><div class="muted">${state.me.is_admin?'관리자':'일반 사용자'}</div><hr style="border:0;border-top:1px solid var(--line);margin:12px 0"><button id="logoutBtn" class="btn btn-ghost btn-block">로그아웃</button></div>`}

function mainContent(){
 const mine=state.page==='mine';
 return `<div class="page-head"><div class="page-title"><h1>${mine?'내 업무':'전체 업무'}</h1><p>${mine?'내가 담당하는 업무만 타임라인으로 확인합니다.':'워크샵에서 정한 팀 목표와 개인 업무를 함께 봅니다.'}</p></div>
 ${!mine?'<button id="newProjectBtn" class="btn btn-primary">+ 프로젝트</button>':''}</div>
 <div class="toolbar">
   <input id="searchInput" class="control search" placeholder="업무명, 프로젝트명, 담당자 이름/닉네임 검색" value="${esc(state.query)}" />
   ${!mine?`<select id="assigneeFilter" class="control"><option value="">전체 담당자</option>${state.profiles.map(p=>`<option value="${p.id}" ${state.assignee===p.id?'selected':''}>${esc(p.nickname||p.full_name)}</option>`).join('')}</select>`:''}
   <select id="statusFilter" class="control"><option value="">전체 상태</option>${['예정','진행중','완료','보류'].map(s=>`<option ${state.status===s?'selected':''}>${s}</option>`).join('')}</select>
   <select id="projectFilter" class="control"><option value="">전체 프로젝트</option>${state.projects.map(p=>`<option value="${p.id}" ${state.project===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
   ${!mine?`<div class="view-switch"><button data-view="timeline" class="${state.view==='timeline'?'active':''}">타임라인</button><button data-view="people" class="${state.view==='people'?'active':''}">개인별</button></div>`:''}
 </div>
 ${(!mine && state.view==='people')?peopleBoard():timelineView()}`
}

function todayLine(){
  const now=new Date(); if(now<RANGE_START||now>RANGE_END) return ''
  const pct=Math.max(0,Math.min(100,((now-RANGE_START)/DAY_MS/TOTAL_DAYS)*100))
  return `<span class="today-line" style="left:${pct}%"></span><span class="today-label" style="left:${pct}%">오늘</span>`
}
function timelineView(){
  const items=filteredItems(), pm=profileMap();
  const projects=state.projects.filter(p=>items.some(w=>w.project_id===p.id))
  return `<div class="timeline-card"><div class="timeline">
    <div class="timeline-head"><div class="label-head">팀 일정 / 개인 업무</div><div class="month-head">${MONTHS.map(m=>`<div>${m}</div>`).join('')}</div></div>
    ${projects.map(p=>{
      const pItems=items.filter(w=>w.project_id===p.id), members=projectMembers(p.id), owners=members.filter(m=>m.role==='owner').map(m=>m.profile?.nickname||m.profile?.full_name).filter(Boolean), dates=projectDates(p.id), expanded=state.expanded.has(p.id)
      return `<div class="project-row"><div class="project-label"><span>${expanded?'▾':'▸'}</span><button data-project-toggle="${p.id}">${esc(p.name)}</button><div class="project-meta">${pItems.length}개 업무 · ${new Set(pItems.map(x=>x.assignee_id)).size}명${owners.length?` · ${esc(owners.join(', '))} 오너`:''}</div></div><div class="timeline-cell project-cell">${todayLine()}${dates.start?`<span class="bar project" style="${rangeStyle(dates.start,dates.end)}"></span>`:`<span class="no-date">일정 미정</span>`}</div></div>
      ${expanded?projectOverview(p,members,dates):''}
      ${pItems.map(w=>{const person=pm[w.assignee_id],role=memberRole(p.id,w.assignee_id)||'participant';return `<div class="work-row ${state.selectedWorkId===w.id?'selected':''}"><div class="work-label" data-work="${w.id}"><div class="work-icon">${esc((person?.nickname||'?').slice(0,1))}</div><div><div class="work-title">${esc(w.title)} ${isNew(w)?'<span class="badge new">NEW</span>':''}</div><div class="work-sub">${esc(person?.nickname||person?.full_name||'')} · ${role==='owner'?'오너':'참여자'} · ${fmtDate(w.start_date)}${w.end_date?`–${fmtDate(w.end_date)}`:''} · <span class="badge status-${w.status}">${w.status}</span></div></div></div><div class="timeline-cell" data-work="${w.id}">${todayLine()}${w.start_date&&w.end_date?`<span class="bar ${role==='owner'?'owner':'participant'} ${w.status==='완료'?'completed':''}" style="${rangeStyle(w.start_date,w.end_date)}">${esc(person?.nickname||'')}</span>`:`<span class="no-date">일정 미정</span>`}</div></div>`}).join('')}`
    }).join('')}
  </div></div>`
}
function projectOverview(p,members,dates){
  const owners=members.filter(x=>x.role==='owner').map(x=>x.profile?.nickname||x.profile?.full_name).filter(Boolean).join(' · ')
  const participants=members.filter(x=>x.role==='participant').map(x=>x.profile?.nickname||x.profile?.full_name).filter(Boolean).join(' · ')
  return `<div class="project-overview"><div class="project-overview-label"><div class="meta-line"><span class="meta-key">오너</span>${esc(owners||'-')} &nbsp;&nbsp; <span class="meta-key">참여자</span>${esc(participants||'-')} &nbsp;&nbsp; <span class="meta-key">전체일정</span>${dates.start?`${fmtDate(dates.start)} ~ ${fmtDate(dates.end)}`:'일정 미정'}</div><div class="meta-line"><span class="meta-key">설명</span>${esc(p.description||'')}</div></div><div class="project-overview-body">${isOwner(p.id)||state.me.is_admin?'<button class="btn btn-sm" data-add-work="'+p.id+'">+ 업무 추가</button><button class="btn btn-sm" data-edit-project="'+p.id+'">수정</button>':memberRole(p.id,state.me.id)?'<button class="btn btn-sm" data-add-self="'+p.id+'">+ 내 업무 추가</button>':''}</div></div>`
}
function peopleBoard(){
  const items=filteredItems(), pm=profileMap(), prj=projectMap();
  const groups=state.profiles.map(p=>({p,items:items.filter(w=>w.assignee_id===p.id)})).filter(g=>g.items.length)
  return `<div class="people-board">${groups.map(g=>`<section class="person-col"><div class="person-head"><span>${esc(g.p.nickname||g.p.full_name)}</span><span class="person-count">${g.items.length}</span></div>${g.items.map(w=>`<div class="task-card" data-work="${w.id}">${esc(w.title)} ${isNew(w)?'<span class="badge new">NEW</span>':''}<div class="task-meta">${esc(prj[w.project_id]?.name||'')} · ${w.status} · ${fmtDate(w.start_date)}${w.end_date?`–${fmtDate(w.end_date)}`:''}</div></div>`).join('')}</section>`).join('')}</div>`
}

function detailPanel(){
 const w=state.workItems.find(x=>x.id===state.selectedWorkId); if(!w) return ''
 const p=projectMap()[w.project_id], person=profileMap()[w.assignee_id], role=memberRole(w.project_id,w.assignee_id)
 return `<aside class="side-panel"><div class="side-panel-inner"><div class="panel-head"><div><div class="panel-kicker">${esc(p?.name||'')}</div><h2>${esc(w.title)}</h2></div><div class="panel-actions">${canEditWork(w)&&!state.editing?'<button id="editWorkBtn" class="btn btn-sm">수정</button>':''}${state.editing?'<button id="cancelEditBtn" class="btn btn-sm">취소</button><button id="saveWorkBtn" class="btn btn-primary btn-sm">저장</button>':''}<button id="closePanelBtn" class="icon-btn">×</button></div></div>
 ${state.editing?editForm(w):readDetail(w,person,role)}
 </div></aside>`
}
function readDetail(w,person,role){
 return `<div class="info-grid"><div class="info-cell"><div class="info-label">담당자</div><div class="info-value">${esc(person?.nickname||person?.full_name||'')}</div></div><div class="info-cell"><div class="info-label">역할</div><div class="info-value">${role==='owner'?'오너':'참여자'}</div></div><div class="info-cell"><div class="info-label">일정</div><div class="info-value">${w.start_date?`${fmtDate(w.start_date)} – ${fmtDate(w.end_date)}`:'일정 미정'}</div></div><div class="info-cell"><div class="info-label">상태</div><div class="info-value"><span class="badge status-${w.status}">${w.status}</span></div></div></div>${detailSection('고객 대상',w.customer_target)}${detailSection('고객 니즈',w.customer_need)}${detailSection('기대효과',w.expected_effect)}${detailSection('내용 및 기능',w.details)}${canDeleteWork(w)?'<div style="margin-top:30px"><button id="deleteWorkBtn" class="btn btn-sm btn-danger">업무 삭제</button></div>':''}`
}
function detailSection(title,value){return value?.trim()?`<section class="detail-section"><h3>${title}</h3><div class="detail-content">${esc(value)}</div></section>`:''}
function editForm(w){return `<div class="edit-form"><div class="field"><label>업무명</label><input id="editTitle" value="${esc(w.title)}"></div><div class="form-grid"><div class="field"><label>시작일</label><input id="editStart" type="date" value="${w.start_date||''}"></div><div class="field"><label>종료일</label><input id="editEnd" type="date" value="${w.end_date||''}"></div></div><div class="field"><label>상태</label><select id="editStatus">${['예정','진행중','완료','보류'].map(s=>`<option ${w.status===s?'selected':''}>${s}</option>`).join('')}</select></div>${['customer_target|고객 대상','customer_need|고객 니즈','expected_effect|기대효과','details|내용 및 기능'].map(x=>{const [k,l]=x.split('|');return `<div class="field"><label>${l}</label><textarea id="edit_${k}">${esc(w[k]||'')}</textarea></div>`}).join('')}</div>`}

function modalMarkup(){
 if(state.modal?.type==='project') return projectModal(state.modal.projectId)
 if(state.modal?.type==='work') return workModal(state.modal.projectId,state.modal.selfOnly)
 return ''
}
function projectModal(projectId){
 const editing=!!projectId, p=state.projects.find(x=>x.id===projectId), mem=projectId?projectMembers(projectId):[]
 const ownerIds=new Set(mem.filter(x=>x.role==='owner').map(x=>x.profile_id)), partIds=new Set(mem.filter(x=>x.role==='participant').map(x=>x.profile_id))
 return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${editing?'프로젝트 수정':'새 프로젝트'}</h2><button id="modalClose" class="icon-btn">×</button></div><form id="projectForm"><div class="field"><label>프로젝트명</label><input id="projectName" required value="${esc(p?.name||'')}"></div><div class="field"><label>간단 설명</label><textarea id="projectDesc">${esc(p?.description||'')}</textarea></div>${editing?`<div class="field"><label>오너</label><div class="checklist">${state.profiles.map(x=>`<label class="check-item"><input type="checkbox" name="owners" value="${x.id}" ${ownerIds.has(x.id)?'checked':''}>${esc(x.nickname||x.full_name)}</label>`).join('')}</div></div><div class="field"><label>참여자</label><div class="checklist">${state.profiles.map(x=>`<label class="check-item"><input type="checkbox" name="participants" value="${x.id}" ${partIds.has(x.id)?'checked':''}>${esc(x.nickname||x.full_name)}</label>`).join('')}</div></div>`:''}<div class="form-actions">${editing?'<button type="button" id="deleteProjectBtn" class="btn btn-danger" style="margin-right:auto">프로젝트 삭제</button>':''}<button type="button" id="modalCancel" class="btn">취소</button><button class="btn btn-primary" type="submit">저장</button></div></form></div></div>`
}
function workModal(projectId,selfOnly=false){
 const members=projectMembers(projectId), choices=selfOnly?members.filter(m=>m.profile_id===state.me.id):members
 return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${selfOnly?'내 업무 추가':'업무 추가'}</h2><button id="modalClose" class="icon-btn">×</button></div><form id="workForm"><div class="field"><label>업무명</label><input id="workTitle" required></div><div class="field"><label>담당자</label><select id="workAssignee">${choices.map(m=>`<option value="${m.profile_id}">${esc(m.profile?.nickname||m.profile?.full_name)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>시작일</label><input id="workStart" type="date"></div><div class="field"><label>종료일</label><input id="workEnd" type="date"></div></div><div class="field"><label>상태</label><select id="workStatus">${['예정','진행중','완료','보류'].map(s=>`<option>${s}</option>`).join('')}</select></div>${['customer_target|고객 대상','customer_need|고객 니즈','expected_effect|기대효과','details|내용 및 기능'].map(x=>{const [k,l]=x.split('|');return `<div class="field"><label>${l}</label><textarea id="work_${k}"></textarea></div>`}).join('')}<div class="form-actions"><button type="button" id="modalCancel" class="btn">취소</button><button type="submit" class="btn btn-primary">추가</button></div></form></div></div>`
}

function bindEvents(){
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;state.selectedWorkId=null;state.editing=false;if(state.page==='mine')state.view='timeline';render()})
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.selectedWorkId=null;render()})
 byId('profileTrigger')?.addEventListener('click',()=>{state.profileOpen=!state.profileOpen;render()}); byId('logoutBtn')?.addEventListener('click',()=>supabase.auth.signOut())
 byId('searchInput')?.addEventListener('input',e=>{state.query=e.target.value;render();requestAnimationFrame(()=>{const i=byId('searchInput');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}})}); byId('assigneeFilter')?.addEventListener('change',e=>{state.assignee=e.target.value;render()}); byId('statusFilter')?.addEventListener('change',e=>{state.status=e.target.value;render()}); byId('projectFilter')?.addEventListener('change',e=>{state.project=e.target.value;render()})
 document.querySelectorAll('[data-project-toggle]').forEach(b=>b.onclick=()=>{const id=b.dataset.projectToggle;state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);render()})
 document.querySelectorAll('[data-work]').forEach(el=>el.onclick=()=>{state.selectedWorkId=el.dataset.work;state.editing=false;render()})
 byId('closePanelBtn')?.addEventListener('click',()=>{state.selectedWorkId=null;state.editing=false;render()}); byId('editWorkBtn')?.addEventListener('click',()=>{state.editing=true;render()}); byId('cancelEditBtn')?.addEventListener('click',()=>{state.editing=false;render()}); byId('saveWorkBtn')?.addEventListener('click',saveWork); byId('deleteWorkBtn')?.addEventListener('click',deleteWork)
 byId('newProjectBtn')?.addEventListener('click',()=>{state.modal={type:'project',projectId:null};render()})
 document.querySelectorAll('[data-edit-project]').forEach(b=>b.onclick=()=>{state.modal={type:'project',projectId:b.dataset.editProject};render()})
 document.querySelectorAll('[data-add-work]').forEach(b=>b.onclick=()=>{state.modal={type:'work',projectId:b.dataset.addWork,selfOnly:false};render()})
 document.querySelectorAll('[data-add-self]').forEach(b=>b.onclick=()=>{state.modal={type:'work',projectId:b.dataset.addSelf,selfOnly:true};render()})
 byId('modalClose')?.addEventListener('click',closeModal); byId('modalCancel')?.addEventListener('click',closeModal); byId('projectForm')?.addEventListener('submit',saveProject); byId('workForm')?.addEventListener('submit',saveNewWork); byId('deleteProjectBtn')?.addEventListener('click',deleteProject)
}
function closeModal(){state.modal=null;render()}
async function saveWork(){
 const w=state.workItems.find(x=>x.id===state.selectedWorkId); const payload={title:byId('editTitle').value.trim(),start_date:byId('editStart').value||null,end_date:byId('editEnd').value||null,status:byId('editStatus').value,customer_target:byId('edit_customer_target').value.trim()||null,customer_need:byId('edit_customer_need').value.trim()||null,expected_effect:byId('edit_expected_effect').value.trim()||null,details:byId('edit_details').value.trim()||null}
 const {error}=await supabase.from('work_items').update(payload).eq('id',w.id); if(error)return alert(error.message); await loadData();state.editing=false;render()
}
async function deleteWork(){const w=state.workItems.find(x=>x.id===state.selectedWorkId); if(!confirm(`'${w.title}' 업무를 삭제할까요?`))return; const {error}=await supabase.from('work_items').delete().eq('id',w.id);if(error)return alert(error.message);await loadData();state.selectedWorkId=null;render()}
async function saveProject(e){
 e.preventDefault(); const projectId=state.modal.projectId, name=byId('projectName').value.trim(), description=byId('projectDesc').value.trim()||null
 if(!projectId){const {data,error}=await supabase.from('projects').insert({name,description,created_by:state.me.id}).select().single(); if(error)return alert(error.message); const {error:me}=await supabase.from('project_members').insert({project_id:data.id,profile_id:state.me.id,role:'owner'}); if(me)return alert(me.message)}
 else {const {error}=await supabase.from('projects').update({name,description}).eq('id',projectId);if(error)return alert(error.message);const ownerIds=[...document.querySelectorAll('input[name=owners]:checked')].map(x=>x.value);const participantIds=[...document.querySelectorAll('input[name=participants]:checked')].map(x=>x.value).filter(x=>!ownerIds.includes(x));if(!ownerIds.length)return alert('오너는 최소 1명 필요합니다.');const current=state.members.filter(m=>m.project_id===projectId);for(const m of current){const desired=ownerIds.includes(m.profile_id)?'owner':participantIds.includes(m.profile_id)?'participant':null;if(!desired){const {error:del}=await supabase.from('project_members').delete().eq('project_id',projectId).eq('profile_id',m.profile_id);if(del)return alert(del.message)}else if(desired!==m.role){const {error:up}=await supabase.from('project_members').update({role:desired}).eq('project_id',projectId).eq('profile_id',m.profile_id);if(up)return alert(up.message)}}for(const id of [...ownerIds,...participantIds]){if(!current.some(m=>m.profile_id===id)){const role=ownerIds.includes(id)?'owner':'participant';const {error:ins}=await supabase.from('project_members').insert({project_id:projectId,profile_id:id,role});if(ins)return alert(ins.message)}}}
 await loadData();state.modal=null;render()
}
async function deleteProject(){const id=state.modal.projectId,p=state.projects.find(x=>x.id===id);if(!confirm(`'${p.name}' 프로젝트와 그 안의 업무를 모두 삭제할까요?`))return;const {error}=await supabase.from('projects').delete().eq('id',id);if(error)return alert(error.message);await loadData();state.modal=null;render()}
async function saveNewWork(e){
 e.preventDefault();const projectId=state.modal.projectId;const payload={project_id:projectId,assignee_id:byId('workAssignee').value,title:byId('workTitle').value.trim(),start_date:byId('workStart').value||null,end_date:byId('workEnd').value||null,status:byId('workStatus').value,customer_target:byId('work_customer_target').value.trim()||null,customer_need:byId('work_customer_need').value.trim()||null,expected_effect:byId('work_expected_effect').value.trim()||null,details:byId('work_details').value.trim()||null,created_by:state.me.id};const {error}=await supabase.from('work_items').insert(payload);if(error)return alert(error.message);await loadData();state.modal=null;state.expanded.add(projectId);render()
}

supabase.auth.onAuthStateChange(async (_event,session)=>{state.session=session;if(session){try{await loadData();render()}catch(e){console.error(e);renderLogin(e.message)}}else{state.me=null;renderLogin()}})
const {data:{session}}=await supabase.auth.getSession();state.session=session;if(session){try{await loadData();render()}catch(e){renderLogin(e.message)}}else renderLogin()
