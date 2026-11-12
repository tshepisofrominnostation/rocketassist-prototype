
/* Shared ticket store: the bridge between customer chat and agent desk. */
(function (root) {
  const KEY = "rocketassist.tickets.v1";
  const listeners = new Set();

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
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
      transcript: [],
      draft: "",
      unreadFromCustomer: false
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

  function get(id) {
    return read().find((t) => t.id === id) || null;
  }

  function getByRef(ref) {
    return read().find((t) => t.ref === ref) || null;
  }

  function updateByRef(ref, patch) {
    const list = read();
    const i = list.findIndex((t) => t.ref === ref);

    if (i < 0) return null;

    list[i] = Object.assign(list[i], patch);
    write(list);
    return list[i];
  }

  function appendTranscript(ref, message, options) {
    const list = read();
    const i = list.findIndex((t) => t.ref === ref);

    if (i < 0) return null;

    const ticket = list[i];

    ticket.transcript = ticket.transcript || [];
    ticket.transcript.push(Object.assign({
      who: "user",
      text: "",
      at: new Date().toISOString()
    }, message));

    if (options && options.customerReply) {
      ticket.unreadFromCustomer = true;
      ticket.status = "open";
    }

    write(list);
    return ticket;
  }

  function markCustomerRepliesRead(id) {
    return update(id, { unreadFromCustomer: false });
  }

  function openCount() {
    return read().filter((t) => t.status !== "resolved").length;
  }

  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      listeners.forEach((fn) => fn(read()));
    }
  });

  root.RocketStore = {
    read,
    create,
    update,
    get,
    getByRef,
    updateByRef,
    appendTranscript,
    markCustomerRepliesRead,
    openCount,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
})(window);
