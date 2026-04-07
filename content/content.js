const FIELD_SELECTOR = "input, textarea, select";
let learningFields = new Map();
let latestFields = [];
let sessionFilledSignatures = new Set();
let cachedResumeData = null;
let sectionHintCache = new WeakMap();
const UI_THEME_STORAGE_KEY = "popup_ui_theme";
const UI_LOCALE_STORAGE_KEY = "popup_ui_locale";
const UI_THEMES = ["a", "b", "c"];
const UI_LOCALES = ["zh", "en"];

const PANEL_I18N = {
  zh: {
    panelTitle: "AI 智能填写",
    close: "关闭",
    refresh: "重新识别",
    fillAll: "全部填入",
    ready: "准备就绪",
    noMatch: "未找到可匹配字段。",
    sourceUnknown: "未知",
    sourceConfidence: "来源: {source} | 置信度: {confidence}",
    detectedSummary: "识别到 {total} 个字段，可操作 {actionable} 个。",
    confirmLearnField: "检测到新字段“{label}”，是否保存到简历存档？",
    sessionDone: "当前会话中可填写空字段已处理完成。",
    identifyFailed: "识别失败: {error}",
    unknownError: "未知错误",
    identifyRunning: "正在识别...",
    identifyRunningForce: "正在重新识别...",
    localMatched: "本地快速匹配 {count} 项",
    elapsed: "耗时 {seconds}s",
    contextInvalidated: "扩展上下文已失效，请从 Popup 重新打开面板或刷新页面。",
    filling: "正在填写...",
    fillSummary: "已填入 {success} 项，跳过 {skipped} 项，失败 {failed} 项。仅处理空字段。",
    fillFailed: "填写失败: {error}",
    langToggle: "EN"
  },
  en: {
    panelTitle: "AI Resume Autofill",
    close: "Close",
    refresh: "Refresh",
    fillAll: "Fill All",
    ready: "Ready.",
    noMatch: "No matchable fields found.",
    sourceUnknown: "unknown",
    sourceConfidence: "Source: {source} | Confidence: {confidence}",
    detectedSummary: "Detected {total} fields, {actionable} are currently actionable.",
    confirmLearnField: "New field \"{label}\" detected. Save it into archive?",
    sessionDone: "All actionable empty fields are completed for this session.",
    identifyFailed: "Identify failed: {error}",
    unknownError: "Unknown error",
    identifyRunning: "Identifying...",
    identifyRunningForce: "Refreshing identification...",
    localMatched: "Local fast match: {count}",
    elapsed: "Elapsed {seconds}s",
    contextInvalidated: "Extension context invalidated. Re-open panel from popup or refresh page.",
    filling: "Filling...",
    fillSummary: "Filled {success}, skipped {skipped}, failed {failed}. Empty fields only.",
    fillFailed: "Fill failed: {error}",
    langToggle: "中文"
  }
};

let panelLocale = detectDefaultLocale();

const UNSUPPORTED_INPUT_TYPES = new Set([
  "hidden",
  "file",
  "submit",
  "button",
  "reset",
  "image"
]);

function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase().trim();
  return UI_LOCALES.includes(value) ? value : "";
}

function detectDefaultLocale() {
  return String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function tp(key, params = {}) {
  const dict = PANEL_I18N[panelLocale] || PANEL_I18N.en;
  const fallback = PANEL_I18N.en || {};
  const template = dict[key] ?? fallback[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, token) => String(params[token] ?? ""));
}

function loadUiLocaleFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get([UI_LOCALE_STORAGE_KEY], (result) => {
      if (chrome.runtime?.lastError) {
        resolve(detectDefaultLocale());
        return;
      }
      resolve(normalizeLocale(result?.[UI_LOCALE_STORAGE_KEY]) || detectDefaultLocale());
    });
  });
}

function persistUiLocale(nextLocale) {
  chrome.storage.local.set({ [UI_LOCALE_STORAGE_KEY]: nextLocale }, () => {});
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function ensurePanelVisible(panel) {
  const vw = window.innerWidth || document.documentElement.clientWidth || 1200;
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;
  const rect = panel.getBoundingClientRect();
  const outOfView =
    rect.right < 20 || rect.bottom < 20 || rect.left > vw - 20 || rect.top > vh - 20;
  if (outOfView) {
    panel.style.left = "20px";
    panel.style.bottom = "20px";
    panel.style.top = "auto";
    panel.style.right = "auto";
  }
}

function pulsePanel(panel) {
  panel.style.transition = "box-shadow 160ms ease";
  panel.style.boxShadow = "0 0 0 3px rgba(36, 198, 184, 0.6), 0 18px 40px rgba(0, 0, 0, 0.35)";
  window.setTimeout(() => {
    panel.style.boxShadow = "0 18px 40px rgba(0, 0, 0, 0.35)";
  }, 260);
}

function normalizeUiTheme(theme) {
  const value = String(theme || "").toLowerCase().trim();
  return UI_THEMES.includes(value) ? value : "b";
}

function applyPanelTheme(panel, theme) {
  if (!panel) return;
  const next = normalizeUiTheme(theme);
  panel.classList.remove("ai-theme-a", "ai-theme-b", "ai-theme-c");
  panel.classList.add(`ai-theme-${next}`);
}

function loadUiThemeFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get([UI_THEME_STORAGE_KEY], (result) => {
      if (chrome.runtime?.lastError) {
        resolve("b");
        return;
      }
      resolve(normalizeUiTheme(result?.[UI_THEME_STORAGE_KEY]));
    });
  });
}

function applyPanelLocale(shadow, locale) {
  if (!shadow) return;
  panelLocale = normalizeLocale(locale) || detectDefaultLocale();
  const title = shadow.getElementById("ai-title");
  const close = shadow.getElementById("ai-close");
  const refresh = shadow.getElementById("ai-refresh");
  const fill = shadow.getElementById("ai-fill-all");
  const note = shadow.getElementById("ai-note");
  const toggle = shadow.getElementById("ai-locale-toggle");
  if (title) title.textContent = tp("panelTitle");
  if (close) close.textContent = tp("close");
  if (refresh) refresh.textContent = tp("refresh");
  if (fill) fill.textContent = tp("fillAll");
  if (toggle) toggle.textContent = tp("langToggle");
  if (note && !note.dataset.userSet) {
    note.textContent = tp("ready");
  }
}

function getLabelForElement(element) {
  const id = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
  const fromFor = id?.innerText?.trim();
  const aria = element.getAttribute("aria-label") || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const nearby = element.closest("label, div, section, td")?.innerText || "";
  return (fromFor || aria || placeholder || nearby || element.name || element.id || tp("sourceUnknown"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function containsAny(text, tokens) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return (tokens || []).some((token) => normalized.includes(normalizeText(token)));
}

function isProjectsSectionHint(sectionHint) {
  return containsAny(sectionHint, ["projects", "project", "项目"]);
}

function isWorkSectionHint(sectionHint) {
  return containsAny(sectionHint, ["workexperience", "work", "工作"]);
}

function isEducationSectionHint(sectionHint) {
  return containsAny(sectionHint, ["education", "edu", "教育"]);
}

function resolveSectionFromHints(hints, sectionHint) {
  if (
    containsAny(hints, ["项目", "project", "作品"]) ||
    isProjectsSectionHint(sectionHint)
  ) {
    return "projects";
  }
  if (
    containsAny(hints, ["教育", "学校", "专业", "学历", "学位", "education"]) ||
    isEducationSectionHint(sectionHint)
  ) {
    return "education";
  }
  if (
    containsAny(hints, ["工作", "公司", "岗位", "职务", "职位", "work"]) ||
    isWorkSectionHint(sectionHint)
  ) {
    return "work";
  }
  return "";
}

function isChannelClosedError(error) {
  const msg = String(error?.message || error || "");
  return msg.includes("message channel closed before a response was received");
}

function isExtensionContextInvalidatedError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("extension context invalidated");
}

async function runtimeSendMessageWithRetry(message, retries = 1) {
  let lastError = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      lastError = error;
      if (!isChannelClosedError(error) || i >= retries) break;
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
  }
  throw lastError || new Error("Failed to send message.");
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values || []) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const k = normalizeText(value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(value);
  }
  return out;
}

function getFieldSignalText(element) {
  if (!element) return "";
  const id = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
  const fromFor = id?.innerText?.trim() || "";
  const nearbyLabel = getLabelForElement(element) || "";
  const placeholder = element.getAttribute("placeholder") || "";
  const aria = element.getAttribute("aria-label") || "";
  const name = element.name || "";
  const elId = element.id || "";
  return normalizeText([fromFor, nearbyLabel, placeholder, aria, name, elId].join("|"));
}

function scoreSectionBySignals(signals) {
  const scores = { work: 0, education: 0, projects: 0 };
  for (const signal of signals || []) {
    if (!signal) continue;

    if (containsAny(signal, ["\u516c\u53f8", "company", "\u804c\u52a1", "\u804c\u4f4d", "\u5c97\u4f4d"])) {
      scores.work += 2;
    }
    if (containsAny(signal, ["\u5de5\u4f5c\u63cf\u8ff0", "\u804c\u52a1\u63cf\u8ff0"])) {
      scores.work += 2;
    }

    if (containsAny(signal, ["\u5b66\u6821", "school", "\u5b66\u5386", "\u5b66\u4f4d", "\u4e13\u4e1a", "major", "degree"])) {
      scores.education += 2;
    }

    if (containsAny(signal, ["\u9879\u76ee", "project", "\u9879\u76ee\u540d\u79f0", "\u9879\u76ee\u63cf\u8ff0", "\u9879\u76ee\u804c\u8d23"])) {
      scores.projects += 2;
    }
  }
  return scores;
}

function getBestSectionFromScores(scores) {
  const entries = Object.entries(scores || {});
  if (!entries.length) return "";
  entries.sort((a, b) => b[1] - a[1]);
  const first = entries[0];
  const second = entries[1] || ["", Number.NEGATIVE_INFINITY];
  if (!first || first[1] <= 0) return "";
  if (first[1] === second[1]) return "";
  return first[0];
}

function detectSectionHint(element) {
  if (!element) return "";
  const cached = sectionHintCache.get(element);
  if (cached) return cached;

  let node = element;
  for (let i = 0; i < 8 && node; i += 1) {
    const inputs = [...node.querySelectorAll(FIELD_SELECTOR)].filter(
      (el) => !el.disabled && !UNSUPPORTED_INPUT_TYPES.has(String(el.type || "").toLowerCase())
    );
    if (inputs.length >= 2 && inputs.length <= 18) {
      const signals = inputs.map(getFieldSignalText);
      const section = getBestSectionFromScores(scoreSectionBySignals(signals));
      if (section) {
        sectionHintCache.set(element, section);
        return section;
      }
    }
    node = node.parentElement;
  }

  const strongTokens = {
    projects: ["项目名称", "项目描述", "项目职责", "项目角色", "projectname", "projectdescription"],
    work: ["公司名称", "职务", "职位", "岗位", "工作描述", "workexperience"],
    education: ["学校全称", "学历", "学位", "专业", "education"]
  };
  node = element;
  for (let i = 0; i < 6 && node; i += 1) {
    const text = normalizeText((node.textContent || "").slice(0, 900));
    if (!text) {
      node = node.parentElement;
      continue;
    }
    if (containsAny(text, strongTokens.projects)) {
      sectionHintCache.set(element, "projects");
      return "projects";
    }
    if (containsAny(text, strongTokens.work)) {
      sectionHintCache.set(element, "work");
      return "work";
    }
    if (containsAny(text, strongTokens.education)) {
      sectionHintCache.set(element, "education");
      return "education";
    }
    node = node.parentElement;
  }
  sectionHintCache.set(element, "");
  return "";
}

function getFieldBucket(meta) {
  const label = normalizeText(meta?.label || "");
  const name = normalizeText(meta?.name || "");
  const id = normalizeText(meta?.id || "");
  const placeholder = normalizeText(meta?.placeholder || "");
  const base = label || name || id || "unknown";
  if (containsAny(base, ["时间", "日期", "time", "date"]) || containsAny(placeholder, ["时间", "日期", "time", "date"])) {
    if (containsAny(base, ["开始", "start"]) || containsAny(placeholder, ["开始", "start"])) return `${base}|start`;
    if (containsAny(base, ["结束", "end"]) || containsAny(placeholder, ["结束", "end"])) return `${base}|end`;
  }
  return base;
}

function getExistingValuesByBucket() {
  const map = new Map();
  for (const field of latestFields) {
    const el = field?._element;
    if (!el) continue;
    const raw = String(el.value ?? "").trim();
    if (!raw) continue;
    const bucket = getFieldBucket(field);
    const norm = normalizeText(raw);
    if (!map.has(bucket)) map.set(bucket, new Set());
    map.get(bucket).add(norm);
  }
  return map;
}

function classifyFieldExplicit(field, sectionHintForResolve) {
  const label = normalizeText(field?.label || "");
  const placeholder = normalizeText(field?.placeholder || "");
  const hints = `${label}|${normalizeText(field?.name || "")}|${normalizeText(field?.id || "")}|${placeholder}`;

  if (containsAny(hints, ["项目名称", "projectname"])) return { section: "projects", property: "name" };
  if (containsAny(hints, ["项目角色", "项目职责", "projectrole"])) {
    return { section: "projects", property: "role" };
  }
  if (containsAny(hints, ["项目描述", "projectdescription"])) {
    return { section: "projects", property: "description" };
  }

  if (containsAny(hints, ["职责描述", "description"])) {
    const section = resolveSectionFromHints(hints, sectionHintForResolve);
    return { section, property: "description" };
  }

  if (containsAny(hints, ["职务描述", "工作描述", "岗位描述"])) {
    return { section: "work", property: "description" };
  }
  if (containsAny(hints, ["公司", "company"])) return { section: "work", property: "company" };
  if (containsAny(hints, ["职务", "岗位", "职位", "title"])) {
    return { section: "work", property: "title" };
  }

  if (containsAny(hints, ["学校", "school"])) return { section: "education", property: "school" };
  if (containsAny(hints, ["专业", "major"])) return { section: "education", property: "major" };
  if (containsAny(hints, ["学历", "学位", "degree"])) return { section: "education", property: "degree" };

  if (containsAny(hints, ["开始", "start"]) && containsAny(hints, ["时间", "日期", "date", "time"])) {
    const section = resolveSectionFromHints(hints, sectionHintForResolve);
    return { section, property: "startDate" };
  }
  if (containsAny(hints, ["结束", "end"]) && containsAny(hints, ["时间", "日期", "date", "time"])) {
    const section = resolveSectionFromHints(hints, sectionHintForResolve);
    return { section, property: "endDate" };
  }

  if (containsAny(hints, ["邮箱", "email"])) return { section: "basic", property: "email" };
  if (containsAny(hints, ["手机", "电话", "phone", "mobile"])) return { section: "basic", property: "phone" };
  if (containsAny(hints, ["姓名", "name"])) return { section: "basic", property: "fullName" };
  if (containsAny(hints, ["github"])) return { section: "basic", property: "github" };
  if (containsAny(hints, ["linkedin"])) return { section: "basic", property: "linkedIn" };
  if (containsAny(hints, ["网站", "主页", "website"])) return { section: "basic", property: "website" };
  return { section: "", property: "" };
}

function inferSectionFromNearbyAnchors(field) {
  if (!field?._element) return "";
  const ordered = (latestFields || [])
    .filter((f) => f?._element)
    .sort((a, b) => compareDomElements(a._element, b._element));
  const index = ordered.findIndex((f) => f.fieldId === field.fieldId);
  if (index < 0) return "";

  const scores = { work: 0, education: 0, projects: 0 };
  const from = Math.max(0, index - 28);
  const to = Math.min(ordered.length - 1, index + 28);
  for (let i = from; i <= to; i += 1) {
    if (i === index) continue;
    const other = ordered[i];
    const otherHint = normalizeText(other.sectionHint || detectSectionHint(other._element));
    const cls = classifyFieldExplicit(other, otherHint);
    if (!cls.section) continue;

    const dist = Math.abs(i - index);
    let weight = 1 / (dist + 1);
    if (
      (cls.section === "work" && (cls.property === "company" || cls.property === "title")) ||
      (cls.section === "education" &&
        (cls.property === "school" || cls.property === "major" || cls.property === "degree")) ||
      (cls.section === "projects" && (cls.property === "name" || cls.property === "role"))
    ) {
      weight *= 4;
    } else {
      weight *= 1.5;
    }
    scores[cls.section] += weight;
  }
  return getBestSectionFromScores(scores);
}

function classifyField(field) {
  const sectionHint = normalizeText(field?.sectionHint || "");
  let sectionHintForResolve = sectionHint;
  if (!sectionHintForResolve && field?._element) {
    sectionHintForResolve = normalizeText(detectSectionHint(field._element));
  }

  const explicit = classifyFieldExplicit(field, sectionHintForResolve);
  if (!explicit.property) return explicit;
  if (explicit.section) return explicit;

  if (
    explicit.property === "startDate" ||
    explicit.property === "endDate" ||
    explicit.property === "description"
  ) {
    const inferred = inferSectionFromNearbyAnchors(field);
    if (inferred) return { section: inferred, property: explicit.property };
  }

  return explicit;
}

function compareDomElements(a, b) {
  if (a === b) return 0;
  const pos = a.compareDocumentPosition(b);
  if (pos & 4) return -1; // a before b
  if (pos & 2) return 1; // a after b
  return 0;
}

function buildSectionRowIndexMap(fields) {
  const result = new Map();
  const sectionAnchorProp = {
    work: "company",
    education: "school",
    projects: "name"
  };
  const sections = Object.keys(sectionAnchorProp);

  for (const section of sections) {
    const sectionFields = (fields || [])
      .filter((f) => f?._element && classifyField(f).section === section)
      .sort((a, b) => compareDomElements(a._element, b._element));
    if (!sectionFields.length) continue;

    const anchorProperty = sectionAnchorProp[section];
    let anchors = sectionFields.filter((f) => classifyField(f).property === anchorProperty);
    if (!anchors.length) {
      const firstProp = classifyField(sectionFields[0]).property;
      anchors = sectionFields.filter((f) => classifyField(f).property === firstProp);
    }
    if (!anchors.length) anchors = [sectionFields[0]];

    const anchorEls = anchors.map((x) => x._element);
    for (const field of sectionFields) {
      let rowIndex = 0;
      for (let i = 0; i < anchorEls.length; i += 1) {
        if (compareDomElements(anchorEls[i], field._element) <= 0) {
          rowIndex = i;
        } else {
          break;
        }
      }
      result.set(field.fieldId, rowIndex);
    }
  }

  return result;
}

function getResumeRowsBySection(resumeData, section) {
  if (!resumeData) return [];
  if (section === "work") {
    return Array.isArray(resumeData.workExperience) ? resumeData.workExperience : [];
  }
  if (section === "education") {
    return Array.isArray(resumeData.education) ? resumeData.education : [];
  }
  if (section === "projects") {
    return Array.isArray(resumeData.projects) ? resumeData.projects : [];
  }
  return [];
}

function findResumeRowIndexByAnchorValue(rows, prop, rawValue, usedRowIndexes) {
  const value = normalizeText(rawValue);
  if (!value) return -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (usedRowIndexes.has(i)) continue;
    const candidate = normalizeText(rows[i]?.[prop]);
    if (candidate && candidate === value) return i;
  }
  for (let i = 0; i < rows.length; i += 1) {
    if (usedRowIndexes.has(i)) continue;
    const candidate = normalizeText(rows[i]?.[prop]);
    if (!candidate) continue;
    if (candidate.includes(value) || value.includes(candidate)) return i;
  }
  return -1;
}

function getFieldCurrentValue(field) {
  return String(field?._element?.value ?? "").trim();
}

function getRowIndexFromField(field, rowIndexMap) {
  const rowIndex = rowIndexMap.get(field.fieldId);
  return Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : -1;
}

function getFirstUnusedResumeRowIndex(rows, usedRowIndexes, preferredIndex = -1) {
  if (
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < rows.length &&
    !usedRowIndexes.has(preferredIndex)
  ) {
    return preferredIndex;
  }
  for (let i = 0; i < rows.length; i += 1) {
    if (!usedRowIndexes.has(i)) return i;
  }
  return -1;
}

function findResumeRowIndexByDateRange(rows, startValue, endValue, usedRowIndexes) {
  const start = normalizeText(startValue);
  const end = normalizeText(endValue);
  if (!start && !end) return -1;

  for (let i = 0; i < rows.length; i += 1) {
    if (usedRowIndexes.has(i)) continue;
    const rowStart = normalizeText(rows[i]?.startDate);
    const rowEnd = normalizeText(rows[i]?.endDate);
    const startOk = !start || (rowStart && (rowStart === start || rowStart.includes(start) || start.includes(rowStart)));
    const endOk = !end || (rowEnd && (rowEnd === end || rowEnd.includes(end) || end.includes(rowEnd)));
    if (startOk && endOk) return i;
  }
  return -1;
}

function buildResumeRowBindingMap(fields, rowIndexMap) {
  const result = new Map();
  const sectionAnchorProp = {
    work: "company",
    education: "school",
    projects: "name"
  };

  for (const [section, anchorProp] of Object.entries(sectionAnchorProp)) {
    const rows = getResumeRowsBySection(cachedResumeData, section);
    if (!rows.length) continue;

    const sectionFields = (fields || []).filter((f) => classifyField(f).section === section && f?._element);
    if (!sectionFields.length) continue;

    const rowToResumeRow = new Map();
    const usedResumeRowIndexes = new Set();
    const fieldsByDomRow = new Map();
    for (const field of sectionFields) {
      const domRow = getRowIndexFromField(field, rowIndexMap);
      if (domRow < 0) continue;
      if (!fieldsByDomRow.has(domRow)) fieldsByDomRow.set(domRow, []);
      fieldsByDomRow.get(domRow).push(field);
    }
    const domRows = [...fieldsByDomRow.keys()].sort((a, b) => a - b);

    // Pass 1: map by anchor value (company/school/project name) when present.
    for (const domRow of domRows) {
      const rowFields = fieldsByDomRow.get(domRow) || [];
      const anchorFields = rowFields.filter((f) => classifyField(f).property === anchorProp);
      let matchedResumeRow = -1;
      for (const anchorField of anchorFields) {
        const anchorValue = getFieldCurrentValue(anchorField);
        if (!anchorValue) continue;
        matchedResumeRow = findResumeRowIndexByAnchorValue(
          rows,
          anchorProp,
          anchorValue,
          usedResumeRowIndexes
        );
        if (matchedResumeRow >= 0) break;
      }
      if (matchedResumeRow < 0) continue;
      rowToResumeRow.set(domRow, matchedResumeRow);
      usedResumeRowIndexes.add(matchedResumeRow);
    }

    // Pass 2: map by date range if anchor is empty.
    for (const domRow of domRows) {
      if (rowToResumeRow.has(domRow)) continue;
      const rowFields = fieldsByDomRow.get(domRow) || [];
      const startField = rowFields.find((f) => classifyField(f).property === "startDate");
      const endField = rowFields.find((f) => classifyField(f).property === "endDate");
      const matchedResumeRow = findResumeRowIndexByDateRange(
        rows,
        getFieldCurrentValue(startField),
        getFieldCurrentValue(endField),
        usedResumeRowIndexes
      );
      if (matchedResumeRow < 0) continue;
      rowToResumeRow.set(domRow, matchedResumeRow);
      usedResumeRowIndexes.add(matchedResumeRow);
    }

    // Pass 3: assign remaining rows in order, preserving section isolation.
    for (const domRow of domRows) {
      if (rowToResumeRow.has(domRow)) continue;
      const nextResumeRow = getFirstUnusedResumeRowIndex(rows, usedResumeRowIndexes, domRow);
      if (nextResumeRow < 0) continue;
      rowToResumeRow.set(domRow, nextResumeRow);
      usedResumeRowIndexes.add(nextResumeRow);
    }

    for (const field of sectionFields) {
      const domRow = getRowIndexFromField(field, rowIndexMap);
      if (domRow < 0) continue;
      if (!rowToResumeRow.has(domRow)) continue;
      result.set(field.fieldId, {
        section,
        rowIndex: rowToResumeRow.get(domRow)
      });
    }
  }
  return result;
}

function getResumeCandidates(field, resumeData, cls) {
  if (!resumeData || typeof resumeData !== "object") return [];
  const classification = cls || classifyField(field);
  const edu = Array.isArray(resumeData.education) ? resumeData.education : [];
  const work = Array.isArray(resumeData.workExperience) ? resumeData.workExperience : [];
  const basic = resumeData.basicInfo || {};

  if (classification.section === "education" && classification.property) {
    return uniqueNonEmpty(edu.map((x) => x?.[classification.property]));
  }
  if (classification.section === "work" && classification.property) {
    return uniqueNonEmpty(work.map((x) => x?.[classification.property]));
  }
  if (classification.section === "projects" && classification.property) {
    const projects = Array.isArray(resumeData.projects) ? resumeData.projects : [];
    return uniqueNonEmpty(projects.map((x) => x?.[classification.property]));
  }
  if (classification.section === "basic" && classification.property) {
    return uniqueNonEmpty([basic[classification.property]]);
  }
  return [];
}

function getRowPreferredCandidate(field, resumeData, cls, rowBindingMap) {
  if (!resumeData || !cls?.property) return "";
  const binding = rowBindingMap?.get(field.fieldId);
  const boundSection =
    binding && typeof binding === "object" && binding.section
      ? String(binding.section)
      : cls.section;
  const rowIndex =
    binding && typeof binding === "object" && Number.isInteger(binding.rowIndex)
      ? binding.rowIndex
      : rowBindingMap?.get(field.fieldId);

  if (!Number.isInteger(rowIndex) || rowIndex < 0) return "";

  if (boundSection === "work") {
    const rows = Array.isArray(resumeData.workExperience) ? resumeData.workExperience : [];
    return String(rows[rowIndex]?.[cls.property] ?? "").trim();
  }
  if (boundSection === "education") {
    const rows = Array.isArray(resumeData.education) ? resumeData.education : [];
    return String(rows[rowIndex]?.[cls.property] ?? "").trim();
  }
  if (boundSection === "projects") {
    const rows = Array.isArray(resumeData.projects) ? resumeData.projects : [];
    return String(rows[rowIndex]?.[cls.property] ?? "").trim();
  }
  return "";
}

function pickBestCandidate(field, info, existingByBucket, usedByBucket, rowBindingMap) {
  const bucket = getFieldBucket(field);
  const existingSet = existingByBucket.get(bucket) || new Set();
  const usedSet = usedByBucket.get(bucket) || new Set();
  const cls = classifyField(field);
  const binding = rowBindingMap?.get(field.fieldId);
  const hasRowBinding =
    binding &&
    typeof binding === "object" &&
    Number.isInteger(binding.rowIndex) &&
    binding.rowIndex >= 0;
  const effectiveSection =
    binding && typeof binding === "object" && binding.section ? binding.section : cls.section;
  const effectiveCls = effectiveSection ? { ...cls, section: effectiveSection } : cls;
  const aiValue = String(info?.value ?? "").trim();
  const rowPreferred = getRowPreferredCandidate(field, cachedResumeData, effectiveCls, rowBindingMap);
  const fallback = getResumeCandidates(field, cachedResumeData, effectiveCls);
  const isRepeating =
    effectiveSection === "work" ||
    effectiveSection === "education" ||
    effectiveSection === "projects";

  // Repeated sections: prefer row-consistent value first.
  // If row binding is unavailable, gracefully fallback to AI/local candidates instead of skipping all.
  if (isRepeating) {
    if (hasRowBinding) return rowPreferred || "";
    if (rowPreferred) return rowPreferred;
  }

  const candidates = uniqueNonEmpty([rowPreferred, aiValue, ...fallback]);
  // Prefer unique candidates first.
  for (const candidate of candidates) {
    const norm = normalizeText(candidate);
    if (!norm) continue;
    if (existingSet.has(norm)) continue;
    if (usedSet.has(norm)) continue;
    return candidate;
  }
  // Then allow duplicates that are not used in this single run.
  for (const candidate of candidates) {
    const norm = normalizeText(candidate);
    if (!norm) continue;
    if (usedSet.has(norm)) continue;
    return candidate;
  }
  // Final fallback: return first non-empty candidate to avoid skipping empty fields.
  return candidates[0] || "";
}

function resolveFieldId(rawKey, info, pageFields) {
  const fields = pageFields || [];
  const byId = new Set(fields.map((f) => f.fieldId).filter(Boolean));
  if (typeof rawKey === "string" && byId.has(rawKey)) return rawKey;
  if (info?.fieldId && byId.has(info.fieldId)) return info.fieldId;
  if (info?.targetFieldId && byId.has(info.targetFieldId)) return info.targetFieldId;

  const numeric = Number(rawKey);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < fields.length) {
    return fields[numeric].fieldId;
  }

  const hints = [
    rawKey,
    info?.label,
    info?.fieldLabel,
    info?.name,
    info?.id,
    info?.source
  ]
    .filter(Boolean)
    .map((v) => String(v));

  let best = null;
  let bestScore = 0;
  for (const field of fields) {
    for (const hint of hints) {
      const h = normalizeText(hint);
      if (!h) continue;
      const fl = normalizeText(field.label);
      const fn = normalizeText(field.name);
      const fi = normalizeText(field.id);
      let score = 0;
      if (fl && fl === h) score = 8;
      else if (fn && fn === h) score = 7;
      else if (fi && fi === h) score = 7;
      else if (fl && (fl.includes(h) || h.includes(fl))) score = 5;
      else if (fn && (fn.includes(h) || h.includes(fn))) score = 4;
      else if (fi && (fi.includes(h) || h.includes(fi))) score = 4;
      if (score > bestScore) {
        bestScore = score;
        best = field;
      }
    }
  }
  return bestScore >= 4 ? best?.fieldId || null : null;
}

function normalizeMappings(rawMappings, pageFields) {
  if (!rawMappings || typeof rawMappings !== "object") return {};
  const normalized = {};
  for (const [rawKey, rawInfo] of Object.entries(rawMappings)) {
    const info = rawInfo && typeof rawInfo === "object" ? rawInfo : { value: rawInfo };
    const fieldId = resolveFieldId(rawKey, info, pageFields);
    if (!fieldId) continue;
    normalized[fieldId] = info;
  }
  return normalized;
}

function augmentMappingsFromLocalHeuristics(mappings, pendingFields) {
  const next = { ...(mappings || {}) };
  const existingByBucket = getExistingValuesByBucket();
  const usedByBucket = new Map();
  const rowIndexMap = buildSectionRowIndexMap(latestFields);
  const rowBindingMap = buildResumeRowBindingMap(latestFields, rowIndexMap);

  for (const [fieldId, info] of Object.entries(next)) {
    const meta = pendingFields.find((f) => f.fieldId === fieldId);
    if (!meta) continue;
    const bucket = getFieldBucket(meta);
    const norm = normalizeText(info?.value || "");
    if (!norm) continue;
    if (!usedByBucket.has(bucket)) usedByBucket.set(bucket, new Set());
    usedByBucket.get(bucket).add(norm);
  }

  for (const field of pendingFields || []) {
    const current = next[field.fieldId];
    const currentValue = String(current?.value || "").trim();
    if (currentValue) continue;
    const candidate = pickBestCandidate(
      field,
      current || {},
      existingByBucket,
      usedByBucket,
      rowBindingMap
    );
    if (!candidate) continue;
    const bucket = getFieldBucket(field);
    const norm = normalizeText(candidate);
    if (!usedByBucket.has(bucket)) usedByBucket.set(bucket, new Set());
    usedByBucket.get(bucket).add(norm);
    next[field.fieldId] = {
      value: candidate,
      confidence: current?.confidence ?? 0.72,
      source: current?.source || "local.fallback",
      status: "matched"
    };
  }
  return next;
}

function filterOutSessionFilled(mappings, pageFields) {
  const signatureByFieldId = new Map(
    (pageFields || []).map((f) => [f.fieldId, f.fieldSignature]).filter((x) => x[0])
  );
  const next = {};
  for (const [fieldId, info] of Object.entries(mappings || {})) {
    const signature = signatureByFieldId.get(fieldId);
    if (signature && sessionFilledSignatures.has(signature)) continue;
    next[fieldId] = info;
  }
  return next;
}

function isFieldEmpty(element) {
  if (!element) return false;
  const tag = String(element.tagName || "").toLowerCase();
  const type = String(element.type || "").toLowerCase();
  if (type === "checkbox") return !element.checked;
  if (type === "radio") {
    if (!element.name) return !element.checked;
    const radios = [...document.querySelectorAll(`input[type="radio"][name="${element.name}"]`)];
    return !radios.some((r) => r.checked);
  }
  if (tag === "select") {
    const valueNorm = normalizeText(String(element.value || "").trim());
    const selected = element.selectedOptions?.[0] || null;
    const textNorm = normalizeText(String(selected?.textContent || "").trim());
    return isSelectPlaceholder(valueNorm, textNorm);
  }
  return String(element.value || "").trim() === "";
}

function isElementActuallyVisible(el) {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (!style) return false;
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectFields() {
  sectionHintCache = new WeakMap();
  const elements = [...document.querySelectorAll(FIELD_SELECTOR)].filter((el) => {
    if (!el || el.disabled) return false;
    const type = String(el.type || "").toLowerCase();
    if (UNSUPPORTED_INPUT_TYPES.has(type)) return false;
    if (!isElementActuallyVisible(el)) return false;
    return true;
  });
  const occurrenceMap = new Map();
  const usedSignatures = new Set();
  const fields = elements.map((el) => {
    const label = getLabelForElement(el);
    const type = el.type || el.tagName.toLowerCase();
    const name = el.name || "";
    const id = el.id || "";
    const placeholder = el.getAttribute("placeholder") || "";
    const sectionHint = detectSectionHint(el);
    let fieldSignature = el.dataset.aiFieldSignature || "";
    if (!fieldSignature || usedSignatures.has(fieldSignature)) {
      const baseSignature = `${normalizeText(name)}|${normalizeText(id)}|${type}|${normalizeText(label)}`;
      let occurrence = occurrenceMap.get(baseSignature) || 0;
      let candidate = `${baseSignature}#${occurrence}`;
      while (usedSignatures.has(candidate)) {
        occurrence += 1;
        candidate = `${baseSignature}#${occurrence}`;
      }
      occurrenceMap.set(baseSignature, occurrence + 1);
      fieldSignature = candidate;
      el.dataset.aiFieldSignature = fieldSignature;
    }
    usedSignatures.add(fieldSignature);
    const nextFieldId = `f_${hashText(fieldSignature)}`;
    el.dataset.aiFieldId = nextFieldId;
    return {
      fieldId: nextFieldId,
      fieldSignature,
      label,
      type,
      name,
      id,
      placeholder,
      sectionHint,
      value: el.value || "",
      _element: el
    };
  });
  latestFields = fields;
  return fields;
}

function isLikelyDegreeField(element) {
  const hint = normalizeText(
    [
      getLabelForElement(element),
      element?.name || "",
      element?.id || "",
      element?.getAttribute?.("placeholder") || "",
      element?.getAttribute?.("aria-label") || ""
    ].join("|")
  );
  return containsAny(hint, [
    "\u5b66\u5386", // 学历
    "\u5b66\u4f4d", // 学位
    "degree",
    "education"
  ]);
}

function getDegreeAliasMap() {
  return {
    bachelor: [
      "\u672c\u79d1", // 本科
      "\u5b66\u58eb", // 学士
      "bachelor"
    ],
    master: [
      "\u7855\u58eb", // 硕士
      "\u7814\u7a76\u751f", // 研究生
      "master",
      "msc",
      "ma",
      "meng",
      "mba"
    ],
    doctor: [
      "\u535a\u58eb", // 博士
      "phd",
      "doctor"
    ],
    associate: [
      "\u5927\u4e13", // 大专
      "\u4e13\u79d1", // 专科
      "associate"
    ]
  };
}

function inferDegreeKey(text) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  const aliasMap = getDegreeAliasMap();
  for (const [key, aliases] of Object.entries(aliasMap)) {
    if (aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      return key;
    }
  }
  return "";
}

function isSelectPlaceholder(optionValueNorm, optionTextNorm) {
  const placeholderTokens = [
    "\u8bf7\u9009", // 请选
    "\u8bf7\u9009\u62e9", // 请选择
    "select",
    "choose",
    "placeholder",
    "--"
  ];
  if (!optionTextNorm && !optionValueNorm) return true;
  if (containsAny(optionTextNorm, placeholderTokens)) return true;
  if (containsAny(optionValueNorm, placeholderTokens)) return true;
  return false;
}

function matchSelectOptionValue(selectEl, rawValue) {
  const target = String(rawValue ?? "").trim();
  if (!target) return "";
  const targetNorm = normalizeText(target);
  const isDegreeField = isLikelyDegreeField(selectEl);
  const targetDegreeKey = isDegreeField ? inferDegreeKey(targetNorm) : "";
  const aliasMap = isDegreeField ? getDegreeAliasMap() : null;

  const options = [...(selectEl?.options || [])]
    .map((opt) => {
      const value = String(opt.value ?? "").trim();
      const text = String(opt.textContent ?? "").trim();
      return {
        opt,
        value,
        text,
        valueNorm: normalizeText(value),
        textNorm: normalizeText(text)
      };
    })
    .filter((x) => !isSelectPlaceholder(x.valueNorm, x.textNorm));

  if (!options.length) return "";

  let bestValue = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const item of options) {
    let score = 0;

    if (item.value === target) score = Math.max(score, 100);
    if (item.text === target) score = Math.max(score, 95);
    if (item.valueNorm === targetNorm) score = Math.max(score, 92);
    if (item.textNorm === targetNorm) score = Math.max(score, 90);

    if (targetNorm && item.textNorm && item.textNorm.includes(targetNorm)) {
      score = Math.max(score, 80);
    }
    if (targetNorm && item.valueNorm && item.valueNorm.includes(targetNorm)) {
      score = Math.max(score, 78);
    }
    if (targetNorm && item.textNorm && targetNorm.includes(item.textNorm)) {
      score = Math.max(score, 70);
    }

    if (isDegreeField && targetDegreeKey && aliasMap?.[targetDegreeKey]) {
      const aliases = aliasMap[targetDegreeKey];
      if (
        aliases.some((alias) => {
          const a = normalizeText(alias);
          return item.textNorm.includes(a) || item.valueNorm.includes(a);
        })
      ) {
        score = Math.max(score, 88);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = item.value;
    }
  }

  if (bestScore < 60) return "";
  return bestValue;
}

function setFieldValue(element, value) {
  if (!element || element.disabled) return false;
  if (String(element.type || "").toLowerCase() === "file") return false;
  const tag = element.tagName.toLowerCase();
  if (tag === "select") {
    element.focus();
    const matched = matchSelectOptionValue(element, value);
    if (!matched) return false;
    element.value = matched;
    if (String(element.value || "").trim() !== matched) return false;
  } else if (element.type === "checkbox") {
    element.checked = Boolean(value);
  } else if (element.type === "radio") {
    const radios = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
    let matched = false;
    radios.forEach((r) => {
      r.checked = r.value === value;
      if (r.checked) {
        matched = true;
        r.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    return matched;
  } else {
    const proto =
      element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const previousValue = element.value;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(element, String(value ?? ""));
    else element.value = String(value ?? "");
    if (element._valueTracker && typeof element._valueTracker.setValue === "function") {
      element._valueTracker.setValue(previousValue);
    }
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function makePanel() {
  const host = document.createElement("div");
  host.id = "ai-resume-shell";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  const shadow = host.attachShadow({ mode: "open" });
  const cssLink = document.createElement("link");
  cssLink.rel = "stylesheet";
  cssLink.href = chrome.runtime.getURL("content/content.css");
  shadow.appendChild(cssLink);

  const panel = document.createElement("section");
  panel.className = "ai-panel";
  applyPanelTheme(panel, "b");
  panel.innerHTML = `
    <div class="ai-header">
      <strong id="ai-title">${tp("panelTitle")}</strong>
      <div class="ai-header-actions">
        <button class="ai-btn" id="ai-locale-toggle">${tp("langToggle")}</button>
        <button class="ai-btn" id="ai-close">${tp("close")}</button>
      </div>
    </div>
    <div class="ai-body">
      <div class="ai-actions">
        <button class="ai-btn" id="ai-refresh">${tp("refresh")}</button>
        <button class="ai-btn primary" id="ai-fill-all">${tp("fillAll")}</button>
      </div>
      <p class="ai-note" id="ai-note">${tp("ready")}</p>
      <div id="ai-list"></div>
    </div>
  `;
  // Fallback styles in case Shadow CSS fails to load on specific pages.
  panel.style.position = "fixed";
  panel.style.left = "20px";
  panel.style.bottom = "20px";
  panel.style.width = "360px";
  panel.style.maxHeight = "70vh";
  panel.style.overflow = "hidden";
  panel.style.borderRadius = "14px";
  panel.style.zIndex = "2147483647";
  panel.style.pointerEvents = "auto";
  shadow.appendChild(panel);
  const mountRoot = document.body || document.documentElement;
  mountRoot.appendChild(host);
  void loadUiThemeFromStorage().then((theme) => applyPanelTheme(panel, theme));
  void loadUiLocaleFromStorage().then((locale) => applyPanelLocale(shadow, locale));
  ensurePanelVisible(panel);
  pulsePanel(panel);

  let dragging = false;
  let ox = 0;
  let oy = 0;
  const header = panel.querySelector(".ai-header");
  header.addEventListener("mousedown", (e) => {
    dragging = true;
    ox = e.clientX - panel.getBoundingClientRect().left;
    oy = e.clientY - panel.getBoundingClientRect().top;
  });
  window.addEventListener("mouseup", () => {
    dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panel.style.left = `${Math.max(0, e.clientX - ox)}px`;
    panel.style.top = `${Math.max(0, e.clientY - oy)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.position = "fixed";
  });

  shadow.getElementById("ai-close").addEventListener("click", () => host.remove());
  return { host, shadow };
}

function renderMatches(shadow, mappings) {
  const list = shadow.getElementById("ai-list");
  const note = shadow.getElementById("ai-note");
  list.innerHTML = "";
  learningFields = new Map();

  const entries = Object.entries(mappings || {});
  if (!entries.length) {
    note.textContent = tp("noMatch");
    note.dataset.userSet = "1";
    return;
  }
  let renderCount = 0;

  for (const [fieldId, info] of entries) {
    const meta = latestFields.find((f) => f.fieldId === fieldId);
    const el = meta?._element || document.querySelector(`[data-ai-field-id="${fieldId}"]`);
    if (!el) continue;
    renderCount += 1;
    const row = document.createElement("div");
    row.className = "ai-row";
    const status = info?.status || (info?.value ? "matched" : "unknown");
    if (status === "unknown") {
      learningFields.set(fieldId, { label: getLabelForElement(el), element: el });
    }
    row.innerHTML = `
      <strong>${getLabelForElement(el)}</strong>
      <small>${tp("sourceConfidence", { source: info?.source || tp("sourceUnknown"), confidence: (info?.confidence ?? 0).toFixed(2) })}</small>
      <input data-field-id="${fieldId}" value="${String(info?.value ?? "").replace(/"/g, "&quot;")}" />
    `;
    list.appendChild(row);
  }
  note.textContent = tp("detectedSummary", { total: entries.length, actionable: renderCount });
  note.dataset.userSet = "1";

  list.querySelectorAll("input[data-field-id]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = e.target.dataset.fieldId;
      if (mappings[id]) mappings[id].value = e.target.value;
    });
  });
}

function findElementForFieldId(fieldId) {
  const byDataset = document.querySelector(`[data-ai-field-id="${fieldId}"]`);
  if (byDataset) return byDataset;

  const meta = latestFields.find((f) => f.fieldId === fieldId);
  if (!meta) return null;

  if (meta.id) {
    const byId = document.getElementById(meta.id);
    if (byId) return byId;
  }
  if (meta.name) {
    const safeName = String(meta.name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const byName = document.querySelector(`${FIELD_SELECTOR}[name="${safeName}"]`);
    if (byName) return byName;
  }
  const candidates = [...document.querySelectorAll(FIELD_SELECTOR)];
  return (
    candidates.find((el) => getLabelForElement(el) === meta.label && (el.type || el.tagName.toLowerCase()) === meta.type) ||
    null
  );
}

function installLearningHooks() {
  for (const [fieldId, meta] of learningFields.entries()) {
    const el = meta.element;
    if (el.dataset.aiLearningBound === "1") continue;
    el.dataset.aiLearningBound = "1";

    el.addEventListener(
      "blur",
      async () => {
        if (!el.value || !learningFields.has(fieldId)) return;
        const ok = window.confirm(tp("confirmLearnField", { label: meta.label }));
        if (!ok) return;
        await chrome.runtime.sendMessage({
          type: "SAVE_NEW_FIELD",
          fieldLabel: meta.label,
          fieldValue: el.value
        });
        learningFields.delete(fieldId);
      },
      true
    );
  }
}

async function identifyAndRender(shadow, forceRematch = false) {
  const pageFields = collectFields();
  // Re-sync filled signatures from real DOM values to avoid stale skip state.
  sessionFilledSignatures = new Set(
    pageFields
      .filter((f) => f.fieldSignature && !isFieldEmpty(f._element))
      .map((f) => f.fieldSignature)
  );
  if (!cachedResumeData) {
    try {
      const resumeRes = await runtimeSendMessageWithRetry({ type: "GET_RESUME" }, 1);
      if (resumeRes?.ok && resumeRes.data) cachedResumeData = resumeRes.data;
    } catch (error) {
      console.warn("[AI Resume] get resume failed", error);
    }
  }
  const pendingFields = pageFields.filter(
    (f) => isFieldEmpty(f._element) && !sessionFilledSignatures.has(f.fieldSignature)
  );
  const pendingPayload = pendingFields.map((f) => ({
    fieldId: f.fieldId,
    fieldSignature: f.fieldSignature,
    label: f.label,
    type: f.type,
    name: f.name,
    id: f.id,
    placeholder: f.placeholder,
    sectionHint: f.sectionHint,
    value: f.value
  }));
  if (!pendingFields.length) {
    const note = shadow.getElementById("ai-note");
    note.textContent = tp("sessionDone");
    note.dataset.userSet = "1";
    renderMatches(shadow, {});
    return {};
  }
  const domain = location.hostname;
  const res = await runtimeSendMessageWithRetry({
    type: "MATCH_FIELDS",
    pageFields: pendingPayload,
    domain,
    forceRematch
  }, 1);
  if (!res?.ok) {
    const note = shadow.getElementById("ai-note");
    note.textContent = tp("identifyFailed", { error: res?.error || tp("unknownError") });
    note.dataset.userSet = "1";
    return null;
  }
  const normalizedMappings = filterOutSessionFilled(
    normalizeMappings(res.data || {}, pendingPayload),
    pendingPayload
  );
  const hydratedMappings = augmentMappingsFromLocalHeuristics(normalizedMappings, pendingPayload);
  renderMatches(shadow, hydratedMappings);
  installLearningHooks();
  if (res?.localMatched || res?.metrics) {
    const note = shadow.getElementById("ai-note");
    const localText = res?.localMatched ? tp("localMatched", { count: res.localMatched }) : "";
    const perfText = res?.metrics?.totalMs ? tp("elapsed", { seconds: Math.round(res.metrics.totalMs / 100) / 10 }) : "";
    const separator = panelLocale === "zh" ? "，" : ", ";
    const extra = [localText, perfText].filter(Boolean).join(separator);
    if (extra) {
      note.textContent = `${note.textContent} ${extra}`;
      note.dataset.userSet = "1";
    }
  }
  return hydratedMappings;
}

function fillAll(mappings) {
  // Refresh live field references before writing, page may re-render after identification.
  collectFields();
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  const newlyFilledFieldIds = [];
  const existingByBucket = getExistingValuesByBucket();
  const usedByBucket = new Map();
  const rowIndexMap = buildSectionRowIndexMap(latestFields);
  const rowBindingMap = buildResumeRowBindingMap(latestFields, rowIndexMap);
  const fieldOrder = new Map(latestFields.map((f, idx) => [f.fieldId, idx]));
  const sortedEntries = Object.entries(mappings || {}).sort((a, b) => {
    const ia = fieldOrder.get(a[0]);
    const ib = fieldOrder.get(b[0]);
    return (ia ?? Number.MAX_SAFE_INTEGER) - (ib ?? Number.MAX_SAFE_INTEGER);
  });

  for (const [fieldId, info] of sortedEntries) {
    let meta = latestFields.find((f) => f.fieldId === fieldId);
    if (meta?.fieldSignature && sessionFilledSignatures.has(meta.fieldSignature)) {
      skippedCount += 1;
      continue;
    }
    try {
      const el = findElementForFieldId(fieldId);
      if (!el) {
        failCount += 1;
        continue;
      }
      if (!meta) {
        meta = {
          fieldId,
          fieldSignature: el.dataset.aiFieldSignature || `adhoc_${fieldId}`,
          label: getLabelForElement(el),
          type: el.type || el.tagName.toLowerCase(),
          name: el.name || "",
          id: el.id || "",
          placeholder: el.getAttribute("placeholder") || "",
          sectionHint: detectSectionHint(el),
          _element: el
        };
      }
      if (!isFieldEmpty(el)) {
        if (meta?.fieldSignature) sessionFilledSignatures.add(meta.fieldSignature);
        skippedCount += 1;
        continue;
      }

      const candidate = pickBestCandidate(
        meta,
        info,
        existingByBucket,
        usedByBucket,
        rowBindingMap
      );
      if (!candidate) {
        skippedCount += 1;
        continue;
      }

      const ok = setFieldValue(el, candidate);
      if (ok) {
        successCount += 1;
        newlyFilledFieldIds.push(fieldId);
        if (meta?.fieldSignature) sessionFilledSignatures.add(meta.fieldSignature);
        const bucket = getFieldBucket(meta);
        const norm = normalizeText(candidate);
        if (!existingByBucket.has(bucket)) existingByBucket.set(bucket, new Set());
        if (!usedByBucket.has(bucket)) usedByBucket.set(bucket, new Set());
        existingByBucket.get(bucket).add(norm);
        usedByBucket.get(bucket).add(norm);
        if (mappings[fieldId]) mappings[fieldId].value = candidate;
      }
      else failCount += 1;
    } catch (error) {
      failCount += 1;
      console.warn("[AI Resume] fill failed", { fieldId, error });
    }
  }
  return { successCount, failCount, skippedCount, newlyFilledFieldIds };
}

async function bootstrap() {
  const existing = document.getElementById("ai-resume-shell");
  if (existing) {
    // Important: when extension reloads, stale panel DOM may remain without live listeners.
    // Recreate panel to guarantee action buttons are wired by current script context.
    existing.remove();
  }
  const { shadow } = makePanel();
  let mappings = {};
  let busy = false;
  const note = shadow.getElementById("ai-note");
  const refreshBtn = shadow.getElementById("ai-refresh");
  const fillBtn = shadow.getElementById("ai-fill-all");
  const localeBtn = shadow.getElementById("ai-locale-toggle");

  localeBtn?.addEventListener("click", async () => {
    const nextLocale = panelLocale === "zh" ? "en" : "zh";
    applyPanelLocale(shadow, nextLocale);
    persistUiLocale(nextLocale);
    renderMatches(shadow, mappings);
    installLearningHooks();
  });

  async function doIdentify(forceRematch) {
    if (busy) return;
    busy = true;
    refreshBtn.disabled = true;
    fillBtn.disabled = true;
    note.textContent = forceRematch ? tp("identifyRunningForce") : tp("identifyRunning");
    note.dataset.userSet = "1";
    try {
      mappings = (await identifyAndRender(shadow, forceRematch)) || {};
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        note.textContent = tp("contextInvalidated");
      } else {
        note.textContent = tp("identifyFailed", { error: error?.message || String(error) });
      }
      note.dataset.userSet = "1";
      console.error("[AI Resume] identify failed", error);
    } finally {
      busy = false;
      refreshBtn.disabled = false;
      fillBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", () => {
    void doIdentify(true);
  });

  fillBtn.addEventListener("click", () => {
    if (busy) return;
    note.textContent = tp("filling");
    note.dataset.userSet = "1";
    try {
      const result = fillAll(mappings);
      result.newlyFilledFieldIds.forEach((id) => {
        delete mappings[id];
      });
      renderMatches(shadow, mappings);
      installLearningHooks();
      note.textContent = tp("fillSummary", {
        success: result.successCount,
        skipped: result.skippedCount,
        failed: result.failCount
      });
      note.dataset.userSet = "1";
    } catch (error) {
      note.textContent = tp("fillFailed", { error: error?.message || String(error) });
      note.dataset.userSet = "1";
      console.error("[AI Resume] fill all failed", error);
    }
  });

  void doIdentify(false);
  return { created: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "HEALTHCHECK_RUNTIME") {
    runtimeSendMessageWithRetry({ type: "PING_BG" }, 0)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }
  if (msg?.type === "OPEN_AUTOFILL_PANEL") {
    bootstrap()
      .then((result) => sendResponse({ ok: true, data: result || { created: false } }))
      .catch((err) => {
        console.error("[AI Resume]", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      });
    return true;
  }
  return false;
});
