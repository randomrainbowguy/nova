/* Tiny Google Analytics 4 sender for the standalone Nova.
   Google's gtag.js won't send anything from a downloaded file or an about:blank tab, which is
   exactly where Nova runs, so this talks to GA's collection endpoint directly (the same requests
   gtag makes). Uses gaId from config.js.

   novaTrack("page_view", { title: "Games", path: "/games" })
   novaTrack("play_game", { game_name: "PolyTrack", game_id: "55" }, { title: "PolyTrack", path: "/play/55" })
*/
(function () {
  var SESSION_MS = 30 * 60 * 1000;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var pageId = Math.floor(Math.random() * 2147483647);
  var started = Date.now();
  var lastPage = { title: "Nova", path: "/" };

  function client() {
    var cid = store.get("nova_ga_cid"), first = false;
    if (!cid) {
      cid = Math.floor(Math.random() * 2147483647) + "." + Math.floor(Date.now() / 1000);
      store.set("nova_ga_cid", cid);
      first = true;
    }
    return { cid: cid, first: first };
  }

  // GA sessions: a new one after 30 minutes without activity.
  function session() {
    var s = null;
    try { s = JSON.parse(store.get("nova_ga_session") || "null"); } catch (e) {}
    var now = Date.now(), fresh = !s || now - s.last > SESSION_MS;
    if (fresh) s = { id: Math.floor(now / 1000), count: (s ? s.count : 0) + 1, last: now };
    s.last = now;
    store.set("nova_ga_session", JSON.stringify(s));
    return { id: s.id, count: s.count, fresh: fresh };
  }

  window.novaTrack = function (name, params, page) {
    var id = (window.NOVA_CONFIG || {}).gaId || "";
    if (!/^G-[A-Z0-9]{4,20}$/.test(id)) return;
    if (page) lastPage = page;
    var c = client(), s = session();
    var q = {
      v: "2", tid: id, cid: c.cid, sid: s.id, sct: s.count, seg: "1", _p: pageId, en: name,
      dl: "https://nova.games" + lastPage.path, dt: lastPage.title,
      ul: (navigator.language || "en-us").toLowerCase(),
      sr: screen.width + "x" + screen.height,
      _et: Math.max(1, Date.now() - started),
    };
    if (s.fresh) { q._ss = "1"; q._nsi = "1"; }
    if (c.first) q._fv = "1";
    params = params || {};
    for (var k in params) {
      if (k === "title" || k === "path") continue;
      q[(typeof params[k] === "number" ? "epn." : "ep.") + k] = params[k];
    }
    started = Date.now();
    var url = "https://www.google-analytics.com/g/collect?" + Object.keys(q).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]);
    }).join("&");
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon(url))) fetch(url, { method: "POST", mode: "no-cors", keepalive: true });
    } catch (e) {}
  };
})();
