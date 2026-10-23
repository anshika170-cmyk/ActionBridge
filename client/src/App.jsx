import React, { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, ArrowRight, Bot, CalendarDays, Check, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, FileText, Filter, Mail, Menu, MessageSquareText, Plus, Search, Send, Sparkles, Target, Trash2, Users, X } from "lucide-react";
import { jsPDF } from "jspdf";
const API = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api`;
const sampleNotes = `Project sync — October 23
Decision: Launch the beta after QA signs off.
- Maya will prepare the onboarding copy by tomorrow.
- Send the updated prototype to the design team by Friday. Owner: Arjun
- Investigate the login bug ASAP. Owner: Maya
- Priya will draft the launch announcement by next week.
- Confirm analytics events with the product team.
- QA depends on the login fix before final sign-off.`;

async function api(path, options={}) {
  const response = await fetch(`${API}${path}`, {
    headers: {"Content-Type":"application/json", ...(options.headers||{})},
    ...options
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
function dateLabel(date) {
  if (!date) return "No deadline";
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
function isOverdue(task) { return task.status !== "Done" && task.dueDate && task.dueDate < new Date().toISOString().slice(0,10); }
function App() {
  const [tasks,setTasks] = useState([]);
  const [meetings,setMeetings] = useState([]);
  const [page,setPage] = useState("Overview");
  const [notes,setNotes] = useState("");
  const [meetingTitle,setMeetingTitle] = useState("Weekly project sync");
  const [analysis,setAnalysis] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  const [statusFilter,setStatusFilter] = useState("All");
  const [priorityFilter,setPriorityFilter] = useState("All");
  const [assistantText,setAssistantText] = useState("");
  const [assistantResult,setAssistantResult] = useState(null);
  const [showNewTask,setShowNewTask] = useState(false);
  const [taskForm,setTaskForm] = useState({title:"",owner:"",dueDate:"",priority:"Medium"});
  const [editing,setEditing] = useState(null);
  const [mobileNav,setMobileNav] = useState(false);
  const [toast,setToast] = useState("");

  async function refresh() {
    try { const [t,m] = await Promise.all([api("/tasks"),api("/meetings")]); setTasks(t); setMeetings(m); setError(""); }
    catch(e) { setError(`${e.message}. Is the backend running on port 5000?`); }
  }
  useEffect(()=>{refresh();},[]);
  const openCount = tasks.filter(t=>t.status==="Open").length;
  const progressCount = tasks.filter(t=>t.status==="In Progress").length;
  const doneCount = tasks.filter(t=>t.status==="Done").length;
  const overdueCount = tasks.filter(isOverdue).length;
  const completion = tasks.length ? Math.round(doneCount/tasks.length*100) : 0;
  const filteredTasks = useMemo(()=>tasks.filter(t=>
    (statusFilter==="All"||t.status===statusFilter) &&
    (priorityFilter==="All"||t.priority===priorityFilter) &&
    `${t.title} ${t.owner} ${t.notes}`.toLowerCase().includes(query.toLowerCase())
  ),[tasks,statusFilter,priorityFilter,query]);

  function notify(message){setToast(message);setTimeout(()=>setToast(""),2600);}
  async function analyze() {
    if(!notes.trim()) {setError("Paste meeting notes before analyzing.");return;}
    setBusy(true);setError("");
    try { const result=await api("/analyze",{method:"POST",body:JSON.stringify({title:meetingTitle,notes})});setAnalysis(result);await refresh();setPage("Analyze"); }
    catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function commitAnalysis() {
    if(!analysis?.tasks?.length) return;
    try {
      const result=await api("/analyze/commit",{method:"POST",body:JSON.stringify({tasks:analysis.tasks})});
      await refresh();setAnalysis(null);setNotes("");setPage("Tasks");notify(`${result.count} action items added to your task list.`);
    } catch(e){setError(e.message);}
  }
  async function saveTask(e) {
    e.preventDefault();
    try {
      if(editing) await api(`/tasks/${editing.id}`,{method:"PATCH",body:JSON.stringify(taskForm)});
      else await api("/tasks",{method:"POST",body:JSON.stringify(taskForm)});
      setTaskForm({title:"",owner:"",dueDate:"",priority:"Medium"});setShowNewTask(false);setEditing(null);await refresh();notify(editing?"Task updated.":"Task created.");
    } catch(e){setError(e.message);}
  }
  function editTask(task){setEditing(task);setTaskForm({title:task.title,owner:task.owner||"",dueDate:task.dueDate||"",priority:task.priority});setShowNewTask(true);}
  async function patchTask(task,patch) {
    try { await api(`/tasks/${task.id}`,{method:"PATCH",body:JSON.stringify(patch)});await refresh(); }
    catch(e){setError(e.message);}
  }
  async function deleteTask(task) {
    if(!window.confirm(`Delete “${task.title}”?`)) return;
    try{await api(`/tasks/${task.id}`,{method:"DELETE"});await refresh();notify("Task deleted.");}catch(e){setError(e.message);}
  }
  async function askAssistant(e) {
    e.preventDefault(); if(!assistantText.trim()) return;
    try{const result=await api("/assistant",{method:"POST",body:JSON.stringify({message:assistantText})});setAssistantResult(result);setAssistantText("");}
    catch(e){setError(e.message);}
  }
  async function copyText(text) {
    try{await navigator.clipboard.writeText(text);notify("Copied to clipboard.");}
    catch{setError("Clipboard access was blocked by your browser.");}
  }
  function exportTasks(format) {
    const content = format==="json" ? JSON.stringify(tasks,null,2) :
      ["Title,Owner,Due date,Priority,Status",...tasks.map(t=>[t.title,t.owner,t.dueDate,t.priority,t.status].map(v=>`"${String(v||"").replaceAll('"','""')}"`).join(","))].join("\n");
    const blob=new Blob([content],{type:format==="json"?"application/json":"text/csv"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`actionbridge-tasks.${format==="json"?"json":"csv"}`;a.click();URL.revokeObjectURL(url);
  }
  const navItems=[["Overview",Activity],["Analyze notes",FileText],["Tasks",ClipboardList],["Assistant",Bot]];
  const go=(p)=>{setPage(p);setMobileNav(false);};
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?"sidebar-open":""}`}>
      <div className="brand"><div className="brand-icon"><Sparkles size={20}/></div><div><strong>ActionBridge</strong><small>MEETING INTELLIGENCE</small></div><button className="icon-button mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-avatar">AB</div><div><b>My workspace</b><small>Personal project</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{navItems.map(([label,Icon])=><button key={label} className={`nav-item ${page===label||(page==="Analyze"&&label==="Analyze notes")?"active":""}`} onClick={()=>go(label==="Analyze notes"?"Analyze":label)}><Icon size={18}/><span>{label}</span>{label==="Tasks"&&tasks.length>0&&<em>{tasks.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="mini-agent"><div className="agent-orb"><Bot size={18}/></div><div><b>Action agent</b><small>Local analysis active</small></div><span className="online-dot"/></div><div className="sidebar-note">Turn conversations into clear next steps.</div></div>
    </aside>
    {mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><span className="crumb">Workspace</span><span className="crumb-slash">/</span><b>{page==="Analyze"?"Analyze notes":page}</b></div><div className="topbar-right"><span className="status-pill"><span className="online-dot"/> All systems local</span><div className="profile-avatar">A</div></div></header>
      <div className="page-content">
        {error&&<div className="error-banner"><CircleAlert size={17}/><span>{error}</span><button onClick={()=>setError("")}><X size={16}/></button></div>}
        {page==="Overview"&&<Overview tasks={tasks} meetings={meetings} openCount={openCount} progressCount={progressCount} doneCount={doneCount} overdueCount={overdueCount} completion={completion} go={go} setNotes={setNotes} analyze={analyze} busy={busy} setShowNewTask={setShowNewTask} filteredTasks={tasks.slice(0,5)} patchTask={patchTask}/>}
        {page==="Analyze"&&<AnalyzePage notes={notes} setNotes={setNotes} meetingTitle={meetingTitle} setMeetingTitle={setMeetingTitle} analyze={analyze} busy={busy} analysis={analysis} setAnalysis={setAnalysis} commitAnalysis={commitAnalysis} copyText={copyText} setPage={setPage}/>}
        {page==="Tasks"&&<TasksPage tasks={filteredTasks} allCount={tasks.length} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} setShowNewTask={setShowNewTask} editTask={editTask} patchTask={patchTask} deleteTask={deleteTask} exportTasks={exportTasks}/>}
        {page==="Assistant"&&<AssistantPage assistantText={assistantText} setAssistantText={setAssistantText} askAssistant={askAssistant} result={assistantResult} copyText={copyText} go={go}/>}
      </div>
      <footer className="footer"><span>© 2026 ActionBridge</span><span><span className="online-dot"/> Local-first prototype · Review AI-generated actions before use</span></footer>
    </main>
    {showNewTask&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setShowNewTask(false);setEditing(null);}}}><form className="task-modal" onSubmit={saveTask}><div className="modal-head"><div><h2>{editing?"Edit task":"Create a task"}</h2><p>Add a clear next step to your workspace.</p></div><button type="button" className="icon-button" onClick={()=>{setShowNewTask(false);setEditing(null);}}><X size={18}/></button></div><label>Task title<input autoFocus required maxLength="300" value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="e.g. Share revised project timeline"/></label><div className="form-grid"><label>Owner<input value={taskForm.owner} onChange={e=>setTaskForm({...taskForm,owner:e.target.value})} placeholder="Name or TBD"/></label><label>Due date<input type="date" value={taskForm.dueDate} onChange={e=>setTaskForm({...taskForm,dueDate:e.target.value})}/></label></div><label>Priority<select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})}><option>Low</option><option>Medium</option><option>High</option></select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>{setShowNewTask(false);setEditing(null);}}>Cancel</button><button className="button primary"><Check size={16}/>{editing?"Save changes":"Create task"}</button></div></form></div>}
    {toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </div>;
}

function PageHeading({eyebrow,title,subtitle,action}) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function Overview({tasks,meetings,openCount,progressCount,doneCount,overdueCount,completion,go,setNotes,analyze,busy,setShowNewTask,filteredTasks,patchTask}) {
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE" title="Good work starts with clarity." subtitle="Turn the conversations you have into the actions that move work forward." action={<button className="button primary" onClick={()=>go("Analyze")}><Sparkles size={16}/> Analyze a meeting</button>}/>
    <div className="welcome-banner"><div className="welcome-copy"><span className="banner-kicker"><Sparkles size={14}/> YOUR MEETING CO-PILOT</span><h2>From discussion to done.</h2><p>Drop in your notes. ActionBridge finds next steps, spots gaps, and helps your team leave every meeting with a plan.</p><button className="button white" onClick={()=>go("Analyze")}>Analyze meeting notes <ArrowRight size={16}/></button></div><div className="banner-art"><div className="art-circle circle-one"/><div className="art-circle circle-two"/><div className="floating-card card-a"><div className="float-check"><Check size={15}/></div><div><b>Action identified</b><small>Prototype review</small></div><span className="float-tag">HIGH</span></div><div className="floating-card card-b"><div className="float-icon"><CalendarDays size={17}/></div><div><b>Deadline detected</b><small>Tomorrow · 2 tasks</small></div></div><div className="art-center"><Sparkles size={34}/></div></div></div>
    <div className="section-heading"><div><h2>Workspace at a glance</h2><p>A live snapshot of your action items.</p></div><button className="text-button" onClick={()=>go("Tasks")}>View all tasks <ArrowRight size={15}/></button></div>
    <div className="metric-grid">
      <Metric label="Open tasks" value={openCount} icon={ClipboardList} tone="purple" note="Ready to be picked up"/>
      <Metric label="In progress" value={progressCount} icon={Activity} tone="blue" note="Currently being worked on"/>
      <Metric label="Completed" value={doneCount} icon={CheckCircle2} tone="green" note={`${completion}% overall completion`}/>
      <Metric label="Overdue" value={overdueCount} icon={CalendarDays} tone="orange" note="Needs attention"/>
    </div>
    <div className="overview-grid"><section className="panel task-panel"><div className="panel-heading"><div><h3>Recent action items</h3><p>Your next steps, all in one place.</p></div><button className="icon-button" title="Create task" onClick={()=>setShowNewTask(true)}><Plus size={18}/></button></div>{filteredTasks.length?<div className="task-list">{filteredTasks.map(t=><TaskRow key={t.id} task={t} patchTask={patchTask}/>)}</div>:<EmptyState icon={ClipboardList} title="Your action list is clear" text="Analyze meeting notes to find your first action items." button="Analyze notes" onClick={()=>go("Analyze")}/>}</section>
      <section className="panel progress-panel"><div className="panel-heading"><div><h3>Project momentum</h3><p>Completion across all tasks.</p></div><Target size={19} className="muted-icon"/></div><div className="progress-number">{completion}<span>%</span></div><div className="progress-track"><div className="progress-fill" style={{width:`${completion}%`}}/></div><div className="progress-legend"><span><i className="legend-dot done-dot"/>Completed <b>{doneCount}</b></span><span><i className="legend-dot open-dot"/>Remaining <b>{tasks.length-doneCount}</b></span></div><div className="progress-divider"/><div className="insight-box"><div className="insight-icon"><Sparkles size={17}/></div><div><b>One small next step</b><p>{overdueCount?`${overdueCount} overdue item(s) need attention. Start there.`:openCount?`Pick one of your ${openCount} open tasks and give it an owner and deadline.`:"Great momentum — review completed tasks and capture the next milestone."}</p></div></div><button className="button secondary full-button" onClick={()=>go("Tasks")}>Open task manager <ArrowRight size={15}/></button></section></div>
    <div className="bottom-hint"><div className="hint-icon"><MessageSquareText size={19}/></div><div><b>Have a question about your workload?</b><p>Ask the ActionBridge assistant to summarize tasks, find missing owners, or draft a follow-up email.</p></div><button className="button secondary" onClick={()=>go("Assistant")}>Ask assistant <ArrowRight size={15}/></button></div>
  </>;
}
function Metric({label,value,icon:Icon,tone,note}){return <div className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;}
function TaskRow({task,patchTask,editTask,deleteTask}) {
  return <div className={`task-row ${task.status==="Done"?"task-done":""}`}><button className={`task-check ${task.status==="Done"?"checked":""}`} title="Mark complete" onClick={()=>patchTask(task,{status:task.status==="Done"?"Open":"Done"})}>{task.status==="Done"&&<Check size={13}/>}</button><div className="task-main"><b>{task.title}</b><div className="task-meta"><span className="owner-avatar">{(task.owner||"?").slice(0,1).toUpperCase()}</span><span>{task.owner||"Unassigned"}</span><span className="meta-separator">·</span><CalendarDays size={13}/><span>{dateLabel(task.dueDate)}</span></div></div><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><select className="status-select" value={task.status} onChange={e=>patchTask(task,{status:e.target.value})} aria-label="Task status"><option>Open</option><option>In Progress</option><option>Done</option></select></div>;
}
function EmptyState({icon:Icon,title,text,button,onClick}){return <div className="empty-state"><div className="empty-icon"><Icon size={23}/></div><b>{title}</b><p>{text}</p>{button&&<button className="button secondary" onClick={onClick}>{button}</button>}</div>;}
function exportDraftAsPdf(draft) {
  if (!draft || !draft.trim()) {
    alert("No follow-up draft available to export.");
    return;
  }

  const doc = new jsPDF();
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;

  // PDF heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ActionBridge", margin, 22);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Follow-up and Action Items", margin, 32);

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, 38, pageWidth - margin, 38);

  // Format and wrap the draft text
  doc.setFontSize(11);
  const paragraphs = draft.split(/\r?\n/);
  let y = 48;
  const lineHeight = 6;

  for (const paragraph of paragraphs) {
    const lines = paragraph.trim()
      ? doc.splitTextToSize(paragraph, maxWidth)
      : [""];

    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }

      if (line) {
        doc.text(line, margin, y);
      }

      y += lineHeight;
    }

    y += 2;
  }

  doc.save("ActionBridge-Follow-Up.pdf");
}
function AnalyzePage({notes,setNotes,meetingTitle,setMeetingTitle,analyze,busy,analysis,setAnalysis,commitAnalysis,copyText,setPage}) {
  const [fileError,setFileError]=useState("");
  function handleFile(e){const file=e.target.files?.[0];if(!file)return;if(file.size>1024*1024){setFileError("Please choose a text file smaller than 1 MB.");return;}const reader=new FileReader();reader.onload=()=>{setNotes(String(reader.result||""));setFileError("");};reader.readAsText(file);}
  return <>
    <PageHeading eyebrow="MEETING INTELLIGENCE" title="Turn notes into next steps." subtitle="Paste a transcript or upload a text file. The agent will identify actions, owners, deadlines, decisions, and potential risks."/>
    <div className="analysis-layout"><section className="panel input-panel"><div className="panel-heading"><div><h3>Meeting details</h3><p>Start with the raw notes. They don't need to be perfect.</p></div><div className="panel-step">01 / INPUT</div></div><label className="field-label">Meeting name<input value={meetingTitle} onChange={e=>setMeetingTitle(e.target.value)} placeholder="e.g. Weekly product sync"/></label><div className="notes-label"><label className="field-label">Meeting notes</label><button className="text-button" onClick={()=>setNotes(sampleNotes)}>Load sample notes</button></div><textarea className="notes-input" value={notes} onChange={e=>setNotes(e.target.value)} placeholder={"Paste meeting notes here...\n\n• Maya will send the draft by Friday.\n• Confirm the release date with the team.\n• Decision: move the beta launch to next week."}/><div className="input-footer"><label className="upload-link"><ArrowDownToLine size={15}/> Upload .txt file<input type="file" accept=".txt,text/plain" onChange={handleFile} hidden/></label><span>{notes.length.toLocaleString()} characters</span></div>{fileError&&<p className="field-error">{fileError}</p>}<div className="analysis-notice"><CircleAlert size={16}/><span>Review extracted owners and dates before adding tasks. Pattern-based analysis can miss context.</span></div><button className="button primary analyze-button" disabled={busy||!notes.trim()} onClick={analyze}>{busy?<span className="spinner"/>:<Sparkles size={17}/>} {busy?"Analyzing notes...":"Analyze meeting notes"} <ArrowRight size={16}/></button></section>
      <section className="analysis-side"><div className="panel side-guide"><div className="guide-icon"><Bot size={20}/></div><h3>What the agent looks for</h3><div className="guide-item"><div className="guide-check"><Check size={13}/></div><div><b>Action items</b><p>Clear verbs and concrete deliverables.</p></div></div><div className="guide-item"><div className="guide-check"><Check size={13}/></div><div><b>Owners & deadlines</b><p>Who is responsible and when it's due.</p></div></div><div className="guide-item"><div className="guide-check"><Check size={13}/></div><div><b>Risks & decisions</b><p>Missing details, blockers, and decisions.</p></div></div></div><div className="privacy-card"><div className="privacy-icon"><CheckCircle2 size={18}/></div><div><b>Local-first prototype</b><p>Your notes are processed by your own backend. No external AI provider is called by this version.</p></div></div></section></div>
    {analysis&&<section className="panel analysis-results"><div className="panel-heading"><div><div className="eyebrow">ANALYSIS COMPLETE</div><h3>Here's what we found</h3><p>{analysis.summary}</p></div><button className="icon-button" onClick={()=>setAnalysis(null)}><X size={18}/></button></div><div className="analysis-stats"><div><b>{analysis.tasks.length}</b><span>Action items</span></div><div><b>{analysis.stats?.missingOwners||0}</b><span>Missing owners</span></div><div><b>{analysis.stats?.missingDates||0}</b><span>Missing deadlines</span></div><div><b>{analysis.decisions.length}</b><span>Decisions</span></div></div>{analysis.risks?.length>0&&<div className="risk-list"><h4><CircleAlert size={16}/> Things to review</h4>{analysis.risks.map((r,i)=><div key={i} className="risk-item">{r}</div>)}</div>}{analysis.decisions?.length>0&&<div className="decision-list"><h4>Decisions captured</h4>{analysis.decisions.map((d,i)=><p key={i}>• {d}</p>)}</div>}<div className="extracted-tasks"><h4>Extracted tasks</h4>{analysis.tasks.length?analysis.tasks.map((t,i)=><div className="extracted-row" key={i}><div><b>{t.title}</b><small>{t.owner||"Owner TBD"} · {dateLabel(t.dueDate)}</small></div><span className={`priority priority-${t.priority.toLowerCase()}`}>{t.priority}</span></div>):<p className="muted-copy">No clear action items were detected. Try adding bullet points or action verbs such as “send”, “review”, or “confirm”.</p>}</div>
<div className="result-actions">
  <button
    className="button secondary"
    onClick={() => copyText(analysis.followUp)}
  >
    <Mail size={16} /> Copy follow-up draft
  </button>

  <button
    className="button secondary"
    onClick={() => exportDraftAsPdf(analysis.followUp)}
    disabled={!analysis.followUp?.trim()}
  >
    <ArrowDownToLine size={16} /> Export as PDF
  </button>

  <button
    className="button primary"
    disabled={!analysis.tasks.length}
    onClick={commitAnalysis}
  >
    <Plus size={16} /> Add {analysis.tasks.length} tasks to workspace
  </button>
</div><p className="fine-print">Extraction is heuristic, not guaranteed. Confirm every action item before sharing it.</p></section>}
  </>;
}
function TasksPage({tasks,allCount,query,setQuery,statusFilter,setStatusFilter,priorityFilter,setPriorityFilter,setShowNewTask,editTask,patchTask,deleteTask,exportTasks}) {
  return <><PageHeading eyebrow="TASK MANAGEMENT" title="Every next step, accounted for." subtitle="Keep ownership, deadlines, and progress visible across your meetings." action={<button className="button primary" onClick={()=>setShowNewTask(true)}><Plus size={16}/> New task</button>}/><div className="task-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tasks or owners..."/></div><div className="filter-box"><Filter size={15}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option><option>Open</option><option>In Progress</option><option>Done</option></select><select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></div><div className="export-menu"><button className="button secondary" onClick={()=>exportTasks("csv")}><ArrowDownToLine size={15}/> Export CSV</button><button className="button secondary export-json" onClick={()=>exportTasks("json")}>JSON</button></div></div><section className="panel task-table-panel"><div className="table-topline"><div><h3>Action items <span className="count-chip">{tasks.length}</span></h3><p>Showing {tasks.length} of {allCount} tasks.</p></div></div>{tasks.length?<div className="table-wrap"><table><thead><tr><th>Task</th><th>Owner</th><th>Due date</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td><div className="table-task"><button className={`task-check ${t.status==="Done"?"checked":""}`} onClick={()=>patchTask(t,{status:t.status==="Done"?"Open":"Done"})}>{t.status==="Done"&&<Check size={12}/>}</button><span className={t.status==="Done"?"line-through":""}>{t.title}</span></div></td><td><span className="table-owner"><span className="owner-avatar">{(t.owner||"?").slice(0,1).toUpperCase()}</span>{t.owner||"Unassigned"}</span></td><td><span className={isOverdue(t)?"overdue-date":""}>{dateLabel(t.dueDate)}{isOverdue(t)?" · Overdue":""}</span></td><td><span className={`priority priority-${t.priority.toLowerCase()}`}>{t.priority}</span></td><td><select className="status-select" value={t.status} onChange={e=>patchTask(t,{status:e.target.value})}><option>Open</option><option>In Progress</option><option>Done</option></select></td><td><div className="row-actions"><button className="icon-button small" title="Edit" onClick={()=>editTask(t)}><FileText size={15}/></button><button className="icon-button small danger-hover" title="Delete" onClick={()=>deleteTask(t)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>:<EmptyState icon={Search} title="No matching tasks" text="Try changing your search or filters, or create a new task."/>}</section></>;
}
function AssistantPage({assistantText,setAssistantText,askAssistant,result,copyText,go}) {
  const examples=["What tasks are overdue?","Which tasks have no owner?","Summarize my task status","Draft a follow-up email"];
  return <><PageHeading eyebrow="ACTION AGENT" title="A little help moving work forward." subtitle="Ask about your action items. The assistant selects a local tool, retrieves your task data, and returns a grounded response."/><div className="assistant-layout"><section className="panel assistant-chat"><div className="chat-header"><div className="assistant-avatar"><Bot size={21}/></div><div><b>ActionBridge assistant</b><small><span className="online-dot"/> Connected to local task tools</small></div><span className="agent-label">TOOL-ENABLED</span></div><div className="chat-body"><div className="chat-message agent-message"><div className="chat-mini-avatar"><Sparkles size={15}/></div><div><p>Hi! I can look through your current action items and help you spot what needs attention.</p><p>Try asking about overdue tasks, missing owners, task status, or a follow-up draft.</p></div></div>{result&&<div className="chat-message agent-message"><div className="chat-mini-avatar"><Sparkles size={15}/></div><div><p>{result.reply}</p><div className="tool-call"><CheckCircle2 size={14}/><span>Tool called: <b>{result.tool}</b></span></div>{result.payload?.draft&&<div className="draft-result"><div className="draft-head"><b>Follow-up draft</b><button className="text-button" onClick={()=>copyText(result.payload.draft)}>Copy draft</button></div><pre>{result.payload.draft}</pre></div>}{result.payload?.tasks?.length>0&&<div className="tool-results">{result.payload.tasks.map(t=><div key={t.id}><b>{t.title}</b><small>{t.owner||"Unassigned"} · {t.dueDate||"No deadline"}</small></div>)}</div>}</div></div>}</div><div className="suggestion-area"><span>TRY ASKING</span><div className="suggestion-chips">{examples.map(x=><button key={x} onClick={()=>setAssistantText(x)}>{x}<ArrowRight size={13}/></button>)}</div></div><form className="chat-input-row" onSubmit={askAssistant}><input value={assistantText} onChange={e=>setAssistantText(e.target.value)} placeholder="Ask about your action items..." aria-label="Ask the assistant"/><button className="send-button" disabled={!assistantText.trim()} aria-label="Send question"><Send size={17}/></button></form></section><aside className="assistant-sidebar"><div className="panel tools-panel"><div className="tool-panel-icon"><Activity size={19}/></div><h3>Available tools</h3><p>The assistant can call these local functions to ground its answers in your workspace data.</p>{[["list_overdue_tasks","Find late work"],["find_missing_owners","Spot unassigned tasks"],["summarize_tasks","Summarize progress"],["draft_followup","Prepare an email"]].map(([name,desc])=><div className="tool-item" key={name}><span className="tool-dot"/><div><b>{desc}</b><small>{name}</small></div><CheckCircle2 size={15}/></div>)}</div><div className="safety-note"><CircleAlert size={17}/><div><b>Human approval stays in the loop</b><p>This prototype reads and drafts. Review results before sending messages or changing project commitments.</p></div></div><button className="button secondary full-button" onClick={()=>go("Tasks")}>Open task manager <ArrowRight size={15}/></button></aside></div></>;
}
export default App;