const KEYS = {
  resumeData: "resumeData",
  apiSettings: "apiSettings",
  customFields: "customFields",
  fieldHistory: "fieldHistory"
};

const DEFAULT_PROFILE = {
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini"
};

function getFromStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function setToStorage(payload) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function saveResumeData(data) {
  await setToStorage({ [KEYS.resumeData]: data });
}

export async function getResumeData() {
  const data = await getFromStorage([KEYS.resumeData]);
  return data[KEYS.resumeData] || null;
}

export async function saveApiSettings(settings) {
  const bundle = await getApiSettingsBundle();
  const incoming = {
    ...DEFAULT_PROFILE,
    ...(settings || {})
  };

  const profileId = incoming.id || `api_${Date.now()}`;
  const normalizedProfile = {
    id: profileId,
    name: incoming.name || `${incoming.provider} | ${incoming.model}`,
    provider: incoming.provider,
    apiKey: incoming.apiKey,
    baseUrl: incoming.baseUrl,
    model: incoming.model,
    updatedAt: new Date().toISOString()
  };

  const profiles = bundle.profiles.filter((p) => p.id !== profileId);
  profiles.unshift(normalizedProfile);

  const nextBundle = {
    profiles,
    activeProfileId: profileId
  };
  await setToStorage({ [KEYS.apiSettings]: nextBundle });
  return nextBundle;
}

export async function getApiSettings() {
  const bundle = await getApiSettingsBundle();
  const active =
    bundle.profiles.find((p) => p.id === bundle.activeProfileId) || bundle.profiles[0] || null;
  return active
    ? {
        provider: active.provider,
        apiKey: active.apiKey,
        baseUrl: active.baseUrl,
        model: active.model
      }
    : DEFAULT_PROFILE;
}

export async function setActiveApiProfile(profileId) {
  const bundle = await getApiSettingsBundle();
  if (!bundle.profiles.some((p) => p.id === profileId)) return bundle;
  const nextBundle = { ...bundle, activeProfileId: profileId };
  await setToStorage({ [KEYS.apiSettings]: nextBundle });
  return nextBundle;
}

export async function deleteApiProfile(profileId) {
  const bundle = await getApiSettingsBundle();
  const profiles = bundle.profiles.filter((p) => p.id !== profileId);
  const activeProfileId =
    bundle.activeProfileId === profileId ? (profiles[0]?.id || "") : bundle.activeProfileId;
  const nextBundle = { profiles, activeProfileId };
  await setToStorage({ [KEYS.apiSettings]: nextBundle });
  return nextBundle;
}

export async function getApiSettingsBundle() {
  const data = await getFromStorage([KEYS.apiSettings]);
  const raw = data[KEYS.apiSettings];

  if (!raw) {
    return { profiles: [], activeProfileId: "" };
  }

  if (Array.isArray(raw.profiles)) {
    return {
      profiles: raw.profiles,
      activeProfileId: raw.activeProfileId || raw.profiles[0]?.id || ""
    };
  }

  // Backward compatibility for old single-settings structure.
  if (raw.baseUrl || raw.apiKey || raw.model || raw.provider) {
    const legacyId = "legacy_default";
    return {
      profiles: [
        {
          id: legacyId,
          name: `${raw.provider || DEFAULT_PROFILE.provider} | ${
            raw.model || DEFAULT_PROFILE.model
          }`,
          provider: raw.provider || DEFAULT_PROFILE.provider,
          apiKey: raw.apiKey || "",
          baseUrl: raw.baseUrl || DEFAULT_PROFILE.baseUrl,
          model: raw.model || DEFAULT_PROFILE.model,
          updatedAt: new Date().toISOString()
        }
      ],
      activeProfileId: legacyId
    };
  }

  return { profiles: [], activeProfileId: "" };
}

export async function saveCustomFields(fields) {
  await setToStorage({ [KEYS.customFields]: fields || {} });
}

export async function getCustomFields() {
  const data = await getFromStorage([KEYS.customFields]);
  return data[KEYS.customFields] || {};
}

export async function saveFieldHistory(domain, mappings) {
  const data = await getFromStorage([KEYS.fieldHistory]);
  const history = data[KEYS.fieldHistory] || {};
  history[domain] = {
    updatedAt: new Date().toISOString(),
    mappings
  };
  await setToStorage({ [KEYS.fieldHistory]: history });
}

export async function getFieldHistory(domain) {
  const data = await getFromStorage([KEYS.fieldHistory]);
  const history = data[KEYS.fieldHistory] || {};
  return history[domain] || null;
}
