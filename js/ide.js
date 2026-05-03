"use strict";

const DEFAULT_SETTINGS = [
  "channels.defaults.groupPolicy","channels.defaults.contextVisibility","channels.defaults.heartbeat.showOk","channels.defaults.heartbeat.showAlerts","channels.defaults.heartbeat.useIndicator","channels.modelByChannel",
  "channels.whatsapp.dmPolicy","channels.whatsapp.allowFrom","channels.whatsapp.textChunkLimit","channels.whatsapp.chunkMode","channels.whatsapp.mediaMaxMb","channels.whatsapp.sendReadReceipts","channels.whatsapp.groups","channels.whatsapp.groupPolicy","channels.whatsapp.groupAllowFrom",
  "channels.telegram.enabled","channels.telegram.botToken","channels.telegram.tokenFile","channels.telegram.defaultAccount","channels.telegram.accounts","channels.telegram.dmPolicy","channels.telegram.allowFrom","channels.telegram.groups","channels.telegram.customCommands","channels.telegram.historyLimit","channels.telegram.replyToMode","channels.telegram.linkPreview","channels.telegram.streaming","channels.telegram.mediaMaxMb",
  "channels.discord.enabled","channels.discord.token","channels.discord.mediaMaxMb","channels.discord.allowBots","channels.discord.actions","channels.discord.replyToMode","channels.discord.dmPolicy","channels.discord.allowFrom","channels.discord.guilds.*.requireMention","channels.discord.guilds.*.users","channels.discord.guilds.*.channels","channels.discord.historyLimit","channels.discord.textChunkLimit","channels.discord.chunkMode","channels.discord.streaming",
  "agents.defaults.workspace","agents.defaults.repoRoot","agents.defaults.skills","agents.defaults.contextInjection","agents.defaults.contextLimits","agents.defaults.startupContext","agents.defaults.model","agents.defaults.heartbeat","agents.defaults.compaction","agents.defaults.contextPruning","agents.defaults.sandbox","agents.list",
  "tools.profile","tools.allow","tools.deny","tools.byProvider","tools.elevated","tools.exec","tools.loopDetection","tools.web","tools.media","tools.agentToAgent","tools.sessions","tools.sessions_spawn",
  "providers","skills","plugins","browser","ui","gateway.port","gateway.mode","gateway.bind","gateway.host","gateway.auth","gateway.http.endpoints","gateway.tls","gateway.reload","hooks","gmail","canvas","discovery","env","secrets","auth.cooldowns","logging","diagnostics","update","acp","cli","wizard","identity","cron","cron.retry","cron.failureAlert","cron.failureDestination","$include"
].map(path => ({ path, type: "documented", category: path.split(".")[0] }));

let settings = DEFAULT_SETTINGS.slice();
let schemaObject = null;
let editor = null;
let fallbackTextArea = null;
let activeTab = "config";
let lastReport = null;
const docs = { config: "", schema: "", db: "" };

const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function stripJson5Lite(input) {
  let s = String(input || "").replace(/^\uFEFF/, "");
  let out = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (inString) {
      if (c === "'" && quote === "'" && !escaped) out += '"'; else out += c;
      if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; out += '"'; continue; }
    if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,\s*([}\]])/g, "$1").replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
}

function parseMaybeJson5(text, label) {
  if (!String(text || "").trim()) throw new Error(label + " vazio.");
  try { return JSON.parse(text); } catch (_) { return JSON.parse(stripJson5Lite(text)); }
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined, obj);
}

function resolveRef(root, ref) {
  if (!ref || !ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((acc, key) => acc ? acc[key.replace(/~1/g, "/").replace(/~0/g, "~")] : null, root);
}

function collectSchemaPaths(schema, root = schema, base = "", seen = new Set(), out = new Map()) {
  if (!schema || typeof schema !== "object") return out;
  if (schema.$ref) {
    const marker = schema.$ref + "|" + base;
    if (seen.has(marker)) return out;
    seen.add(marker);
    return collectSchemaPaths(resolveRef(root, schema.$ref), root, base, seen, out);
  }
  ["allOf", "anyOf", "oneOf"].forEach(key => {
    if (Array.isArray(schema[key])) schema[key].forEach(sub => collectSchemaPaths(sub, root, base, seen, out));
  });
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([name, sub]) => {
      const path = base ? base + "." + name : name;
      out.set(path, { path, type: Array.isArray(sub.type) ? sub.type.join("|") : (sub.type || "unknown"), category: path.split(".")[0], description: sub.description || sub.title || "Setting do schema local." });
      collectSchemaPaths(sub, root, path, seen, out);
    });
  }
  if (schema.patternProperties) {
    Object.values(schema.patternProperties).forEach(sub => {
      const path = base ? base + ".*" : "*";
      out.set(path, { path, type: sub.type || "object", category: path.split(".")[0], description: "Chave dinâmica no schema local." });
      collectSchemaPaths(sub, root, path, seen, out);
    });
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    const path = base ? base + ".*" : "*";
    out.set(path, { path, type: schema.additionalProperties.type || "object", category: path.split(".")[0], description: "Chave dinâmica permitida no schema local." });
    collectSchemaPaths(schema.additionalProperties, root, path, seen, out);
  }
  if (schema.items) collectSchemaPaths(schema.items, root, base ? base + "[]" : "[]", seen, out);
  return out;
}

function validateWithSchema(value, schema, root, path, issues, seen = new Set()) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    const marker = schema.$ref + "|" + path;
    if (seen.has(marker)) return;
    seen.add(marker);
    validateWithSchema(value, resolveRef(root, schema.$ref), root, path, issues, seen);
    return;
  }
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.includes(valueType(value))) {
      issues.push({ severity: "error", path, title: "Tipo inválido", suggestion: "Recebido " + valueType(value) + "; esperado " + allowed.join(" ou ") + "." });
      return;
    }
  }
  if (schema.enum && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) {
    issues.push({ severity: "error", path, title: "Valor fora da enumeração permitida", suggestion: "Valores permitidos: " + schema.enum.map(JSON.stringify).join(", ") });
  }
  ["allOf", "anyOf", "oneOf"].forEach(key => {
    if (Array.isArray(schema[key])) schema[key].forEach(sub => validateWithSchema(value, sub, root, path, issues, seen));
  });
  if (valueType(value) === "object") {
    const props = schema.properties || {};
    (schema.required || []).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) issues.push({ severity: "error", path: path + "." + key, title: "Campo obrigatório em falta", suggestion: "Adicionar " + path + "." + key + "." });
    });
    Object.keys(value).forEach(key => {
      const childPath = path === "$" ? "$." + key : path + "." + key;
      if (props[key]) validateWithSchema(value[key], props[key], root, childPath, issues, seen);
      else if (schema.additionalProperties === false && key !== "$schema") issues.push({ severity: "error", path: childPath, title: "Chave desconhecida pelo schema", suggestion: "Remover ou confirmar se pertence a outra versão/plugin." });
    });
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => validateWithSchema(item, schema.items, root, path + "[" + i + "]", issues, seen));
}

function isSecretPath(path, key, value) {
  if (typeof value !== "string" || value.length < 12) return false;
  if (/avatar|voice|baseUrl|cdpUrl|url|model|provider|workspace|agentDir|path|outputFormat|lang/i.test(key)) return false;
  return /token|secret|password|api.?key|botToken/i.test(path + "." + key);
}

function findSecurityIssues(obj, path, issues) {
  if (!obj || typeof obj !== "object") return;
  const typos = { fallBacks: "fallbacks", workspacePath: "workspace", allowfrom: "allowFrom", requiremention: "requireMention", group_policy: "groupPolicy", securityAudit: "security.audit" };
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const childPath = path === "$" ? "$." + key : path + "." + key;
    if (typos[key]) issues.push({ severity: "warning", path: childPath, title: "Nome de chave suspeito", suggestion: "Confirmar se pretendia usar " + typos[key] + "." });
    if (isSecretPath(childPath, key, value)) issues.push({ severity: "warning", path: childPath, title: "Segredo em texto claro", suggestion: "Preferir variável de ambiente ou SecretRef. Se já foi partilhado, rodar este segredo." });
    if (value && typeof value === "object") findSecurityIssues(value, childPath, issues);
  });
}

function addHeuristicChecks(config, issues) {
  const bind = getPath(config, "gateway.bind") || getPath(config, "gateway.host") || getPath(config, "gateway.listen");
  const auth = getPath(config, "gateway.auth");
  if (bind === "0.0.0.0" || bind === "::" || bind === "lan") issues.push({ severity: "warning", path: "$.gateway.bind", title: "Gateway acessível na rede", suggestion: "Manter token forte, firewall/reverse proxy seguro e correr openclaw security audit --deep." });
  if (auth === false || auth === "off" || (auth && auth.enabled === false) || (auth && auth.mode === "off")) issues.push({ severity: "error", path: "$.gateway.auth", title: "Autenticação aparenta estar desligada", suggestion: "Activar autenticação antes de expor a interface ou nós remotos." });
  Object.entries(config.channels || {}).forEach(([name, channel]) => {
    if (channel && channel.enabled === true && ["open", "allowAll", "everyone", "all"].includes(channel.groupPolicy)) issues.push({ severity: "warning", path: "$.channels." + name + ".groupPolicy", title: "Política de canal permissiva", suggestion: "Preferir allowlist quando houver múltiplos utilizadores." });
  });
  (Array.isArray(config.agents?.list) ? config.agents.list : []).forEach(agent => {
    const id = agent.id || "?";
    const every = agent.heartbeat?.every;
    if (every) {
      const m = String(every).match(/^(\d+)\s*(m|min|minute|minutes)$/i);
      if (m && Number(m[1]) > 0 && Number(m[1]) < 60) issues.push({ severity: "warning", path: "$.agents.list." + id + ".heartbeat.every", title: "Heartbeat muito frequente", suggestion: "Considerar 120m ou mais em agentes com contexto pesado." });
      if (m && Number(m[1]) === 0) issues.push({ severity: "info", path: "$.agents.list." + id + ".heartbeat.every", title: "Heartbeat desactivado", suggestion: "0m foi tratado como desactivado." });
    }
    const exec = agent.tools?.exec;
    if (exec?.security === "full" && exec?.ask === "off") issues.push({ severity: "warning", path: "$.agents.list." + id + ".tools.exec", title: "Execução full sem confirmação", suggestion: "Aceitável em agentes internos controlados; evitar em agentes expostos a canais públicos." });
  });
  findSecurityIssues(config, "$", issues);
}

function currentText() {
  return editor ? editor.getValue() : fallbackTextArea.value;
}
function setCurrentText(text) {
  if (editor) editor.setValue(text); else fallbackTextArea.value = text;
}
function saveActiveDoc() { docs[activeTab] = currentText(); }
function switchTab(tab) {
  saveActiveDoc();
  activeTab = tab;
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  setCurrentText(docs[tab] || "");
  if (editor && window.monaco) monaco.editor.setModelLanguage(editor.getModel(), tab === "config" ? "json" : "json");
  if (editor) setTimeout(() => editor.layout(), 0);
}

function renderSettingsList() {
  $("settingsCount").textContent = String(settings.length);
  $("settingsList").innerHTML = settings.slice(0, 300).map(s => `<div><code>${escapeHtml(s.path)}</code><br><span>${escapeHtml(s.description || s.category || "")}</span></div>`).join("") + (settings.length > 300 ? `<div>... ${settings.length - 300} settings adicionais omitidos.</div>` : "");
}

function applySchema(raw) {
  docs.schema = raw;
  schemaObject = parseMaybeJson5(raw, "schema");
  settings = Array.from(collectSchemaPaths(schemaObject).values()).sort((a, b) => a.path.localeCompare(b.path));
  $("schemaStatus").textContent = "Schema carregado: " + settings.length + " settings extraídos.";
  renderSettingsList();
  if (window.monaco) configureMonacoJsonSchema();
}

function configureMonacoJsonSchema() {
  if (!window.monaco) return;
  const schemas = [];
  if (schemaObject) schemas.push({ uri: "inmemory://schema/openclaw.schema.json", fileMatch: ["openclaw.json"], schema: schemaObject });
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: true, trailingCommas: "ignore", schemas });
}

function registerCompletionProvider() {
  if (!window.monaco) return;
  monaco.languages.registerCompletionItemProvider("json", {
    triggerCharacters: ['"', '.', ':'],
    provideCompletionItems: function(model, position) {
      const range = model.getWordUntilPosition(position);
      const replaceRange = new monaco.Range(position.lineNumber, range.startColumn, position.lineNumber, range.endColumn);
      const suggestions = settings.map(item => {
        const key = item.path.split(".").filter(Boolean).pop().replace("[]", "").replace("*", "customKey");
        return {
          label: item.path,
          kind: monaco.languages.CompletionItemKind.Property,
          detail: item.type || item.category || "OpenClaw setting",
          documentation: item.description || "Setting OpenClaw",
          insertText: '"' + key + '": ',
          range: replaceRange
        };
      });
      suggestions.push({ label: "SecretRef env", kind: monaco.languages.CompletionItemKind.Snippet, detail: "Referência por variável de ambiente", insertText: '{ "source": "env", "id": "${1:ENV_VAR_NAME}" }', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: replaceRange });
      return { suggestions };
    }
  });
}

function initMonaco() {
  fallbackTextArea = document.createElement("textarea");
  fallbackTextArea.className = "fallback hidden";
  fallbackTextArea.id = "fallbackEditor";
  $("editorHost").appendChild(fallbackTextArea);

  if (!window.require) {
    fallbackTextArea.classList.remove("hidden");
    $("ideStatus").textContent = "Monaco não carregou; fallback textarea activo.";
    return;
  }
  window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });
  window.require(["vs/editor/editor.main"], function() {
    monaco.editor.defineTheme("openclaw-dark", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#020617" } });
    editor = monaco.editor.create($("editorHost"), { value: docs.config, language: "json", theme: "openclaw-dark", automaticLayout: true, minimap: { enabled: true }, fontSize: 13, tabSize: 2, wordWrap: "on", formatOnPaste: true, formatOnType: true, model: monaco.editor.createModel(docs.config, "json", monaco.Uri.parse("file:///openclaw.json")) });
    configureMonacoJsonSchema();
    registerCompletionProvider();
    $("ideStatus").textContent = "Monaco Editor activo. Ctrl+Space mostra sugestões.";
  }, function() {
    fallbackTextArea.classList.remove("hidden");
    $("ideStatus").textContent = "Monaco não carregou; fallback textarea activo.";
  });
}

function renderReport(report) {
  const counts = { error: 0, warning: 0, info: 0 };
  report.issues.forEach(i => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
  $("metrics").innerHTML = `<div class="metric"><strong>${counts.error}</strong><span>erros</span></div><div class="metric"><strong>${counts.warning}</strong><span>avisos</span></div><div class="metric"><strong>${counts.info}</strong><span>info</span></div><div class="metric"><strong>${settings.length}</strong><span>settings</span></div>`;
  if (report.parseError) {
    $("results").innerHTML = `<div class="issue error"><span class="badge error">erro</span><strong>Erro de leitura</strong><p>${escapeHtml(report.parseError)}</p></div>`;
    return;
  }
  $("results").innerHTML = report.issues.map(i => `<div class="issue ${i.severity}"><span class="badge ${i.severity}">${i.severity}</span><strong>${escapeHtml(i.title)}</strong><p><code>${escapeHtml(i.path || "$")}</code></p>${i.suggestion ? `<p>${escapeHtml(i.suggestion)}</p>` : ""}</div>`).join("") || `<div class="issue ok"><span class="badge ok">ok</span><strong>Nenhum problema encontrado</strong></div>`;
}

function analyse() {
  saveActiveDoc();
  const report = { parseError: null, issues: [] };
  try {
    const config = parseMaybeJson5(docs.config, "openclaw.json");
    if (schemaObject) validateWithSchema(config, schemaObject, schemaObject, "$", report.issues);
    addHeuristicChecks(config, report.issues);
    report.issues.push({ severity: "info", path: "$", title: schemaObject ? "Cobertura por schema local" : "Cobertura por DB documentada", suggestion: schemaObject ? `Foram extraídos ${settings.length} settings do schema carregado.` : `Foram carregados ${settings.length} settings documentados. Para cobertura completa, carregar openclaw.schema.json.` });
    report.issues.sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.severity] - { error: 0, warning: 1, info: 2 }[b.severity]));
  } catch (error) {
    report.parseError = error.message;
  }
  lastReport = report;
  renderReport(report);
}

async function loadFileToDoc(input, tab) {
  const file = input.files && input.files[0];
  if (!file) return;
  const text = await file.text();
  docs[tab] = text;
  if (tab === "schema") applySchema(text);
  if (activeTab === tab) setCurrentText(text);
}

async function loadBundledDb() {
  try {
    const res = await fetch("data/settings-db.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const db = await res.json();
    const preset = Object.values(db.presets || {})[0];
    settings = preset?.settings || DEFAULT_SETTINGS;
    docs.db = JSON.stringify(db, null, 2);
    renderSettingsList();
  } catch (error) {
    settings = DEFAULT_SETTINGS.slice();
    renderSettingsList();
    $("ideStatus").textContent = "DB externa não carregou; DB embutida activa.";
  }
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $("configFile").addEventListener("change", e => loadFileToDoc(e.target, "config"));
  $("schemaFile").addEventListener("change", e => loadFileToDoc(e.target, "schema"));
  $("dbFile").addEventListener("change", async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await file.text();
    docs.db = text;
    const db = parseMaybeJson5(text, "settings-db.json");
    const preset = Object.values(db.presets || {})[0];
    settings = preset?.settings || DEFAULT_SETTINGS;
    renderSettingsList();
    if (activeTab === "db") setCurrentText(text);
  });
  $("analyseBtn").addEventListener("click", analyse);
  $("formatBtn").addEventListener("click", () => {
    try { setCurrentText(JSON.stringify(parseMaybeJson5(currentText(), activeTab), null, 2)); saveActiveDoc(); }
    catch (e) { $("ideStatus").textContent = "Não foi possível formatar: " + e.message; }
  });
  $("sampleBtn").addEventListener("click", () => {
    docs.config = '{\n  "gateway": { "bind": "lan", "auth": { "mode": "token", "token": "EXAMPLE_TOKEN" } },\n  "channels": { "discord": { "enabled": true, "groupPolicy": "allowlist" } },\n  "agents": { "list": [{ "id": "main", "heartbeat": { "every": "120m" } }] }\n}';
    switchTab("config");
  });
  $("downloadBtn").addEventListener("click", () => {
    saveActiveDoc();
    const blob = new Blob([docs.config], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "openclaw.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("downloadReportBtn").addEventListener("click", () => {
    if (!lastReport) analyse();
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relatorio-openclaw-json.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  docs.config = "";
  docs.schema = "";
  docs.db = JSON.stringify({ presets: { documented: { settings: DEFAULT_SETTINGS } } }, null, 2);
  bindEvents();
  renderSettingsList();
  initMonaco();
  loadBundledDb();
});
