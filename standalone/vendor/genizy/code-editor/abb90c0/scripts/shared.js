let runcodeonedit = false;
function getCaretPos(element) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    let preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
}

function setCaretPos(element, offset) {
    let currentOffset = 0;
    const sel = window.getSelection();
    sel.removeAllRanges();

    const range = document.createRange();

    function traverse(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const nextOffset = currentOffset + node.length;
            if (offset <= nextOffset) {
                range.setStart(node, offset - currentOffset);
                range.collapse(true);
                sel.addRange(range);
                throw "found";
            }
            currentOffset = nextOffset;
        } else {
            for (let i = 0; i < node.childNodes.length; i++) {
                traverse(node.childNodes[i]);
            }
        }
    }
    try {
        traverse(element);
        range.selectNodeContents(element);
        range.collapse(false);
        sel.addRange(range);
    } catch (e) {
        if (e !== "found") throw e;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('code[contenteditable="true"]').forEach(codeBlock => {

        codeBlock.addEventListener('paste', e => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            selection.getRangeAt(0).insertNode(document.createTextNode(text));
            selection.collapseToEnd();
        });
        
        codeBlock.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const tabNode = document.createTextNode('\t');
                range.insertNode(tabNode);
                range.setStartAfter(tabNode);
                range.setEndAfter(tabNode);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });

        let highlightTimeout;
        codeBlock.addEventListener('input', function(e) {
            clearTimeout(highlightTimeout);
            highlightTimeout = setTimeout(() => {
                const caretPos = getCaretPos(codeBlock);
                codeBlock.textContent = codeBlock.textContent;
                codeBlock.removeAttribute("data-highlighted");
                hljs.highlightElement(codeBlock);
                setCaretPos(codeBlock, caretPos);
                if (runcodeonedit) {
                    runCode();
                }
            }, 200);
        });
        
    });
});

function gohome() {
    if (typeof singlefile !== 'undefined') {
        fetch("singlefile.html").then(res => res.text()).then(html => {
            document.documentElement.innerHTML = html;
            document.documentElement.querySelectorAll('script').forEach(oldScript => {
                const newScript = document.createElement('script');
                if (oldScript.src) {
                    newScript.src = oldScript.src;
                } else {
                    newScript.textContent = oldScript.textContent;
                }
                document.body.appendChild(newScript);
            });
            try {
                let singlefile = true;
            } catch (error) {}
        });
    } else {
        location.href = "index.html"
    }
}

hljs.highlightAll();