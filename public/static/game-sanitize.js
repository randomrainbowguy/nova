/* game-sanitize.js — prepares a raw game HTML file for the blob: iframe player.
 *
 *   window.sanitizeGameHtml(html, url) -> html
 *
 * 1. <base>: adds <base href="<folder of url>/"> right after <head> — unless the file already has its
 *    own <base href>, because the FIRST <base> in a document wins and ~590 of these files point their
 *    <base> at the real asset repo (e.g. PolyTrack). raw.githubusercontent folders are mapped to the
 *    jsDelivr mirror, because raw.githubusercontent serves .js/.css as text/plain + nosniff, which
 *    the browser refuses to run.
 * 2. Removes foreign analytics / ad scripts that the uploaders injected (gtag/GA/GTM, the obfuscated
 *    "cdn.r9x.in" ad loader, the #sidebarad1/#sidebarad2 boxes with floating "✕" it fills, Cloudflare
 *    Insights, Facebook pixel, AdSense tags and <ins> slots, Google IMA video-ad SDK).
 * 3. Injects a small shim <script> first in <head> that stubs gtag/dataLayer/ga/fbq, answers AdSense
 *    "adBreak" calls with "notReady" (so games that wait for an ad continue), blocks tracker/ad
 *    scripts that are added later by JS (they get an async "error" event, like an ad blocker), plus a
 *    CSS rule hiding ad slots. It also fixes things that break only because the page is a blob: URL:
 *    `new URL(x, location-derived base)`, service-worker registration, LayaAir's asset root, and
 *    cross-origin images used as WebGL textures (requested with CORS from jsDelivr/GitHub).
 * 4. Replaces two platform SDKs that hang outside their host site with local stand-ins:
 *    YouTube Playables (ytgame.js) and Yandex Games (yandex-sdk.js).
 * 5. A few URL rewrites for assets that moved (see REWRITES).
 * Everything is plain string/regex work so the rest of the document stays byte-for-byte identical
 * (doctype, script order, inline code).
 */
(function () {
  "use strict";

  // Hosts whose scripts/iframes are pure tracking or display ads (never game code).
  var BLOCK_HOSTS = [
    "googletagmanager.com", "imasdk.googleapis.com", "2mdn.net", "google-analytics.com", "analytics.google.com", "googlesyndication.com",
    "doubleclick.net", "googleadservices.com", "adservice.google.com", "r9x.in",
    "static.cloudflareinsights.com", "connect.facebook.net", "mc.yandex.ru", "clarity.ms",
    "hotjar.com", "statcounter.com", "histats.com", "quantserve.com", "scorecardresearch.com",
    "amazon-adsystem.com", "adnxs.com", "taboola.com", "outbrain.com", "propellerads.com",
    "popads.net", "adsterra.com", "highperformanceformat.com", "effectivegatecpm.com"
  ];
  var hostRe = "(?:[a-z0-9-]+\\.)*(?:" + BLOCK_HOSTS.map(function (h) { return h.replace(/\./g, "\\."); }).join("|") + ")";
  var BLOCK_URL = new RegExp("^(?:https?:)?//" + hostRe + "(?:[:/?#]|$)", "i");

  var SHIM = "(" + function (blockSrc) {
    var BLOCK = new RegExp(blockSrc, "i");
    var w = window, noop = function () {};
    // analytics stubs
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
    w.ga = w.ga || noop; w.fbq = w.fbq || noop; w._gaq = w._gaq || { push: noop };
    // AdSense / H5 Games Ads: behave like "no ad available"
    var ads = w.adsbygoogle = w.adsbygoogle || [];
    ads.loaded = true;
    ads.push = function (o) {
      try {
        if (o && typeof o === "object") {
          if (typeof o.onReady === "function") setTimeout(o.onReady, 0);
          if (typeof o.adBreakDone === "function") setTimeout(function () { o.adBreakDone({ breakType: o.type, breakName: o.name, breakFormat: o.type === "reward" ? "reward" : "interstitial", breakStatus: "notReady" }); }, 0);
        }
      } catch (e) {}
      return 0;
    };
    w.adBreak = w.adBreak || ads.push; w.adConfig = w.adConfig || ads.push;
    // blob: URLs can't be a base for relative URLs, so `new URL("x.wasm", location.href)` throws
    // "Invalid base URL" inside the blob iframe (Construct 3, Emscripten, ...). Resolve against <base>.
    try {
      var NativeURL = w.URL;
      w.URL = new Proxy(NativeURL, { construct: function (T, a, nt) {
        nt = nt === w.URL ? T : nt;
        if (a.length > 1 && a[1] != null && /^blob:/i.test(String(a[1]))) a = [a[0], document.baseURI];
        try { return Reflect.construct(T, a, nt); }
        catch (e) {   // base built from the blob location (e.g. origin + pathname + "scripts/") -> re-root it on <base>
          if (a.length > 1 && a[1] != null) {
            var b = String(a[1]), p = location.pathname, dir = p.slice(0, p.lastIndexOf("/") + 1), k = dir ? b.indexOf(dir) : -1;
            if (k !== -1) return Reflect.construct(T, [a[0], document.baseURI.replace(/[^/]*$/, "") + b.slice(k + dir.length)], nt);
          }
          throw e;
        }
      } });
    } catch (e) {}
    // Images from the CDN are cross-origin here (they were same-origin on the original site), so WebGL
    // refuses them as "tainted" unless requested with CORS. jsDelivr / GitHub send
    // Access-Control-Allow-Origin: *, so ask for CORS automatically for those hosts.
    try {
      var CORS_OK = /^https?:\/\/(?:cdn\.jsdelivr\.net|fastly\.jsdelivr\.net|raw\.githubusercontent\.com|[a-z0-9-]+\.github\.io)\//i;
      var IP = HTMLImageElement.prototype, desc = Object.getOwnPropertyDescriptor(IP, "src");
      var wantCors = function (img, v) {
        if (img.getAttribute("crossorigin") === null && typeof v === "string") {
          var abs; try { abs = new NativeURL(v, document.baseURI).href; } catch (e) { return; }
          if (CORS_OK.test(abs)) img.crossOrigin = "anonymous";
        }
      };
      Object.defineProperty(IP, "src", { configurable: true, enumerable: desc.enumerable, get: desc.get,
        set: function (v) { wantCors(this, v); desc.set.call(this, v); } });
      var sa = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (n, v) {
        if (this instanceof HTMLImageElement && String(n).toLowerCase() === "src") wantCors(this, String(v));
        return sa.call(this, n, v);
      };
    } catch (e) {}
    // LayaAir computes its asset root from location.protocol + "//" + location.host + location.pathname,
    // which is garbage for a blob: page ("blob://http//..."). Point it at <base> as soon as Laya loads.
    try {
      var laya;
      Object.defineProperty(w, "Laya", { configurable: true, enumerable: true,
        get: function () { return laya; },
        set: function (v) {
          laya = v;
          try { if (v && v.Laya && typeof v.Laya._getUrlPath === "function") v.Laya._getUrlPath = function () { return document.baseURI.replace(/[^/]*$/, ""); }; } catch (e) {}
        } });
    } catch (e) {}
    // Service workers can't be registered from a blob: document; make register() a harmless no-op
    // instead of an unhandled SecurityError (Godot, Construct, PWA exports).
    try {
      var sw = navigator.serviceWorker;
      if (sw) {
        sw.register = function () { return new Promise(noop); };
        sw.getRegistration = function () { return Promise.resolve(undefined); };
        sw.getRegistrations = function () { return Promise.resolve([]); };
      }
    } catch (e) {}
    // block tracker/ad <script>/<iframe> elements inserted later by JS
    function blocked(n) {
      if (!n || n.nodeType !== 1) return false;
      var t = n.tagName, s;
      if (t !== "SCRIPT" && t !== "IFRAME") return false;
      s = n.getAttribute("src") || "";
      if (!s || !BLOCK.test(s.replace(/^\s+/, ""))) return false;
      setTimeout(function () { try { n.dispatchEvent(new Event("error")); } catch (e) {} }, 0);
      return true;
    }
    var P = Node.prototype, ap = P.appendChild, ib = P.insertBefore;
    P.appendChild = function (n) { return blocked(n) ? n : ap.call(this, n); };
    P.insertBefore = function (n, r) { return blocked(n) ? n : ib.call(this, n, r); };
    ["append", "prepend"].forEach(function (k) {
      var E = Element.prototype, orig = E[k];
      if (orig) E[k] = function () { return orig.apply(this, [].filter.call(arguments, function (n) { return !blocked(n); })); };
    });
  }.toString() + ")(" + JSON.stringify(BLOCK_URL.source.replace("^(?:https?:)?//", "^(?:https?:)?//")) + ");";

  var CSS = "#sidebarad1,#sidebarad2,.sidebar-frame,ins.adsbygoogle,iframe[src*='googlesyndication'],iframe[src*='doubleclick'],div[id^='google_ads_iframe'],div[id^='aswift_']{display:none!important}";


  // Stand-in for the YouTube Playables SDK (ytgame.js). The real SDK waits for the YouTube host page to
  // answer (loadData() never resolves outside YouTube), so ~60 "youtube-playables" ports hang on a blank
  // screen. This keeps the same API, saves to localStorage and reports "no ad".
  var YTGAME = "(" + function () {
    if (window.ytgame && window.ytgame.__nova) return;
    var noop = function () {}, P = function (v) { return Promise.resolve(v); };
    var key = "ytgame:save:" + location.pathname.replace(/^.*\//, "") + ":" + document.title;
    var AdResult = { UNKNOWN: 0, SHOWED: 1, REJECTED: 2 };
    var handlers = function () { return function () { return noop; }; };
    window.ytgame = {
      __nova: true, IN_PLAYABLES_ENV: true, SDK_VERSION: "nova-shim",
      game: {
        firstFrameReady: noop, gameReady: noop,
        loadData: function () { var d = null; try { d = localStorage.getItem(key); } catch (e) {} return P(d || "{}"); },
        saveData: function (d) { try { localStorage.setItem(key, String(d)); } catch (e) {} return P(); }
      },
      engagement: { sendScore: function () { return P(); }, openYTContent: function () { return P(); } },
      health: { logError: noop, logWarning: noop },
      system: {
        isAudioEnabled: function () { return true; }, onAudioEnabledChange: handlers(),
        onPause: handlers(), onResume: handlers(),
        getLanguage: function () { return P(navigator.language || "en-US"); }
      },
      ads: {
        AdResult: AdResult,
        requestAd: function () { return P(AdResult.REJECTED); },
        requestInterstitialAd: function () { return P(); },
        requestRewardedAd: function () { return P(false); }
      }
    };
  }.toString() + ")();";

  // Specific asset URLs that moved: [pattern, replacement], applied to the whole file.
  var REWRITES = [
    // jsDelivr GitHub URLs missing the "/gh/" segment (always 404): cdn.jsdelivr.net/user/repo@ref/...
    [/cdn\.jsdelivr\.net\/(?!gh\/|npm\/|wp\/|combine\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@)/g, "cdn.jsdelivr.net/gh/$1"],
    // "Tag": bubblfan/UGS-Assets no longer has tag/ (404); the same files live in bubbls/UGS-Assets
    // axo323lotl-bit/elitecomposite was deleted from GitHub (18 hyper-casual Unity ports 404). The same
    // folders exist in genizy/brainrot, which is too big for jsDelivr, so use rawcdn.githack (as other
    // files in freebuisness/html already do for that repo).
    [/cdn\.jsdelivr\.net\/(?:gh\/)?axo323lotl-bit\/elitecomposite@main\//g, "rawcdn.githack.com/genizy/brainrot/main/"],
    // typo in an EmulatorJS loader (Ace Attorney Investigations): response.rrayBuffer()
    [/\.rrayBuffer\(\)/g, ".arrayBuffer()"],
    [/(EJS_color = "#[0-9a-fA-F]+";)a(\s)/g, "$1$2"],   // ...and the "a" that went missing there
    [/cdn\.jsdelivr\.net\/gh\/bubblfan\/UGS-Assets@main\/tag\//g, "cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/tag/"]
  ];

  // Per-file fixes, keyed by the end of the game URL. base: use this <base> instead of the file's folder
  // (for exports whose scripts compute their own folder from location, e.g. Construct 3).
  var FILE_FIXES = {
  };
  function fileFix(url) {
    for (var k in FILE_FIXES) if (url.slice(-k.length) === k) return FILE_FIXES[k];
    return null;
  }


  // Stand-in for the Yandex Games SDK (freebuisness/assets/yandex-sdk.js). The real one talks to the
  // Yandex host frame; outside it, YaGames.init() only resolves after several timeouts, and some Unity
  // ports call ysdk before that and crash. This resolves at once, saves to localStorage, shows no ads.
  var YASDK = "(" + function () {
    if (window.YaGames && window.YaGames.__nova) return;
    var noop = function () {}, P = function (v) { return Promise.resolve(v); }, R = function () { return Promise.reject(new Error("not available")); };
    var KEY = "yasdk:" + document.title + ":";
    var load = function (k) { try { return JSON.parse(localStorage.getItem(KEY + k) || "{}"); } catch (e) { return {}; } };
    var save = function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} };
    function soft(obj) {   // unknown members become no-op functions returning a resolved promise
      return new Proxy(obj, { get: function (t, k) {
        if (k in t || typeof k === "symbol" || k === "then") return t[k];
        return function () { return P(); };
      } });
    }
    function later(fn) { setTimeout(function () { try { fn && fn(); } catch (e) { console.error(e); } }, 0); }
    var player = soft({
      getName: function () { return ""; }, getPhoto: function () { return ""; }, getUniqueID: function () { return "local-player"; },
      getID: function () { return "local-player"; }, getMode: function () { return "lite"; }, isAuthorized: function () { return false; },
      getPayingStatus: function () { return "unknown"; },
      getData: function (keys) { var d = load("data"); if (keys) { var o = {}; keys.forEach(function (k) { if (k in d) o[k] = d[k]; }); return P(o); } return P(d); },
      setData: function (v) { var d = load("data"); for (var k in v) d[k] = v[k]; save("data", d); return P(true); },
      getStats: function () { return P(load("stats")); },
      setStats: function (v) { var d = load("stats"); for (var k in v) d[k] = v[k]; save("stats", d); return P(true); },
      incrementStats: function (v) { var d = load("stats"); for (var k in v) d[k] = (d[k] || 0) + v[k]; save("stats", d); return P(d); }
    });
    var lang = (navigator.language || "en").slice(0, 2);
    var ysdk = soft({
      environment: { app: { id: "local" }, browser: { lang: lang }, i18n: { lang: lang, tld: "com" }, payload: null },
      deviceInfo: { type: "desktop", isDesktop: function () { return true; }, isMobile: function () { return false; }, isTablet: function () { return false; }, isTV: function () { return false; } },
      features: { LoadingAPI: { ready: noop }, GameplayAPI: { start: noop, stop: noop }, GamesAPI: soft({}), PluginEngineDataReporterAPI: soft({}) },
      adv: soft({
        showFullscreenAdv: function (o) { var c = (o && o.callbacks) || {}; later(function () { c.onClose && c.onClose(false); }); },
        showRewardedVideo: function (o) { var c = (o && o.callbacks) || {}; later(function () { c.onError && c.onError(new Error("no ad")); c.onClose && c.onClose(); }); },
        showBannerAdv: function () { return P({ stickyAdvIsShowing: false }); }, hideBannerAdv: function () { return P({ stickyAdvIsShowing: false }); },
        getBannerAdvStatus: function () { return P({ stickyAdvIsShowing: false }); }
      }),
      auth: { openAuthDialog: R },
      getPlayer: function () { return P(player); },
      getLeaderboards: function () { return P(soft({ getLeaderboardDescription: R, getLeaderboardPlayerEntry: R, setLeaderboardScore: function () { return P(); }, getLeaderboardEntries: function () { return P({ entries: [], ranges: [], userRank: 0 }); } })); },
      getPayments: R, getStorage: function () { return P(localStorage); },
      shortcut: { canShowPrompt: function () { return P({ canShow: false }); }, showPrompt: function () { return P({ outcome: "rejected" }); } },
      feedback: { canReview: function () { return P({ value: false, reason: "UNKNOWN" }); }, requestReview: function () { return P({ feedbackSent: false }); } },
      clipboard: { writeText: function () { return P(); } },
      isAvailableMethod: function () { return P(false); }, getFlags: function () { return P({}); },
      serverTime: function () { return Date.now(); }, on: noop, off: noop, dispatchEvent: function () { return P(); }
    });
    window.YaGames = { __nova: true, init: function () { return P(ysdk); } };
  }.toString() + ")();";

  // ---- static removals ----
  function removeTrackers(html) {
    // <script src="tracker">...</script>
    html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)[^>]*>[\s\S]*?<\/script\s*>/gi, function (m, src) {
      return BLOCK_URL.test(src.trim()) ? "" : m;
    });
    // inline scripts that are only tracker boilerplate (gtag config, GTM/FB/GA snippets, r9x loader)
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, function (m, attrs, body) {
      if (/\bsrc\s*=/i.test(attrs) || !body.trim()) return m;
      if (/^\s*\(function\s*\(/.test(body) && body.indexOf("UravPbGESYjDUNqxKcf") !== -1 || /^\s*\(function\s*\(/.test(body) && body.indexOf("b1adada9aae3f6f6babdb7f7abe0a1f7b0b7") !== -1) return ""; // obfuscated cdn.r9x.in ad loader
      if (body.length < 1500 && /googletagmanager\.com\/gtm\.js|google-analytics\.com\/(?:analytics|ga)\.js|connect\.facebook\.net\/[^"']*fbevents\.js|mc\.yandex\.ru\/metrika/i.test(body)) return "";
      if (isGtagBoilerplate(body)) return "";
      return m;
    });
    // Google Sites gadget leftovers: calls a function only Google Sites' parent page has
    html = html.replace(/<script>\s*window\.parent\.maeExportApis_\(\);?\s*<\/script>/g, "");
    // YouTube Playables SDK -> local stand-in (see YTGAME)
    html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*\/ytgame\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script\s*>/gi, function () {
      return "<script>" + YTGAME + "<\/script>";
    });
    // Yandex Games SDK -> local stand-in (see YASDK)
    html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:freebuisness\/assets@main\/yandex-sdk\.js|yandex\.ru\/games\/sdk\/v2)[^"']*["'][^>]*>\s*<\/script\s*>/gi, function () {
      return "<script>" + YASDK + "<\/script>";
    });
    // GTM / FB / Yandex <noscript> fallbacks
    html = html.replace(/<noscript\b[^>]*>\s*(?:<iframe[^>]*googletagmanager\.com[^>]*>\s*<\/iframe>|<img[^>]*(?:facebook\.com\/tr|mc\.yandex\.ru)[^>]*>|<div>\s*<img[^>]*mc\.yandex\.ru[^>]*>\s*<\/div>)\s*<\/noscript>/gi, "");
    // The uploader's sidebar ad boxes (160x600, fixed, z-index 999999, with a floating "✕"), filled by the r9x loader
    html = html.replace(/<div id=["']sidebarad[12]["'][^>]*>\s*<div class=["']sidebar-close["'][^>]*>[^<]*<\/div>\s*<\/div>/gi, "");
    // AdSense slots
    html = html.replace(/<ins\b[^>]*class\s*=\s*["'][^"']*\badsbygoogle\b[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi, "");
    return html;
  }

  function isGtagBoilerplate(body) {
    var rest = body
      .replace(/\/\/[^\n]*/g, "")
      .replace(/window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\s*\]\s*[;,]?/g, "")
      .replace(/function\s+gtag\s*\(\s*\)\s*\{\s*(?:window\.)?dataLayer\.push\(\s*arguments\s*\)\s*;?\s*\}\s*[;,]?/g, "")
      .replace(/(?:if\s*\([^)]*\)\s*)?gtag\(\s*["'](?:js|config|set|consent)["']\s*,\s*(?:new Date(?:\(\))?|["'][^"']*["'](?:\s*,\s*\{[^}]*\})?)\s*\)\s*[;,]?/g, "")
      .replace(/[\s;,]/g, "");
    return rest === "" && /gtag|dataLayer/.test(body);
  }

  function baseFor(url) {
    var folder = url.slice(0, url.lastIndexOf("/") + 1);
    // raw.githubusercontent.com/<u>/<r>/(refs/heads/)?<branch>/<path>  ->  cdn.jsdelivr.net/gh/<u>/<r>@<branch>/<path>
    var m = folder.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.*)$/i);
    if (m) folder = "https://cdn.jsdelivr.net/gh/" + m[1] + "/" + m[2] + "@" + m[3] + "/" + m[4];
    return folder;
  }

  // first match of re that is not inside a <script>…</script> or <!-- comment --> (some files embed whole
  // HTML documents in JS strings, e.g. '<head>\n' — inserting there would break the script)
  function findOutside(html, re) {
    var g = new RegExp(re.source, "gi"), m;
    while ((m = g.exec(html))) {
      var i = m.index;
      var so = Math.max(html.lastIndexOf("<script", i), html.lastIndexOf("<SCRIPT", i));
      var sc = Math.max(html.lastIndexOf("</script", i), html.lastIndexOf("</SCRIPT", i));
      var co = html.lastIndexOf("<!--", i), cc = html.lastIndexOf("-->", i);
      if (so <= sc && co <= cc) return m;
    }
    return null;
  }

  window.sanitizeGameHtml = function (html, url) {
    try { html = removeTrackers(html); } catch (e) { /* never block the game on a sanitizer bug */ }
    for (var r = 0; r < REWRITES.length; r++) html = html.replace(REWRITES[r][0], REWRITES[r][1]);
    var headTag = findOutside(html, /<head(?:\s[^>]*)?>/);
    var headEnd = findOutside(html, /<\/head\s*>|<body[\s>]/);
    // does the file already set its own <base href> in its head? (the first <base> wins, so don't add ours)
    var b = findOutside(html, /<base\b[^>]*\bhref\s*=/);
    var hasBase = !!b && (!headEnd || b.index < headEnd.index);
    var fix = fileFix(url) || {};
    if (fix.base) hasBase = false;
    var add = (hasBase ? "" : '<base href="' + (fix.base || baseFor(url)) + '">') +
      "<script>" + SHIM + "<\/script><style>" + CSS + "</style>";
    var at;
    if (headTag) at = headTag.index + headTag[0].length;
    else { var d = html.match(/^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i); at = d ? d[0].length : 0; }
    return html.slice(0, at) + add + html.slice(at);
  };
})();
