// Bulk game import: accepts JSON, a JavaScript array literal, or CSV with a header row.

/** Turn a JavaScript array literal (unquoted keys, 'single quotes', trailing commas,
 *  `const data = [...];`) into JSON, without touching text inside strings. */
export function jsToJson(text) {
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Couldn't find a [ ... ] list in what you pasted.");
  text = text.slice(start, end + 1);
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      const buf = [];
      i++;
      while (i < n && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < n) {
          const nxt = text[i + 1];
          buf.push(nxt === "'" ? nxt : "\\" + nxt);
          i += 2;
          continue;
        }
        buf.push(text[i] === '"' ? '\\"' : text[i] === "\n" ? "\\n" : text[i]);
        i++;
      }
      out.push('"' + buf.join("") + '"');
      i++;
    } else if (text.startsWith("//", i)) {
      while (i < n && text[i] !== "\n") i++;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      i = close === -1 ? n : close + 2;
    } else if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
      const word = text.slice(i, j);
      let k = j;
      while (k < n && " \t\r\n".includes(text[k])) k++;
      out.push(k < n && text[k] === ":" ? `"${word}"` : word);
      i = j;
    } else {
      out.push(ch);
      i++;
    }
  }
  return out.join("").replace(/,(\s*[\]}])/g, "$1");
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || "").trim()])));
}

export function parseGameList(text) {
  const stripped = text.trim();
  if (!stripped) return [];
  if (stripped.startsWith("[") || stripped.startsWith("{") || stripped.split("\n", 1)[0].includes("[")) {
    let items;
    try { items = JSON.parse(stripped); }
    catch {
      try { items = JSON.parse(jsToJson(stripped)); }
      catch (e) { throw new Error(e.message.startsWith("Couldn't") ? e.message : "that isn't valid JSON or a JavaScript list"); }
    }
    if (items && !Array.isArray(items) && typeof items === "object") items = items.games || items.data || [items];
    return (Array.isArray(items) ? items : []).filter((x) => x && typeof x === "object" && !Array.isArray(x));
  }
  return parseCsv(stripped);
}

export function cleanGenres(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[,|;]/);
  return parts.map((p) => String(p).trim()).filter(Boolean).join(", ");
}
