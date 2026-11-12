
/* RocketAssist — dialogue manager. */
(function (root) {
  const A = () => root.RocketAssist;
  const SUBURBS = () =>
    Object.keys(typeof COVERAGE !== "undefined" ? COVERAGE : {});

  function newState() {
    return {
      slots: {},
      awaiting: null,
      pending: null,
      escalated: false,
      ticket: null,
      turns: 0,
      lastTeam: null,
      lastTopic: null
    };
  }

  const GREETING = /^(hi|hey|hello|good morning|good afternoon|good day|yo)\b/i;

  const THANKS =
    /^(thanks|thank you|thank u|great|perfect|awesome|cheers|okay|ok|got it|that's all|that is all|all good|i'll wait|ill wait)([.!,\s].*)?$/i;

  const NO_ACCOUNT =
    /\b(i don't have it|i do not have it|don't have my account|no account number|can't find it|cannot find it|i forgot it|not sure)\b/i;

  const AGENT_REQUEST =
    /\b(agent|speak to someone|speak to an agent|talk to someone|talk to an agent|real person|call me|manager)\b/i;

  const BILLING_QUERY =
    /\b(bill|billed|billing|invoice|charge|charged|debit|refund|payment|cancelled|canceled)\b/i;

  const PACKAGE_FOLLOW_UP =
    /\b(what's included|what is included|whats included|what does it include|what do i get|included in the package|package details)\b/i;

  function suburbFrom(text) {
    const lower = String(text || "").toLowerCase();
    return SUBURBS().find((s) => lower.includes(s.toLowerCase())) || null;
  }

  function ticketRef() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return "RA-2026-" + n;
  }

  function createHandover(state, data) {
    state.escalated = true;
    state.lastTeam = data.owner || data.team || "Support agent";
    state.ticket = state.ticket || ticketRef();

    return {
      type: "handover",
      data: Object.assign({ ref: state.ticket }, data)
    };
  }

  function quick(list) {
    return list.map((label) => ({ label, send: label }));
  }

  function handoverForBilling(state, identifier, originalText) {
    state.awaiting = null;
    state.pending = null;

    const card = createHandover(state, {
      owner: "Billing team",
      priority: "Normal",
      summary:
        "Billing query requires secure identity verification. Customer supplied verification reference: " +
        identifier +
        ". Original query: " +
        String(originalText || "").slice(0, 180)
    });

    return {
      say: [
        "Thank you. I've passed your billing query to our billing team.",
        "They will securely verify your details before discussing the account or explaining the charge. Your reference is " +
          (state.ticket || "being generated") + "."
      ],
      quick: quick(["Thanks, I'll wait", "That's all, thanks"]),
      state,
      meta: null,
      card
      };
  }

  function packageDetails() {
    if (typeof PACKAGES === "undefined" || !PACKAGES.length) {
      return [
        "I can help explain the packages, but I don't have the package details available right now."
      ];
    }

    return [
      "Here are the package details:",
      ...PACKAGES.map((p) => {
        return p.name + " — R" + p.price + " per month. " + p.note + ".";
      }),
      "All package prices shown are monthly. Would you like help choosing a package?"
    ];
  }

  function respond(state, text) {
    const message = String(text || "").trim();
    const lower = message.toLowerCase();
    state.turns += 1;

    // Acknowledge thanks before checking the handover state.
    if (THANKS.test(lower) && !state.awaiting) {
      if (state.escalated) {
        return {
          say: [
            "You're welcome. Your message is with " +
              (state.lastTeam || "our support team") +
              ". They'll continue the conversation here."
          ],
          quick: [],
          state,
          meta: null,
          card: null
        };
      }

      return {
        say: ["You're welcome. Let me know if you need anything else."],
        quick: [],
        state,
        meta: null,
        card: null
      };
    }

    // After handover, never create another handover for the same conversation.
    if (state.escalated) {
      return {
        say: [
          "I've added your message to the existing conversation with " +
            (state.lastTeam || "our support team") +
            ". Your reference is " +
            (state.ticket || "") +
            "."
        ],
        quick: quick(["Thanks, I'll wait", "That's all, thanks"]),
        state,
        meta: null,
        card: null
      };
    }

    // Greeting.
    if (GREETING.test(lower) && lower.length < 26 && !state.awaiting) {
      return {
        say: [
          "Hi, I'm RocketAssist, RocketNet's support assistant. I can check network faults, confirm coverage, explain packages, help with installations, or direct billing queries to our team."
        ],
        quick: quick([
          "My line is down",
          "Am I covered?",
          "What packages do you offer?",
          "Explain my bill"
        ]),
        state,
        meta: null,
        card: null
      };
    }

    // Package follow-up: retain the context instead of treating this as a new intent.
    if (PACKAGE_FOLLOW_UP.test(lower) && state.lastTopic === "packages") {
      return {
        say: packageDetails(),
        quick: quick(["Compare the packages", "Book a slot"]),
        state,
        meta: null,
        card: null
      };
    }

    // Billing: never disclose account-specific information in the automated flow.
    if (state.awaiting === "billing_identifier") {
      const account =
        (message.match(/\bRA-?\d{3,}\b/i) || [])[0];

      const email =
        (message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0];

      const phone =
        (message.match(/(?:\+27|0)\s?\d{2}\s?\d{3}\s?\d{4}\b/) || [])[0];

      if (account || email || phone) {
        const identifier = account || email || phone;
        const original =
          state.pending && state.pending.text
            ? state.pending.text
            : "Customer billing query";

        return handoverForBilling(state, identifier, original);
      }

      if (
        NO_ACCOUNT.test(lower) ||
        lower.includes("phone") ||
        lower.includes("email") ||
        lower.includes("provide my")
      ) {
        state.awaiting = "billing_identifier";

        return {
          say: [
            "No problem. Please type the phone number or email address registered to your RocketNet account.",
            "An agent will securely verify your details before discussing the charge."
          ],
          quick: quick(["Talk to an agent", "That's all, thanks"]),
          state,
          meta: null,
          card: null
        };
      }

      if (AGENT_REQUEST.test(lower)) {
        const original =
          state.pending && state.pending.text
            ? state.pending.text
            : "Customer requested billing assistance";

        return {
          say: [
            "Of course. I'll pass your billing query to an agent. They'll verify your identity before discussing account details."
          ],
          quick: [],
          state,
          meta: null,
          card: createHandover(state, {
            owner: "Billing team",
            priority: "Normal",
            summary: "Billing query requires secure identity verification. " + original
          })
        };
      }

      return {
        say: [
          "I can use either the account number or the phone number or email address registered to the account.",
          "If you don't have those details available, I can pass the query to a billing agent for assistance."
        ],
        quick: quick(["I don't have it", "Talk to an agent"]),
        state,
        meta: null,
        card: null
      };
    }

    // Start the billing verification flow before the engine can produce a bill explanation.
    if (BILLING_QUERY.test(lower)) {
      state.awaiting = "billing_identifier";
      state.pending = { text: message };

      const account =
        (message.match(/\bRA-?\d{3,}\b/i) || [])[0];

      const email =
        (message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0];

      const phone =
        (message.match(/(?:\+27|0)\s?\d{2}\s?\d{3}\s?\d{4}\b/) || [])[0];

      if (account || email || phone) {
        return handoverForBilling(state, account || email || phone, message);
      }

      return {
        say: [
          "I can help direct your billing query to the right team.",
          "For security, an agent must verify your identity before discussing account-specific charges. Do you have your account number, or the phone number or email address registered to the account?"
        ],
        quick: quick(["I don't have it", "Talk to an agent"]),
        state,
        meta: null,
        card: null
      };
    }

    // If the customer was asked for a suburb, use their answer with the original query.
    let combined = message;

    if (state.awaiting === "suburb") {
      const found = suburbFrom(message);

      if (!found) {
        const original =
          state.pending && state.pending.text
            ? state.pending.text
            : "Customer requested a network or coverage check";

        state.awaiting = null;

        return {
          say: [
            "I couldn't match that to a suburb in our coverage list, so I don't want to guess.",
            "I'm passing this to our coverage team so they can check it properly."
          ],
          quick: [],
          state,
          meta: null,
          card: createHandover(state, {
            owner: "Coverage team",
            priority: "Normal",
            summary: "Suburb not recognised: " + message.slice(0, 60) + ". Original request: " + original
          })
        };
      }

      state.slots.suburb = found;
      combined =
        (state.pending && state.pending.text ? state.pending.text : "") +
        " in " +
        found;
      state.awaiting = null;
      state.pending = null;
    }

    const result = A().analyse(combined);
    const ent = result.entities || {};

    if (ent.suburb) state.slots.suburb = ent.suburb;
    if (ent.account) state.slots.account = ent.account;

    if (
      result.decision.verdict === "escalate" &&
      result.decision.kind === "missing_suburb"
    ) {
      state.awaiting = "suburb";
      state.pending = { text: combined };

      return {
        say: ["Which suburb are you in? I need that to check the correct network or coverage information."],
        quick: quick(SUBURBS().slice(0, 5)),
        state,
        meta: null,
        card: null
      };
    }

    const say = result.reply.slice();
    let card = null;

    if (result.decision.kind === "install" || result.decision.kind === "survey") {
      state.lastTopic = "packages";
    }

    if (result.handover) {
      card = createHandover(state, result.handover);
    }

    return {
      say,
      quick: nextQuick(result),
      state,
      meta: null,
      card,
      result
    };
  }

  function nextQuick(result) {
    if (result.decision.verdict === "escalate") {
      return quick(["Talk to an agent", "That's all, thanks"]);
    }

    if (result.decision.verdict === "convert") {
      return quick(["Book a slot", "What's included?"]);
    }

    if (result.decision.verdict === "deflect") {
      return quick(["It's still down", "Talk to an agent"]);
    }

    return quick(["Talk to an agent"]);
  }

  root.RocketDialog = {
    newState,
    respond,
    suburbFrom,
    ticketRef
  };
})(window);
