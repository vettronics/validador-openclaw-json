"use strict";

(function () {
  function q(id) { return document.getElementById(id); }

  function injectMissingStyles() {
    if (document.getElementById("missingStyles")) return;
    var style = document.createElement("style");
    style.id = "missingStyles";
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
    box.innerHTML = '' +
      '<h3>Como usar</h3>' +
      '<ol>' +
      '<li>Obter o ficheiro de configuração: copiar o conteúdo de <code>~/.openclaw/openclaw.json</code> ou fazer upload do ficheiro.</li>' +
      '<li>Obter o schema da instalação: correr <code>openclaw config schema &gt; openclaw.schema.json</code> e carregar esse ficheiro no separador/schema.</li>' +
      '<li>Opcional: escolher uma versão no dropdown de presets ou carregar uma DB própria em <code>settings-db.json</code>.</li>' +
      '<li>Clicar em <code>Analisar</code>. Campos obrigatórios em falta aparecem como <code>MISSING</code>.</li>' +
      '</ol>';
    results.prepend(box);
  }

  function markMissingCards() {
    var cards = document.querySelectorAll(".issue");
    cards.forEach(function (card) {
      var text = card.textContent || "";
      if (!/Campo obrigatório em falta/i.test(text)) return;
      card.classList.remove("error");
      card.classList.add("missing");
      var badge = card.querySelector(".badge");
      if (badge) {
        badge.className = "badge missing";
        badge.textContent = "MISSING";
      }
      var strong = card.querySelector("strong");
      if (strong && !/^MISSING/i.test(strong.textContent || "")) {
        strong.textContent = "MISSING — " + strong.textContent;
      }
    });
  }

  function enhance() {
    injectMissingStyles();
    addInstructions();
    markMissingCards();
  }

  document.addEventListener("DOMContentLoaded", function () {
    enhance();
    var results = q("results");
    if (results && window.MutationObserver) {
      var observer = new MutationObserver(function () { enhance(); });
      observer.observe(results, { childList: true, subtree: true });
    }
  });
})();
