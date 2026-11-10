# RocketAssist — AI customer service prototype

An interactive prototype of an AI customer service assistant for **RocketNet**, a Cape Town
fibre and wireless internet provider. Built for CAPACITI Week 2, deliverable 3
(visual prototype), 4 (three practical examples) and 5 (benefits, limits and ethics).

**Live:** https://tshepisofrominnostation.github.io/rocketassist-prototype/

## What it demonstrates

A customer message goes in; the assistant reads it, pulls out what is specific, answers
only from approved content, checks six guardrails, and then either answers, books, or
hands the conversation to a person with a written summary. The right-hand panel shows
every one of those steps live, including the confidence score and the reason for any
handover, so nothing about the decision is hidden.

Four things worth clicking:

| Scenario | What it shows |
|---|---|
| "Answers itself · outage" | A known area fault explained without opening a ticket |
| "Earns money · install" | An after-hours installation enquiry converted into a booking |
| "Knows its limit · billing" | A charge explained, then handed to billing because money is involved |
| "asks for a person" | Handover on request, at any point in the conversation |

The **Three use cases** tab holds the five required fields for each example. The
**Evaluation** tab holds three benefits, two limitations, two ethical considerations,
the oversight model and one recommendation.

## What is simulated, honestly

- The decision engine is **deterministic**, not a language model. It is scripted so the
  demonstration runs offline, in a classroom, with no account and no API key. In
  production the intent step would be a language model reading the same knowledge base;
  the guardrails, escalation rules and handover would not change.
- The **outage feed, coverage table and package prices** in `docs/kb.js` are illustrative.
- **No customer data is used.** No message leaves the browser. There is no backend.

## Files

- `docs/index.html` — layout and styling
- `docs/kb.js` — knowledge base, packages, coverage, outage feed, use-case content
- `docs/engine.js` — intent scoring, entity extraction, guardrails, decision and reply
- `docs/ui.js` — tabs, chat playback, analyst panel, metrics

Open `docs/index.html` in any browser, or serve the folder with
`python3 -m http.server`.

## Credit

Tshepiso Freddy Thosago, with Avuyile Plaatjie, Xoliswa Dywili and Deliwe Klaas.
RocketNet is a real company; this is an independent student study and is not affiliated
with or endorsed by RocketNet. Prices, coverage and outage details shown are placeholders.
