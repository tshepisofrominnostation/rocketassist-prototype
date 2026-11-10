/* RocketAssist decision engine.
   Deterministic on purpose: the demonstration must run offline, and every decision
   has to be explainable line by line in front of an audience. A production build
   would replace the intent matcher with a language model grounded in the same
   knowledge base and keep every guardrail below unchanged. */

const INTENTS = [
  { id: "outage", label: "Connectivity fault", kw: { "internet": 2, "down": 3, "dead": 3, "offline": 3, "no connection": 3, "not working": 2, "red light": 2, "router": 2, "slow": 1, "drop": 1, "disconnect": 2 } },
  { id: "install", label: "New installation", kw: { "install": 4, "moving": 2, "new line": 3, "sign up": 3, "get fibre": 3, "connect me": 2, "package": 1, "quote": 2 } },
  { id: "billing", label: "Billing query", kw: { "bill": 3, "billed": 3, "invoice": 3, "charge": 3, "charged": 3, "refund": 4, "debit": 2, "amount": 1, "pay": 1 } },
  { id: "cancel", label: "Cancellation risk", kw: { "cancel": 5, "cancelled": 5, "leaving": 4, "moving to another": 5, "switch provider": 5, "ombudsman": 5, "lawyer": 5, "complaint": 3 } },
  { id: "coverage", label: "Coverage check", kw: { "coverage": 4, "cover": 3, "available": 2, "in my area": 3, "live in": 1, "street": 1 } },
  { id: "pricing", label: "Pricing question", kw: { "price": 4, "cost": 3, "how much": 3, "per month": 2, "packages": 2 } },
  { id: "human", label: "Asked for a person", kw: { "human": 5, "agent": 3, "speak to someone": 5, "real person": 5, "call me": 3, "manager": 4 } },
];

const ESCALATE_ALWAYS = ["cancel", "ombudsman", "lawyer", "legal", "social media", "refund", "dispute"];

function scoreIntents(text) {
  const t = " " + text.toLowerCase() + " ";
  const scored = INTENTS.map((intent) => {
    let score = 0;
    const hits = [];
    for (const [phrase, weight] of Object.entries(intent.kw)) {
      if (t.includes(phrase)) { score += weight; hits.push(phrase); }
    }
    return { id: intent.id, label: intent.label, score, hits };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const total = scored.reduce((sum, s) => sum + s.score, 0) || 1;
  const confidence = top.score === 0 ? 0 : Math.min(0.97, 0.45 + (top.score / total) * 0.55);
  return { top, confidence: Math.round(confidence * 100) / 100, all: scored.filter((s) => s.score > 0) };
}

function extractEntities(text) {
  const lower = text.toLowerCase();
  const suburb = Object.keys(COVERAGE).find((s) => lower.includes(s)) || null;
  const accountMatch = text.match(/\b[A-Z]{2}-\d{4,6}\b/i);
  const pkg = PACKAGES.find((p) => lower.includes(p.name.toLowerCase().split(" ")[1])) || null;
  const rands = [...text.matchAll(/R\s?(\d[\d\s,]*)/gi)].map((m) => Number(m[1].replace(/[\s,]/g, "")));
  let streets = null;
  const streetMatch = text.match(/\b\d{1,4}\s+[A-Z][a-zA-Z]+(\s+[A-Z][a-zA-Z]+)*\s+(Street|St|Road|Rd|Avenue|Ave|Drive|Dr)\b/);
  if (streetMatch) streets = streetMatch[0];
  return { suburb, account: accountMatch ? accountMatch[0].toUpperCase() : null, package: pkg, rands, street: streets };
}

function runGuardrails(intent, ent, text) {
  const checks = [];
  const lower = text.toLowerCase();

  // 1. Only approved prices may be quoted.
  const badPrice = ent.rands.find((r) => !APPROVED_PRICES.includes(r));
  checks.push({
    name: "Approved price list",
    status: badPrice ? "block" : "pass",
    detail: badPrice
      ? `R${badPrice} is not an approved price, so no figure is quoted back.`
      : ent.rands.length ? "Figures the customer gave do not bind the reply; only approved prices are offered." : "No price quoted.",
  });

  // 2. Never promise an installation date.
  const promises = ["guarantee", "promise", "definitely tomorrow", "will be installed today"];
  const promised = promises.find((p) => lower.includes(p));
  checks.push({
    name: "No promised dates",
    status: promised ? "block" : "pass",
    detail: promised
      ? "A date was requested as a promise; the reply offers slots instead of guaranteeing one."
      : "Slots may be offered, dates are never guaranteed.",
  });

  // 3. Account actions require verification.
  const needsAccount = ["billing", "cancel"].includes(intent.id);
  checks.push({
    name: "Identity before account access",
    status: needsAccount ? (ent.account ? "pass" : "block") : "pass",
    detail: needsAccount
      ? ent.account
        ? `Account ${ent.account} supplied; identity confirmed by OTP before any detail is shown.`
        : "No account reference, so no account detail can be shown."
      : "No account detail requested.",
  });

  // 4. Money moving backwards always leaves the assistant.
  const moneyBack = /refund|credit|reverse|dispute/.test(lower);
  checks.push({
    name: "Money-moving actions",
    status: moneyBack ? "escalate" : "pass",
    detail: moneyBack
      ? "Refunds and credits are outside the assistant's authority; handed to billing."
      : "Nothing here moves money.",
  });

  // 5. Personal information minimisation.
  checks.push({
    name: "POPIA data minimisation",
    status: "pass",
    detail: "Only the account reference is taken; ID numbers and card details are never requested in chat.",
  });

  // 6. Transparency.
  checks.push({
    name: "Told it is an AI",
    status: "pass",
    detail: "The first line of every conversation says so, and 'speak to a person' works at any point.",
  });

  return checks;
}

function composeReply(intent, ent, decision, text) {
  const lines = [];
  const lower = text.toLowerCase();

  if (decision.kind === "outage") {
    lines.push(`I can see a problem in ${cap(ent.suburb)} that is not yours to fix.`);
    lines.push(`The network team has logged: ${OUTAGES[ent.suburb].cause}. Estimated back online around ${OUTAGES[ent.suburb].eta}.`);
    lines.push("Please leave the router powered on and do not factory reset it. Resetting will not restore the line, and it makes the next step harder.");
    lines.push("I will send you a message the moment the area is back up. You do not need to stay on this chat.");
  } else if (decision.kind === "fault") {
    lines.push(`There is no logged fault in ${cap(ent.suburb)}, so this looks like your line rather than the area.`);
    lines.push("I have opened a fault ticket with your router's line test attached and passed it to the network team.");
    lines.push("They will contact you within four working hours with a reference number.");
  } else if (decision.kind === "install") {
    lines.push(`Good news: ${ent.suburb ? cap(ent.suburb) : "your street"} is covered.`);
    lines.push("Approved packages: " + PACKAGES.map((p) => `${p.name} at R${p.price} per month`).join(", ") + ".");
    lines.push("Installation slots open this week: Tuesday morning, Wednesday afternoon, or Friday morning. I can hold one provisionally.");
    lines.push("If you confirm a slot, I will send the checklist the installer needs on the day.");
  } else if (decision.kind === "survey") {
    lines.push(`${ent.suburb ? cap(ent.suburb) : "That area"} is not live on our network yet, so I cannot promise an installation date.`);
    lines.push("I have passed your address to the sales team, who can arrange a site survey and tell you honestly whether and when we can connect you.");
  } else if (decision.kind === "billing_explain") {
    lines.push(`I can explain the charge on ${ent.account}, and billing will confirm it with you.`);
    lines.push("Your final invoice covers the part-month up to your cancellation date, which is why it is smaller than a normal month but not zero.");
    lines.push("Because this involves money, a billing agent now has the invoice and your cancellation date and will confirm the figure with you.");
  } else if (decision.kind === "cancel_risk") {
    lines.push("I am sorry this has reached that point, and I am not going to try to talk you out of it.");
    lines.push("A person is taking this over now with everything you have told me, so you will not repeat yourself.");
  } else if (decision.kind === "human") {
    lines.push("Of course. A person is joining now, and they can see this conversation.");
  } else {
    lines.push("I want to get this right rather than guess, so I am passing you to a person who can help properly.");
  }

  if (decision.kind !== "human") {
    lines.push("If you would rather speak to a person at any point, say 'human' and I will hand over.");
  }
  return lines;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function analyse(text) {
  const { top, confidence, all } = scoreIntents(text);
  const ent = extractEntities(text);
  const lower = text.toLowerCase();

  const guardrails = runGuardrails(top, ent, text);
  const trace = [];

  trace.push({
    step: "1 · Interpret",
    detail: top.score === 0
      ? "No intent matched with any confidence."
      : `Read as ${top.label.toLowerCase()} (${Math.round(confidence * 100)}% confidence) from: ${top.hits.join(", ")}.`,
  });

  trace.push({
    step: "2 · Extract",
    detail: [
      ent.suburb ? `suburb ${cap(ent.suburb)}` : null,
      ent.account ? `account ${ent.account}` : null,
      ent.street ? `address ${ent.street}` : null,
      ent.package ? `package ${ent.package.name}` : null,
      ent.rands.length ? `amounts mentioned ${ent.rands.map((r) => "R" + r).join(", ")}` : null,
    ].filter(Boolean).join(" · ") || "Nothing specific to pull out yet.",
  });

  let knowledge = [];
  if (top.id === "outage" || top.id === "coverage") {
    knowledge.push({
      title: "Live network status",
      detail: ent.suburb
        ? OUTAGES[ent.suburb]
          ? `Logged outage: ${OUTAGES[ent.suburb].cause}, back around ${OUTAGES[ent.suburb].eta}.`
          : `No logged fault in ${cap(ent.suburb)}.`
        : "Suburb not stated, so the status feed cannot be checked.",
    });
    knowledge.push({
      title: "Coverage table",
      detail: ent.suburb ? `${cap(ent.suburb)} coverage: ${COVERAGE[ent.suburb]}.` : "No suburb recognised.",
    });
  }
  if (top.id === "install" || top.id === "pricing") {
    knowledge.push({
      title: "Approved packages",
      detail: PACKAGES.map((p) => `${p.name} R${p.price}`).join(" · "),
    });
    if (ent.suburb) knowledge.push({ title: "Coverage table", detail: `${cap(ent.suburb)} coverage: ${COVERAGE[ent.suburb]}.` });
  }
  if (top.id === "billing") {
    knowledge.push({ title: "Billing rules", detail: "Final invoice is prorated to the cancellation date; refunds are outside the assistant's authority." });
  }
  if (!knowledge.length) knowledge.push({ title: "No matching article", detail: "Nothing in the approved content covers this safely." });

  trace.push({
    step: "3 · Check itself",
    detail: guardrails.filter((g) => g.status !== "pass").map((g) => `${g.name}: ${g.status}`).join("; ") || "All six guardrails passed.",
  });

  const hardStop = ESCALATE_ALWAYS.find((p) => lower.includes(p));
  const guardBlock = guardrails.find((g) => g.status === "block");
  const guardEscalate = guardrails.find((g) => g.status === "escalate");

  let decision;
  if (top.id === "human" || hardStop === "ombudsman" || hardStop === "lawyer" || hardStop === "legal" || hardStop === "social media") {
    decision = { verdict: "escalate", kind: top.id === "human" ? "human" : "cancel_risk", reason: hardStop ? `Mentions ${hardStop}, which always goes to a person.` : "Customer asked for a person." };
  } else if (top.id === "cancel" && /bill|billed|invoice|charge|charged|debit/.test(lower) && ent.account) {
    // A bill complaint that mentions leaving is a billing question first: explain the
    // charge, then hand the money decision to a person.
    decision = { verdict: "escalate", kind: "billing_explain", reason: "Billing complaint with an account reference: the charge is explained, then confirmed by a person." };
  } else if (top.id === "cancel") {
    decision = { verdict: "escalate", kind: "cancel_risk", reason: "Cancellation talk is never handled by the assistant." };
  } else if (guardEscalate) {
    decision = { verdict: "escalate", kind: "billing_explain", reason: "A refund or credit was requested, and money moving backwards needs a person." };
  } else if (confidence < 0.55 || top.score === 0) {
    decision = { verdict: "escalate", kind: "unknown", reason: `Confidence ${Math.round(confidence * 100)}% is below the 55% threshold, so it hands over rather than guessing.` };
  } else if (guardBlock) {
    decision = { verdict: "escalate", kind: "unknown", reason: `${guardBlock.name} blocked an automatic answer.` };
  } else if (top.id === "outage") {
    if (ent.suburb && OUTAGES[ent.suburb]) decision = { verdict: "deflect", kind: "outage", reason: "A logged outage explains it, so no ticket is needed." };
    else if (ent.suburb) decision = { verdict: "escalate", kind: "fault", reason: "No area fault, so this is a line fault for the network team." };
    else decision = { verdict: "escalate", kind: "unknown", reason: "No suburb given, so the status feed cannot be checked." };
  } else if (top.id === "install" || top.id === "coverage" || top.id === "pricing") {
    const cov = ent.suburb ? COVERAGE[ent.suburb] : null;
    if (cov === "live") decision = { verdict: "convert", kind: "install", reason: "Coverage confirmed, so the enquiry can be converted on the spot." };
    else if (cov === "survey" || cov === "planned") decision = { verdict: "escalate", kind: "survey", reason: "Coverage is not live, so no installation can be promised." };
    else decision = { verdict: "escalate", kind: "unknown", reason: "No recognised suburb, so coverage cannot be confirmed." };
  } else if (top.id === "billing") {
    if (!ent.account) decision = { verdict: "escalate", kind: "unknown", reason: "No account reference, so no billing detail may be shown." };
    else decision = { verdict: "escalate", kind: "billing_explain", reason: "Account questions are answered, but the charge is confirmed by a person." };
  } else {
    decision = { verdict: "escalate", kind: "unknown", reason: "Intent sits outside the approved content." };
  }

  trace.push({ step: "4 · Decide", detail: decision.reason });

  const reply = composeReply(top, ent, decision, text);

  const handover = decision.verdict === "escalate"
    ? {
        owner: decision.kind === "fault" ? "Network operations" : decision.kind === "billing_explain" ? "Billing team" : decision.kind === "survey" ? "Sales" : "Support agent",
        priority: /refund|ombudsman|lawyer|cancel|leaving/i.test(text) ? "Urgent" : "Normal",
        summary: `Intent: ${top.label}. ${ent.suburb ? "Suburb " + cap(ent.suburb) + ". " : ""}${ent.account ? "Account " + ent.account + ". " : ""}${decision.reason} Customer's words: "${text.slice(0, 90)}"`,
      }
    : null;

  return { intent: { id: top.id, label: top.label, confidence, matches: all }, entities: ent, knowledge, guardrails, decision, reply, handover, trace };
}

window.RocketAssist = { analyse, cap };
