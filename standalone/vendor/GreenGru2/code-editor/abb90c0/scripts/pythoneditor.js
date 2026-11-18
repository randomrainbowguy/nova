runcodeonedit = false;

(async () => {
    var output = document.getElementById("output");
    var pythoncode = document.getElementById("pythoncode");

    output.textContent = 'Initializing...\n';

    window.pyodide = await loadPyodide({ stdout: addToOutput, stderr: addToOutput });
    output.textContent = 'Output will be here\n';
})();

async function runCode() {
    const code = pythoncode.textContent;
    addToOutput(`>>> ${code}`);

    try {
        await pyodide.loadPackagesFromImports(code);
        let result = await pyodide.runPythonAsync(code);
        if (result !== undefined) {
            addToOutput(result.toString());
        }
    } catch (e) {
        addToOutput(e.toString());
    }
}

function addToOutput(s) {
    const output = document.getElementById("output");
    output.textContent += `${s}\n`;
    output.scrollTop = output.scrollHeight;
}