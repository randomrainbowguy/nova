#!/usr/bin/env python3
"""Copies the most-played freebuisness/html games, and every file they load from other GitHub
repos, into this repo (standalone/games/ and standalone/vendor/), so a game needs nothing but Nova.

    python3 tools/vendor/vendor.py --top 300            # plan + download + rewrite
    python3 tools/vendor/vendor.py --top 300 --dry-run  # only the plan (sizes, what fits)
    python3 tools/vendor/vendor.py --games 27,33 --src /path/to/freebuisness-html-checkout

How a game is handled
  1. Its HTML is read from freebuisness/html at the pinned commit (SRC_SHA).
  2. Every URL in it that points at a GitHub repo (jsDelivr, githack, raw.githubusercontent, statically,
     github.com/blob|raw) is resolved against that repo's file tree at that commit. A file is copied as
     is; a folder (e.g. the <base href> of a Unity build) is copied whole when it is small enough,
     otherwise only the entries the game names. Copied .js/.css/.json/.html files are scanned the same
     way, so a loader that fetches more files is followed.
  3. Files land in standalone/vendor/<owner>/<repo>/<commit7>/<path> (shared between games), and the
     game HTML, with every repo URL rewritten to that folder, in standalone/games/<number>.html.
     URLs are written against CANON (this repo on jsDelivr, @overnight); the hub swaps that prefix for
     whatever address it is running from. Files over 20 MB (jsDelivr's limit) are written against
     RAW_CANON (raw.githubusercontent.com, 100 MB limit) instead.
  4. standalone/vendor/manifest.json lists every game: what was copied, from where, what was skipped
     and why. Games that need a file over 100 MB, or whose source repo is gone, are skipped.
Nothing here needs more than Python 3 and a `gh auth token` (for the GitHub API).
"""
import argparse
import concurrent.futures as cf
import html as htmlmod
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
STANDALONE = os.path.join(ROOT, "standalone")
CACHE = os.path.join(HERE, ".cache")

SRC_REPO = "freebuisness/html"
SRC_SHA = "ee1a41a86692fbcd7bca5c5700f19433d169e2cf"   # 2026-10-12
COVERS_REPO, COVERS_SHA = "freebuisness/covers", "298e9bedbc2ae3d7257bb67f28752a4c151ba5f8"
NOVA_REPO, NOVA_BRANCH = "randomrainbowguy/nova", "overnight"
CANON = f"https://cdn.jsdelivr.net/gh/{NOVA_REPO}@{NOVA_BRANCH}/standalone/"
RAW_CANON = f"https://raw.githubusercontent.com/{NOVA_REPO}/{NOVA_BRANCH}/standalone/"
JSDELIVR_MAX = 20 * 1024 * 1024      # jsDelivr refuses bigger files
GITHUB_MAX = 100 * 1024 * 1024       # GitHub refuses bigger files
DIR_FULL_MAX = 48 * 1024 * 1024      # a referenced folder up to this size is copied whole
TEXT_EXT = {".js", ".mjs", ".css", ".json", ".html", ".htm", ".txt", ".xml", ".svg", ".vtt", ".tres", ".cfg", ".ini", ".glsl", ".frag", ".vert"}

# The same URL fixes public/static/game-sanitize.js applies at load time (moved/renamed assets).
REWRITES = [
    (re.compile(r"cdn\.jsdelivr\.net/(?!gh/|npm/|wp/|combine/)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@)"), r"cdn.jsdelivr.net/gh/\1"),
    (re.compile(r"cdn\.jsdelivr\.net/(?:gh/)?axo323lotl-bit/elitecomposite@main/"), "rawcdn.githack.com/genizy/brainrot/main/"),
    (re.compile(r"cdn\.jsdelivr\.net/gh/bubblfan/UGS-Assets@main/tag/"), "cdn.jsdelivr.net/gh/bubbls/UGS-Assets@main/tag/"),
]

URL_RE = re.compile(
    r"https?://(?:cdn\.jsdelivr\.net/gh|(?:rawcdn|bbcdn|raw)\.githack\.com|raw\.githubusercontent\.com|cdn\.statically\.io/gh|github\.com)"
    r"/[^\s\"'<>()`\\]+", re.I)
# One regex that matches the "<host>/<owner>/<repo>@<ref>/" prefix of any of those URL styles.
PREFIX_RE = re.compile(
    r"https?://(?:"
    r"cdn\.jsdelivr\.net/gh/(?P<o1>[^/@\s\"'<>]+)/(?P<r1>[^/@\s\"'<>]+)(?:@(?P<v1>[^/\s\"'<>]+))?/?"
    r"|(?:rawcdn|bbcdn|raw)\.githack\.com/(?P<o2>[^/\s\"'<>]+)/(?P<r2>[^/\s\"'<>]+)/(?P<v2>[^/\s\"'<>]+)/"
    r"|raw\.githubusercontent\.com/(?P<o3>[^/\s\"'<>]+)/(?P<r3>[^/\s\"'<>]+)/(?:refs/heads/)?(?P<v3>[^/\s\"'<>]+)/"
    r"|cdn\.statically\.io/gh/(?P<o4>[^/@\s\"'<>]+)/(?P<r4>[^/@\s\"'<>]+)[@/](?P<v4>[^/\s\"'<>]+)/"
    r"|github\.com/(?P<o5>[^/\s\"'<>]+)/(?P<r5>[^/\s\"'<>]+)/(?:raw|blob)/(?:refs/heads/)?(?P<v5>[^/\s\"'<>]+)/"
    r")", re.I)


def log(*a):
    print(*a, flush=True)


def gh_token():
    try:
        return subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return ""


TOKEN = gh_token()


def http(url, binary=False, tries=4, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "nova-vendor", **({"Authorization": "Bearer " + TOKEN} if TOKEN and "github" in url else {})})
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 403, 451, 422):
                raise
            last = e
        except Exception as e:  # noqa
            last = e
        time.sleep(1.5 * (i + 1))
    raise last


def api(path):
    key = os.path.join(CACHE, "api", re.sub(r"[^A-Za-z0-9_.@-]+", "_", path) + ".json")
    if os.path.exists(key):
        return json.load(open(key))
    try:
        data = json.loads(http("https://api.github.com/" + path))
    except urllib.error.HTTPError as e:
        data = {"_error": f"HTTP {e.code}"}
    os.makedirs(os.path.dirname(key), exist_ok=True)
    json.dump(data, open(key, "w"))
    return data


class Repo:
    """A GitHub repo at one commit: its file tree (path -> size) and folder sizes."""
    _cache = {}

    @classmethod
    def get(cls, owner, name, ref):
        key = (owner.lower(), name.lower(), ref)
        if key not in cls._cache:
            cls._cache[key] = cls(owner, name, ref)
        return cls._cache[key]

    def __init__(self, owner, name, ref):
        self.owner, self.name, self.ref = owner, name, ref
        self.error = None
        self.ghost = False
        info = api(f"repos/{owner}/{name}")
        if "_error" in info:
            # Gone from GitHub. jsDelivr keeps every file it ever served, so files a game asks for by
            # full URL (extras.json, from verify.py) can still be fetched one by one; see ghost_fetch().
            self.error = f"repo {owner}/{name}: {info['_error']} (deleted or blocked; files come from jsDelivr's cache)"
            self.ghost = True
            self.sha = None
            self.files = {}
            self.dirs = set()
            self._dirsize = {}
            return
        self.owner, self.name = info["full_name"].split("/")   # canonical casing
        real = ref
        if ref == "latest":   # jsDelivr: newest release/tag, or the default branch if there is none
            rel = api(f"repos/{owner}/{name}/releases/latest")
            tags = api(f"repos/{owner}/{name}/tags") if "_error" in rel else []
            real = rel.get("tag_name") or (tags[0]["name"] if isinstance(tags, list) and tags else info["default_branch"])
        if re.fullmatch(r"[0-9a-f]{40}", real):
            self.sha = real
        else:
            c = api(f"repos/{owner}/{name}/commits/{urllib.parse.quote(real, safe='')}")
            self.sha = c.get("sha")
            if not self.sha:
                self.error = f"{owner}/{name}@{ref}: {c.get('_error', 'no such branch/tag')} (files come from jsDelivr's cache)"
                self.ghost, self.sha, self.files, self.dirs, self._dirsize = True, None, {}, set(), {}
                return
        t = api(f"repos/{owner}/{name}/git/trees/{self.sha}?recursive=1")
        if "tree" not in t:
            self.error = f"{owner}/{name}@{ref}: {t.get('_error', 'no tree')} (files come from jsDelivr's cache)"
            self.ghost, self.sha, self.files, self.dirs, self._dirsize = True, None, {}, set(), {}
            return
        self.truncated = t.get("truncated", False)
        self.files = {e["path"]: e.get("size", 0) for e in t["tree"] if e["type"] == "blob"}
        self.dirs = set()
        for p in self.files:
            d = posixpath.dirname(p)
            while d:
                self.dirs.add(d)
                d = posixpath.dirname(d)
        self._dirsize = {}

    @property
    def sha7(self):
        return (self.sha or self.ref)[:7]

    def dir_size(self, d):
        if d not in self._dirsize:
            pre = d + "/" if d else ""
            self._dirsize[d] = sum(s for p, s in self.files.items() if p.startswith(pre))
        return self._dirsize[d]

    def under(self, d):
        pre = d + "/" if d else ""
        return [p for p in self.files if p.startswith(pre)]

    def vendor_dir(self):
        return f"{self.owner}/{self.name}/{self.sha7}"

    def ghost_fetch(self, path):
        """For a ghost repo: fetch one file from jsDelivr's cache straight into the vendor folder."""
        dest = os.path.join(STANDALONE, "vendor", self.vendor_dir(), path)
        if os.path.exists(dest):
            self.files[path] = os.path.getsize(dest)
            return True
        try:
            data = http(self.jsdelivr_url(path), binary=True, timeout=300)
        except Exception:  # noqa
            return False
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)
        self.files[path] = len(data)
        return True

    def raw_url(self, path):
        return f"https://raw.githubusercontent.com/{self.owner}/{self.name}/{self.sha}/" + urllib.parse.quote(path)

    def jsdelivr_url(self, path):
        return f"https://cdn.jsdelivr.net/gh/{self.owner}/{self.name}@{self.ref}/" + urllib.parse.quote(path)


def parse_prefix(m):
    for i in "12345":
        if m.group("o" + i):
            return m.group("o" + i), m.group("r" + i), m.group("v" + i) or "main"
    return None


def split_url(url):
    """-> (owner, repo, ref, path) for a repo URL, or None."""
    url = htmlmod.unescape(url).rstrip(".,;:")
    m = PREFIX_RE.match(url)
    if not m:
        return None
    o, r, v = parse_prefix(m)
    path = url[m.end():].split("?")[0].split("#")[0]
    if (o.lower(), r.lower()) in (tuple(SRC_REPO.lower().split("/")), tuple(NOVA_REPO.lower().split("/"))):
        return None   # another game file, or this repo itself; not an asset to copy
    return o, r, v, urllib.parse.unquote(path)


def norm(p):
    p = posixpath.normpath(p) if p else ""
    return "" if p in (".", "/") else p.lstrip("/")


# Strings in a file that could be a relative path to an asset: quoted, or bare in CSS url()/@import.
HINT_RE = re.compile(r"""["'`(]\s*(?:\.{0,2}/)?([A-Za-z0-9_][A-Za-z0-9_./ %@+-]{0,200}\.[A-Za-z0-9]{1,8})\s*(?:[?#][^"'`)]*)?["'`)]""")


def hints(text):
    out = set()
    for h in HINT_RE.findall(text):
        h = htmlmod.unescape(h)
        if "://" in h or h.startswith("data:"):
            continue
        out.add(norm(urllib.parse.unquote(h)))
    return out


class Game:
    def __init__(self, num, file, meta):
        self.num, self.file, self.meta = num, file, meta
        self.html = None
        self.wanted = {}        # (repo key) -> set(paths)   files to copy
        self.repos = {}         # key -> Repo
        self.full_dirs = set()  # (key, dir) copied whole
        self.problems = []      # strings
        self.foreign = set()    # non-GitHub hosts the game talks to
        self.scanned = set()
        self.big = {}           # (key, path) -> size, files over JSDELIVR_MAX

    def key(self, repo):
        return (repo.owner.lower(), repo.name.lower(), repo.sha or repo.ref)

    def want(self, repo, path):
        if path not in repo.files:
            return False
        self.wanted.setdefault(self.key(repo), set()).add(path)
        self.repos[self.key(repo)] = repo
        return True

    def want_dir(self, repo, d, hint_set):
        k = self.key(repo)
        if (k, d) in self.full_dirs:
            return
        if repo.dir_size(d) <= DIR_FULL_MAX:
            self.full_dirs.add((k, d))
            for p in repo.under(d):
                self.want(repo, p)
            return
        # Too big to take whole: take what the game names (files, and folders it names).
        pre = d + "/" if d else ""
        by_name = {}
        for p in repo.under(d):
            by_name.setdefault(posixpath.basename(p), []).append(p)
        for h in hint_set:
            found = False
            for cand in {norm(posixpath.join(d, h)), h}:
                if cand in repo.files:
                    self.want(repo, cand)
                    found = True
                elif cand in repo.dirs and cand != d and cand.startswith(pre):
                    self.want_dir(repo, cand, hint_set)
                    found = True
            if not found:
                # named with a folder the game builds at runtime ("Build" + "/x.data"): take every file of that
                # name, and files derived from it (x.data.br, x.data.part0 ...)
                b = posixpath.basename(h)
                cands = [p for n, ps in by_name.items() if n == b or n.startswith(b + ".") for p in ps]
                if 1 <= len(cands) <= 40:
                    for p in cands:
                        self.want(repo, p)
        self.problems.append(f"folder {repo.owner}/{repo.name}@{repo.sha7}/{d} is {repo.dir_size(d)/1e6:.0f} MB; copied only the entries the game names")

    def add_refs(self, text, base_dir=None, base_repo=None):
        """Find repo URLs (and, against a base folder, relative paths) in text and queue the files."""
        hint_set = hints(text)
        for u in URL_RE.findall(text):
            s = split_url(u)
            if not s:
                continue
            o, r, v, path = s
            repo = Repo.get(o, r, v)
            path = norm(path)
            if repo.ghost:
                if path and not path.endswith("/") and repo.ghost_fetch(path):
                    self.want(repo, path)
                elif repo.error not in self.problems:
                    self.problems.append(repo.error)
                continue
            if repo.error:
                self.problems.append(repo.error)
                continue
            if path == "" or path in repo.dirs:
                self.want_dir(repo, path, hint_set)
            elif path in repo.files:
                self.want(repo, path)
                d = posixpath.dirname(path)
            elif path + "/index.html" in repo.files:
                self.want_dir(repo, path, hint_set)
            else:
                # Maybe a folder prefix used as a base for dynamic names ("Build/x" + ".data")
                sib = [p for p in repo.files if p.startswith(path)]
                if sib and len(sib) <= 40:
                    for p in sib:
                        self.want(repo, p)
                else:
                    self.problems.append(f"missing in source: {o}/{r}@{repo.sha7}/{path}")
        if base_repo is not None and base_dir is not None:
            for h in hint_set:
                cand = norm(posixpath.join(base_dir, h))
                if cand in base_repo.files:
                    self.want(base_repo, cand)
                elif cand in base_repo.dirs and base_repo.dir_size(cand) <= DIR_FULL_MAX:
                    self.want_dir(base_repo, cand, hint_set)

    def base(self):
        """The game's own <base href> as (repo, dir), if it points at a repo."""
        m = re.search(r"<base\s[^>]*href\s*=\s*[\"']([^\"']+)", self.html, re.I)
        if not m:
            return None, None
        s = split_url(m.group(1))
        if not s:
            return None, None
        repo = Repo.get(s[0], s[1], s[2])
        return (None, None) if repo.error or repo.ghost else (repo, norm(s[3]))

    def files_list(self):
        return [(k, p) for k, ps in self.wanted.items() for p in sorted(ps)]

    def total_bytes(self):
        return sum(self.repos[k].files[p] for k, p in self.files_list())


def load_html(num, file, src_dir):
    if src_dir:
        return open(os.path.join(src_dir, file), encoding="utf-8", errors="replace").read()
    key = os.path.join(CACHE, "src", file)
    if not os.path.exists(key):
        os.makedirs(os.path.dirname(key), exist_ok=True)
        open(key, "w", encoding="utf-8").write(http(f"https://raw.githubusercontent.com/{SRC_REPO}/{SRC_SHA}/{file}"))
    return open(key, encoding="utf-8", errors="replace").read()


def is_text(path):
    return os.path.splitext(path)[1].lower() in TEXT_EXT


def dest_path(repo_key, repo, path):
    return os.path.join(STANDALONE, "vendor", repo.vendor_dir(), path)


def download(repo, path, dest):
    if os.path.exists(dest) and os.path.getsize(dest) == repo.files[path]:
        return "cached"
    if repo.ghost:
        return "ok" if repo.ghost_fetch(path) else "missing"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    data = http(repo.raw_url(path), binary=True, timeout=600)
    tmp = dest + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, dest)
    return "ok"


EXTRAS_PATH = os.path.join(HERE, "extras.json")


def load_extras():
    """{game number: [url, ...]}: files a game asked for while running (found by verify.py) that the
    static scan missed, e.g. URLs built at runtime by obfuscated loaders."""
    return {int(k): v for k, v in json.load(open(EXTRAS_PATH)).items()} if os.path.exists(EXTRAS_PATH) else {}


def plan_game(g, src_dir, extras=None):
    g.html = load_html(g.num, g.file, src_dir)
    for pat, rep in REWRITES:
        g.html = pat.sub(rep, g.html)
    base_repo, base_dir = g.base()
    g.add_refs(g.html, base_dir, base_repo)
    for u in (extras or {}).get(g.num, []):
        g.add_refs(f'"{u}"', base_dir, base_repo)
    for h in re.findall(r"https?://([A-Za-z0-9.-]+)", g.html):
        if not re.search(r"(jsdelivr|githack|githubusercontent|statically|github\.com|github\.io|w3\.org|googleapis|gstatic|schema\.org|purl\.org|apple\.com|mozilla|microsoft|whatbrowser|khronos|emscripten|youtube|twitter|discord|facebook|instagram|google\.com|yoyogames|unity3d|unity\.com|godotengine|renpy|adobe\.com|macromedia|w3schools|wikipedia|tiktok|reddit|steampowered|itch\.io|twitch|poki|crazygames|cloudflare|jquery\.com|yandex|gamedistribution|gamemonetize)", h, re.I):
            g.foreign.add(h.lower())
    return g


def scan_downloaded(g, dest_of):
    """Follow URLs and relative paths inside copied text files; returns True when new files were added."""
    before = len(g.files_list())
    base_repo, base_dir = g.base()
    for k, p in list(g.files_list()):
        if (k, p) in g.scanned or not is_text(p):
            continue
        g.scanned.add((k, p))
        repo = g.repos[k]
        try:
            text = open(dest_of(k, repo, p), encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        if len(text) > 6_000_000:
            continue
        g.add_refs(text, posixpath.dirname(p), repo)
        if base_repo is not None:
            g.add_refs(text, base_dir, base_repo)
    return len(g.files_list()) > before


def rewrite_text(text, g):
    """Every repo URL whose repo+ref we know becomes a CANON vendor URL (RAW_CANON for files > 20 MB)."""
    def repl(m):
        o, r, v = parse_prefix(m)
        if (o.lower(), r.lower()) in (tuple(SRC_REPO.lower().split("/")), tuple(NOVA_REPO.lower().split("/"))):
            return m.group(0)   # another game file, or an already-rewritten URL (re-runs must be idempotent)
        repo = Repo.get(o, r, v)
        if repo.ghost:
            return f"{CANON}vendor/{repo.vendor_dir()}/" if repo.files else m.group(0)
        if repo.error or not repo.sha:
            return m.group(0)
        return f"{CANON}vendor/{repo.vendor_dir()}/"
    text = PREFIX_RE.sub(repl, text)
    # game-sanitize.js replaces the Yandex SDK (freebuisness/assets@main/yandex-sdk.js) with a stand-in
    # and recognises it by that URL, so leave it alone.
    text = re.sub(re.escape(CANON) + r"vendor/freebuisness/assets/[0-9a-f]{7}/yandex-sdk\.js",
                  "https://cdn.jsdelivr.net/gh/freebuisness/assets@main/yandex-sdk.js", text)
    # Big files: point their (now CANON) URL at raw.githubusercontent instead.
    for (k, p), size in g.big.items():
        repo = g.repos[k]
        for enc in {p, urllib.parse.quote(p)}:
            text = text.replace(f"{CANON}vendor/{repo.vendor_dir()}/{enc}", f"{RAW_CANON}vendor/{repo.vendor_dir()}/{enc}")
    return text


# Injected first in every copied game. Repo URLs the static rewrite could not see (built at run time,
# often by obfuscated loaders) are redirected to the copy in this repo: fetch, XMLHttpRequest, Worker,
# src/href of script/img/audio/video/source/link/iframe, setAttribute, and document.write.
RUNTIME_MAP = r"""<script>(function(){var M=__MAP__,V=__VENDOR__,RAW=__RAW__,BIG=__BIG__;
var RE=/^(?:https?:)?\/\/(?:cdn\.jsdelivr\.net\/gh\/([^\/@?#]+)\/([^\/@?#]+)(?:@([^\/?#]+))?|(?:rawcdn|bbcdn|raw)\.githack\.com\/([^\/?#]+)\/([^\/?#]+)\/([^\/?#]+)|raw\.githubusercontent\.com\/([^\/?#]+)\/([^\/?#]+)\/(?:refs\/heads\/)?([^\/?#]+)|cdn\.statically\.io\/gh\/([^\/@?#]+)\/([^\/@?#]+)[@\/]([^\/?#]+)|github\.com\/([^\/?#]+)\/([^\/?#]+)\/(?:raw|blob)\/(?:refs\/heads\/)?([^\/?#]+))\/?([^?#]*)(.*)$/i;
var C=/^https:\/\/cdn\.jsdelivr\.net\/gh\/randomrainbowguy\/nova@[^\/]+\/standalone\/vendor\//i,CR=/^https:\/\/raw\.githubusercontent\.com\/randomrainbowguy\/nova\/[^\/]+\/standalone\/vendor\//i;
function map(u){if(typeof u!=="string")return u;if(C.test(u))return u.replace(C,V);if(CR.test(u))return u.replace(CR,RAW);var m=RE.exec(u);if(!m)return u;
var o,r,v,i;for(i=1;i<=13;i+=3)if(m[i]){o=m[i];r=m[i+1];v=m[i+2]||"main";break}
var e=M[(o+"/"+r).toLowerCase()];if(!e)return u;var d=e[v];if(!d)return u;
var p=(m[16]||"").replace(/^\//,"");try{p=decodeURIComponent(p)}catch(x){}
return (BIG[d+"/"+p]?RAW:V)+d+"/"+encodeURI(p).replace(/#/g,"%23")+(m[17]||"");}
var w=window;try{w.__novaVendorMap=map}catch(x){}
if(w.fetch){var f=w.fetch;w.fetch=function(a,b){try{if(typeof a==="string")a=map(a);else if(a&&typeof a.url==="string"&&map(a.url)!==a.url)a=new Request(map(a.url),a)}catch(x){}return f.call(this,a,b)}}
if(w.XMLHttpRequest){var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=Array.prototype.slice.call(arguments);try{a[1]=map(String(u))}catch(x){}return xo.apply(this,a)}}
if(w.Worker){var W=w.Worker;w.Worker=function(u,o){return new W(map(String(u)),o)};w.Worker.prototype=W.prototype}
function prop(C,n){try{var d=Object.getOwnPropertyDescriptor(C.prototype,n);if(!d||!d.set)return;Object.defineProperty(C.prototype,n,{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,map(String(v)))}})}catch(x){}}
[["HTMLScriptElement","src"],["HTMLImageElement","src"],["HTMLAudioElement","src"],["HTMLVideoElement","src"],["HTMLMediaElement","src"],["HTMLSourceElement","src"],["HTMLIFrameElement","src"],["HTMLLinkElement","href"],["HTMLObjectElement","data"],["HTMLEmbedElement","src"]].forEach(function(e){if(w[e[0]])prop(w[e[0]],e[1])});
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(/^(src|href|data|srcset)$/i.test(n))v=map(String(v));return sa.call(this,n,v)};
var dw=document.write,dl=document.writeln,fix=function(s){return String(s).replace(/https?:\/\/[^\s"'<>()]+/g,map)};
document.write=function(){return dw.apply(document,Array.prototype.map.call(arguments,fix))};document.writeln=function(){return dl.apply(document,Array.prototype.map.call(arguments,fix))};
var ih=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML");if(ih&&ih.set)Object.defineProperty(Element.prototype,"innerHTML",{configurable:true,enumerable:ih.enumerable,get:ih.get,set:function(v){ih.set.call(this,typeof v==="string"&&/jsdelivr|githack|githubusercontent|statically|github\.com/i.test(v)?fix(v):v)}});
})();</script>"""


def runtime_map(g):
    """The RUNTIME_MAP script for this game: every repo it uses, by owner/repo and ref (and "*")."""
    m = {}
    for k, repo in g.repos.items():
        e = m.setdefault(f"{repo.owner}/{repo.name}".lower(), {})
        for ref in {repo.ref, repo.sha or repo.ref, (repo.sha or repo.ref)[:7]} | ({"main", "master", "latest"} if not repo.ghost else set()):
            if ref and ref not in e:
                e[ref] = repo.vendor_dir()
    big = {f"{g.repos[k].vendor_dir()}/{p}": 1 for (k, p) in g.big}
    return (RUNTIME_MAP.replace("__MAP__", json.dumps(m)).replace("__VENDOR__", json.dumps(CANON + "vendor/"))
            .replace("__RAW__", json.dumps(RAW_CANON + "vendor/")).replace("__BIG__", json.dumps(big)))


def inject_first(html, script):
    """Put script before anything else that runs: right after <head>, or at the very top when a <script>
    comes before <head> (some files are one script that writes the whole page)."""
    head = re.search(r"<head[\s>]", html, re.I)
    first_script = re.search(r"<script[\s>]", html, re.I)
    if not head or (first_script and first_script.start() < head.start()):
        d = re.match(r"^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>", html, re.I)
        at = d.end() if d else 0
        return html[:at] + script + html[at:]
    end = html.index(">", head.start()) + 1
    return html[:end] + script + html[end:]


def rewrite_relative_big(text, g, base_repo, base_dir):
    """A relative path (against the game's <base>) to a file > 20 MB becomes its absolute RAW_CANON URL."""
    if base_repo is None:
        return text
    bk = g.key(base_repo)
    for (k, p), size in g.big.items():
        if k != bk:
            continue
        rel = posixpath.relpath(p, base_dir) if base_dir else p
        absu = f"{RAW_CANON}vendor/{base_repo.vendor_dir()}/{urllib.parse.quote(p)}"
        for enc in {rel, urllib.parse.quote(rel)}:
            text = re.sub(r"""(["'`(])\s*(?:\./)?""" + re.escape(enc) + r"""(\s*[?#"'`)])""", lambda m: m.group(1) + absu + m.group(2), text)
    return text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=300, help="how many games, by jsDelivr hits (default 300)")
    ap.add_argument("--games", help="only these game numbers, comma-separated")
    ap.add_argument("--ranking", default=os.path.join(HERE, "ranking.json"), help="from rank.py")
    ap.add_argument("--src", help="a checkout of freebuisness/html (otherwise files are fetched)")
    ap.add_argument("--budget-mb", type=float, default=0, help="stop adding games past this many MB (0 = no cap)")
    ap.add_argument("--max-game-mb", type=float, default=50, help="skip a game needing more than this (0 = no cap); the next in the ranking takes its place")
    ap.add_argument("--prune", action="store_true", help="afterwards delete copied files no kept game uses")
    ap.add_argument("--dry-run", action="store_true", help="plan only; download nothing, write nothing")
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)

    ranking = json.load(open(args.ranking))   # [{num, hits, file, name, nova_id}, ...]
    if args.games:
        want = {int(x) for x in args.games.split(",")}
        ranking = [r for r in ranking if r["num"] in want]
    # otherwise: walk the whole ranking until args.top games are copied (skipped ones don't count)

    extras = load_extras()
    manifest_path = os.path.join(STANDALONE, "vendor", "manifest.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) and not args.dry_run else {"games": {}}
    total = 0
    done = skipped = 0
    files_dir = os.path.join(CACHE, "files")
    os.makedirs(files_dir, exist_ok=True)
    for i, r in enumerate(ranking):
        if not args.games and done >= args.top:
            break
        g = Game(r["num"], r["file"], r)
        try:
            plan_game(g, args.src, extras)
        except urllib.error.HTTPError as e:
            log(f"[{i+1}/{len(ranking)}] #{g.num} {r['name']}: cannot read {g.file}: {e}")
            continue
        size = g.total_bytes()
        too_big = [(k, p) for k, p in g.files_list() if g.repos[k].files[p] > GITHUB_MAX]
        prev = manifest["games"].get(str(g.num), {})
        # keep what other tools recorded about this game (verify.py's result, covers.py's cover)
        entry = {k: prev[k] for k in ("verified", "verify_reason", "verify_errors", "leaks", "missing", "self_contained", "cover") if k in prev}
        entry.update({"num": g.num, "name": r["name"], "file": g.file, "hits": r["hits"], "nova_id": r.get("nova_id"),
                 "bytes": size, "files": len(g.files_list()), "problems": g.problems, "foreign_hosts": sorted(g.foreign),
                 "sources": sorted({f"{g.repos[k].owner}/{g.repos[k].name}@{g.repos[k].sha7}" for k in g.wanted})})
        status = "ok"
        if too_big:
            status = f"skipped: needs a file over 100 MB ({too_big[0][1]}, {g.repos[too_big[0][0]].files[too_big[0][1]]/1e6:.0f} MB)"
        elif args.max_game_mb and size > args.max_game_mb * 1e6:
            status = f"skipped: over {args.max_game_mb:.0f} MB ({size/1e6:.0f} MB)"
        elif args.budget_mb and total + size > args.budget_mb * 1e6:
            status = f"skipped: over the budget ({(total + size)/1e6:.0f} MB)"
        entry["status"] = status
        log(f"[{i+1}/{len(ranking)}] #{g.num} {r['name'][:40]!r} {g.file}: {size/1e6:.1f} MB, {entry['files']} files from {len(g.wanted)} repos -> {status}"
            + (f"; {len(g.problems)} note(s): {g.problems[0][:100]}" if g.problems else ""))
        if status != "ok":
            manifest["games"][str(g.num)] = entry
            for stale in (os.path.join(STANDALONE, "games", f"{g.num}.html"), os.path.join(files_dir, f"{g.num}.txt")):
                if os.path.exists(stale):
                    os.remove(stale)
            skipped += 1
            continue
        if args.dry_run:
            total += size
            entry["big_files"] = [f"{g.repos[k].vendor_dir()}/{p}" for k, p in g.files_list() if g.repos[k].files[p] > JSDELIVR_MAX]
            manifest["games"][str(g.num)] = entry
            done += 1
            continue
        # Download, then follow references inside copied text files until nothing new turns up.
        dest_of = dest_path
        rounds = 0
        while True:
            jobs = [(k, p) for k, p in g.files_list() if (k, p) not in g.scanned or not os.path.exists(dest_of(k, g.repos[k], p))]
            jobs = [(k, p) for k, p in jobs if not (os.path.exists(dest_of(k, g.repos[k], p)) and os.path.getsize(dest_of(k, g.repos[k], p)) == g.repos[k].files[p])]
            if jobs:
                with cf.ThreadPoolExecutor(args.workers) as ex:
                    futs = {ex.submit(download, g.repos[k], p, dest_of(k, g.repos[k], p)): (k, p) for k, p in jobs}
                    for f in cf.as_completed(futs):
                        k, p = futs[f]
                        try:
                            f.result()
                        except Exception as e:
                            g.problems.append(f"download failed: {g.repos[k].owner}/{g.repos[k].name}/{p}: {str(e)[:80]}")
            rounds += 1
            if rounds > 5 or not scan_downloaded(g, dest_of):
                break
        size = g.total_bytes()
        if args.max_game_mb and size > args.max_game_mb * 1e6:   # grew past the cap while following its loaders
            entry.update({"status": f"skipped: over {args.max_game_mb:.0f} MB ({size/1e6:.0f} MB)", "bytes": size, "files": len(g.files_list()), "problems": g.problems})
            log(f"    -> {entry['status']}")
            manifest["games"][str(g.num)] = entry
            for stale in (os.path.join(STANDALONE, "games", f"{g.num}.html"), os.path.join(files_dir, f"{g.num}.txt")):
                if os.path.exists(stale):
                    os.remove(stale)
            skipped += 1
            continue
        g.big = {(k, p): g.repos[k].files[p] for k, p in g.files_list() if g.repos[k].files[p] > JSDELIVR_MAX}
        with open(os.path.join(files_dir, f"{g.num}.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(f"{g.repos[k].vendor_dir()}/{p}" for k, p in g.files_list()))
        # Rewrite URLs in the game and in every copied text file (idempotent; shared files get the same result).
        base_repo, base_dir = g.base()
        out_html = inject_first(rewrite_relative_big(rewrite_text(g.html, g), g, base_repo, base_dir), runtime_map(g))
        os.makedirs(os.path.join(STANDALONE, "games"), exist_ok=True)
        open(os.path.join(STANDALONE, "games", f"{g.num}.html"), "w", encoding="utf-8").write(out_html)
        for k, p in g.files_list():
            if not is_text(p):
                continue
            d = dest_of(k, g.repos[k], p)
            try:
                t = open(d, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            t2 = rewrite_text(t, g)
            if t2 != t:
                open(d, "w", encoding="utf-8").write(t2)
        entry.update({"bytes": size, "files": len(g.files_list()), "problems": g.problems,
                      "big_files": [f"{g.repos[k].vendor_dir()}/{p}" for (k, p) in g.big],
                      "sources": sorted({f"{g.repos[k].owner}/{g.repos[k].name}@{g.repos[k].sha7}" for k in g.wanted}),
                      "html": f"games/{g.num}.html"})
        manifest["games"][str(g.num)] = entry
        total += size
        done += 1
        if not args.dry_run:
            os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
            json.dump(manifest, open(manifest_path, "w"), indent=1, ensure_ascii=False)
    if args.prune and not args.dry_run:
        keep = set()
        for num, e in manifest["games"].items():
            fl = os.path.join(files_dir, f"{num}.txt")
            if e["status"].startswith("ok") and os.path.exists(fl):
                keep.update(l for l in open(fl, encoding="utf-8").read().split("\n") if l)
        vroot = os.path.join(STANDALONE, "vendor")
        removed = freed = 0
        for dp, dn, fn in os.walk(vroot, topdown=False):
            for f in fn:
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, vroot)
                if rel == "manifest.json" or rel.startswith("covers/") or rel.endswith(".part"):
                    if rel.endswith(".part"):
                        os.remove(full)
                    continue
                if rel not in keep:
                    freed += os.path.getsize(full)
                    os.remove(full)
                    removed += 1
            if dp != vroot and not os.listdir(dp):
                os.rmdir(dp)
        log(f"pruned {removed} files ({freed/1e6:.0f} MB) no kept game uses")
    if args.dry_run:
        plan = os.path.join(CACHE, "plan.json")
        json.dump(manifest, open(plan, "w"), indent=1, ensure_ascii=False)
        log(f"dry run: {done} games would be copied ({total/1e6:.0f} MB), {skipped} skipped -> {plan}")
    else:
        json.dump(manifest, open(manifest_path, "w"), indent=1, ensure_ascii=False)
        log(f"done: {done} games copied ({total/1e6:.0f} MB this run), {skipped} skipped -> {manifest_path}")


if __name__ == "__main__":
    main()
