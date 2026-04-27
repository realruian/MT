/**
 * 美团 Friday AI 网关客户端：图像编辑（gemini-3.1-flash-image-preview）
 *
 * 协议：异步任务 + 轮询
 *   1. POST /google/models/{model}:imageGenerate
 *      返回纯文本 task_id（可能带引号）
 *   2. GET  /google/models/{task_id}:imageGenerateQuery
 *      JSON: { status, data: { candidates: [{content: {parts: [...]}}] } }
 *      status === 1  → 完成
 *      status === -1 → 失败
 *      其他          → 还在跑
 *
 * 结果图三种返回格式：part.inline_data.data（base64 或 URL）/
 *                      part.file_data.file_uri（URL）/
 *                      part.image_url.url（URL）
 *
 * 翻译自同事 poster-text-editor/main.py 的核心逻辑（_submit_image_generate_parts +
 * poll_image_result），保留同款重试与超时策略。
 */

const FRIDAY_BASE_URL =
  process.env.FRIDAY_BASE_URL ?? "https://aigc.sankuai.com/v1";
const FRIDAY_APP_ID = process.env.FRIDAY_APP_ID;
const MODEL =
  process.env.FRIDAY_IMAGE_EDIT_MODEL ?? "gemini-3.1-flash-image-preview";

export interface FridayEditOptions {
  /** 输入图 base64（不带 data:URL 前缀） */
  imageBase64: string;
  /** image/png / image/jpeg / image/webp */
  mimeType: string;
  /** 编辑指令文字 */
  prompt: string;
  /** 提交任务的单次请求超时 ms，默认 120s */
  submitTimeoutMs?: number;
  /** 轮询总超时 ms，默认 300s（复杂图 2-3 分钟） */
  pollTimeoutMs?: number;
  /** 轮询间隔 ms，默认 5s（避免限流） */
  pollIntervalMs?: number;
}

export interface FridayEditResult {
  /** 结果图 base64（不带 data:URL 前缀） */
  imageBase64: string;
  /** 结果图 mime type */
  mimeType: string;
}

export class FridayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FridayError";
  }
}

function ensureKey(): string {
  if (!FRIDAY_APP_ID) {
    throw new FridayError("FRIDAY_APP_ID 未配置，请检查 .env.local");
  }
  return FRIDAY_APP_ID;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${ensureKey()}`,
    "Content-Type": "application/json",
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 提交图像编辑任务，返回 task_id。
 * 命中 Friday 上游"abnormal / try again"自动重试 3 次（间隔 5s）。
 */
export async function submitEditTask(opts: FridayEditOptions): Promise<string> {
  const url = `${FRIDAY_BASE_URL}/google/models/${MODEL}:imageGenerate`;
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: opts.prompt },
          {
            inline_data: { mime_type: opts.mimeType, data: opts.imageBase64 },
          },
        ],
      },
    ],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const submitTimeout = opts.submitTimeoutMs ?? 120_000;
  let lastErr = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body,
        signal: AbortSignal.timeout(submitTimeout),
      });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < 2) {
        await sleep(5000);
        continue;
      }
      throw new FridayError(`提交任务失败（网络错误）：${lastErr}`);
    }

    const text = await resp.text();
    if (resp.ok) {
      // Friday 返回纯文本 task_id，可能裹引号
      const taskId = text.trim().replace(/^"|"$/g, "");
      if (taskId) return taskId;
      lastErr = "返回为空";
    } else {
      lastErr = `${resp.status} ${text.slice(0, 200)}`;
    }

    // 上游临时异常 → 重试
    if (text.includes("abnormal") || text.includes("try again")) {
      if (attempt < 2) {
        await sleep(5000);
        continue;
      }
    }
    throw new FridayError(`提交任务失败：${lastErr}`);
  }
  throw new FridayError(`提交任务失败（已重试 3 次）：${lastErr}`);
}

interface FridayQueryResponse {
  status?: number;
  data?: {
    candidates?: Array<{
      content?: { parts?: Array<Record<string, unknown>> };
    }>;
    [k: string]: unknown;
  };
}

/** 轮询任务结果，提取生成图。最多等 pollTimeoutMs。 */
export async function pollResult(
  taskId: string,
  opts: { pollTimeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<FridayEditResult> {
  const url = `${FRIDAY_BASE_URL}/google/models/${taskId}:imageGenerateQuery`;
  const totalTimeout = opts.pollTimeoutMs ?? 300_000;
  const interval = opts.pollIntervalMs ?? 5000;
  const start = Date.now();

  while (Date.now() - start < totalTimeout) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "GET",
        headers: authHeaders(),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      await sleep(interval);
      continue;
    }
    if (!resp.ok) {
      await sleep(interval);
      continue;
    }

    const result = (await resp.json()) as FridayQueryResponse;

    if (result.status === 1) {
      const parts = result.data?.candidates?.[0]?.content?.parts ?? [];
      const found = await extractImageFromParts(parts);
      if (found) return found;
      throw new FridayError("任务成功但未找到图片数据");
    }
    if (result.status === -1) {
      throw new FridayError(
        `图像生成失败：${JSON.stringify(result.data ?? null)}`,
      );
    }
    await sleep(interval);
  }
  throw new FridayError(
    `图像生成超时（超过 ${Math.round(totalTimeout / 1000)}s）`,
  );
}

/** 从轮询返回的 parts 数组里抽出图片，兼容三种格式。 */
async function extractImageFromParts(
  parts: Array<Record<string, unknown>>,
): Promise<FridayEditResult | null> {
  for (const part of parts) {
    const inline = (part.inline_data ?? part.inlineData) as
      | { mime_type?: string; mimeType?: string; data?: string }
      | undefined;
    if (inline?.data) {
      const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
      const data = inline.data;
      // Friday 偶尔在 inline_data.data 里直接塞 URL（非 base64）
      if (data.startsWith("http")) {
        return await fetchUrlAsBase64(data, mime);
      }
      return { imageBase64: data, mimeType: mime };
    }

    const fileData = (part.file_data ?? part.fileData) as
      | {
          file_uri?: string;
          fileUri?: string;
          mime_type?: string;
          mimeType?: string;
        }
      | undefined;
    if (fileData) {
      const fileUrl = fileData.file_uri ?? fileData.fileUri;
      if (fileUrl) {
        return await fetchUrlAsBase64(
          fileUrl,
          fileData.mime_type ?? fileData.mimeType ?? "image/png",
        );
      }
    }

    const imageUrl = (part.image_url ?? part.imageUrl) as
      | { url?: string }
      | undefined;
    if (imageUrl?.url) {
      return await fetchUrlAsBase64(imageUrl.url, "image/png");
    }
  }
  return null;
}

async function fetchUrlAsBase64(
  url: string,
  fallbackMime: string,
): Promise<FridayEditResult> {
  const resp = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) throw new FridayError(`下载结果图失败：${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get("content-type") ?? fallbackMime;
  return { imageBase64: buf.toString("base64"), mimeType: mime };
}

/**
 * 一站式：提交 + 轮询。失败抛 `FridayError`。
 *
 * 用法：
 *   const result = await editImage({
 *     imageBase64: "iVBORw0KGgo...",
 *     mimeType: "image/png",
 *     prompt: "把背景换成纯白",
 *   });
 *   // result.imageBase64 是新图 base64
 */
export async function editImage(
  opts: FridayEditOptions,
): Promise<FridayEditResult> {
  const taskId = await submitEditTask(opts);
  return await pollResult(taskId, opts);
}
