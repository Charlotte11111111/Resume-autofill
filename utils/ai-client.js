import { getApiSettings } from "./storage.js";
import { resumeSchema } from "./resume-schema.js";

function extractJsonBlock(text) {
  if (!text) return "{}";
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const raw = text.match(/\{[\s\S]*\}/);
  return raw ? raw[0] : "{}";
}

function truncateText(value, maxLen = 260) {
  const text = String(value ?? "");
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function compactPageFields(pageFields) {
  return (pageFields || []).map((f) => ({
    fieldId: f.fieldId,
    label: truncateText(f.label, 120),
    type: f.type || "",
    name: f.name || "",
    id: f.id || "",
    placeholder: truncateText(f.placeholder || "", 80)
  }));
}

function compactResumeData(resumeData) {
  const basic = resumeData?.basicInfo || {};
  const toItem = (item) => ({
    ...item,
    description: truncateText(item?.description || "", 260)
  });
  const custom = resumeData?.customFields || {};
  const compactCustom = {};
  Object.entries(custom)
    .slice(0, 60)
    .forEach(([k, v]) => {
      compactCustom[truncateText(k, 80)] = truncateText(v, 120);
    });

  return {
    basicInfo: {
      fullName: truncateText(basic.fullName, 60),
      email: truncateText(basic.email, 80),
      phone: truncateText(basic.phone, 40),
      address: truncateText(basic.address, 80),
      city: truncateText(basic.city, 40),
      country: truncateText(basic.country, 40),
      linkedIn: truncateText(basic.linkedIn, 120),
      website: truncateText(basic.website, 120),
      github: truncateText(basic.github, 120)
    },
    education: (resumeData?.education || []).slice(0, 8).map(toItem),
    workExperience: (resumeData?.workExperience || []).slice(0, 8).map(toItem),
    skills: (resumeData?.skills || []).slice(0, 30).map((x) => truncateText(x, 60)),
    projects: (resumeData?.projects || []).slice(0, 6).map((p) => ({
      name: truncateText(p?.name || "", 80),
      role: truncateText(p?.role || "", 80),
      description: truncateText(p?.description || "", 220)
    })),
    customFields: compactCustom
  };
}

async function aiChat(messages, temperature = 0.1) {
  const settings = await getApiSettings();
  if (!settings.apiKey) {
    throw new Error("未配置 API Key，请先在 Popup 中保存。");
  }

  const baseUrl = (settings.baseUrl || "").replace(/\/+$/, "");
  const provider = settings.provider || "openai";

  // MiniMax 使用特殊的 endpoint
  const endpoint = provider === "minimax"
    ? `${baseUrl}/v1/text/chatcompletion_v2`
    : `${baseUrl}/chat/completions`;

  const body = {
    model: settings.model || "gpt-4o-mini",
    messages,
    temperature
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI API 调用失败 (${res.status}): ${txt.slice(0, 300)}`);
  }

  const data = await res.json();

  // 调试：打印完整响应到控制台
  console.log("MiniMax 完整响应:", JSON.stringify(data, null, 2));

  // 尝试多种返回格式
  // MiniMax 可能格式: { choices: [{ messages: [{ content }] }] }
  // 或格式: { choices: [{ message: { content } }] }
  // 或格式: { output: "..." }

  let content = "";

  // 尝试 MiniMax 格式
  if (data?.choices?.[0]?.messages?.[0]?.content) {
    content = data.choices[0].messages[0].content;
  }
  // 尝试 OpenAI 格式
  else if (data?.choices?.[0]?.message?.content) {
    content = data.choices[0].message.content;
  }
  // 尝试直接 output 字段
  else if (data?.output) {
    content = data.output;
  }
  // 尝试 base_resp 中的消息
  else if (data?.base_resp?.status_msg) {
    throw new Error(`MiniMax API 错误: ${data.base_resp.status_msg}`);
  }

  return content;
}

export async function parseResume(rawText) {
  const prompt = [
    {
      role: "system",
      content:
        "你是简历解析专家。请严格返回 JSON，不要输出额外解释。未知字段留空。"
    },
    {
      role: "user",
      content: `请按以下 Schema 解析简历文本。\nSchema: ${JSON.stringify(resumeSchema)}\n\n简历原文:\n${rawText}`
    }
  ];
  const content = await aiChat(prompt, 0);

  // 调试：打印 AI 返回的内容
  console.log("MiniMax AI 返回内容:", content);

  if (!content || !content.trim()) {
    throw new Error("AI 返回内容为空，请重试。");
  }

  const extracted = extractJsonBlock(content);
  console.log("提取的 JSON:", extracted);

  try {
    return JSON.parse(extracted);
  } catch (e) {
    console.error("JSON 解析失败:", e);
    throw new Error(`AI 返回的 JSON 格式错误: ${e.message}\n内容: ${extracted.slice(0, 200)}`);
  }
}

export async function matchFields(pageFields, resumeData) {
  const compactFields = compactPageFields(pageFields);
  const compactResume = compactResumeData(resumeData);
  const prompt = [
    {
      role: "system",
      content:
        "你是表单字段匹配助手。请返回 JSON 映射：fieldId -> {value, confidence, source, status}。status 仅可为 matched 或 unknown。优先短而准确。"
    },
    {
      role: "user",
      content: `表单字段: ${JSON.stringify(compactFields)}\n\n简历数据: ${JSON.stringify(
        compactResume
      )}\n\n请返回 JSON。`
    }
  ];
  const content = await aiChat(prompt, 0);
  return JSON.parse(extractJsonBlock(content));
}

export async function classifyNewField(fieldLabel, fieldValue) {
  const prompt = [
    {
      role: "system",
      content:
        "你是字段归类助手。把字段归入一个简历键路径，返回 JSON: {key, reason}。key 例如 customFields.favoriteTool。"
    },
    {
      role: "user",
      content: `字段名: ${fieldLabel}\n字段值: ${fieldValue}\n请返回 JSON。`
    }
  ];
  const content = await aiChat(prompt, 0);
  return JSON.parse(extractJsonBlock(content));
}
