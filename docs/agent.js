/* Agent desk: the human side. Tickets arrive from the customer chat,
   the assistant proposes a draft, the person decides what goes out. */
(function (root) {
  const CHAT_KEY = "rocketassist.v2";
  let selected = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };

  function draftFor(t) {
    const where = t.suburb ? " in " + t.suburb : "";
    const acct = t.account ? " " + t.account : "";
    if (t.owner === "Billing team") {
      return "Hi, I have account" + acct + " open in front of me. The final invoice covers the days up to the date the line was cancelled, which is why a charge still appears. I am confirming the exact amount and the credit, and you will have that in writing today. If the numbers do not match what you were told, reply here and I will correct it.";
    }
    if (t.owner === "Network operations") {
      return "Hi, thank you for the detail - it saved us a call. I have picked up the fault" + where + " and attached your line test to the job. A technician has been assigned and you will get an SMS with a two-hour window before anyone arrives. Please leave the router powered on.";
    }
    if (t.owner === "Sales") {
      return "Hi, thanks for your patience. Your street needs a quick site survey before we can promise an installation date, so I have booked that and will come back to you with a confirmed slot. There is no charge for the survey and no obligation.";
    }
    return "Hi, I have read the whole conversation so you do not need to repeat yourself. I am looking into this now and will come back to you shortly with a clear answer.";
  }

  function addToCustomerChat(text) {
    let box = { msg: [], state: {} };
    try { box = JSON.parse(localStorage.getItem(CHAT_KEY) || "{}") || box; } catch (e) { }
    box.msg = box.msg || [];
    box.msg.push({ who: "agent", text: text, at: new Date().toISOString() });
    localStorage.setItem(CHAT_KEY, JSON.stringify(box));
  }

  function queueRow(t) {
    const active = selected === t.id;
    const chip = t.priority === "Urgent" ? "v-escalate" : "v-convert";
    return '<button class="w-full text-left card-2 p-3 ' + (active ? "ring-1" : "") + '" data-ticket="' + t.id + '" style="' + (active ? "border-color:var(--blue-deep)" : "") + '">' +
      '<div class="flex items-center gap-2"><span class="badge ' + chip + '">' + esc(t.owner) + "</span>" +
      '<span class="meta ml-auto">' + esc(when(t.createdAt)) + "</span></div>" +
      '<p class="text-[12.5px] font-semibold mt-1.5">' + esc(t.ref) + " · " + esc(t.priority) + " priority</p>" +
      '<p class="text-[11.5px] mut mt-0.5">' + esc((t.suburb || t.account || "No reference") ) + " · " + esc(t.status) + "</p></button>";
  }

  function detail(t) {
    const lines = (t.transcript || []).map((m) =>
      '<div class="text-[12px] ' + (m.who === "user" ? "ink" : "mut") + '"><span class="meta">' + (m.who === "user" ? "Customer" : "Assistant") + "</span><br>" + esc(m.text) + "</div>").join("");
    return '<div class="card p-4">' +
      '<div class="flex items-center gap-2 flex-wrap"><h3 class="text-[14px] font-bold">' + esc(t.ref) + "</h3>" +
      '<span class="badge v-convert">' + esc(t.owner) + "</span>" +
      '<button id="resolveBtn" class="ghost ml-auto px-3 py-1.5 text-[11.5px]">Mark resolved</button></div>' +
      '<p class="text-[12px] mut mt-2">' + esc(t.summary || "") + "</p>" +
      '<div class="mt-3 space-y-1.5 max-h-[150px] overflow-auto pr-1">' + lines + "</div>" +
      '<label class="block text-[11px] font-semibold mt-4 mb-1" for="draft">Suggested reply <span class="mut font-normal">(edit before sending)</span></label>' +
      '<textarea id="draft" rows="5" class="w-full rounded-xl p-2.5 text-[12.5px] leading-relaxed" style="border:1px solid var(--line);background:var(--surface-2)">' + esc(t.draft || draftFor(t)) + "</textarea>" +
      '<div class="flex items-center gap-2 mt-2"><button id="sendReply" class="rounded-xl px-3.5 py-2 text-[12px] font-semibold" style="background:var(--blue-deep);color:#fff">Send to customer</button>' +
      '<span class="meta">Approved content only · no dates promised</span></div>' +
      (t.replies && t.replies.length ? '<p class="meta mt-2">Sent: ' + esc(t.replies[t.replies.length - 1].text.slice(0, 60)) + "…</p>" : "") +
      "</div>";
  }

  function paint() {
    const list = root.RocketStore.read();
    const q = document.getElementById("queue");
    const d = document.getElementById("ticketDetail");
    if (!q || !d) return;
    q.innerHTML = list.length ? list.map(queueRow).join("") :
      '<p class="text-[12.5px] mut">No handovers yet. In the customer view, ask to cancel, ask for a human, or ask about a bill — the assistant hands it over and the ticket lands here.</p>';
    const t = list.find((x) => x.id === selected) || list[0];
    if (!t) { d.innerHTML = ""; return; }
    selected = t.id;
    d.innerHTML = detail(t);
    document.querySelectorAll("[data-ticket]").forEach((b) =>
      b.addEventListener("click", () => { selected = b.dataset.ticket; paint(); }));
    const send = document.getElementById("sendReply");
    if (send) send.addEventListener("click", () => {
      const text = document.getElementById("draft").value.trim();
      if (!text) return;
      const ticket = root.RocketStore.get(selected);
      root.RocketStore.update(selected, {
        status: "replied",
        replies: (ticket.replies || []).concat({ text: text, at: new Date().toISOString() }),
        draft: text,
      });
      addToCustomerChat(text);
      paint();
      badge();
    });
    const res = document.getElementById("resolveBtn");
    if (res) res.addEventListener("click", () => { root.RocketStore.update(selected, { status: "resolved" }); paint(); badge(); });
  }

  function badge() {
    const b = document.getElementById("agentCount");
    if (!b) return;
    const n = root.RocketStore.openCount();
    b.textContent = n ? String(n) : "";
    b.hidden = !n;
  }

  root.RocketAgent = { paint, badge };
  document.addEventListener("DOMContentLoaded", () => { paint(); badge(); });
  root.RocketStore && root.RocketStore.subscribe(() => { paint(); badge(); });
})(window);
