// Reaction rows for an edition of The Cortegaça Chronicle.
//
// build_index.py copies this file to the site root and loads it on every edition with the API's
// address in `data-api`. Every element carrying `data-rk` (articles, list entries, diary events)
// gets a row: the reactions it already has, and a button that opens a palette of five. Readers have no account: a browser is told apart by a random id
// kept in localStorage. Opening any edition once with `#owner=<key>` stores the owner key, after
// which this browser's reactions count as Markus's own. If the API can't be reached, no row is
// drawn and the page reads as it always did.
(() => {
  const script = document.currentScript;
  const API = ((script && script.dataset.api) || "").replace(/\/$/, "");
  const edition = (location.pathname.match(/(\d{4}-\d{2}-\d{2})(?:\.html)?$/) || [])[1];
  const items = [...document.querySelectorAll("[data-rk]")];
  if (!API || !edition || !items.length) return;

  const REACTIONS = [
    ["up", "👍", "More like this"],
    ["down", "👎", "Less like this"],
    ["love", "❤️", "Loved it"],
    ["bore", "😴", "Boring"],
    ["save", "⭐", "Save for later"],
  ];

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
      } catch {}
    },
  };

  const fromHash = /^#owner=(.+)$/.exec(location.hash);
  if (fromHash) {
    store.set("rx-owner", decodeURIComponent(fromHash[1]));
    history.replaceState(null, "", location.pathname + location.search);
  }
  let ownerKey = store.get("rx-owner");

  let voter = store.get("rx-voter");
  if (!voter) {
    voter = crypto.randomUUID
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
        );
    store.set("rx-voter", voter);
  }

  const headers = () => (ownerKey ? { Authorization: `Bearer ${ownerKey}` } : { "X-Voter": voter });

  const counts = {}; // key -> {reaction: n}
  const mine = {}; // key -> Set of reactions
  const rows = new Map(); // key -> [row elements]; the same item can appear twice on a page

  const ADD_ICON =
    '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M16.2 10.6a6.7 6.7 0 1 1-6.8-6.8"/><path d="M7 11.6c.7 1.1 1.7 1.7 2.8 1.7s2.1-.6 2.8-1.7"/>' +
    '<path d="M7.4 8.2v.1M12 8.2v.1" stroke-width="1.7"/><path d="M15.5 2.5v4.6M13.2 4.8h4.6"/></svg>';

  function chip(key, id, glyph, label) {
    const n = (counts[key] || {})[id] || 0;
    const on = !!(mine[key] && mine[key].has(id));
    const b = document.createElement("button");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", n ? `${label}, ${n}` : label);
    b.setAttribute("aria-pressed", String(on));
    const e = document.createElement("span");
    e.className = "e";
    e.textContent = glyph;
    b.append(e);
    b.addEventListener("click", () => {
      closePalette();
      react(key, id, !on);
    });
    return { b, n };
  }

  // A row holds the reactions the item already has, then the button that opens the palette.
  function draw(key) {
    for (const row of rows.get(key) || []) {
      const hadFocus = row.contains(document.activeElement);
      row.textContent = "";
      for (const [id, glyph, label] of REACTIONS) {
        const { b, n } = chip(key, id, glyph, label);
        if (!n) continue;
        b.append(String(n));
        row.append(b);
      }
      const add = document.createElement("button");
      add.type = "button";
      add.className = "add";
      add.innerHTML = ADD_ICON;
      add.title = "React";
      add.setAttribute("aria-label", "React");
      add.setAttribute("aria-haspopup", "true");
      add.setAttribute("aria-expanded", "false");
      add.addEventListener("click", () => (palette && palette.anchor === add ? closePalette() : openPalette(key, add)));
      row.append(add);
      if (hadFocus) add.focus();
    }
  }

  // The palette: one floating strip of all five reactions, anchored under the button that opened
  // it. It floats over the page, so opening it never moves the text.
  let palette = null;

  function openPalette(key, anchor) {
    closePalette();
    const el = document.createElement("div");
    el.className = "rx rx-pop";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", "Choose a reaction");
    for (const [id, glyph, label] of REACTIONS) el.append(chip(key, id, glyph, label).b);
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const width = el.offsetWidth;
    const left = Math.min(Math.max(8, r.right - width), document.documentElement.clientWidth - width - 8);
    el.style.left = `${left + scrollX}px`;
    el.style.top = `${r.bottom + scrollY + 6}px`;
    anchor.setAttribute("aria-expanded", "true");
    palette = { el, anchor };
    el.querySelector("button").focus();
  }

  function closePalette(refocus) {
    if (!palette) return;
    palette.el.remove();
    palette.anchor.setAttribute("aria-expanded", "false");
    if (refocus && palette.anchor.isConnected) palette.anchor.focus();
    palette = null;
  }

  document.addEventListener("pointerdown", (ev) => {
    if (palette && !palette.el.contains(ev.target) && !palette.anchor.contains(ev.target)) closePalette();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closePalette(true);
  });
  addEventListener("resize", () => closePalette());

  async function react(key, id, on) {
    const before = { counts: { ...(counts[key] || {}) }, mine: new Set(mine[key] || []) };
    // show the change at once; the server's answer replaces it
    const c = (counts[key] ||= {});
    const m = (mine[key] ||= new Set());
    c[id] = Math.max(0, (c[id] || 0) + (on ? 1 : -1));
    on ? m.add(id) : m.delete(id);
    draw(key);
    try {
      const res = await fetch(`${API}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ k: key, d: edition, r: id, on }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      counts[key] = body.counts;
      mine[key] = new Set(body.mine);
    } catch {
      counts[key] = before.counts;
      mine[key] = before.mine;
    }
    draw(key);
  }

  async function load() {
    const keys = [...new Set(items.map((el) => el.dataset.rk))];
    const url = `${API}/counts?k=${keys.join(",")}`;
    let res = await fetch(url, { headers: headers() });
    if (res.status === 401 && ownerKey) {
      // the stored owner key is not the server's: carry on as an ordinary reader
      ownerKey = null;
      store.set("rx-owner", null);
      res = await fetch(url, { headers: headers() });
    }
    if (!res.ok) return;
    const body = await res.json();
    Object.assign(counts, body.counts);
    for (const [k, list] of Object.entries(body.mine)) mine[k] = new Set(list);

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    for (const el of items) {
      const inline = el.tagName === "LI";
      const row = document.createElement(inline ? "span" : "div");
      row.className = "rx";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Reactions");
      const kicker = el.querySelector(":scope > .kicker, :scope > .eyebrow");
      if (kicker) {
        // an article: the row shares the kicker's line, at its right end, above the headline
        const head = document.createElement("div");
        head.className = "rx-head";
        kicker.before(head);
        head.append(kicker, row);
      } else {
        // a diary event is a two-column grid (date | text): the row belongs under the text
        (el.querySelector(":scope > .txt") || el).append(row);
      }
      const key = el.dataset.rk;
      rows.set(key, [...(rows.get(key) || []), row]);
    }
    for (const key of rows.keys()) draw(key);
  }

  const CSS = `
  .rx { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 7px; }
  .rx-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
  .rx-head > .kicker, .rx-head > .eyebrow { margin-bottom: 0; min-width: 0; }
  .rx-head > .rx { margin-top: 0; flex: none; flex-wrap: nowrap; }
  .lead > .rx-head { margin-bottom: 6px; }
  span.rx { display: inline-flex; margin: 0 0 0 6px; vertical-align: middle; }
  .rx button {
    appearance: none; -webkit-appearance: none; display: inline-flex; align-items: center; gap: 4px;
    min-width: 24px; min-height: 22px; padding: 0 8px; justify-content: center;
    border: 0; border-radius: 999px; background: rgba(27, 25, 23, 0.03);
    color: var(--ink-3, #6b625a); font: 0.72rem/1 "PT Serif", Georgia, serif; font-variant-numeric: tabular-nums;
    cursor: pointer; transition: background-color 0.12s, color 0.12s;
  }
  .rx button .e { font-size: 0.85rem; filter: grayscale(1); opacity: 0.8; transition: transform 0.12s; }
  .rx button:hover { background: rgba(27, 25, 23, 0.075); }
  .rx button:focus-visible { outline: 2px solid var(--accent, #9c2b1e); outline-offset: 1px; }
  /* a reaction of your own: full colour, darker tint, bold count */
  .rx button[aria-pressed="true"] { background: rgba(27, 25, 23, 0.06); color: var(--ink, #1b1917); font-weight: 700; }
  .rx button[aria-pressed="true"] .e { filter: none; opacity: 1; }
  /* the button that opens the palette: always there, quiet until the item is hovered or it is in use */
  .rx .add { background: transparent; padding: 0; color: var(--rule-2, #a89c88); }
  [data-rk]:hover .rx .add, .rx .add:focus-visible { color: var(--ink-2, #403a34); }
  .rx .add:hover, .rx .add[aria-expanded="true"] { color: var(--ink, #1b1917); background: rgba(27, 25, 23, 0.08); }
  /* the palette: a soft card lifted off the page, a shade lighter than the paper */
  .rx-pop {
    position: absolute; z-index: 20; margin: 0; padding: 5px; gap: 2px; flex-wrap: nowrap;
    background: #fcfaf4; border-radius: 16px;
    box-shadow: 0 0 0 1px rgba(27, 25, 23, 0.07), 0 2px 4px rgba(27, 25, 23, 0.06), 0 12px 28px rgba(27, 25, 23, 0.14);
    transform-origin: top right; animation: rx-pop 0.14s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  @keyframes rx-pop { from { opacity: 0; transform: translateY(-4px) scale(0.94); } }
  .rx-pop button { min-width: 36px; min-height: 36px; padding: 0; border-radius: 11px; background: transparent; }
  .rx-pop button .e { font-size: 1.2rem; filter: none; opacity: 1; }
  .rx-pop button:hover { background: rgba(27, 25, 23, 0.06); }
  .rx-pop button:hover .e { transform: scale(1.18); }
  .rx-pop button[aria-pressed="true"] { background: rgba(27, 25, 23, 0.1); }
  @media (pointer: coarse) {
    .rx button { min-width: 32px; min-height: 30px; padding: 0 10px; }
    .rx .add { padding: 0; }
    .rx-pop button { min-width: 42px; min-height: 42px; padding: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .rx-pop { animation: none; } .rx button, .rx button .e { transition: none; } }
  @media print { .rx { display: none; } }
  `;

  load().catch(() => {});
})();
