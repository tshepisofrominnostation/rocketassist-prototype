/* Shared ticket store: the bridge between a customer chat and the agent desk.
   localStorage keeps it honest across tabs, so two windows (customer + agent)
   behave like two people. */
(function (root) {
  const KEY = "rocketassist.tickets.v1";
  const listeners = new Set();

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
    listeners.forEach((fn) => fn(list));
  }
  function create(t) {
    const list = read();
    const ticket = Object.assign({
      id: "T" + Date.now().toString(36),
      ref: t.ref || "RA-" + Math.floor(1000 + Math.random() * 9000),
      status: "open",
      createdAt: new Date().toISOString(),
      replies: [],
      draft: "",
    }, t);
    list.unshift(ticket);
    write(list);
    return ticket;
  }
  function update(id, patch) {
    const list = read();
    const i = list.findIndex((t) => t.id === id);
    if (i < 0) return null;
    list[i] = Object.assign(list[i], patch);
    write(list);
    return list[i];
  }
  function get(id) { return read().find((t) => t.id === id) || null; }
  function openCount() { return read().filter((t) => t.status !== "resolved").length; }

  window.addEventListener("storage", (e) => {
    if (e.key === KEY) listeners.forEach((fn) => fn(read()));
  });

  root.RocketStore = { read, create, update, get, openCount, subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)) };
})(window);
