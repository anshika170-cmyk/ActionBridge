import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { analyzeMeeting } from "./analysis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data.json");
const app = express();
app.use(cors());
app.use(express.json({limit:"2mb"}));

async function readData() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, "utf8")); }
  catch { return {tasks:[], meetings:[]}; }
}
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}
function normalizeTask(input) {
  return {
    id: input.id || randomUUID(),
    title: String(input.title || "").trim().slice(0,300),
    owner: String(input.owner || "").trim().slice(0,100),
    dueDate: input.dueDate || "",
    priority: ["Low","Medium","High"].includes(input.priority) ? input.priority : "Medium",
    status: ["Open","In Progress","Done"].includes(input.status) ? input.status : "Open",
    notes: String(input.notes || "").slice(0,1000),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
app.get("/api/health", (_req,res) => res.json({ok:true, app:"ActionBridge API"}));
app.get("/api/tasks", async (req,res) => {
  const data = await readData();
  let tasks = data.tasks;
  if (req.query.status && req.query.status !== "All") tasks = tasks.filter(t => t.status === req.query.status);
  if (req.query.priority && req.query.priority !== "All") tasks = tasks.filter(t => t.priority === req.query.priority);
  if (req.query.q) tasks = tasks.filter(t => `${t.title} ${t.owner} ${t.notes}`.toLowerCase().includes(String(req.query.q).toLowerCase()));
  res.json(tasks);
});
app.post("/api/tasks", async (req,res) => {
  if (!String(req.body.title || "").trim()) return res.status(400).json({error:"Task title is required."});
  const data = await readData();
  const task = normalizeTask(req.body);
  data.tasks.unshift(task);
  await writeData(data);
  res.status(201).json(task);
});
app.patch("/api/tasks/:id", async (req,res) => {
  const data = await readData();
  const i = data.tasks.findIndex(t => t.id === req.params.id);
  if (i < 0) return res.status(404).json({error:"Task not found."});
  data.tasks[i] = normalizeTask({...data.tasks[i], ...req.body, id:data.tasks[i].id, createdAt:data.tasks[i].createdAt});
  await writeData(data);
  res.json(data.tasks[i]);
});
app.delete("/api/tasks/:id", async (req,res) => {
  const data = await readData();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  if (data.tasks.length === before) return res.status(404).json({error:"Task not found."});
  await writeData(data);
  res.json({ok:true});
});
app.post("/api/analyze", async (req,res) => {
  const notes = String(req.body.notes || "").trim();
  if (!notes) return res.status(400).json({error:"Paste meeting notes first."});
  const result = analyzeMeeting(notes);
  const data = await readData();
  const meeting = {id:randomUUID(), title:String(req.body.title || "Untitled meeting").slice(0,150), notes, createdAt:new Date().toISOString(), analysis:result};
  data.meetings.unshift(meeting);
  data.meetings = data.meetings.slice(0,50);
  await writeData(data);
  res.json({...result, meetingId:meeting.id});
});
app.post("/api/analyze/commit", async (req,res) => {
  const incoming = Array.isArray(req.body.tasks) ? req.body.tasks : [];
  const data = await readData();
  const created = incoming.filter(t => String(t.title || "").trim()).map(t => normalizeTask(t));
  data.tasks = [...created, ...data.tasks];
  await writeData(data);
  res.status(201).json({created, count:created.length});
});
app.get("/api/meetings", async (_req,res) => {
  const data = await readData();
  res.json(data.meetings);
});
app.post("/api/assistant", async (req,res) => {
  const message = String(req.body.message || "").trim();
  const lower = message.toLowerCase();
  const data = await readData();
  let reply = "I can analyze meeting notes, summarize open tasks, identify missing owners or deadlines, and draft follow-up emails. Try asking: “What tasks are overdue?”";
  let tool = "help";
  let payload = {};
  if (lower.includes("overdue")) {
    const today = new Date().toISOString().slice(0,10);
    const tasks = data.tasks.filter(t => t.status !== "Done" && t.dueDate && t.dueDate < today);
    tool = "list_overdue_tasks"; payload = {count:tasks.length, tasks};
    reply = tasks.length ? `I found ${tasks.length} overdue task(s): ${tasks.map(t => `${t.title}${t.owner ? ` (owner: ${t.owner})` : ""}, due ${t.dueDate}`).join("; ")}.` : "There are no overdue tasks in your current task list.";
  } else if (lower.includes("missing owner") || lower.includes("no owner")) {
    const tasks = data.tasks.filter(t => !t.owner && t.status !== "Done");
    tool = "find_missing_owners"; payload = {count:tasks.length, tasks};
    reply = tasks.length ? `${tasks.length} open task(s) need an owner: ${tasks.map(t=>t.title).join("; ")}.` : "All open tasks currently have an owner.";
  } else if (lower.includes("summary") || lower.includes("status") || lower.includes("how many")) {
    const open = data.tasks.filter(t=>t.status==="Open").length;
    const progress = data.tasks.filter(t=>t.status==="In Progress").length;
    const done = data.tasks.filter(t=>t.status==="Done").length;
    tool = "summarize_tasks"; payload = {open, inProgress:progress, done, total:data.tasks.length};
    reply = `You have ${data.tasks.length} task(s): ${open} open, ${progress} in progress, and ${done} completed.`;
  } else if (lower.includes("draft") || lower.includes("email") || lower.includes("follow-up")) {
    const tasks = data.tasks.filter(t=>t.status!=="Done");
    tool = "draft_followup";
    const draft = ["Subject: Action items follow-up","","Hi everyone,","Here are the outstanding action items:",...tasks.map((t,i)=>`${i+1}. ${t.title} — Owner: ${t.owner || "TBD"} — Due: ${t.dueDate || "TBD"}`),"","Please reply with corrections or updates.","","Best,"].join("\n");
    payload = {draft};
    reply = "I've drafted a follow-up email from your current open tasks. You can copy it from the result panel.";
  }
  res.json({reply, tool, payload});
});
app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(500).json({error:"Unexpected server error."});
});

const port = process.env.PORT || 5000;

app.listen(port, "0.0.0.0", () => {
  console.log(`ActionBridge API running on port ${port}`);
});
