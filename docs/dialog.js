/* RocketAssist — dialogue manager.
   Turns the one-shot classifier into a conversation: it asks for the one thing it
   is missing instead of guessing, and remembers it for the next turn. */
(function (root) {
  const A = () => root.RocketAssist;
  const SUBURBS = () => Object.keys(typeof COVERAGE !== "undefined" ? COVERAGE : {});

  function newState() {
    return { slots: {}, awaiting: null, pending: null, escalated: false, ticket: null, turns: 0 };
  }

  const GREETING = /^(hi|hey|hello|good morning|good afternoon|good day|yo)\b/i;
  const THANKS = /^(thanks|thank you|thank u|great|perfect|awesome|cheers)\b/i;

  function suburbFrom(text) {
    const lower = text.toLowerCase();
    const hit = SUBURBS().find((s) => lower.includes(s.toLowerCase()));
    return hit || null;
  }

  function ticketRef() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return "RA-2026-" + n;
  }

  function quick(list) {
    return list.map((l) => ({ label: l, send: l }));
  }

  /* One assistant turn. Returns what to say, what to offer next, and the state. */
  function respond(state, text) {
    const lower = String(text || "").toLowerCase().trim();
    state.turns += 1;

    // Small talk: an assistant should acknowledge before it interrogates.
    if (!state.escalated && GREETING.test(lower) && lower.length < 26 && !state.awaiting) {
      return {
        say: ["Hi, I'm RocketAssist, RocketNet's support assistant. I can check whether your area has a fault, find out if we cover your street, book an installation, or explain a charge."],
        quick: quick(["My line is down", "Am I covered?", "Book an installation", "Explain my bill"]),
        state, meta: null, card: null
      };
    }
    if (THANKS.test(lower) && lower.length < 24 && !state.awaiting) {
      return { say: ["Any time. If something else comes up, I'm here.", "If you'd rather talk to a person, just say \u201chuman\u201d."], quick: [], state, meta: null, card: null };
    }

    if (state.escalated && !/human|agent|person/.test(lower)) {
      return {
        say: ["Your chat is already with " + (state.lastTeam || "the support team") + ", reference " + (state.ticket || "") + ".",
              "Anything you type here joins that conversation, so you won't have to explain it twice. A person will reply shortly."],
        quick: [{ label: "Thanks, I'll wait", send: "thanks" }],
        state, meta: null, card: null
      };
    }

    // If we asked for a detail last turn, this message is probably that answer.
    let combined = text;
    if (state.awaiting === "suburb") {
      const found = suburbFrom(text);
      if (!found) {
        return {
          say: ["I couldn't match \"" + String(text).slice(0, 40) + "\" to a suburb we serve, and I don't want to guess about your line.", "I'm passing you to a person who can check the coverage map properly."],
          quick: [], state, meta: null,
          card: { type: "handover", data: { team: "Coverage team", priority: "Normal", summary: "Suburb not recognised in coverage list: \u201c" + String(text).slice(0, 40) + "\u201d. Customer request: " + state.pending.text } }
        };
      }
      state.slots.suburb = found;
      combined = state.pending.text + " in " + found;
      state.awaiting = null;
    } else if (state.awaiting === "account") {
      const acct = (String(text).match(/RA-?\d{3,}/i) || [])[0];
      if (!acct) {
        return {
          say: ["I need the account number to look at a bill, because I won't discuss an account without it. It starts with RA- and appears on your invoice."],
          quick: quick(["I don't have it", "Speak to a human"]), state, meta: null, card: null
        };
      }
      state.slots.account = acct.toUpperCase().replace(/^RA(?!-)/, "RA-");
      combined = state.pending.text + " account " + state.slots.account;
      state.awaiting = null;
    }

    const result = A().analyse(combined);
    const ent = result.entities || {};
    if (ent.suburb) state.slots.suburb = ent.suburb;
    if (ent.account) state.slots.account = ent.account;

    // Missing detail: ask once, with buttons, rather than making the customer type.
    if (result.decision.verdict === "escalate" && result.decision.kind === "missing_suburb") {
      state.awaiting = "suburb";
      state.pending = { text: combined };
      return {
        say: [result.reply[0] + " " + result.reply[1]],
        quick: quick(SUBURBS().slice(0, 5).map((x) => x.charAt(0).toUpperCase() + x.slice(1))), state,
        meta: { confidence: result.intent.confidence, route: "needs one detail" }, card: null
      };
    }

    if (result.decision.kind === "missing_account") {
      state.awaiting = "account";
      state.pending = { text: combined };
      return {
        say: result.reply.slice(),
        quick: quick(["I don't have it", "Talk to a human"]), state,
        meta: { confidence: result.intent.confidence, route: "needs one detail" }, card: null
      };
    }

    const say = result.reply.slice();
    let card = null;
    if (result.handover) {
      state.escalated = true;
      state.lastTeam = result.handover.owner || result.handover.team;
      state.ticket = state.ticket || ticketRef();
      card = { type: "handover", data: Object.assign({ ref: state.ticket }, result.handover) };
    }
    const meta = { confidence: result.intent.confidence, intent: result.intent.label, route: result.decision.verdict };
    return { say, quick: nextQuick(result), state, meta, card, result };
  }

  function nextQuick(result) {
    if (result.decision.verdict === "escalate") return quick(["Talk to a human", "That's all, thanks"]);
    if (result.decision.verdict === "convert") return quick(["Book that slot", "What's included?"]);
    if (result.decision.verdict === "deflect") return quick(["It's still down", "Talk to a human"]);
    return quick(["Talk to a human"]);
  }

  root.RocketDialog = { newState, respond, suburbFrom, ticketRef };
})(window);
