# ActionBridge — Meeting-to-Action Agent

ActionBridge converts meeting notes into actionable tasks, flags missing owners and deadline issues, tracks progress, and drafts follow-up emails.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Storage: local JSON file (`server/data.json`)
- Analysis: local rule-based extraction (no paid API required)
- Optional MCP tool server: `server/mcp-server.js`

## Requirements
- Node.js 20+ recommended
- npm

## Run locally

### 1. Start the API
```bash
cd server
npm install
npm run dev
```
API runs at `http://localhost:5000`.

### 2. Start the frontend
In another terminal:
```bash
cd client
npm install
npm run dev
```
Open the URL Vite prints, usually `http://localhost:5173`.

## Features
- Paste meeting notes and analyze them
- Extract tasks, owners, dates, priorities, and decisions
- Create, edit, complete, and delete tasks
- Filter tasks by status and priority
- Dashboard metrics and progress
- Identify missing owners, overdue tasks, and shared deadlines
- Draft a follow-up email and copy it
- Export tasks as JSON or CSV
- Simulated assistant panel that calls app tools through the API
- Optional MCP server exposing task tools

## MCP server (optional)
The MCP server is a separate tool server. It is not, by itself, an official Alexa+ integration.
```bash
cd server
npm install
npm run mcp
```
The server uses stdio transport, so configure it in an MCP-compatible client if desired. The exact configuration depends on the client.

## Notes and limitations
- The local extraction engine is a prototype. It uses patterns and may miss tasks or infer owners/dates incorrectly. Review tasks before relying on them.
- Data is stored locally in `server/data.json`. This is suitable for a demo, not a multi-user production deployment.
- No authentication is included.
- The assistant panel is a simulated agent experience; do not claim it is connected to Alexa+ unless you build and verify that integration separately.
