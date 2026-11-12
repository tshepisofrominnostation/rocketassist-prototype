/* RocketAssist — assistant behaviour. One conversation, persisted, with the
   reasoning available on demand instead of shouting over the chat. */
(function () {
  const $ = (s) => document.querySelector(s);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEY = "rocketassist.v2";
  const PROFILE_KEY = "rocketassist.customer";
  let CUSTOMER = null;

  let STATE = window.RocketDialog.newState();
  let MSG = [];            // {who, text, meta, card}
  let LAST = null;         // last analysis, for the drawer
  let busy = false;

  /* ---------- rendering ---------- */
  function bubble(m) {
    const wrap = document.createElement("div");
    wrap.className = m.who === "user" ? "flex justify-end" : "flex justify-start";
    const col = document.createElement("div");
    col.className = "max-w-[88%] space-y-1";

    const b = document.createElement("div");
    b.className = (m.who === "user" ? "bubble-user" : m.who === "agent" ? "bubble-agent" : "bubble-bot") +
      " rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap";
    b.textContent = m.text;
    col.appendChild(b);

    if (m.meta && m.who === "bot") {
      const meta = document.createElement("button");
      meta.className = "meta hover:underline";
      meta.textContent = m.meta.confidence + "% confident · " + (m.meta.intent || m.meta.route);
      meta.addEventListener("click", openDrawer);
      col.appendChild(meta);
    }
    if (m.card) col.appendChild(cardEl(m.card));
    wrap.appendChild(col);
    return wrap;
  }

  function cardEl(card) {
    const d = card.data || {};
    const el = document.createElement("div");
    el.className = "card mt-2 p-3.5";
    el.innerHTML =
      '<div class="flex items-center gap-2 mb-1.5">' +
        '<span class="chip v-escalate">Passed to an agent</span>' +
        (d.priority ? '<span class="meta">' + esc(d.priority) + ' priority</span>' : "") +
      "</div>" +
      '<p class="text-[12.5px] font-semibold">' + esc(d.owner || d.team || "Support team") + "</p>" +
      (d.ref ? '<p class="text-[11.5px] mut mt-0.5">Reference ' + esc(d.ref) + "</p>" : "") +
      (d.summary ? '<p class="text-[12px] mut mt-2 leading-relaxed">' + esc(d.summary) + "</p>" : "") +
      '<p class="text-[11px] dim mt-2">The agent receives this, so you won\'t repeat yourself.</p>';
    return el;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function showCustomerChat() {
  $("#customerDetails").hidden = true;
  $("#intro").hidden = false;
  $("#chat").hidden = false;
  $("#quick").hidden = false;
  $("#composer").hidden = false;
}

function showCustomerForm() {
  $("#customerDetails").hidden = false;
  $("#intro").hidden = true;
  $("#chat").hidden = true;
  $("#quick").hidden = true;
  $("#composer").hidden = true;
}

  function appendToTicket(message, customerReply) {
    if (!STATE.ticket || !window.RocketStore) return;

    window.RocketStore.appendTranscript(
      STATE.ticket,
      {
        who: message.who,
        text: message.text,
        at: new Date().toISOString()
      },
      { customerReply: Boolean(customerReply) }
    );

    if (window.RocketAgent) window.RocketAgent.badge();
  }

  function paint() {
    const chat = $("#chat");
    chat.innerHTML = "";
    MSG.forEach((m) => chat.appendChild(bubble(m)));
    scrollDown();
  }

  function scrollDown() { window.scrollTo({ top: document.body.scrollHeight, behavior: reduce ? "auto" : "smooth" }); }

  function typing() {
    const t = document.createElement("div");
    t.id = "typing";
    t.className = "flex justify-start";
    t.innerHTML = '<div class="bubble-bot rounded-2xl px-4 py-3 text-[13px]"><span class="typing"><i></i><i></i><i></i></span></div>';
    $("#chat").appendChild(t);
    scrollDown();
  }
  function untype() { const t = $("#typing"); if (t) t.remove(); }

  /* ---------- conversation ---------- */
  async function send(text) {
    const clean = String(text || "").trim();
    if (!clean || busy) return;
    busy = true;
    MSG.push({ who: "user", text: clean });

    if (STATE.escalated) {
      appendToTicket({who: "user", text: clean}, true);
    }

    paint();
    save();  // persist immediately: a reload mid-reply must not lose the question
    $("#quick").innerHTML = "";
    $("#msg").value = "";
    autosize();

    typing();
    const res = window.RocketDialog.respond(STATE, clean);
    STATE = res.state;
    if (res.result) LAST = res.result;
    await wait(reduce ? 80 : 380);
    untype();

    for (const line of res.say) {
      MSG.push({ who: "bot", text: "" });
      const node = bubble(MSG[MSG.length - 1]);
      node.querySelector(".bubble-bot").dataset.stream = "1";
      $("#chat").appendChild(node);
      await stream(node.querySelector(".bubble-bot"), line);
      MSG[MSG.length - 1].text = line;
      //Keep the ticket transcript synchronised after handover
      if (STATE.escalated && !res.card){
        appendToTicket({who: "bot", text: line}, false);
      }

      save();  // keep the transcript as it lands, not only at the end
    }
    if (res.card) {
      MSG.push({ who: "bot", text: "", card: res.card });
      $("#chat").appendChild(bubble(MSG[MSG.length - 1]));
      if (window.RocketStore) {
        const existingTicket = window.RocketStore.read().some(
        (ticket) => ticket.ref === STATE.ticket
        );

        if (!existingTicket) {
          window.RocketStore.create({
            ref: STATE.ticket,
            customer: CUSTOMER,
            owner: res.card.data.owner || res.card.data.team ||  "Support agent",
            priority: res.card.data.priority || "Normal",
            summary: res.card.data.summary || "",
            suburb: (LAST && LAST.entities && LAST.entities.suburb) || null,
            account: (LAST && LAST.entities && LAST.entities.account) || null,
            transcript: MSG
              .map((m) => ({
                who: m.who,
                text: m.text,
                at: new Date().toISOString()
              }))
              .filter((m) => m.text),
          });
        }
        if (window.RocketAgent) window.RocketAgent.badge();
      }
    }

    paint();
    paintQuick(res.quick || []);
    save();
    busy = false;
  }

  function stream(node, text) {
    return new Promise((resolve) => {
      if (reduce) { node.textContent = text; return resolve(); }
      let i = 0;
      const step = Math.max(1, Math.round(text.length / 22));
      const t = setInterval(() => {
        i += step;
        node.textContent = text.slice(0, i);
        if (i % (step * 4) === 0) scrollDown();
        if (i >= text.length) { clearInterval(t); node.textContent = text; resolve(); }
      }, 10);
    });
  }

  function paintQuick(list) {
    const wrap = $("#quick");
    wrap.innerHTML = "";
    list.forEach((q) => {
      const b = document.createElement("button");
      b.className = "ghost px-3 py-1.5 text-[12.5px]";
      b.textContent = q.label;
      b.addEventListener("click", () => send(String(q.send)));
      wrap.appendChild(b);
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- behind the scenes ---------- */
  function openDrawer() {
    const d = $("#drawer"), body = $("#drawerBody");
    d.hidden = false;
    $("#analystBtn").setAttribute("aria-pressed", "true");
    if (!LAST) { body.innerHTML = '<p class="text-[13px] mut">Send a message and I\'ll show how it was handled.</p>'; return; }
    const r = LAST;
    body.innerHTML =
      '<div class="card p-3.5"><p class="text-[11px] dim uppercase tracking-wide">Read as</p>' +
        '<p class="text-[14px] font-semibold mt-0.5">' + esc(r.intent.label) + " · " + Math.round(r.intent.confidence * 100) + "%</p>" +
        '<p class="text-[12px] mut mt-1">' + esc(r.decision.reason) + "</p></div>" +
      (r.trace || []).map((t) =>
        '<div class="card p-3.5"><p class="text-[11px] font-bold blue">' + esc(t.step) + '</p>' +
        '<p class="text-[12px] mut mt-1 leading-relaxed">' + esc(t.detail) + "</p></div>").join("") +
      '<div class="card p-3.5"><p class="text-[11px] font-bold ink mb-2">Guardrails</p>' +
        (r.guardrails || []).map((g) =>
          '<div class="flex items-start gap-2 py-1"><span class="chip ' + (g.status === "pass" ? "v-deflect" : "v-escalate") + '">' + esc(g.status) + "</span>" +
          '<span class="text-[11.5px] mut">' + esc(g.name) + "</span></div>").join("") + "</div>";
  }
  function closeDrawer() { $("#drawer").hidden = true; $("#analystBtn").setAttribute("aria-pressed", "false"); }

  /* ---------- project notes: use cases + evaluation ---------- */
  function openNotes() {
    const box = $("#casesBox");
    box.innerHTML = (typeof USE_CASES !== "undefined" ? USE_CASES : []).map((c) =>
      '<div class="card p-3.5">' +
        '<div class="flex items-center gap-2 mb-1"><span class="chip">' + esc(c.tag) + '</span><span class="meta">' + esc(c.from || "") + '</span></div>' +
        '<p class="text-[13px] font-semibold">' + esc(c.title) + '</p>' +
        field("Situation", c.situation) + field("What the customer gives", c.provides) +
        field("What the assistant does", c.ai) + field("Expected outcome", c.outcome) +
        field("When a person takes over", c.human) +
        '<button class="ghost px-3 py-1.5 text-[12px] mt-2" data-play="' + esc(c.message) + '">Play this in the chat</button>' +
      "</div>").join("");

    const E = typeof EVALUATION !== "undefined" ? EVALUATION : null;
    const list = (title, rows) => rows && rows.length
      ? '<div class="card p-3.5"><p class="text-[11px] font-bold blue uppercase tracking-wide">' + title + "</p>" +
        rows.map((r) => '<p class="text-[12.5px] mt-1.5"><span class="font-semibold">' + esc(r.title || r) + "</span>" +
          (r.body ? ' <span class="mut">' + esc(r.body) + "</span>" : "") + "</p>").join("") + "</div>"
      : "";
    $("#evalBox").innerHTML = E
      ? list("Benefits", E.benefits) + list("Limitations", E.limitations) + list("Ethical and privacy", E.ethics) +
        '<div class="card p-3.5"><p class="text-[11px] font-bold blue uppercase tracking-wide">Human oversight</p><ul class="mt-1.5 space-y-1 list-disc pl-4">' +
        (E.oversight || []).map((o) => '<li class="text-[12.5px] mut">' + esc(o) + "</li>").join("") + "</ul></div>" +
        '<div class="card p-3.5"><p class="text-[11px] font-bold blue uppercase tracking-wide">One recommendation</p><p class="text-[12.5px] mut mt-1">' + esc(E.recommendation) + "</p></div>"
      : "";

    box.querySelectorAll("[data-play]").forEach((b) =>
      b.addEventListener("click", () => { closeNotes(); reset(); setTimeout(() => send(b.dataset.play), 60); }));
    $("#notes").hidden = false;
  }
  function field(label, val) {
    return val ? '<p class="text-[12px] mut mt-2"><span class="font-semibold ink">' + label + ":</span> " + esc(val) + "</p>" : "";
  }
  function closeNotes() { $("#notes").hidden = true; }

  /* ---------- persistence ---------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ msg: MSG, state: STATE })); } catch (e) {}
  }
  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d.msg || !d.msg.length) return false;
      MSG = d.msg; STATE = Object.assign(window.RocketDialog.newState(), d.state || {});
      paint();
      return true;
    } catch (e) { return false; }
  }

  function reset() {
    MSG = [];
    STATE = window.RocketDialog.newState();
    LAST = null;

    localStorage.removeItem(KEY);

    paint();
    paintQuick([]);
    $("#msg").value = "";
    closeDrawer();

    if (CUSTOMER) {
      showCustomerChat();
    } else {
      showCustomerForm();
    }
  }

  /* ---------- input ---------- */
  function autosize() {
    const t = $("#msg");
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 128) + "px";
  }

  function boot() {
        $("#customerDetailsForm").addEventListener("submit", (e) => {
      e.preventDefault();

      CUSTOMER = {
        fullName: $("#customerName").value.trim(),
        phone: $("#customerPhone").value.trim(),
        email: $("#customerEmail").value.trim(),
        suburb: $("#customerSuburb").value.trim()
      };

      if (!CUSTOMER.fullName || !CUSTOMER.phone ||
          !CUSTOMER.email || !CUSTOMER.suburb) {
        return;
      }

      localStorage.setItem(PROFILE_KEY, JSON.stringify(CUSTOMER));

      showCustomerChat();
      paint();
      scrollDown();
    });

    $("#composer").addEventListener("submit", (e) => { e.preventDefault(); send($("#msg").value); });
    $("#msg").addEventListener("input", autosize);
    $("#msg").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("#msg").value); }
    });
    $("#newChat").addEventListener("click", reset);
    $("#notesBtn").addEventListener("click", openNotes);
    $("#notesClose").addEventListener("click", closeNotes);
    $("#analystBtn").addEventListener("click", () => ($("#drawer").hidden ? openDrawer() : closeDrawer()));
    $("#drawerClose").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeNotes(); } });

    const intro = [
      "My internet is dead since this morning",
      "Do you cover Observatory?",
      "I want fibre installed",
      "Why was I billed after cancelling?",
    ];
    const iq = $("#introQuick");
    intro.forEach((t) => {
      const b = document.createElement("button");
      b.className = "ghost px-3 py-1.5 text-[12.5px]";
      b.textContent = t;
      b.addEventListener("click", () => send(t));
      iq.appendChild(b);
    });

    // Voice input, when the browser offers it. Degrades silently otherwise.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = $("#mic");
    if (!SR) { mic.style.display = "none"; }
    else {
      mic.addEventListener("click", () => {
        const r = new SR();
        r.lang = "en-ZA"; r.interimResults = false;
        r.onresult = (e) => { $("#msg").value = e.results[0][0].transcript; autosize(); send($("#msg").value); };
        r.start();
      });
    }

        // Restore saved customer details.
    try {
      const savedCustomer = localStorage.getItem(PROFILE_KEY);
      CUSTOMER = savedCustomer ? JSON.parse(savedCustomer) : null;
    } catch (e) {
      CUSTOMER = null;
    }

    if (CUSTOMER) {
      showCustomerChat();

      if (restore()) {
        $("#intro").hidden = true;
      }
    } else {
      showCustomerForm();
    }

    autosize();
  }

  function showView(which) {
    const agent = which === "agent";
    $("#viewCustomer").hidden = agent;
    $("#viewAgent").hidden = !agent;
    $("#composer").style.display = agent ? "none" : "";
    $("#tabCustomer").setAttribute("aria-selected", String(!agent));
    $("#tabAgent").setAttribute("aria-selected", String(agent));
    if (agent && window.RocketAgent) window.RocketAgent.paint();
  }

  // an agent replying in another tab shows up here without a reload
  window.addEventListener("storage", (e) => {
    if (e.key !== "rocketassist.v2" || !e.newValue) return;
    try {
      const d = JSON.parse(e.newValue);
      if (Array.isArray(d.msg)) { MSG = d.msg; paint(); scrollDown(); }
    } catch (err) { }
  });

  window.RocketUI = { reset, send, showView };
  document.addEventListener("DOMContentLoaded", () => {
    boot();
    const c = $("#tabCustomer"), a = $("#tabAgent");
    if (c) c.addEventListener("click", () => showView("customer"));
    if (a) a.addEventListener("click", () => showView("agent"));
  });
})();
