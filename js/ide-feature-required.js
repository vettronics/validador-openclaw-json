"use strict";

(function () {
  var FEATURE_RULES = [
    {
      id: "telegram",
      label: "Telegram",
      active: function (c) { return !!(c.channels && c.channels.telegram && c.channels.telegram.enabled === true); },
      required: ["channels.telegram.botToken"],
      message: "Necessário para o canal Telegram responder."
    },
    {
      id: "telegram_group_responses",
      label: "Telegram — respostas em grupos",
      active: function (c) {
        var t = c.channels && c.channels.telegram;
        if (!t || t.enabled !== true) return false;
        return !!(t.groups || t.groupPolicy || t.groupAllowFrom);
      },
      required: ["channels.telegram.groups", "channels.telegram.groupPolicy"],
      message: "Necessário para respostas do agente em grupos Telegram."
    },
    {
      id: "discord",
      label: "Discord",
      active: function (c) { return !!(c.channels && c.channels.discord && c.channels.discord.enabled === true); },
      required: ["channels.discord.token"],
      message: "Necessário para o canal Discord responder."
    },
    {
      id: "discord_group_responses",
      label: "Discord — respostas em servidores/canais",
      active: function (c) {
        var d = c.channels && c.channels.discord;
        if (!d || d.enabled !== true) return false;
        return !!(d.guilds || d.groupPolicy || d.allowFrom);
      },
      required: ["channels.discord.guilds", "channels.discord.groupPolicy"],
      message: "Necessário para respostas do agente em servidores/canais Discord."
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      active: function (c) { return !!(c.channels && c.channels.whatsapp && c.channels.whatsapp.enabled === true); },
      required: ["channels.whatsapp.allowFrom"],
      message: "Necessário para autorizar remetentes no WhatsApp."
    },
    {
      id: "whatsapp_group_responses",
      label: "WhatsApp — respostas em grupos",
      active: function (c) {
        var w = c.channels && c.channels.whatsapp;
        if (!w || w.enabled !== true) return false;
        return !!(w.groups || w.groupPolicy || w.groupAllowFrom);
      },
      required: ["channels.whatsapp.groupPolicy"],
      message: "Necessário para respostas do agente em grupos WhatsApp."
    },
    {
      id: "channel_bindings",
      label: "Bindings canal → agente",
      active: function (c) {
        return !!(c.channels && Object.keys(c.channels).some(function (k) { return c.channels[k] && c.channels[k].enabled === true && k !== "defaults"; }));
      },
      required: ["bindings"],
      message: "Recomendado/necessário quando queres garantir que canais encaminham para o agente correcto."
    }
  ];

  function q(id) { return document.getElementById(id); }

  function injectStyles() {
    if (document.getElementById("featureRequiredStyles")) return;
    var style = document.createElement("style");
    style.id = "featureRequiredStyles";
    style.textContent = [
      ".issue.feature-required{border-left-color:#f97316!important}",
      ".badge.feature-required{background:#f97316!important;color:#111827!important}",
      ".feature-note{font-size:12px;color:#fed7aa;margin-top:6px}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function stripJson5Lite(input) {
    var s = String(input || "").replace(/^\uFEFF/, "");
    var out = "";
    var inString = false;
    var quote = "";
    var escaped = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i], n = s[i + 1];
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

  function editorText() {
    if (window.editor && typeof window.editor.getValue === "function") return window.editor.getValue();
    var fallback = q("fallbackEditor");
    return fallback ? fallback.value : "";
  }

  function parseConfig() {
    var text = editorText();
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

  function addFeatureCard(feature, path) {
    var results = q("results");
    if (!results) return;
    var id = feature.id + "::" + path;
    if (results.querySelector('[data-feature-required="' + id + '"]')) return;
    var card = document.createElement("div");
    card.className = "issue feature-required";
    card.setAttribute("data-path", "$.".replace("\u007f", path));
    card.setAttribute("data-feature-required", id);
    card.innerHTML = '<span class="badge feature-required">REQUIRED_FOR_FEATURE</span>' +
      '<strong>' + feature.label + ' — campo necessário em falta</strong>' +
      '<p><code>$.' + path + '</code></p>' +
      '<p>' + feature.message + '</p>' +
      '<div class="feature-note">Isto não significa necessariamente que o OpenClaw não arranque; significa que a feature seleccionada pode não funcionar correctamente.</div>';
    results.prepend(card);
  }

  function clearOldFeatureCards() {
    document.querySelectorAll("[data-feature-required]").forEach(function (n) { n.remove(); });
  }

  function validateFeatures() {
    injectStyles();
    clearOldFeatureCards();
    var config;
    try { config = parseConfig(); } catch (_) { return; }
    if (!config || typeof config !== "object") return;
    FEATURE_RULES.forEach(function (feature) {
      var isActive = false;
      try { isActive = feature.active(config); } catch (_) { isActive = false; }
      if (!isActive) return;
      feature.required.forEach(function (path) {
        if (!hasPath(config, path)) addFeatureCard(feature, path);
      });
    });
    if (window.fitIdeLayout) setTimeout(window.fitIdeLayout, 20);
  }

  document.addEventListener("DOMContentLoaded", function () {
    injectStyles();
    var analyse = q("analyseBtn");
    if (analyse) analyse.addEventListener("click", function () { setTimeout(validateFeatures, 120); });
    var preset = q("settingsPresetSelect");
    if (preset) preset.addEventListener("change", function () { setTimeout(validateFeatures, 120); });
  });
})();
