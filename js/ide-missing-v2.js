"use strict";

(function () {
  var REQUIRED_BY_PRESET = {
    "docs-reference": ["gateway"],
    "2026.4.x": ["gateway"],
    "2026.5.x": ["gateway"]
  };

  function q(id) { return document.getElementById(id); }

  function injectStyles() {
    if (document.getElementById("missingV2Styles")) return;
    var style = document.createElement("style");
    style.id = "missingV2Styles";
    style.textContent = [
      ".issue.missing{border-left-color:#a855f7!important}",
      ".badge.missing{background:#a855f7!important;color:#fff!important}",
      ".instructions{border:1px solid #334155;border-left:5px solid #38bdf8;border-radius:12px;background:#0b1220;padding:12px;margin:10px 0;color:#e5e7eb}",
      ".instructions h3{margin:0 0 8px;font-size:14px}",
      ".instructions ol{margin:0 0 0 18px;padding:0;color:#94a3b8;font-size:12px;line-height:1.5}",
      ".instructions code{background:#020617;border-radius:6px;padding:1px 4px;color:#e5e7eb}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function addInstructions() {
    var results = q("results");
    if (!results || document.getElementById("usageInstructions")) return;
    var box = document.createElement("div");
    box.id = "usageInstructions";
    box.className = "instructions";
    box.innerHTML = '<h3>Como usar</h3>' +
      '<ol>' +
      '<li>Copiar o conteúdo de <code>~/.openclaw/openclaw.json</code> ou fazer upload do ficheiro.</li>' +
      '<li>Gerar o schema com <code>openclaw config schema &gt; openclaw.schema.json</code> e carregar esse ficheiro.</li>' +
      '<li>Escolher a versão no dropdown ou carregar uma <code>settings-db.json</code>.</li>' +
      '<li>Clicar em <code>Analisar</code>. Campos obrigatórios em falta aparecem como <code>MISSING</code>.</li>' +
      '</ol>';
    results.prepend(box);
  }

  function stripJson5Lite(input) {
    var s = String(input || "").replace(/^\uFEFF/, "");
    var out = "";
    var inString = false;
    var quote = "";
    var escaped = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      var n = s[i + 1];
      if (inString) {
        if (c === "'" && quote === "'" && !escaped) out += '"'; else out += c;
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === quote) inString = false;
        continue;
      }
      if (c === '"' || c === "'") { inString = true; quote = c; out += '"'; continue; }
      if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
      if (c === "/" && n === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
      out += c;
    }
    return out.replace(/,\s*([}\]])/g, "$1").replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
  }

  function getEditorText() {
    if (window.editor && typeof window.editor.getValue === "function") return window.editor.getValue();
    var fallback = q("fallbackEditor");
    return fallback ? fallback.value : "";
  }

  function parseConfig() {
    var text = getEditorText();
    if (!text.trim()) return null;
    try { return JSON.parse(text); }
    catch (_) { return JSON.parse(stripJson5Lite(text)); }
  }

  function hasPath(obj, path) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, parts[i])) return false;
      cur = cur[parts[i]];
    }
    return true;
  }

  function selectedPresetId() {
    var sel = q("settingsPresetSelect");
    return sel && sel.value ? sel.value : "docs-reference";
  }

  function makeMissingCard(path, reason) {
    var card = document.createElement("div");
    card.className = "issue missing";
    card.setAttribute("data-path", "$.".replace("\u007f", path));
    card.setAttribute("data-missing-path", path);
    card.innerHTML = '<span class="badge missing">MISSING</span>' +
      '<strong>MISSING — campo obrigatório em falta</strong>' +
      '<p><code>$.' + path + '</code></p>' +
      '<p>' + (reason || 'Este campo é obrigatório para o preset/schema seleccionado.') + '</p>';
    return card;
  }

  function addExplicitMissingCards() {
    var results = q("results");
    if (!results) return;
    var config;
    try { config = parseConfig(); } catch (_) { return; }
    if (!config || typeof config !== "object") return;

    var preset = selectedPresetId();
    var required = REQUIRED_BY_PRESET[preset] || REQUIRED_BY_PRESET["docs-reference"] || [];
    required.forEach(function (path) {
      if (hasPath(config, path)) return;
      if (results.querySelector('[data-missing-path="' + path + '"]')) return;
      results.prepend(makeMissingCard(path, 'Falta o campo obrigatório <code>$.' + path + '</code>.'));
    });
  }

  function relabelSchemaMissingCards() {
    document.querySelectorAll(".issue").forEach(function (card) {
      var text = card.textContent || "";
      if (!/Campo obrigatório em falta/i.test(text)) return;
      card.classList.remove("error");
      card.classList.add("missing");
      var badge = card.querySelector(".badge");
      if (badge) { badge.className = "badge missing"; badge.textContent = "MISSING"; }
      var strong = card.querySelector("strong");
      if (strong && !/^MISSING/i.test(strong.textContent || "")) strong.textContent = "MISSING — " + strong.textContent;
    });
  }

  function enhance() {
    injectStyles();
    addInstructions();
    relabelSchemaMissingCards();
    addExplicitMissingCards();
    if (window.fitIdeLayout) setTimeout(window.fitIdeLayout, 20);
  }

  document.addEventListener("DOMContentLoaded", function () {
    enhance();
    var analyse = q("analyseBtn");
    if (analyse) analyse.addEventListener("click", function () { setTimeout(enhance, 100); });
    var preset = q("settingsPresetSelect");
    if (preset) preset.addEventListener("change", function () { setTimeout(enhance, 100); });
    var results = q("results");
    if (results && window.MutationObserver) {
      var observer = new MutationObserver(function () { relabelSchemaMissingCards(); });
      observer.observe(results, { childList: true, subtree: true });
    }
  });
})();
