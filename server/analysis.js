const priorityWords = {
  high: ["urgent", "asap", "critical", "blocker", "immediately", "today"],
  low: ["optional", "when possible", "nice to have", "low priority"]
};

function inferPriority(text) {
  const lower = text.toLowerCase();
  if (priorityWords.high.some(word => lower.includes(word))) return "High";
  if (priorityWords.low.some(word => lower.includes(word))) return "Low";
  return "Medium";
}

function cleanTask(text) {
  return text
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^(?:action item|todo|task)\s*:\s*/i, "")
    .trim()
    .replace(/[.;]+$/, "");
}

function extractOwner(line) {
  const patterns = [
    /\b(?:owner|assigned to|assignee)\s*[:=-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|to)\s+(?:own|complete|send|prepare|review|build|create|update|share|deliver|fix|check|contact|schedule|finalize)\b/
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

function extractDueDate(line) {
  const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const monthDate = line.match(/\b(?:by|before|due(?:\s+on)?|deadline(?:\s+is)?)\s+(?:the\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDate) {
    const monthNames = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const month = monthNames.indexOf(monthDate[1].slice(0,3).toLowerCase()) + 1;
    const year = new Date().getFullYear();
    return `${year}-${String(month).padStart(2,"0")}-${String(Number(monthDate[2])).padStart(2,"0")}`;
  }

  const relative = line.match(/\b(today|tomorrow|next week|this week|end of week|eow)\b/i);
  if (relative) {
    const d = new Date();
    const token = relative[1].toLowerCase();
    if (token === "tomorrow") d.setDate(d.getDate()+1);
    else if (token === "next week") d.setDate(d.getDate()+7);
    else if (token === "end of week" || token === "eow" || token === "this week") {
      const daysUntilFriday = (5 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (daysUntilFriday || 7));
    }
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  return "";
}

function isActionLine(line) {
  const l = line.toLowerCase();
  if (/^(decision|decisions|context|background|attendees|meeting notes?)\s*:/i.test(line)) return false;
  return /(?:^[-*•]\s+|^\d+[.)]\s+|action item|todo|task:|will\s+(?:send|prepare|review|build|create|update|share|deliver|fix|check|contact|schedule|finalize|investigate|confirm|draft|implement|test|publish)|(?:send|prepare|review|build|create|update|share|deliver|fix|check|contact|schedule|finalize|investigate|confirm|draft|implement|test|publish)\s+.{2,}\b(?:by|before|today|tomorrow|next week|eow|end of week|owner|assigned to)\b)/i.test(line)
    || /^(send|prepare|review|build|create|update|share|deliver|fix|check|contact|schedule|finalize|investigate|confirm|draft|implement|test|publish)\b/i.test(l);
}

export function analyzeMeeting(notes) {
  const lines = String(notes || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const tasks = [];
  const decisions = [];
  for (const original of lines) {
    if (/^decision\s*:/i.test(original) || /^decisions\s*:/i.test(original)) {
      decisions.push(original.replace(/^decisions?\s*:\s*/i, "").trim());
      continue;
    }
    if (!isActionLine(original)) continue;
    const title = cleanTask(original);
    if (title.length < 4) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      title,
      owner: extractOwner(original),
      dueDate: extractDueDate(original),
      priority: inferPriority(original),
      status: "Open",
      sourceLine: original
    });
  }

  const lower = String(notes || "").toLowerCase();
  const summary = lines.slice(0, 3).join(" ").slice(0, 420) || "No meeting notes provided.";
  const missingOwners = tasks.filter(t => !t.owner);
  const missingDates = tasks.filter(t => !t.dueDate);
  const dateCounts = {};
  tasks.forEach(t => { if (t.dueDate) dateCounts[t.dueDate] = (dateCounts[t.dueDate] || 0) + 1; });
  const sharedDeadlines = Object.entries(dateCounts).filter(([, count]) => count > 1).map(([date, count]) => ({date, count}));
  const risks = [];
  if (missingOwners.length) risks.push(`${missingOwners.length} task(s) do not have a clear owner.`);
  if (missingDates.length) risks.push(`${missingDates.length} task(s) do not have a clear deadline.`);
  if (sharedDeadlines.length) risks.push(`Several tasks share deadlines: ${sharedDeadlines.map(x => `${x.date} (${x.count})`).join(", ")}.`);
  if (/\b(blocked|blocker|waiting for|depends on|dependency)\b/i.test(notes)) risks.push("The notes mention a blocker or dependency; confirm what must happen first.");
  if (/\b(urgent|asap|critical|immediately)\b/i.test(notes)) risks.push("Urgency language was detected; confirm priority with the meeting owner.");

  const followUp = [
    "Subject: Follow-up and action items",
    "",
    "Hi everyone,",
    "",
    "Thanks for the discussion. Here is the current action-item summary:",
    "",
    ...tasks.map((t, i) => `${i+1}. ${t.title}${t.owner ? ` — Owner: ${t.owner}` : " — Owner: TBD"}${t.dueDate ? ` — Due: ${t.dueDate}` : " — Due date: TBD"} [${t.priority} priority]`),
    "",
    decisions.length ? `Decisions:\n${decisions.map(d => `- ${d}`).join("\n")}` : "",
    "",
    "Please reply with any corrections, missing owners, or deadline changes.",
    "",
    "Best,"
  ].filter(Boolean).join("\n");

  return {summary, tasks, decisions, risks, followUp, stats:{taskCount:tasks.length, missingOwners:missingOwners.length, missingDates:missingDates.length, sharedDeadlines:sharedDeadlines.length}, detectedKeywords: ["meeting notes", ...["deadline","owner","decision","blocker"].filter(k => lower.includes(k))]};
}
