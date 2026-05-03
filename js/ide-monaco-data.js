"use strict";

const FALLBACK_PRESETS = [
  { id: "docs-reference", label: "Docs OpenClaw — configuration-reference", settings: ["gateway.port","gateway.mode","gateway.bind","gateway.auth","channels.discord.enabled","channels.telegram.enabled","channels.whatsapp.enabled","agents.defaults.model","agents.defaults.workspace","agents.list","tools.profile","tools.exec","plugins.allow","cron","$include"] },
  { id: "2026.4.x", label: "OpenClaw 2026.4.x — comum", settings: ["meta.lastTouchedVersion","browser.enabled","auth.profiles.*.provider","models.mode","agents.defaults.model.primary","agents.list.*.id","agents.list.*.heartbeat.every","tools.elevated.enabled","gateway.auth.token","memory.backend","plugins.entries.*.enabled"] },
  { id: "2026.5.x", label: "OpenClaw 2026.5.x — comum", settings: ["agents.defaults.typingMode","agents.defaults.compaction.notifyUser","agents.defaults.sandbox.mode","plugins.entries.openshell.config.mode","discovery.mdns.mode","env.vars","update.channel","cli.banner.taglineMode"] },
  { id: "schema-local", label: "Schema local carregado", dynamic: true, settings: [] }
];

let presetIndex = FALLBACK_PRESETS.slice();
let presetCache = new Map();
let settings = [];
let schemaObject = null;
let editor = null;
let fallbackTextArea = null;
let activeTab = "config";
let lastReport = null;
let completionProvider = null;
const docs = { config: "", schema: "", db: "" };

const $ = id => document.getElementById(id);

function esc(s) { return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function asSettingObjects(paths, type = "setting") { return (paths || []).map(path => ({ path, type, category: String(path).split(".")[0] || "root", description: "Setting OpenClaw" })); }

function stripJson5Lite(input) {
  let s = String(input || "").replace(/^\uFEFF/, ""), out = "", ins = false, q = "", e = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (ins) { if (c === "'" && q === "'" && !e) out += '"'; else out += c; if (e) e = false; else if (c === "\\") e = true; else if (c === q) ins = false; continue; }
    if (c === '"' || c === "'") { ins = true; q = c; out += '"'; continue; }
    if (c === "/" && n === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,\s*([}\]])/g, "$1").replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
}
function parseJson(text, label) { if (!String(text || "").trim()) throw new Error(label + " vazio."); try { return JSON.parse(text); } catch (_) { return JSON.parse(stripJson5Lite(text)); } }
function valueType(v) { if (v === null) return "null"; if (Array.isArray(v)) return "array"; return typeof v; }
function getPath(obj, path) { return path.split(".").reduce((a, k) => a && Object.prototype.hasOwnProperty.call(a, k) ? a[k] : undefined, obj); }
function resolveRef(root, ref) { if (!ref || !ref.startsWith("#/")) return null; return ref.slice(2).split("/").reduce((a, k) => a ? a[k.replace(/~1/g,"/").replace(/~0/g,"~")] : null, root); }

function collectSchemaPaths(schema, root = schema, base = "", seen = new Set(), out = new Set()) {
  if (!schema || typeof schema !== "object") return out;
  if (schema.$ref) { const m = schema.$ref + "|" + base; if (seen.has(m)) return out; seen.add(m); return collectSchemaPaths(resolveRef(root, schema.$ref), root, base, seen, out); }
  ["allOf","anyOf","oneOf"].forEach(k => Array.isArray(schema[k]) && schema[k].forEach(s => collectSchemaPaths(s, root, base, seen, out)));
  if (schema.properties) Object.entries(schema.properties).forEach(([name, sub]) => { const p = base ? base + "." + name : name; out.add(p); collectSchemaPaths(sub, root, p, seen, out); });
  if (schema.patternProperties) Object.values(schema.patternProperties).forEach(sub => { const p = base ? base + ".*" : "*"; out.add(p); collectSchemaPaths(sub, root, p, seen, out); });
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") { const p = base ? base + ".*" : "*"; out.add(p); collectSchemaPaths(schema.additionalProperties, root, p, seen, out); }
  if (schema.items) collectSchemaPaths(schema.items, root, base ? base + "[]" : "[]", seen, out);
  return out;
}

function validateWithSchema(value, schema, root, path, issues, seen = new Set()) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) { const m = schema.$ref + "|" + path; if (seen.has(m)) return; seen.add(m); validateWithSchema(value, resolveRef(root, schema.$ref), root, path, issues, seen); return; }
  if (schema.type) { const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!allowed.includes(valueType(value))) { issues.push({ severity: "error", path, title: "Tipo inválido", suggestion: "Recebido " + valueType(value) + "; esperado " + allowed.join(" ou ") }); return; } }
  if (schema.enum && !schema.enum.some(x => JSON.stringify(x) === JSON.stringify(value))) issues.push({ severity: "error", path, title: "Valor fora da enumeração", suggestion: "Valores permitidos: " + schema.enum.map(JSON.stringify).join(", ") });
  ["allOf","anyOf","oneOf"].forEach(k => Array.isArray(schema[k]) && schema[k].forEach(s => validateWithSchema(value, s, root, path, issues, seen)));
  if (valueType(value) === "object") {
    const props = schema.properties || {};
    (schema.required || []).forEach(k => { if (!Object.prototype.hasOwnProperty.call(value, k)) issues.push({ severity: "error", path: path + "." + k, title: "Campo obrigatório em falta", suggestion: "Adicionar " + path + "." + k }); });
    Object.keys(value).forEach(k => { const child = path === "$" ? "$." + k : path + "." + k; if (props[k]) validateWithSchema(value[k], props[k], root, child, issues, seen); else if (schema.additionalProperties === false && k !== "$schema") issues.push({ severity: "error", path: child, title: "Chave desconhecida pelo schema", suggestion: "Remover ou confirmar se pertence a outra versão/plugin." }); });
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, i) => validateWithSchema(item, schema.items, root, path + "[" + i + "]", issues, seen));
}

function findSecurityIssues(obj, path, issues) {
  if (!obj || typeof obj !== "object") return;
  Object.keys(obj).forEach(k => { const v = obj[k], child = path === "$" ? "$." + k : path + "." + k; if (typeof v === "string" && v.length >= 12 && /token|secret|password|api.?key|botToken/i.test(child) && !/url|model|provider|workspace|path/i.test(k)) issues.push({ severity: "warning", path: child, title: "Segredo em texto claro", suggestion: "Preferir variável de ambiente ou SecretRef. Se já foi partilhado, rodar este segredo." }); if (v && typeof v === "object") findSecurityIssues(v, child, issues); });
}
function addHeuristicChecks(config, issues) {
  const bind = getPath(config, "gateway.bind"), auth = getPath(config, "gateway.auth");
  if (["lan", "0.0.0.0", "::"].includes(bind)) issues.push({ severity: "warning", path: "$.gateway.bind", title: "Gateway acessível na rede", suggestion: "Manter token forte, firewall/reverse proxy seguro e correr openclaw security audit --deep." });
  if (auth === false || auth === "off" || (auth && auth.mode === "off")) issues.push({ severity: "error", path: "$.gateway.auth", title: "Autenticação aparenta estar desligada", suggestion: "Activar autenticação." });
  Object.entries(config.channels || {}).forEach(([name, ch]) => { if (ch && ch.enabled === true && ch.groupPolicy === "open") issues.push({ severity: "warning", path: "$.channels." + name + ".groupPolicy", title: "Política de canal permissiva", suggestion: "Preferir allowlist." }); });
  findSecurityIssues(config, "$", issues);
}

function editorText() { return editor ? editor.getValue() : fallbackTextArea.value; }
function setEditorText(t) { if (editor) editor.setValue(t); else fallbackTextArea.value = t; }
function saveTab() { docs[activeTab] = editorText(); }
function switchTab(tab) { saveTab(); activeTab = tab; document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab)); setEditorText(docs[tab] || ""); if (editor && window.monaco) monaco.editor.setModelLanguage(editor.getModel(), "json"); if (editor) setTimeout(() => editor.layout(), 0); if (window.fitIdeLayout) setTimeout(window.fitIdeLayout, 20); }

async function loadPresetIndex() {
  try {
    const res = await fetch("data/settings/index.json?v=20260503-data", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const data = await res.json();
    presetIndex = data.presets || FALLBACK_PRESETS;
  } catch (e) {
    presetIndex = FALLBACK_PRESETS;
    $("ideStatus").textContent = "Não foi possível carregar data/settings/index.json; presets embutidos activos.";
  }
  populatePresetSelect();
  await applyPreset(presetIndex.find(p => !p.dynamic)?.id || "docs-reference");
}
function populatePresetSelect() {
  const sel = $("settingsPresetSelect");
  sel.innerHTML = "";
  presetIndex.forEach(p => { const opt = document.createElement("option"); opt.value = p.id; opt.textContent = p.label; sel.appendChild(opt); });
}
async function loadPreset(preset) {
  if (preset.dynamic && preset.id === "schema-local") return { settings: Array.from(collectSchemaPaths(schemaObject || {})).sort() };
  if (presetCache.has(preset.id)) return presetCache.get(preset.id);
  if (preset.file) {
    const res = await fetch(preset.file + "?v=20260503-data", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const data = await res.json();
    presetCache.set(preset.id, data);
    return data;
  }
  return preset;
}
async function applyPreset(id) {
  const preset = presetIndex.find(p => p.id === id) || presetIndex[0];
  if (!preset) return;
  if (preset.dynamic && !schemaObject) { $("ideStatus").textContent = "Carrega primeiro um schema local."; return; }
  try {
    const data = await loadPreset(preset);
    settings = (data.settings || []).map(x => typeof x === "string" ? x : x.path).filter(Boolean);
    $("settingsPresetSelect").value = preset.id;
    renderSettingsList();
    registerCompletions();
    $("ideStatus").textContent = "Preset activo: " + preset.label + " (" + settings.length + " settings).";
  } catch (e) {
    $("ideStatus").textContent = "Erro ao carregar preset: " + e.message;
  }
}
function renderSettingsList() { $("settingsCount").textContent = String(settings.length); $("settingsList").innerHTML = settings.slice(0, 250).map(x => `<div><code>${esc(x)}</code></div>`).join("") + (settings.length > 250 ? `<div>... ${settings.length - 250} settings adicionais</div>` : ""); }
function applySchema(text) { docs.schema = text; schemaObject = parseJson(text, "schema"); let dyn = presetIndex.find(p => p.id === "schema-local"); if (!dyn) { dyn = { id: "schema-local", label: "Schema local carregado", dynamic: true }; presetIndex.push(dyn); populatePresetSelect(); } $("schemaStatus").textContent = "Schema carregado."; configureSchema(); applyPreset("schema-local"); }

function configureSchema() { if (!window.monaco) return; monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: true, trailingCommas: "ignore", schemas: schemaObject ? [{ uri: "inmemory://openclaw.schema.json", fileMatch: ["openclaw.json"], schema: schemaObject }] : [] }); }
function registerCompletions() { if (!window.monaco) return; if (completionProvider) completionProvider.dispose(); completionProvider = monaco.languages.registerCompletionItemProvider("json", { triggerCharacters: ['"', '.', ':'], provideCompletionItems: function(model, pos) { const word = model.getWordUntilPosition(pos); const range = new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn); const suggestions = settings.map(path => { const key = path.split(".").filter(Boolean).pop().replace("[]", "").replace("*", "customKey"); return { label: path, kind: monaco.languages.CompletionItemKind.Property, detail: "OpenClaw setting", insertText: '"' + key + '": ', range }; }); suggestions.push({ label: "SecretRef env", kind: monaco.languages.CompletionItemKind.Snippet, insertText: '{ "source": "env", "id": "${1:ENV_VAR_NAME}" }', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range }); return { suggestions }; } }); }
function initEditor() { fallbackTextArea = document.createElement("textarea"); fallbackTextArea.className = "fallback hidden"; fallbackTextArea.id = "fallbackEditor"; $("editorHost").appendChild(fallbackTextArea); window.fallbackTextArea = fallbackTextArea; if (!window.require) { fallbackTextArea.classList.remove("hidden"); $("ideStatus").textContent = "Monaco não carregou; fallback textarea activo."; return; } window.require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } }); window.require(["vs/editor/editor.main"], function() { monaco.editor.defineTheme("openclaw-dark", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#020617" } }); editor = monaco.editor.create($("editorHost"), { value: docs.config, language: "json", theme: "openclaw-dark", automaticLayout: true, minimap: { enabled: true }, fontSize: 13, tabSize: 2, wordWrap: "on", formatOnPaste: true, formatOnType: true, model: monaco.editor.createModel(docs.config, "json", monaco.Uri.parse("file:///openclaw.json")) }); window.editor = editor; configureSchema(); registerCompletions(); $("ideStatus").textContent = "Monaco activo. Ctrl+Space mostra sugestões."; if (window.fitIdeLayout) setTimeout(window.fitIdeLayout, 100); }, function() { fallbackTextArea.classList.remove("hidden"); $("ideStatus").textContent = "Monaco não carregou; fallback textarea activo."; }); }
function renderReport(report) { const c = { error:0, warning:0, info:0 }; report.issues.forEach(i => c[i.severity]++); $("metrics").innerHTML = `<div class="metric"><strong>${c.error}</strong><span>erros</span></div><div class="metric"><strong>${c.warning}</strong><span>avisos</span></div><div class="metric"><strong>${c.info}</strong><span>info</span></div><div class="metric"><strong>${settings.length}</strong><span>settings</span></div>`; if (report.parseError) { $("results").innerHTML = `<div class="issue error"><span class="badge error">erro</span><strong>Erro de leitura</strong><p>${esc(report.parseError)}</p></div>`; return; } $("results").innerHTML = report.issues.map(i => `<div class="issue ${i.severity}" data-path="${esc(i.path || "$")}"><span class="badge ${i.severity}">${i.severity}</span><strong>${esc(i.title)}</strong><p><code>${esc(i.path || "$")}</code></p>${i.suggestion ? `<p>${esc(i.suggestion)}</p>` : ""}</div>`).join(""); if (window.fitIdeLayout) setTimeout(window.fitIdeLayout, 30); }
function analyse() { saveTab(); const report = { parseError:null, issues:[] }; try { const config = parseJson(docs.config, "openclaw.json"); if (schemaObject) validateWithSchema(config, schemaObject, schemaObject, "$", report.issues); addHeuristicChecks(config, report.issues); report.issues.push({ severity:"info", path:"$", title: schemaObject ? "Cobertura por schema local" : "Cobertura por preset", suggestion: `${settings.length} settings activos no dropdown.` }); report.issues.sort((a,b) => ({error:0,warning:1,info:2}[a.severity] - {error:0,warning:1,info:2}[b.severity])); } catch(e) { report.parseError = e.message; } lastReport = report; renderReport(report); }
async function loadFile(input, tab) { const f = input.files && input.files[0]; if (!f) return; const text = await f.text(); docs[tab] = text; if (tab === "schema") applySchema(text); if (activeTab === tab) setEditorText(text); }
function bind() { document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab))); $("settingsPresetSelect").addEventListener("change", e => applyPreset(e.target.value)); $("configFile").addEventListener("change", e => loadFile(e.target, "config")); $("schemaFile").addEventListener("change", e => loadFile(e.target, "schema")); $("dbFile").addEventListener("change", async e => { const f = e.target.files && e.target.files[0]; if (!f) return; const text = await f.text(); docs.db = text; const db = parseJson(text, "settings-db.json"); const id = db.id || "custom"; presetCache.set(id, db); presetIndex.push({ id, label: db.label || id, file: null }); populatePresetSelect(); applyPreset(id); }); $("sampleBtn").addEventListener("click", () => { docs.config = '{\n  "gateway": { "bind": "lan", "auth": { "mode": "token", "token": "EXAMPLE_TOKEN" } },\n  "channels": { "discord": { "enabled": true, "groupPolicy": "allowlist" } },\n  "agents": { "list": [{ "id": "main", "heartbeat": { "every": "120m" } }] }\n}'; switchTab("config"); }); $("formatBtn").addEventListener("click", () => { try { setEditorText(JSON.stringify(parseJson(editorText(), activeTab), null, 2)); saveTab(); } catch(e) { $("ideStatus").textContent = "Não foi possível formatar: " + e.message; } }); $("analyseBtn").addEventListener("click", analyse); $("downloadBtn").addEventListener("click", () => { saveTab(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([docs.config], { type:"application/json" })); a.download = "openclaw.json"; a.click(); URL.revokeObjectURL(a.href); }); $("downloadReportBtn").addEventListener("click", () => { if (!lastReport) analyse(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type:"application/json" })); a.download = "relatorio-openclaw-json.json"; a.click(); URL.revokeObjectURL(a.href); }); }

document.addEventListener("DOMContentLoaded", async () => { bind(); populatePresetSelect(); initEditor(); await loadPresetIndex(); });
