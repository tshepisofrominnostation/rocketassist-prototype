/* RocketAssist prototype UI: tabs, chat playback and the analyst panel. */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; return n; };

const METRICS = { handled: 0, deflect: 0, convert: 0, escalate: 0, replyMs: 0 };
let busy = false;

/* ---------- tabs ---------- */
const TABS = ["prototype", "how", "cases", "eval"];
function showTab(name) {
  TABS.forEach((t) => {
    const btn = document.querySelector(`[data-tab="${t}"]`);
    const panel = document.getElementById(`p-${t}`);
    const on = t === name;
    if (btn) btn.setAttribute("aria-selected", on ? "true" : "false");
    if (panel) panel.classList.toggle("hide", !on);
  });
  if (history.replaceState) history.replaceState(null, "", `#${name}`);
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

/* ---------- chat ---------- */
function bubble(text, who) {
  const row = el("div", `flex ${who === "user" ? "justify-end" : "justify-start"}`);
  const b = el("div", `max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${who === "user" ? "bubble-user" : "bubble-bot"}`);
  b.textContent = text;
  row.appendChild(b);
  $("#chat").appendChild(row);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return row;
}

function typing() {
  const row = el("div", "flex justify-start");
  const b = el("div", "bubble-bot rounded-2xl px-3.5 py-2.5 flex gap-1 items-center");
  b.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  row.appendChild(b);
  $("#chat").appendChild(row);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return row;
}

function stamp() {
  const d = new Date();
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function renderAnalyst(r) {
  const v = $("#verdict");
  v.className = `badge v-${r.decision.verdict}`;
  v.textContent = r.decision.verdict === "deflect" ? "answered" : r.decision.verdict === "convert" ? "booked" : "handed over";

  $("#confidence").classList.remove("hide");
  const pct = Math.round(r.intent.confidence * 100);
  $("#conf-val").textContent = `${pct}% · ${r.intent.label}`;
  $("#conf-bar").style.width = `${pct}%`;

  const trace = $("#trace");
  trace.innerHTML = "";
  r.trace.forEach((s) => {
    const li = el("li", "text-[12px]");
    li.innerHTML = `<p class="gold text-[10.5px] uppercase tracking-wide mb-0.5">${s.step}</p><p class="mut leading-relaxed">${s.detail}</p>`;
    trace.appendChild(li);
  });

  const guards = $("#guards");
  guards.innerHTML = "";
  r.guardrails.forEach((g) => {
    const li = el("li", "flex gap-2");
    const mark = g.status === "pass" ? "✓" : g.status === "block" ? "✕" : "→";
    const cls = g.status === "pass" ? "g-pass" : g.status === "block" ? "g-block" : "g-escalate";
    li.innerHTML = `<span class="${cls} font-bold w-3 shrink-0">${mark}</span><span><span class="ink">${g.name}</span><span class="dim"> — ${g.detail}</span></span>`;
    guards.appendChild(li);
  });

  const kb = $("#knowledge");
  kb.innerHTML = "";
  r.knowledge.forEach((k) => {
    const li = el("li", "");
    li.innerHTML = `<span class="ink">${k.title}</span><span class="dim"> — ${k.detail}</span>`;
    kb.appendChild(li);
  });

  const card = $("#handover-card");
  if (r.handover) {
    card.classList.remove("hide");
    $("#handover").innerHTML = `
      <p class="text-[11px] mut mb-2">The agent receives this, so the customer never repeats themselves.</p>
      <div class="space-y-1.5 text-[12px]">
        <p><span class="dim">Team</span> <span class="ink">${r.handover.owner}</span></p>
        <p><span class="dim">Priority</span> <span class="${r.handover.priority === "Urgent" ? "g-block" : "ink"}">${r.handover.priority}</span></p>
        <p class="mut leading-relaxed">${r.handover.summary}</p>
      </div>`;
  } else {
    card.classList.add("hide");
  }
}

function renderMetrics() {
  const avg = METRICS.handled ? (METRICS.replyMs / METRICS.handled / 1000).toFixed(1) : "0.0";
  const box = $("#metrics");
  box.innerHTML = "";
  [
    ["Messages handled", METRICS.handled, "ink"],
    ["Answered without a person", METRICS.deflect, "olive"],
    ["Enquiries booked", METRICS.convert, "gold"],
    ["Handed to a person", METRICS.escalate, "terra"],
  ].forEach(([label, val, cls]) => {
    const c = el("div", "card px-4 py-3");
    c.innerHTML = `<p class="text-[20px] font-semibold ${cls} leading-none">${val}</p><p class="text-[10.5px] mut mt-1">${label}</p>`;
    box.appendChild(c);
  });
  const note = el("p", "text-[10.5px] dim col-span-2 sm:col-span-4");
  note.textContent = `Average simulated reply time ${avg}s. These counters describe this demonstration session only, not RocketNet's support operation.`;
  box.appendChild(note);
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true;
  $("#msg").value = "";
  bubble(text, "user");
  const think = typing();

  const started = performance.now();
  const result = window.RocketAssist.analyse(text);

  await new Promise((r) => setTimeout(r, 620));
  think.remove();

  for (let i = 0; i < result.reply.length; i++) {
    bubble(result.reply[i], "bot");
    await new Promise((r) => setTimeout(r, 230));
  }

  METRICS.handled += 1;
  METRICS.replyMs += performance.now() - started + 900;
  METRICS[result.decision.verdict] += 1;

  renderAnalyst(result);
  renderMetrics();
  busy = false;
}

/* ---------- scenarios ---------- */
function renderScenarios() {
  const box = $("#scenarios");
  box.innerHTML = "";
  USE_CASES.forEach((c) => {
    const b = el("button", "chip", c.tag + " · " + c.id);
    b.addEventListener("click", () => send(c.message));
    box.appendChild(b);
  });
  const human = el("button", "chip", "asks for a person");
  human.addEventListener("click", () => send("I want to speak to an actual human please"));
  box.appendChild(human);
}

/* ---------- use cases ---------- */
function renderCases() {
  const box = $("#cases");
  box.innerHTML = "";
  USE_CASES.forEach((c, i) => {
    const card = el("div", "card p-5 flex flex-col");
    const rows = [
      ["The situation", c.situation],
      ["What the customer provides", c.provides],
      ["What the AI does", c.ai],
      ["Expected outcome", c.outcome],
      ["When a person takes over", c.human],
    ];
    card.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="text-[10px] gold tracking-widest">0${i + 1}</span>
        <span class="badge" style="background:rgba(217,164,65,.14);color:#e6c07c">${c.tag}</span>
      </div>
      <h3 class="text-[13.5px] font-semibold mb-3">${c.title}</h3>
      <div class="space-y-2.5 text-[12px] flex-1">
        ${rows.map(([k, v]) => `<div><p class="dim text-[10px] uppercase tracking-wide mb-0.5">${k}</p><p class="mut leading-relaxed">${v}</p></div>`).join("")}
      </div>
      <button class="mt-4 w-full rounded-xl py-2 text-[12px] font-semibold" style="background:#2c2018;border:1px solid var(--line);color:#e6c07c">Run this in the prototype</button>`;
    card.querySelector("button").addEventListener("click", () => {
      showTab("prototype");
      $("#chat").innerHTML = "";
      setTimeout(() => send(c.message), 250);
    });
    box.appendChild(card);
  });
}

/* ---------- how it works ---------- */
function renderHow() {
  const steps = [
    ["Read the message", "A language model works out what the customer actually wants: a fault, a bill, a booking, or a cancellation. This is the only step where wording is guessed at, which is why it carries the confidence score."],
    ["Pull what is specific", "Suburb, account reference, package, address. Nothing else is collected, because data that is never gathered cannot leak."],
    ["Answer from approved content only", "Prices, coverage and outage detail come from the knowledge base and the live status feed. The assistant has no memory to invent a price from."],
    ["Check itself before replying", "Six guardrails run on every reply: approved prices, no promised dates, identity before account detail, money-moving actions, data minimisation, and telling the customer it is an AI."],
    ["Answer, act, or hand over", "Below 55% confidence, or on any mandatory handover trigger, a person takes the thread with a written summary attached."],
  ];
  const box = $("#pipeline");
  box.innerHTML = "";
  steps.forEach(([title, body], i) => {
    const row = el("div", "flex gap-3");
    row.innerHTML = `
      <div class="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold" style="background:#2c2018;color:#e6c07c;border:1px solid var(--line)">${i + 1}</div>
      <div class="min-w-0"><p class="text-[12.5px] font-medium ink">${title}</p><p class="text-[12px] mut leading-relaxed">${body}</p></div>`;
    box.appendChild(row);
  });

  const guards = [
    ["Approved price list", "It may only quote figures that exist in the approved list."],
    ["No promised dates", "It offers installation slots; it never guarantees a date."],
    ["Identity before account access", "No account detail without verification."],
    ["Money-moving actions", "Refunds and credits leave the assistant, always."],
    ["POPIA data minimisation", "It never asks for ID numbers or card details in chat."],
    ["Told it is an AI", "The customer is told, and can reach a person at any point."],
  ];
  const gl = $("#guard-list");
  gl.innerHTML = "";
  guards.forEach(([name, body]) => {
    const li = el("li", "");
    li.innerHTML = `<span class="olive font-bold">✓</span> <span class="ink">${name}</span><span class="dim"> — ${body}</span>`;
    gl.appendChild(li);
  });
}

/* ---------- evaluation ---------- */
function renderEval() {
  const fill = (id, items) => {
    const box = $(id);
    box.innerHTML = "";
    items.forEach((it) => {
      const d = el("div", "card-2 p-3.5");
      d.innerHTML = `<p class="text-[12.5px] font-medium ink mb-1">${it.title}</p><p class="text-[12px] mut leading-relaxed">${it.body}</p>`;
      box.appendChild(d);
    });
  };
  fill("#benefits", EVALUATION.benefits);
  fill("#limits", EVALUATION.limitations);
  fill("#ethics", EVALUATION.ethics);

  const ol = $("#oversight");
  ol.innerHTML = "";
  EVALUATION.oversight.forEach((o) => {
    const li = el("li", "flex gap-2 text-[12px]");
    li.innerHTML = `<span class="gold font-bold shrink-0">·</span><span class="mut leading-relaxed">${o}</span>`;
    ol.appendChild(li);
  });

  $("#recommendation").innerHTML = `<p class="text-[12.5px] font-medium ink mb-1">${EVALUATION.recommendation.title}</p><p class="text-[12px] mut leading-relaxed">${EVALUATION.recommendation.body}</p>`;
}

/* ---------- boot ---------- */
function boot() {
  renderScenarios();
  renderCases();
  renderHow();
  renderEval();
  renderMetrics();

  const opening = [
    "Hi, you are chatting with RocketAssist, RocketNet's AI assistant. I can check outages, explain a bill, or book an installation.",
    "If you would rather speak to a person, say “human” at any time and I will hand you over.",
  ];
  opening.forEach((t) => bubble(t, "bot"));

  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send($("#msg").value);
  });
  $("#reset").addEventListener("click", () => {
    $("#chat").innerHTML = "";
    opening.forEach((t) => bubble(t, "bot"));
    $("#verdict").className = "badge v-deflect";
    $("#verdict").textContent = "waiting";
    $("#confidence").classList.add("hide");
    $("#trace").innerHTML = "";
    $("#guards").innerHTML = "";
    $("#knowledge").innerHTML = "";
    $("#handover-card").classList.add("hide");
    Object.assign(METRICS, { handled: 0, deflect: 0, convert: 0, escalate: 0, replyMs: 0 });
    renderMetrics();
  });

  const hash = (location.hash || "").replace("#", "");
  showTab(TABS.includes(hash) ? hash : "prototype");
}

document.addEventListener("DOMContentLoaded", boot);
