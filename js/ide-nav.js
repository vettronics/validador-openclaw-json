"use strict";

(function () {
  function q(id) { return document.getElementById(id); }

  function getEditorText() {
    if (window.editor && typeof window.editor.getValue === "function") return window.editor.getValue();
    var fallback = q("fallbackEditor");
    return fallback ? fallback.value : "";
  }

  function setEditorText(text) {
    if (window.editor && typeof window.editor.setValue === "function") window.editor.setValue(text);
    else {
      var fallback = q("fallbackEditor");
      if (fallback) fallback.value = text;
    }
  }

  function activateConfigTab() {
    var tab = document.querySelector('.tab[data-tab="config"]');
    if (tab && !tab.classList.contains("active")) tab.click();
  }

  function tokensFromPath(path) {
    return String(path || "")
      .replace(/^\$\.?/, "")
      .replace(/\[[^\]]*\]/g, ".")
      .split(".")
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x && x !== "?" && x !== "*" && !/^\d+$/.test(x); });
  }

  function findLineForPath(text, path) {
    var lines = String(text || "").split(/\r?\n/);
    var tokens = tokensFromPath(path);
    if (!tokens.length) return 1;

    for (var t = tokens.length - 1; t >= 0; t--) {
      var key = tokens[t];
      if (key === "list") continue;
      var re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s*:');
      for (var i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) return i + 1;
      }
    }
    return 1;
  }

  function goToLine(line) {
    line = Math.max(1, Number(line) || 1);
    if (window.editor && window.monaco) {
      window.editor.focus();
      window.editor.revealLineInCenter(line);
      window.editor.setPosition({ lineNumber: line, column: 1 });
      return;
    }
    var fallback = q("fallbackEditor");
    if (!fallback) return;
    var lines = fallback.value.split(/\r?\n/);
    var pos = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    fallback.focus();
    fallback.selectionStart = pos;
    fallback.selectionEnd = pos;
  }

  document.addEventListener("click", function (event) {
    var card = event.target.closest && event.target.closest(".issue");
    if (!card) return;
    var code = card.querySelector("code");
    if (!code) return;
    var path = code.textContent || "$";
    if (path === "$") return;
    activateConfigTab();
    setTimeout(function () {
      var line = findLineForPath(getEditorText(), path);
      goToLine(line);
    }, 80);
  });
})();
