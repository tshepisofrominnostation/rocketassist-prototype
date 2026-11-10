/* RocketAssist prototype — knowledge base and demo content.
   Everything here is illustrative: approved packages, a simulated outage feed and
   a coverage table. No real customer data is used anywhere in this prototype. */

const PACKAGES = [
  { name: "Home 25/25", price: 599, note: "25 Mbps up and down, uncapped" },
  { name: "Home 100/100", price: 799, note: "100 Mbps up and down, uncapped" },
  { name: "Business 200/200", price: 1499, note: "200 Mbps, static IP included" },
];

/* Approved prices only. The guardrail refuses to quote anything outside this list. */
const APPROVED_PRICES = PACKAGES.map((p) => p.price);

/* Coverage is the only place the assistant may answer a coverage question from. */
const COVERAGE = {
  observatory: "live",
  woodstock: "live",
  "salt river": "live",
  mowbray: "live",
  rondebosch: "live",
  claremont: "live",
  athlone: "live",
  bellville: "live",
  "sea point": "live",
  wynberg: "survey",
  "mitchells plain": "survey",
  durbanville: "planned",
  somerset: "planned",
};

/* A stand-in for the network status feed RocketNet publishes. */
const OUTAGES = {
  observatory: { cause: "Vandalised cable on the main route", eta: "18:30 today" },
  claremont: { cause: "Planned maintenance on the local exchange", eta: "16:00 today" },
};

const VERDICTS = {
  deflect: "Answered without a person",
  escalate: "Handed to a person",
  convert: "Enquiry captured and booked",
};

/* The three practical examples required by Task 3. Each carries the five fields
   the brief asks for, plus the message that drives the live demo. */
const USE_CASES = [
  {
    id: "outage",
    tag: "Answers itself",
    title: "A line that is down, at 19:40 on a Sunday",
    situation:
      "A customer in Observatory loses internet during load-shedding and assumes their router has failed. They message on WhatsApp, already frustrated.",
    provides:
      "Their suburb, which lights are showing on the router, and a rough time the connection dropped.",
    ai: "Reads the message as a connectivity fault, checks the live network status feed for that suburb, finds a logged cable fault with a repair estimate, and tells the customer not to reset the router because it will not help.",
    outcome:
      "Answered in about forty seconds on a Sunday evening. No ticket is opened, the customer stops unplugging equipment, and the agent finds one fewer complaint on Monday morning.",
    human:
      "If the status feed showed nothing for that suburb, the assistant would open a fault ticket with the line test attached and pass it to the network team instead of guessing.",
    message: "My internet is dead since 7. Are you guys down in Observatory? My router shows a red light",
    from: "Customer · Observatory",
  },
  {
    id: "install",
    tag: "Earns money",
    title: "An installation enquiry at 21:15",
    situation:
      "Someone moving into a flat in Woodstock wants fibre installed before the end of the month. They message after hours, when nobody is at a desk.",
    provides:
      "Street and suburb, which package they are interested in, and preferred installation days.",
    ai: "Confirms the street is covered, quotes the approved package prices, offers the available installation slots and captures the lead with the preferred dates attached.",
    outcome:
      "The enquiry becomes a booked installation the same evening instead of a voicemail the next morning. This is the part of support that actually makes money.",
    human:
      "If the address fell outside coverage, or the building needed body-corporate permission, the assistant would pass the lead to sales rather than promising an installation it cannot deliver.",
    message: "Hi, moving to Woodstock next month. Can I get fibre at 12 Browning Street and what does 100 meg cost?",
    from: "New enquiry · Woodstock",
  },
  {
    id: "billing",
    tag: "Knows its limit",
    title: "A bill after cancellation",
    situation:
      "A customer cancelled in October but has been billed again in November. They are angry and mention leaving for a competitor.",
    provides:
      "Their account number, the invoice number and the date they cancelled.",
    ai: "Verifies the account, finds the invoice, explains the prorated final charge from the approved billing rules, then stops. It cannot issue refunds.",
    outcome:
      "The customer gets an answer in seconds and a person picks up the same thread already knowing the account, the invoice and the history, so nothing is explained twice.",
    human:
      "Always for money moving backwards. Any refund, credit or dispute is handed to billing with the reasoning attached and marked urgent.",
    message: "I cancelled on the 3rd of October and you billed me again. Account RA-40218. I want a refund or I am moving to another provider",
    from: "Customer · Athlone",
  },
];

const EVALUATION = {
  benefits: [
    {
      title: "Answers arrive in seconds, not mornings",
      body:
        "Routine questions are answered immediately, including evenings and weekends, when a small team has nobody on a desk.",
    },
    {
      title: "Enquiries stop leaking away",
      body:
        "After-hours installation and upgrade questions become booked leads instead of missed calls, which is the part of support that earns revenue.",
    },
    {
      title: "A small team spends its day on real faults",
      body:
        "Agents work on technical failures and unhappy customers while the assistant absorbs repetition, and every conversation leaves a record management can read.",
    },
  ],
  limitations: [
    {
      title: "It is confidently wrong when the knowledge is stale",
      body:
        "If a package is discontinued and the content is not updated, the assistant will quote it with total confidence. The failure is quiet, which makes it dangerous.",
    },
    {
      title: "It cannot judge a person",
      body:
        "Sarcasm, panic and quiet fury all look like text. A customer at the end of their patience needs a human to notice, and the assistant cannot reliably notice.",
    },
  ],
  ethics: [
    {
      title: "Private information (POPIA)",
      body:
        "The assistant reads names, addresses and account details. It must collect only what the question needs, verify identity before any account action, and keep a log of who saw what, in line with POPIA.",
    },
    {
      title: "Honesty about being a machine",
      body:
        "The customer must be told they are talking to an AI, must be able to reach a person on request, and must not be steered away from a human to protect a deflection score.",
    },
  ],
  oversight: [
    "A confidence threshold: below it, the assistant hands over instead of guessing.",
    "A mandatory handover list: complaints, cancellations, anything involving money moving backwards, legal threats and requests for a human.",
    "Every conversation logged, with a weekly sample reviewed by a supervisor.",
    "A monthly accuracy audit against real transcripts, reported to management rather than kept internal.",
    "A kill switch: one person can switch the assistant off and route everything to the team.",
  ],
  recommendation: {
    title: "One improvement worth doing next",
    body:
      "Run four weeks on real transcripts, have humans label whether each answer was right, and only then tune the thresholds. Add isiXhosa and Afrikaans once the English behaviour is proven, because a support assistant that only works in English serves part of the customer base.",
  },
};
