const $ = (selector) => document.querySelector(selector);

const statusEl = $("#status");
const fileInput = $("#resumeFile");
const previewEl = $("#resumePreview");
const savedApiSelect = $("#savedApiSelect");
const fileListEl = $("#fileList");
const formatResumeBtn = $("#formatResume");
const saveResumeDraftBtn = $("#saveResumeDraft");
const uiThemeSelect = $("#uiTheme");
const uiLocaleSelect = $("#uiLocale");
const providerSelect = $("#provider");

let selectedFiles = [];
let apiProfiles = [];
let activeProfileId = "";
let editingProfileId = "";

// Provider 默认配置
const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  },
  claude: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514"
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash"
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k"
  },
  minimax: {
    baseUrl: "https://api.minimax.chat",
    model: "MiniMax-M2.7"
  },
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash"
  }
};

const UI_THEME_STORAGE_KEY = "popup_ui_theme";
const UI_LOCALE_STORAGE_KEY = "popup_ui_locale";
const UI_THEMES = ["a"];
const UI_LOCALES = ["zh", "en"];
const UI_THEME_LABELS = {
  a: "极光极简"
};
const I18N = {
  zh: {
    docTitle: "AI 简历智能填写",
    title: "AI 简历智能填写",
    subtitle: "上传简历文件，并在招聘页面自动识别与填写字段。",
    schemeTip: "仅切换界面风格，不影响功能逻辑。",
    languageTip: "切换 Popup 与网页悬浮面板语言。",
    schemeLabel: "风格",
    languageLabel: "语言",
    langZh: "中文",
    langEn: "English",
    themeA: "极光极简",
    apiSettings: "API 设置",
    savedApis: "已保存 API",
    noSavedProfile: "暂无已保存配置",
    createNewProfile: "新建配置...",
    deleteBtn: "删除",
    provider: "Provider",
    providerOpenai: "OpenAI 兼容",
    providerClaude: "Claude 兼容",
    providerGemini: "Gemini 兼容",
    providerKimi: "Kimi 兼容",
    providerMinimax: "MiniMax 兼容",
    providerGlm: "GLM 兼容",
    baseUrl: "Base URL",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    model: "Model",
    modelPlaceholder: "gpt-4o-mini",
    apiKey: "API Key",
    apiKeyPlaceholder: "sk-...",
    saveSettings: "保存设置",
    uploadResume: "上传简历",
    dropzoneHint: "拖拽或点击上传 PDF / DOCX",
    parseAndSave: "解析并存档",
    currentArchive: "当前存档",
    formatJson: "格式化 JSON",
    saveCurrentArchive: "保存当前存档",
    openAutofillOnPage: "在当前页面打开智能填写",
    fileRemoveTitle: "删除文件",
    statusThemePreview: "正在预览 {theme} 风格。",
    statusLocaleSwitched: "已切换为{language}。",
    statusSavingApi: "正在保存 API 设置...",
    errProvideApi: "请填写 API Key。",
    errNoResponse: "后台无响应，请重载扩展后重试。",
    errSaveSettings: "保存设置失败。",
    statusApiSaved: "API 设置已保存。",
    errChooseFile: "请先选择简历文件。",
    statusParsingFile: "正在解析文件（{current}/{total}）：{name}",
    statusCallingAi: "正在调用 AI 解析...",
    errAiParseFailed: "AI 解析失败。",
    statusResumeParsed: "简历已解析并存档。",
    errArchiveEmpty: "存档为空，请先解析简历或粘贴 JSON。",
    errArchiveNotObject: "存档 JSON 必须是对象。",
    errInvalidJson: "JSON 格式错误：{message}",
    statusArchiveFormatted: "存档 JSON 已格式化。",
    errLoadArchive: "加载存档失败。",
    errSaveArchive: "保存存档失败。",
    statusArchiveSaved: "存档已保存。",
    statusFilesAdded: "已添加 {count} 个文件，当前共 {total} 个。",
    statusFileRemoved: "已删除文件，当前共 {total} 个。",
    statusNewProfileMode: "已切换到新建配置模式。",
    statusApiSwitched: "已切换当前 API：{name}",
    errSelectSavedProfile: "请先选择已保存的 API 配置。",
    errDeleteFailed: "删除失败。",
    statusProfileDeleted: "API 配置已删除。",
    statusReady: "就绪。",
    errNoActiveTab: "未找到当前激活标签页。",
    errPageNotInjectable: "当前页面不可注入，请在普通 http/https 页面使用。",
    errOpenPanelFailed: "打开智能填写面板失败。",
    statusPanelCreated: "已在当前页面创建智能填写面板。",
    statusPanelExists: "智能填写面板已存在（已尝试聚焦）。",
    errMissingPdf: "缺少 pdf.js，请放在 lib/pdf.min.js。",
    errMissingMammoth: "缺少 mammoth.js，请放在 lib/mammoth.browser.min.js。",
    errOnlyPdfDocx: "仅支持 PDF 和 DOCX。",
    errSendTabMessage: "向页面发送消息失败。",
    errReinjectNotReady: "重注入后 content script 仍未就绪。",
    errRuntimeHealthCheckFailed: "运行时健康检查失败。"
  },
  en: {
    docTitle: "AI Resume Autofill",
    title: "AI Resume Autofill",
    subtitle: "Upload resume files and auto-match fields on job application pages.",
    schemeTip: "Preview UI schemes only. Functional logic is unchanged.",
    languageTip: "Switch popup and in-page panel language.",
    schemeLabel: "Scheme",
    languageLabel: "Language",
    langZh: "中文",
    langEn: "English",
    themeA: "Aurora Minimal",
    apiSettings: "API Settings",
    savedApis: "Saved APIs",
    noSavedProfile: "No saved profile",
    createNewProfile: "Create New Profile...",
    deleteBtn: "Delete",
    provider: "Provider",
    providerOpenai: "OpenAI Compatible",
    providerClaude: "Claude Compatible",
    providerGemini: "Gemini Compatible",
    providerKimi: "Kimi Compatible",
    providerMinimax: "MiniMax Compatible",
    providerGlm: "GLM Compatible",
    baseUrl: "Base URL",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    model: "Model",
    modelPlaceholder: "gpt-4o-mini",
    apiKey: "API Key",
    apiKeyPlaceholder: "sk-...",
    saveSettings: "Save Settings",
    uploadResume: "Upload Resume",
    dropzoneHint: "Drop or click to upload PDF / DOCX",
    parseAndSave: "Parse and Save",
    currentArchive: "Current Archive",
    formatJson: "Format JSON",
    saveCurrentArchive: "Save Current Archive",
    openAutofillOnPage: "Open Autofill on Current Page",
    fileRemoveTitle: "Delete file",
    statusThemePreview: "Previewing {theme}.",
    statusLocaleSwitched: "Language switched to {language}.",
    statusSavingApi: "Saving API settings...",
    errProvideApi: "Please provide API Key.",
    errNoResponse: "No response from background. Reload extension and retry.",
    errSaveSettings: "Failed to save settings.",
    statusApiSaved: "API settings saved.",
    errChooseFile: "Please choose resume file(s) first.",
    statusParsingFile: "Parsing file ({current}/{total}): {name}",
    statusCallingAi: "Calling AI parser...",
    errAiParseFailed: "AI parsing failed.",
    statusResumeParsed: "Resume parsed and archived.",
    errArchiveEmpty: "Archive is empty. Parse resume first or paste JSON.",
    errArchiveNotObject: "Archive JSON must be an object.",
    errInvalidJson: "Invalid JSON: {message}",
    statusArchiveFormatted: "Archive JSON formatted.",
    errLoadArchive: "Failed to load archive.",
    errSaveArchive: "Failed to save archive.",
    statusArchiveSaved: "Archive saved.",
    statusFilesAdded: "Added {count} file(s). Total: {total}.",
    statusFileRemoved: "Removed file. Total: {total}.",
    statusNewProfileMode: "Switched to new profile mode.",
    statusApiSwitched: "Active API switched: {name}",
    errSelectSavedProfile: "Select a saved API profile first.",
    errDeleteFailed: "Delete failed.",
    statusProfileDeleted: "API profile deleted.",
    statusReady: "Ready.",
    errNoActiveTab: "No active tab found.",
    errPageNotInjectable: "Current page is not injectable. Use a normal http/https page.",
    errOpenPanelFailed: "Failed to open autofill panel.",
    statusPanelCreated: "Autofill panel created on current page.",
    statusPanelExists: "Autofill panel already exists (focus attempted).",
    errMissingPdf: "Missing pdf.js. Please put it at lib/pdf.min.js.",
    errMissingMammoth: "Missing mammoth.js. Please put it at lib/mammoth.browser.min.js.",
    errOnlyPdfDocx: "Only PDF and DOCX are supported.",
    errSendTabMessage: "Failed to send message to tab.",
    errReinjectNotReady: "Content script is not ready after reinjection.",
    errRuntimeHealthCheckFailed: "Content runtime health check failed."
  }
};
let currentLocale = detectDefaultLocale();
let lastStatus = { key: "statusReady", params: {}, isError: false };

function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase().trim();
  return UI_LOCALES.includes(value) ? value : "";
}

function detectDefaultLocale() {
  return String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key, params = {}) {
  const dict = I18N[currentLocale] || I18N.en;
  const fallback = I18N.en || {};
  const template = dict[key] ?? fallback[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, token) => String(params[token] ?? ""));
}

function setStatusByKey(key, params = {}, isError = false) {
  lastStatus = { key, params, isError };
  setStatus(t(key, params), isError);
}

function applyLocaleToDom() {
  document.documentElement.lang = currentLocale === "zh" ? "zh-CN" : "en";
  document.title = t("docTitle");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (key && "placeholder" in el) el.placeholder = t(key);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key) el.title = t(key);
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function applyUiLocale(locale) {
  const nextLocale = normalizeLocale(locale) || detectDefaultLocale();
  currentLocale = nextLocale;
  if (uiLocaleSelect) uiLocaleSelect.value = nextLocale;
  applyLocaleToDom();
  renderApiProfiles();
  renderFileList();
  if (lastStatus?.key) {
    setStatus(t(lastStatus.key, lastStatus.params || {}), Boolean(lastStatus.isError));
  }
}

function applyUiTheme(theme) {
  const nextTheme = UI_THEMES.includes(theme) ? theme : "a";
  document.body.classList.remove("ui-a", "ui-b", "ui-c");
  document.body.classList.add(`ui-${nextTheme}`);
  if (uiThemeSelect) uiThemeSelect.value = nextTheme;
}

function getUiThemeFromChromeStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get([UI_THEME_STORAGE_KEY], (result) => {
      if (chrome.runtime?.lastError) {
        resolve("");
        return;
      }
      resolve(String(result?.[UI_THEME_STORAGE_KEY] || ""));
    });
  });
}

function persistUiTheme(nextTheme) {
  localStorage.setItem(UI_THEME_STORAGE_KEY, nextTheme);
  chrome.storage.local.set({ [UI_THEME_STORAGE_KEY]: nextTheme }, () => {});
}

function getUiLocaleFromChromeStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get([UI_LOCALE_STORAGE_KEY], (result) => {
      if (chrome.runtime?.lastError) {
        resolve("");
        return;
      }
      resolve(normalizeLocale(result?.[UI_LOCALE_STORAGE_KEY]));
    });
  });
}

function persistUiLocale(nextLocale) {
  localStorage.setItem(UI_LOCALE_STORAGE_KEY, nextLocale);
  chrome.storage.local.set({ [UI_LOCALE_STORAGE_KEY]: nextLocale }, () => {});
}

async function initUiTheme() {
  const fromChrome = await getUiThemeFromChromeStorage();
  const savedTheme = fromChrome || localStorage.getItem(UI_THEME_STORAGE_KEY) || "a";
  applyUiTheme(savedTheme);
  persistUiTheme(savedTheme);
  if (!uiThemeSelect) return;
  uiThemeSelect.addEventListener("change", () => {
    const next = uiThemeSelect.value || "a";
    applyUiTheme(next);
    persistUiTheme(next);
    setStatusByKey("statusThemePreview", { theme: UI_THEME_LABELS[next] || next.toUpperCase() });
  });
}

async function initUiLocale() {
  const fromChrome = await getUiLocaleFromChromeStorage();
  const savedLocale = fromChrome || localStorage.getItem(UI_LOCALE_STORAGE_KEY) || detectDefaultLocale();
  applyUiLocale(savedLocale);
  persistUiLocale(savedLocale);
  if (!uiLocaleSelect) return;
  uiLocaleSelect.addEventListener("change", () => {
    const next = normalizeLocale(uiLocaleSelect.value) || detectDefaultLocale();
    applyUiLocale(next);
    persistUiLocale(next);
    const languageLabel = next === "zh" ? t("langZh") : t("langEn");
    setStatusByKey("statusLocaleSwitched", { language: languageLabel });
  });
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve((tabs || [])[0] || null);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message || t("errSendTabMessage")));
        return;
      }
      resolve(response);
    });
  });
}

function executeScript(tabId, files) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files }, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function insertCss(tabId, files) {
  return new Promise((resolve, reject) => {
    chrome.scripting.insertCSS({ target: { tabId }, files }, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function ensureContentSideReady(tabId) {
  let pingOk = false;
  let runtimeHealthy = false;

  try {
    const pingRes = await sendTabMessage(tabId, { type: "PING" });
    pingOk = Boolean(pingRes?.ok);
  } catch (_error) {
    pingOk = false;
  }

  if (pingOk) {
    try {
      const healthRes = await sendTabMessage(tabId, { type: "HEALTHCHECK_RUNTIME" });
      runtimeHealthy = Boolean(healthRes?.ok);
    } catch (_error) {
      runtimeHealthy = false;
    }
  }

  if (!pingOk || !runtimeHealthy) {
    await insertCss(tabId, ["content/content.css"]);
    await executeScript(tabId, ["content/content.js"]);
    const pingRes = await sendTabMessage(tabId, { type: "PING" });
    if (!pingRes?.ok) {
      throw new Error(t("errReinjectNotReady"));
    }
    const healthRes = await sendTabMessage(tabId, { type: "HEALTHCHECK_RUNTIME" });
    if (!healthRes?.ok) {
      throw new Error(healthRes?.error || t("errRuntimeHealthCheckFailed"));
    }
  }
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error(t("errMissingPdf"));
  }
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");
  }
  const buffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => item.str).join(" "));
  }
  return parts.join("\n");
}

async function extractDocxText(file) {
  if (!window.mammoth) {
    throw new Error(t("errMissingMammoth"));
  }
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value || "";
}

async function parseFileToText(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return extractPdfText(file);
  if (lower.endsWith(".docx")) return extractDocxText(file);
  throw new Error(t("errOnlyPdfDocx"));
}

function fillSettings(settings) {
  if (!settings) return;
  $("#provider").value = settings.provider || "openai";
  $("#baseUrl").value = settings.baseUrl || "https://api.openai.com/v1";
  $("#model").value = settings.model || "gpt-4o-mini";
  $("#apiKey").value = settings.apiKey || "";
}

function collectSettings() {
  return {
    id: editingProfileId || undefined,
    name: `${$("#provider").value.trim()} | ${$("#model").value.trim()}`,
    provider: $("#provider").value.trim(),
    baseUrl: $("#baseUrl").value.trim(),
    model: $("#model").value.trim(),
    apiKey: $("#apiKey").value.trim()
  };
}

function renderApiProfiles() {
  const options = [`<option value="__new__">${escapeHtml(t("createNewProfile"))}</option>`];
  if (!apiProfiles.length) {
    options.push(`<option value="" disabled>${escapeHtml(t("noSavedProfile"))}</option>`);
  }
  for (const profile of apiProfiles) {
    const selected = profile.id === activeProfileId ? "selected" : "";
    const label = escapeHtml(profile.name || `${profile.provider} | ${profile.model}`);
    options.push(`<option value="${escapeHtml(profile.id)}" ${selected}>${label}</option>`);
  }
  savedApiSelect.innerHTML = options.join("");

  if (activeProfileId) {
    const active = apiProfiles.find((p) => p.id === activeProfileId);
    if (active) {
      editingProfileId = active.id;
      fillSettings(active);
    }
  }
}

function renderFileList() {
  if (!selectedFiles.length) {
    fileListEl.innerHTML = "";
    return;
  }
  fileListEl.innerHTML = selectedFiles
    .map(
      (file, index) => `
      <div class="file-item">
        <div class="file-meta">
          <strong class="file-name">${escapeHtml(file.name)}</strong>
          <span class="file-size">${formatBytes(file.size)}</span>
        </div>
        <button class="file-remove" data-index="${index}" title="${escapeHtml(t("fileRemoveTitle"))}">×</button>
      </div>
    `
    )
    .join("");
}

function addFiles(files) {
  const signatures = new Set(
    selectedFiles.map((f) => `${f.name}__${f.size}__${f.lastModified || 0}`)
  );
  for (const file of files) {
    const sign = `${file.name}__${file.size}__${file.lastModified || 0}`;
    if (!signatures.has(sign)) {
      selectedFiles.push(file);
      signatures.add(sign);
    }
  }
  renderFileList();
}

function setResumePreview(data) {
  previewEl.value = JSON.stringify(data, null, 2);
}

function parseResumePreview() {
  const raw = String(previewEl.value || "").trim();
  if (!raw) {
    throw new Error(t("errArchiveEmpty"));
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(t("errArchiveNotObject"));
    }
    return parsed;
  } catch (error) {
    throw new Error(t("errInvalidJson", { message: error.message }));
  }
}

async function refreshResume() {
  const res = await sendMessage({ type: "GET_RESUME" });
  if (!res?.ok) throw new Error(res?.error || t("errLoadArchive"));
  setResumePreview(res.data);
}

$("#saveSettings").addEventListener("click", async () => {
  setStatusByKey("statusSavingApi");
  try {
    const settings = collectSettings();
    // 只要求 API Key，其他可选
    if (!settings.apiKey) {
      throw new Error(t("errProvideApi"));
    }
    const res = await sendMessage({ type: "SAVE_SETTINGS", settings });
    if (!res) throw new Error(t("errNoResponse"));
    if (!res.ok) throw new Error(res.error || t("errSaveSettings"));
    apiProfiles = res.data?.profiles || apiProfiles;
    activeProfileId = res.data?.activeProfileId || activeProfileId;
    // Fix: sync editingProfileId so subsequent saves update the same profile
    // instead of creating a new duplicate entry each time.
    editingProfileId = activeProfileId;
    renderApiProfiles();
    setStatusByKey("statusApiSaved");
  } catch (error) {
    setStatus(error.message, true);
  }
});

$("#parseResume").addEventListener("click", async () => {
  if (!selectedFiles.length) {
    setStatusByKey("errChooseFile", {}, true);
    return;
  }
  try {
    const texts = [];
    for (let i = 0; i < selectedFiles.length; i += 1) {
      const file = selectedFiles[i];
      setStatusByKey("statusParsingFile", { current: i + 1, total: selectedFiles.length, name: file.name });
      const text = await parseFileToText(file);
      texts.push(`### File: ${file.name}\n${text}`);
    }
    const rawText = texts.join("\n\n");
    setStatusByKey("statusCallingAi");
    const res = await sendMessage({ type: "PARSE_RESUME", rawText });
    if (!res?.ok) throw new Error(res?.error || t("errAiParseFailed"));
    setResumePreview(res.data);
    setStatusByKey("statusResumeParsed");
  } catch (error) {
    setStatus(error.message, true);
  }
});

formatResumeBtn?.addEventListener("click", () => {
  try {
    const parsed = parseResumePreview();
    setResumePreview(parsed);
    setStatusByKey("statusArchiveFormatted");
  } catch (error) {
    setStatus(error.message, true);
  }
});

saveResumeDraftBtn?.addEventListener("click", async () => {
  try {
    const parsed = parseResumePreview();
    const res = await sendMessage({ type: "SAVE_RESUME_DRAFT", data: parsed });
    if (!res?.ok) throw new Error(res?.error || t("errSaveArchive"));
    setResumePreview(res.data || parsed);
    setStatusByKey("statusArchiveSaved");
  } catch (error) {
    setStatus(error.message, true);
  }
});

fileInput.addEventListener("change", () => {
  const files = [...(fileInput.files || [])];
  if (!files.length) return;
  addFiles(files);
  fileInput.value = "";
  setStatusByKey("statusFilesAdded", { count: files.length, total: selectedFiles.length });
});

fileListEl.addEventListener("click", (event) => {
  const button = event.target.closest(".file-remove");
  if (!button) return;
  const idx = Number(button.dataset.index);
  if (Number.isNaN(idx)) return;
  selectedFiles.splice(idx, 1);
  renderFileList();
  setStatusByKey("statusFileRemoved", { total: selectedFiles.length });
});

savedApiSelect.addEventListener("change", async () => {
  const value = savedApiSelect.value;
  if (value === "__new__") {
    editingProfileId = "";
    fillSettings({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      apiKey: ""
    });
    setStatusByKey("statusNewProfileMode");
    return;
  }

  const profile = apiProfiles.find((p) => p.id === value);
  if (!profile) return;
  editingProfileId = profile.id;
  fillSettings(profile);
  const res = await sendMessage({ type: "SET_ACTIVE_API_PROFILE", profileId: value });
  if (res?.ok) activeProfileId = value;
  setStatusByKey("statusApiSwitched", { name: profile.name });
});

$("#deleteApiProfile").addEventListener("click", async () => {
  const profileId = savedApiSelect.value;
  if (!profileId || profileId === "__new__") {
    setStatusByKey("errSelectSavedProfile", {}, true);
    return;
  }
  try {
    const res = await sendMessage({ type: "DELETE_API_PROFILE", profileId });
    if (!res?.ok) throw new Error(res?.error || t("errDeleteFailed"));
    apiProfiles = res.data?.profiles || [];
    activeProfileId = res.data?.activeProfileId || "";
    editingProfileId = activeProfileId;
    renderApiProfiles();
    setStatusByKey("statusProfileDeleted");
  } catch (error) {
    setStatus(error.message, true);
  }
});

// Provider 选择变化时自动填充默认配置
providerSelect.addEventListener("change", () => {
  const provider = providerSelect.value;
  const defaults = PROVIDER_DEFAULTS[provider];
  if (defaults) {
    // 只有当字段为空时才自动填充默认值
    const baseUrlInput = $("#baseUrl");
    const modelInput = $("#model");
    if (!baseUrlInput.value.trim()) {
      baseUrlInput.value = defaults.baseUrl;
    }
    if (!modelInput.value.trim()) {
      modelInput.value = defaults.model;
    }
  }
});

async function init() {
  try {
    await initUiLocale();
    await initUiTheme();
    const settingsRes = await sendMessage({ type: "GET_SETTINGS" });
    if (settingsRes?.ok) {
      apiProfiles = settingsRes.data?.profiles || [];
      activeProfileId = settingsRes.data?.activeProfileId || "";
      renderApiProfiles();
      if (!apiProfiles.length) savedApiSelect.value = "__new__";
    }
    await refreshResume();
    setStatusByKey("statusReady");
  } catch (error) {
    setStatus(error.message, true);
  }
}

$("#openAutofill").addEventListener("click", async () => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error(t("errNoActiveTab"));
    const url = tab.url || "";
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(t("errPageNotInjectable"));
    }
    await ensureContentSideReady(tab.id);
    const res = await sendTabMessage(tab.id, { type: "OPEN_AUTOFILL_PANEL" });
    if (!res?.ok) throw new Error(res?.error || t("errOpenPanelFailed"));
    if (res?.data?.created) {
      setStatusByKey("statusPanelCreated");
    } else {
      setStatusByKey("statusPanelExists");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

init();
