import { currentMailbox, generation, readCache, writeCache } from "./cache.js";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export async function api(path, { signal, mailbox, ...options } = {}) {
  const headers = { ...options.headers };
  if (options.body) headers["Content-Type"] = "application/json";
  if (mailbox) headers["X-Mailbox-Token"] = mailbox.token;
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (response.status === 304) return { notModified: true };
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "后端接口未返回有效数据，请确认开发服务已启动后重试",
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok)
    throw new ApiError(
      data?.error?.message || "请求失败，请重试",
      response.status,
    );
  return { data, etag: response.headers.get("ETag") };
}
export async function mailboxRequest(box, key, path, signal, ttl = 30000) {
  const start = generation();
  const previous = readCache(box.id, key);
  const response = await api(path, {
    signal,
    mailbox: box,
    headers: previous?.etag ? { "If-None-Match": previous.etag } : {},
  });
  if (start !== generation() || currentMailbox()?.id !== box.id)
    throw new DOMException("Mailbox changed", "AbortError");
  const result = response.notModified
    ? previous
    : { data: response.data, etag: response.etag };
  if (!result) throw new Error("缓存已过期，请重试");
  writeCache(box.id, key, result, ttl, box.expiresAt);
  return result.data;
}
export function retry(count, error) {
  return (
    error.status !== 401 &&
    error.status !== 403 &&
    error.status !== 404 &&
    error.status !== 429 &&
    count < 1
  );
}
