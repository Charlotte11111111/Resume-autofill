import { classifyNewField, matchFields, parseResume } from "../utils/ai-client.js";
import {
  deleteApiProfile,
  getApiSettings,
  getApiSettingsBundle,
  getCustomFields,
  getFieldHistory,
  getResumeData,
  saveApiSettings,
  saveCustomFields,
  saveFieldHistory,
  saveResumeData,
  setActiveApiProfile
} from "../utils/storage.js";
import { getEmptyResumeData } from "../utils/resume-schema.js";

function withCustomFields(resumeData, customFields) {
  const base = resumeData || getEmptyResumeData();
  return { ...base, customFields: customFields || {} };
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      });
  });
}

function getFieldIdOverlapCount(cachedMappings, pageFields) {
  const pageFieldIds = new Set((pageFields || []).map((f) => f.fieldId).filter(Boolean));
  if (!pageFieldIds.size || !cachedMappings || typeof cachedMappings !== "object") return 0;
  let count = 0;
  for (const key of Object.keys(cachedMappings)) {
    if (pageFieldIds.has(key)) count += 1;
  }
  return count;
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

function isEducationSectionHint(sectionHint) {
  return containsAny(sectionHint, ["education", "edu", "教育"]);
}

function isWorkSectionHint(sectionHint) {
  return containsAny(sectionHint, ["workexperience", "work", "工作"]);
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
    return "workExperience";
  }
  return "";
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getPageFieldsCacheKey(domain, pageFields) {
  const token = (pageFields || [])
    .map((f) =>
      [
        f.fieldSignature || "",
        f.fieldId || "",
        normalizeText(f.label),
        normalizeText(f.name),
        normalizeText(f.id),
        normalizeText(f.type)
      ].join("|")
    )
    .sort()
    .join("||");
  const sig = hashText(token || "empty");
  return `${domain}::${sig}`;
}

function compactList(list, max = 8) {
  return (Array.isArray(list) ? list : []).slice(0, max);
}

function pickCustomFieldsByHints(customFields, hints, max = 40) {
  const entries = Object.entries(customFields || {});
  if (!entries.length) return {};
  const picked = [];
  for (const [key, value] of entries) {
    if (!value) continue;
    const nk = normalizeText(key);
    const match = hints.some((h) => h && (nk.includes(h) || h.includes(nk)));
    if (match) picked.push([key, value]);
    if (picked.length >= max) break;
  }
  if (!picked.length) {
    return Object.fromEntries(entries.slice(0, Math.min(max, entries.length)));
  }
  return Object.fromEntries(picked);
}

function buildResumeSubsetForFields(fields, resumeData) {
  const needs = {
    basicInfo: false,
    workExperience: false,
    education: false,
    projects: false,
    skills: false,
    certifications: false,
    languages: false,
    customFields: false
  };
  const hints = [];

  for (const field of fields || []) {
    const cls = classifyField(field);
    if (cls?.section === "basicInfo") needs.basicInfo = true;
    if (cls?.section === "workExperience") needs.workExperience = true;
    if (cls?.section === "education") needs.education = true;
    if (cls?.section === "projects") needs.projects = true;
    if (!cls) {
      const hint = normalizeText([field?.label, field?.name, field?.id, field?.placeholder].join("|"));
      hints.push(hint);
      if (containsAny(hint, ["项目", "project"])) needs.projects = true;
      if (containsAny(hint, ["技能", "skill"])) needs.skills = true;
      if (containsAny(hint, ["证书", "certification"])) needs.certifications = true;
      if (containsAny(hint, ["语言", "language"])) needs.languages = true;
      needs.customFields = true;
    }
  }

  const subset = {};
  if (needs.basicInfo) subset.basicInfo = resumeData?.basicInfo || {};
  if (needs.workExperience) subset.workExperience = compactList(resumeData?.workExperience, 10);
  if (needs.education) subset.education = compactList(resumeData?.education, 10);
  if (needs.projects) subset.projects = compactList(resumeData?.projects, 8);
  if (needs.skills) subset.skills = compactList(resumeData?.skills, 40);
  if (needs.certifications) subset.certifications = compactList(resumeData?.certifications, 12);
  if (needs.languages) subset.languages = compactList(resumeData?.languages, 12);
  if (needs.customFields) {
    subset.customFields = pickCustomFieldsByHints(resumeData?.customFields || {}, hints, 50);
  }

  // Fallback: keep minimal context for generic fields.
  if (!Object.keys(subset).length) {
    subset.basicInfo = resumeData?.basicInfo || {};
    subset.workExperience = compactList(resumeData?.workExperience, 6);
    subset.education = compactList(resumeData?.education, 6);
    subset.projects = compactList(resumeData?.projects, 6);
  }
  return subset;
}

function classifyField(field) {
  const sectionHint = normalizeText(field?.sectionHint || "");
  const hints = [
    field?.label,
    field?.name,
    field?.id,
    field?.placeholder
  ]
    .map(normalizeText)
    .join("|");

  if (containsAny(hints, ["项目名称", "projectname"])) return { section: "projects", property: "name" };
  if (containsAny(hints, ["项目角色", "项目职责", "projectrole"])) {
    return { section: "projects", property: "role" };
  }
  if (containsAny(hints, ["项目描述", "projectdescription"])) {
    return { section: "projects", property: "description" };
  }

  if (containsAny(hints, ["职责描述", "description"])) {
    const section = resolveSectionFromHints(hints, sectionHint);
    if (section === "projects") return { section: "projects", property: "description" };
    if (section === "education") return { section: "education", property: "description" };
    if (section === "workExperience") return { section: "workExperience", property: "description" };
    return null;
  }

  if (containsAny(hints, ["职务描述", "工作描述", "岗位描述"])) {
    return { section: "workExperience", property: "description" };
  }
  if (containsAny(hints, ["公司", "company"])) return { section: "workExperience", property: "company" };
  if (containsAny(hints, ["职务", "岗位", "职位", "title"])) {
    return { section: "workExperience", property: "title" };
  }
  if (containsAny(hints, ["学校", "school"])) return { section: "education", property: "school" };
  if (containsAny(hints, ["专业", "major"])) return { section: "education", property: "major" };
  if (containsAny(hints, ["学历", "学位", "degree"])) return { section: "education", property: "degree" };

  if (containsAny(hints, ["开始", "start"]) && containsAny(hints, ["时间", "日期", "date", "time"])) {
    const section = resolveSectionFromHints(hints, sectionHint);
    if (section === "projects") return { section: "projects", property: "startDate" };
    if (section === "education") return { section: "education", property: "startDate" };
    if (section === "workExperience") return { section: "workExperience", property: "startDate" };
    return null;
  }
  if (containsAny(hints, ["结束", "end"]) && containsAny(hints, ["时间", "日期", "date", "time"])) {
    const section = resolveSectionFromHints(hints, sectionHint);
    if (section === "projects") return { section: "projects", property: "endDate" };
    if (section === "education") return { section: "education", property: "endDate" };
    if (section === "workExperience") return { section: "workExperience", property: "endDate" };
    return null;
  }
  if (containsAny(hints, ["邮箱", "email"])) return { section: "basicInfo", property: "email" };
  if (containsAny(hints, ["手机", "电话", "phone", "mobile"])) return { section: "basicInfo", property: "phone" };
  if (containsAny(hints, ["姓名", "name"])) return { section: "basicInfo", property: "fullName" };
  if (containsAny(hints, ["github"])) return { section: "basicInfo", property: "github" };
  if (containsAny(hints, ["linkedin"])) return { section: "basicInfo", property: "linkedIn" };
  if (containsAny(hints, ["网站", "主页", "website"])) return { section: "basicInfo", property: "website" };
  return null;
}

function getFirstNonEmptyFromArray(arr, prop) {
  const list = Array.isArray(arr) ? arr : [];
  for (const item of list) {
    const value = String(item?.[prop] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function getCustomFieldCandidate(field, resumeData) {
  const customFields = resumeData?.customFields || {};
  const hint = normalizeText([field?.label, field?.name, field?.id].join("|"));
  if (!hint) return "";
  if (
    containsAny(hint, [
      "startdate",
      "enddate",
      "date",
      "time",
      "\u65f6\u95f4", // 时间
      "\u65e5\u671f", // 日期
      "\u5f00\u59cb", // 开始
      "\u7ed3\u675f" // 结束
    ])
  ) {
    return "";
  }
  for (const [key, value] of Object.entries(customFields)) {
    if (!value) continue;
    const k = normalizeText(key);
    if (k.includes(hint) || hint.includes(k)) {
      return String(value).trim();
    }
  }
  return "";
}

function fastLocalMatch(pageFields, resumeData) {
  const mappings = {};
  const unmatched = [];
  for (const field of pageFields || []) {
    if (!field?.fieldId) continue;
    const cls = classifyField(field);
    let value = "";
    let source = "local.unknown";

    if (cls?.section === "basicInfo") {
      value = String(resumeData?.basicInfo?.[cls.property] ?? "").trim();
      source = `basicInfo.${cls.property}`;
    } else if (cls?.section === "workExperience") {
      value = getFirstNonEmptyFromArray(resumeData?.workExperience, cls.property);
      source = `workExperience[].${cls.property}`;
    } else if (cls?.section === "education") {
      value = getFirstNonEmptyFromArray(resumeData?.education, cls.property);
      source = `education[].${cls.property}`;
    } else if (cls?.section === "projects") {
      value = getFirstNonEmptyFromArray(resumeData?.projects, cls.property);
      source = `projects[].${cls.property}`;
    } else {
      value = getCustomFieldCandidate(field, resumeData);
      source = value ? "customFields" : source;
    }

    if (value) {
      mappings[field.fieldId] = {
        value,
        confidence: 0.88,
        source,
        status: "matched"
      };
    } else {
      unmatched.push(field);
    }
  }
  return { mappings, unmatched };
}

async function handleMessage(message) {
  if (!message || !message.type) {
    return { ok: false, error: "鏃犳晥娑堟伅" };
  }

  if (message.type === "PARSE_RESUME") {
    const parsed = await withTimeout(
      parseResume(message.rawText || ""),
      60_000,
      "Resume parsing timed out. Please try again."
    );
    const customFields = await getCustomFields();
    const merged = withCustomFields(parsed, customFields);
    await saveResumeData(merged);
    return { ok: true, data: merged };
  }

  if (message.type === "GET_RESUME") {
    const data = await getResumeData();
    return { ok: true, data: data || getEmptyResumeData() };
  }

  if (message.type === "SAVE_RESUME_DRAFT") {
    const raw = message.data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "Resume draft must be a JSON object." };
    }
    const currentCustomFields = await getCustomFields();
    const incomingCustomFields =
      raw.customFields && typeof raw.customFields === "object" && !Array.isArray(raw.customFields)
        ? raw.customFields
        : currentCustomFields;

    const merged = withCustomFields({ ...getEmptyResumeData(), ...raw }, incomingCustomFields);
    await saveCustomFields(incomingCustomFields);
    await saveResumeData(merged);
    return { ok: true, data: merged };
  }

  if (message.type === "SAVE_SETTINGS") {
    const bundle = await saveApiSettings(message.settings || {});
    return { ok: true, data: bundle };
  }

  if (message.type === "GET_SETTINGS") {
    const bundle = await getApiSettingsBundle();
    const active = await getApiSettings();
    return { ok: true, data: { ...bundle, activeProfile: active } };
  }

  if (message.type === "SET_ACTIVE_API_PROFILE") {
    const bundle = await setActiveApiProfile(message.profileId || "");
    return { ok: true, data: bundle };
  }

  if (message.type === "DELETE_API_PROFILE") {
    const bundle = await deleteApiProfile(message.profileId || "");
    return { ok: true, data: bundle };
  }

  if (message.type === "PING_BG") {
    return { ok: true, ts: Date.now() };
  }

  if (message.type === "MATCH_FIELDS") {
    const startedAt = Date.now();
    const domain = message.domain || "unknown";
    const pageFields = message.pageFields || [];
    const pageCacheKey = getPageFieldsCacheKey(domain, pageFields);
    const forceRematch = Boolean(message.forceRematch);
    const cached = forceRematch ? null : await getFieldHistory(pageCacheKey);
    const legacyCached = forceRematch ? null : await getFieldHistory(domain);
    if (cached?.mappings) {
      const overlap = getFieldIdOverlapCount(cached.mappings, pageFields);
      if (overlap > 0) {
        return { ok: true, data: cached.mappings, cached: true };
      }
    }
    if (legacyCached?.mappings) {
      const overlap = getFieldIdOverlapCount(legacyCached.mappings, pageFields);
      if (overlap > 0) {
        return { ok: true, data: legacyCached.mappings, cached: true };
      }
    }

    const resumeData = await getResumeData();
    if (!resumeData) {
      return { ok: false, error: "Please upload and parse your resume in the extension first." };
    }

    // Fast path: local deterministic matching first, then AI for unresolved fields only.
    const local = fastLocalMatch(pageFields, resumeData);
    let mappings = { ...local.mappings };
    let warning = "";
    let aiElapsedMs = 0;

    if (local.unmatched.length > 0) {
      try {
        const aiStartedAt = Date.now();
        const subsetResume = buildResumeSubsetForFields(local.unmatched, resumeData);
        const aiMappings = await matchFields(local.unmatched, subsetResume);
        aiElapsedMs = Date.now() - aiStartedAt;
        if (aiMappings && typeof aiMappings === "object") {
          mappings = { ...mappings, ...aiMappings };
        }
      } catch (error) {
        warning = `AI matching failed, using local matching only: ${error?.message || String(error)}`;
      }
    }

    if (!Object.keys(mappings).length) {
      return { ok: false, error: warning || "No fields could be matched. Please try identify again." };
    }

    await saveFieldHistory(pageCacheKey, mappings);
    await saveFieldHistory(domain, mappings);
    return {
      ok: true,
      data: mappings,
      cached: false,
      localMatched: Object.keys(local.mappings).length,
      aiRequested: local.unmatched.length > 0,
      warning,
      metrics: {
        totalMs: Date.now() - startedAt,
        aiMs: aiElapsedMs,
        unmatchedCount: local.unmatched.length
      }
    };
  }

  if (message.type === "SAVE_NEW_FIELD") {
    const current = await getCustomFields();
    const fieldLabel = message.fieldLabel || "unknown";
    const fieldValue = message.fieldValue || "";
    let key = `customFields.${fieldLabel}`;

    try {
      const cls = await withTimeout(
        classifyNewField(fieldLabel, fieldValue),
        20_000,
        "Field classification timed out; using default key."
      );
      if (cls?.key && typeof cls.key === "string") key = cls.key;
    } catch (_err) {
      // Fallback to label-only key when classifier is unavailable.
    }

    current[key] = fieldValue;
    await saveCustomFields(current);

    const resumeData = await getResumeData();
    await saveResumeData(withCustomFields(resumeData, current));

    return { ok: true, key };
  }

  return { ok: false, error: `鏈煡娑堟伅绫诲瀷: ${message.type}` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((res) => sendResponse(res))
    .catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
  return true;
});
