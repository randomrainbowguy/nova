runcodeonedit = true;

window.onload = function() {
    runCode();
};

function runCode() {
    const domparser = new DOMParser();
    const htmlcode = document.getElementById("htmlcode").textContent;
    const csscode = document.getElementById("csscode").textContent;
    const jscode = document.getElementById("jscode").textContent;

    const html = domparser.parseFromString(htmlcode, "text/html");

    const styleelement = document.createElement("style");
    styleelement.textContent = csscode;
    html.head.appendChild(styleelement);

    const jselement = document.createElement("script");
    jselement.textContent = jscode;
    html.body.appendChild(jselement);

    const blob = URL.createObjectURL(new Blob([html.documentElement.outerHTML], {
        type: "text/html"
    }));

    document.getElementById("htmliframe").setAttribute("src", blob);
}

document.getElementById("htmlbeautify").onclick = () => {
    let el = document.getElementById("htmlcode");
    el.textContent = html_beautify(el.textContent);
    el.removeAttribute("data-highlighted");
    hljs.highlightElement(el);
};

document.getElementById("jsbeautify").onclick = () => {
    let el = document.getElementById("jscode");
    el.textContent = js_beautify(el.textContent);
    el.removeAttribute("data-highlighted");
    hljs.highlightElement(el);
};

document.getElementById("cssbeautify").onclick = () => {
    let el = document.getElementById("csscode");
    el.textContent = css_beautify(el.textContent);
    el.removeAttribute("data-highlighted");
    hljs.highlightElement(el);
};
