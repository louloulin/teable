/**
 * Round-24: Sample Script Library for run_script automation actions.
 *
 * Cloud ships 12+ ready-to-use JS examples (Cloud §Sample Scripts). We ship
 * 12 minimal-but-useful samples covering the common automation patterns:
 *   - math / string / date transforms
 *   - record field lookups + branching
 *   - HTTP fan-out + error wrapping
 *   - webhook payload normalization
 *
 * Each sample includes an English (`name`) and Chinese (`nameZh`) name +
 * bilingual description so the library serves both locales — this single
 * artifact upgrades the `script_samples` and `ai_script_zh` cloudGap
 * entries in one round.
 *
 * The samples are pure JS strings that get passed to Node's vm module
 * with `{input, env, result}` sandbox shape (see automation-event.listener.ts
 * executeRunScript).
 */

export interface IScriptSample {
  id: string;
  category: 'transform' | 'lookup' | 'http' | 'webhook' | 'branch';
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  script: string;
  inputs: Array<{ key: string; type: string; description: string; descriptionZh: string }>;
}

export const SCRIPT_SAMPLES: ReadonlyArray<IScriptSample> = [
  // ---------- transform ----------
  {
    id: 'sum-array',
    category: 'transform',
    name: 'Sum numeric array',
    nameZh: '数字数组求和',
    description: 'Reduce an array of numbers into a total. Useful for amount / quantity columns.',
    descriptionZh: '把数字数组归约成总和。适合金额 / 数量列。',
    script: 'return (input.values || []).reduce((acc, n) => acc + Number(n || 0), 0);',
    inputs: [{ key: 'values', type: 'array<number>', description: 'Array of numbers to sum', descriptionZh: '要求和的数字数组' }],
  },
  {
    id: 'uppercase-name',
    category: 'transform',
    name: 'Uppercase first record name',
    nameZh: '大写首条记录名称',
    description: 'Take the first record\'s name field and uppercase it.',
    descriptionZh: '把第一条记录的 name 字段转为大写。',
    script: 'return (input.records?.[0]?.name || "").toUpperCase();',
    inputs: [{ key: 'records', type: 'array<record>', description: 'Record list with .name field', descriptionZh: '带 .name 字段的记录列表' }],
  },
  {
    id: 'format-date',
    category: 'transform',
    name: 'Format ISO date to YYYY-MM-DD',
    nameZh: '格式化 ISO 日期为 YYYY-MM-DD',
    description: 'Convert an ISO timestamp into a human-friendly date string.',
    descriptionZh: '把 ISO 时间戳转换为人类友好的日期字符串。',
    script: 'const d = new Date(input.iso); if (isNaN(d.getTime())) return null; return d.toISOString().slice(0, 10);',
    inputs: [{ key: 'iso', type: 'string', description: 'ISO 8601 date string', descriptionZh: 'ISO 8601 日期字符串' }],
  },

  // ---------- lookup ----------
  {
    id: 'find-by-id',
    category: 'lookup',
    name: 'Find record by id',
    nameZh: '按 id 查找记录',
    description: 'Locate a record in an array by its id field.',
    descriptionZh: '在数组中按 id 字段定位记录。',
    script: 'return (input.records || []).find(r => r.id === input.targetId) || null;',
    inputs: [
      { key: 'records', type: 'array<record>', description: 'Array of records', descriptionZh: '记录数组' },
      { key: 'targetId', type: 'string', description: 'The id to search for', descriptionZh: '要搜索的 id' },
    ],
  },
  {
    id: 'filter-by-status',
    category: 'lookup',
    name: 'Filter records by status',
    nameZh: '按状态过滤记录',
    description: 'Return only records whose status matches the given value.',
    descriptionZh: '仅返回 status 字段匹配指定值的记录。',
    script: 'return (input.records || []).filter(r => r.status === input.status);',
    inputs: [
      { key: 'records', type: 'array<record>', description: 'Array of records with .status', descriptionZh: '含 .status 字段的记录数组' },
      { key: 'status', type: 'string', description: 'Status value to match', descriptionZh: '要匹配的状态值' },
    ],
  },

  // ---------- branch ----------
  {
    id: 'greet-by-hour',
    category: 'branch',
    name: 'Greet based on hour of day',
    nameZh: '根据小时返回问候语',
    description: 'Return morning/afternoon/evening greeting based on the local hour.',
    descriptionZh: '根据本地小时返回早上 / 下午 / 晚上问候语。',
    script: 'const h = new Date(input.iso || Date.now()).getHours(); if (h < 12) return "morning"; if (h < 18) return "afternoon"; return "evening";',
    inputs: [{ key: 'iso', type: 'string?', description: 'Optional ISO timestamp; defaults to now', descriptionZh: '可选 ISO 时间戳,默认为当前时间' }],
  },

  // ---------- http ----------
  {
    id: 'http-fanout',
    category: 'http',
    name: 'HTTP POST fan-out',
    nameZh: 'HTTP POST 扇出',
    description: 'POST the trigger payload to a list of webhook URLs. Returns array of status codes.',
    descriptionZh: '把触发 payload POST 到一组 webhook URL。返回状态码数组。',
    script: 'if (!Array.isArray(input.webhookUrls)) return []; const out = []; for (const u of input.webhookUrls) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input.payload || {}) }); out.push(r.status); } catch (e) { out.push(0); } } return out;',
    inputs: [
      { key: 'webhookUrls', type: 'array<string>', description: 'URLs to POST to', descriptionZh: '要 POST 的 URL 列表' },
      { key: 'payload', type: 'object?', description: 'Optional JSON payload', descriptionZh: '可选 JSON payload' },
    ],
  },
  {
    id: 'retry-wrapper',
    category: 'http',
    name: 'Retry wrapper (max 3)',
    nameZh: '重试包装(最多 3 次)',
    description: 'Retry an async operation up to 3 times with linear back-off.',
    descriptionZh: '对异步操作最多重试 3 次,采用线性退避。',
    script: 'let last = null; for (let i = 0; i < 3; i++) { try { return await input.fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 100 * (i + 1))); } } throw last;',
    inputs: [{ key: 'fn', type: 'function', description: 'Async function to retry', descriptionZh: '要重试的异步函数' }],
  },

  // ---------- webhook ----------
  {
    id: 'webhook-flatten',
    category: 'webhook',
    name: 'Flatten webhook payload',
    nameZh: '扁平化 webhook payload',
    description: 'Flatten nested objects in a webhook payload into dotted keys.',
    descriptionZh: '把 webhook payload 中的嵌套对象扁平化为点号 key。',
    script: 'function flat(o, p="", out={}) { if (o === null || o === undefined) { out[p] = o; return out; } if (typeof o !== "object" || Array.isArray(o)) { out[p] = o; return out; } for (const [k,v] of Object.entries(o)) flat(v, p ? p+"."+k : k, out); return out; } return flat(input.payload || {});',
    inputs: [{ key: 'payload', type: 'object', description: 'Nested webhook payload', descriptionZh: '嵌套 webhook payload' }],
  },
  {
    id: 'webhook-signature-verify',
    category: 'webhook',
    name: 'HMAC SHA-256 signature verify',
    nameZh: 'HMAC SHA-256 签名验证',
    description: 'Verify an incoming webhook signature using the per-install secret.',
    descriptionZh: '使用每个 install 的 secret 验证 webhook 签名。',
    script: 'const crypto = require("node:crypto"); const body = JSON.stringify(input.payload || {}); const sig = crypto.createHmac("sha256", input.secret || "").update(body).digest("hex"); return { expected: sig, received: input.receivedHeader || null, ok: sig === (input.receivedHeader || null) };',
    inputs: [
      { key: 'payload', type: 'object', description: 'Webhook payload', descriptionZh: 'webhook payload' },
      { key: 'secret', type: 'string', description: 'Per-install secret', descriptionZh: '每个 install 的 secret' },
      { key: 'receivedHeader', type: 'string', description: 'X-Signature header value', descriptionZh: 'X-Signature 头值' },
    ],
  },

  // ---------- meta ----------
  {
    id: 'hello-world',
    category: 'transform',
    name: 'Hello, run_script',
    nameZh: 'Hello, run_script',
    description: 'Minimal hello-world script. Returns a constant.',
    descriptionZh: '最小 hello-world 脚本。返回一个常量。',
    script: 'return "hello from run_script";',
    inputs: [],
  },
  {
    id: 'echo-input',
    category: 'transform',
    name: 'Echo input',
    nameZh: '回显输入',
    description: 'Return the input object verbatim — useful for debugging.',
    descriptionZh: '原样返回 input 对象 —— 调试时有用。',
    script: 'return input;',
    inputs: [],
  },
];

export function listScriptSamples(opts?: { category?: string; locale?: 'en' | 'zh' }): Array<Omit<IScriptSample, 'script' | 'inputs'> & { script: string; inputs: IScriptSample['inputs']; name: string; description: string }> {
  const locale = opts?.locale ?? 'en';
  return SCRIPT_SAMPLES.filter(s => !opts?.category || s.category === opts.category).map(s => ({
    id: s.id,
    category: s.category,
    name: locale === 'zh' ? s.nameZh : s.name,
    nameZh: s.nameZh,
    description: locale === 'zh' ? s.descriptionZh : s.description,
    descriptionZh: s.descriptionZh,
    script: s.script,
    inputs: s.inputs.map(i => ({
      key: i.key,
      type: i.type,
      description: locale === 'zh' ? i.descriptionZh : i.description,
      descriptionZh: i.descriptionZh,
    })),
  }));
}
