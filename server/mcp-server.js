// Optional MCP tools for an MCP-compatible client.
// This is a general MCP server, not an official Alexa+ integration.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { analyzeMeeting } from "./analysis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data.json");
async function readData(){ try{return JSON.parse(await fs.readFile(DATA_FILE,"utf8"));}catch{return {tasks:[],meetings:[]};}}
async function writeData(d){await fs.writeFile(DATA_FILE,JSON.stringify(d,null,2),"utf8");}
const server = new Server({name:"actionbridge-tools",version:"1.0.0"},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema, async () => ({tools:[
  {name:"analyze_meeting_notes",description:"Extract action items, owners, deadlines, decisions, and risks from meeting notes.",inputSchema:{type:"object",properties:{notes:{type:"string",description:"Meeting notes text"}},required:["notes"]}},
  {name:"list_action_items",description:"List ActionBridge tasks, optionally filtered by status.",inputSchema:{type:"object",properties:{status:{type:"string",enum:["All","Open","In Progress","Done"]}}}},
  {name:"create_action_item",description:"Create an action item in the local ActionBridge task store.",inputSchema:{type:"object",properties:{title:{type:"string"},owner:{type:"string"},dueDate:{type:"string"},priority:{type:"string",enum:["Low","Medium","High"]}},required:["title"]}},
  {name:"update_action_status",description:"Update a task's status by task ID.",inputSchema:{type:"object",properties:{id:{type:"string"},status:{type:"string",enum:["Open","In Progress","Done"]}},required:["id","status"]}}
]}));
server.setRequestHandler(CallToolRequestSchema, async request => {
  const {name, arguments:args={}} = request.params;
  let result;
  if(name==="analyze_meeting_notes"){
    result=analyzeMeeting(args.notes||"");
  } else if(name==="list_action_items"){
    const data=await readData();
    result=data.tasks.filter(t=>!args.status||args.status==="All"||t.status===args.status);
  } else if(name==="create_action_item"){
    if(!String(args.title||"").trim()) throw new Error("title is required");
    const data=await readData();
    const task={id:randomUUID(),title:String(args.title).trim(),owner:String(args.owner||""),dueDate:String(args.dueDate||""),priority:["Low","Medium","High"].includes(args.priority)?args.priority:"Medium",status:"Open",notes:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    data.tasks.unshift(task); await writeData(data); result=task;
  } else if(name==="update_action_status"){
    const data=await readData(); const task=data.tasks.find(t=>t.id===args.id);
    if(!task) throw new Error("task not found");
    task.status=args.status; task.updatedAt=new Date().toISOString(); await writeData(data); result=task;
  } else throw new Error(`Unknown tool: ${name}`);
  return {content:[{type:"text",text:JSON.stringify(result,null,2)}]};
});
const transport = new StdioServerTransport();
await server.connect(transport);
