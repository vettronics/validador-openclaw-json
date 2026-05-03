"use strict";

(function () {
  function q(id) { return document.getElementById(id); }

  function clearAnalysis() {
    var metrics = q("metrics");
    var results = q("results");
    if (metrics) {
      var settingsCount = q("settingsCount") ? q("settingsCount").textContent : "0";
      metrics.innerHTML = '<div class="metric"><strong>0</strong><span>erros</span></div>' +
        '<div class="metric"><strong>0</strong><span>avisos</span></div>' +
        '<div class="metric"><strong>0</strong><span>info</span></div>' +
        '<div class="metric"><strong id="settingsCount">' + settingsCount + '</strong><span>settings</span></div>';
    }
    if (results) {
      results.innerHTML = '<div class="issue info"><span class="badge info">info</span><strong>Análise limpa</strong><p>Podes editar o ficheiro e voltar a clicar em <code>Analisar</code>.</p></div>';
    }
    if (window.fitIdeLayout) setTimeout(window.fitIdeLayout, 20);
  }

  function getEditorText() {
    if (window.editor && typeof window.editor.getValue === "function") return window.editor.getValue();
    var fallback = q("fallbackEditor");
    return fallback ? fallback.value : "";
  }

  function focusLine(line, column) {
    line = Math.max(1, Number(line) || 1);
    column = Math.max(1, Number(column) || 1);
    if (window.editor) {
      window.editor.focus();
      window.editor.revealLineInCenter(line);
      window.editor.setPosition({ lineNumber: line, column: column });
      return;
    }
    var fallback = q("fallbackEditor");
    if (!fallback) return;
    var lines = fallback.value.split(/\r?\n/);
    var pos = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    pos += column - 1;
    fallback.focus();
    fallback.selectionStart = pos;
    fallback.selectionEnd = pos;
  }

  function searchInEditor() {
    var input = q("searchText");
    if (!input) return;
    var needle = input.value;
    if (!needle) return;
    var text = getEditorText();
    var idx = text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) {
      var status = q("ideStatus");
      if (status) status.textContent = "Texto não encontrado: " + needle;
      return;
    }
    var before = text.slice(0, idx).split(/\r?\n/);
    var line = before.length;
    var column = before[before.length - 1].length + 1;
    focusLine(line, column);
    var status2 = q("ideStatus");
    if (status2) status2.textContent = "Encontrado na linha " + line + ".";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var reset = q("resetAnalysisBtn");
    var search = q("searchBtn");
    var input = q("searchText");
    if (reset) reset.addEventListener("click", clearAnalysis);
    if (search) search.addEventListener("click", searchInEditor);
    if (input) input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") searchInEditor();
    });
  });
})();
