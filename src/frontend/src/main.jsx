import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { api, mailboxRequest, retry } from "./api.js";
import {
  currentMailbox,
  setMailbox,
  readCache,
  writeCache,
  subscribe,
} from "./cache.js";
import Icon from "./Icon.jsx";
import "./style.css";

const Turnstile = lazy(() =>
  import("@marsidev/react-turnstile").then((m) => ({ default: m.Turnstile })),
);
const MailPage = lazy(() => import("./MailPage.jsx"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry, refetchOnWindowFocus: false, gcTime: 300000 },
  },
});
subscribe(() => {
  void queryClient.cancelQueries({
    predicate: (q) => q.queryKey[0] !== "config",
  });
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "config" });
});
// Stable snapshots are needed for useSyncExternalStore; mailbox state changes via subscription.
export function useMailbox() {
  const [box, update] = useState(currentMailbox);
  useEffect(() => subscribe(() => update(currentMailbox())), []);
  useEffect(() => {
    if (!box) return;
    const timer = setTimeout(
      () => setMailbox(null),
      Math.min(box.expiresAt - Date.now(), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [box]);
  return box;
}
export function CopyButton({ value, children, className = "button subtle" }) {
  const [copied, setCopied] = useState(false),
    timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      title={copied ? "已复制" : "复制"}
    >
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "已复制" : children}
    </button>
  );
}
export function Challenge({ config, onToken, reference }) {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 380px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 380px)");
    const update = () => {
      setCompact(media.matches);
      onToken("");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [onToken]);
  if (!config?.turnstile.enabled)
    return (
      <span className="verification">
        <Icon name="shield" size={15} /> 安全连接
      </span>
    );
  if (!config.turnstile.configured)
    return <span className="warning">人机验证待管理员配置</span>;
  return (
    <Suspense fallback={<span className="muted">正在加载验证…</span>}>
      <Turnstile
        ref={reference}
        siteKey={config.turnstile.siteKey}
        onSuccess={onToken}
        onExpire={() => onToken("")}
        onError={() => onToken("")}
        options={{
          theme: "light",
          size: compact ? "compact" : "flexible",
          action: "tmail_access",
        }}
      />
    </Suspense>
  );
}
export function Notice({ children }) {
  return children ? (
    <div className="notice" role="status">
      {children}
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="loading">
      <span className="spinner" /> 正在加载…
    </div>
  );
}

function Inbox({ config }) {
  const box = useMailbox(),
    challenge = useRef();
  const [domain, setDomain] = useState(""),
    [password, setPassword] = useState("");
  const selectedDomain = config.emailDomains.includes(domain)
    ? domain
    : (config.emailDomains[0] ?? "");
  const [token, setToken] = useState(""),
    [restore, setRestore] = useState(false),
    [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now()),
    [visible, setVisible] = useState(!document.hidden);
  const [search, setSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    setOffset(0);
    setSearch("");
    setShowPassword(false);
  }, [box?.id]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    const listener = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", listener);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", listener);
    };
  }, []);
  const cached = box ? readCache(box.id, `list:${offset}`) : undefined;
  const query = useQuery({
    queryKey: ["messages", box?.id, offset],
    enabled: Boolean(box),
    queryFn: ({ signal }) =>
      mailboxRequest(
        box,
        `list:${offset}`,
        `/api/mailboxes/${box.id}/messages?offset=${offset}`,
        signal,
      ),
    initialData: cached?.data,
    initialDataUpdatedAt: cached ? Date.now() - 10000 : undefined,
    staleTime: 10000,
    refetchInterval: (q) =>
      !visible || !box
        ? false
        : Math.min(120000, 20000 * 2 ** Math.min(q.state.fetchFailureCount, 3)),
    refetchIntervalInBackground: false,
  });
  const mailboxPassword = box
    ? (query.data?.password ?? box.password ?? null)
    : null;
  useEffect(() => {
    if (query.error?.status === 401 || query.error?.status === 404) {
      setMailbox(null);
      setNotice("邮箱已过期，请重新创建或输入有效邮箱密码。");
    }
  }, [query.error]);

  async function changeMailbox(recover = false) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api(
        recover ? "/api/mailboxes/restore" : "/api/mailboxes",
        {
          method: "POST",
          body: JSON.stringify(
            recover
              ? { password: recovery.trim(), turnstileToken: token }
              : {
                  domain: selectedDomain,
                  password,
                  turnstileToken: token,
                  replaceId: box?.id,
                },
          ),
        },
      );
      setMailbox(result.data);
      setRestore(false);
      setRecovery("");
      setPassword("");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
      setToken("");
      challenge.current?.reset();
    }
  }
  const remaining = box
    ? Math.max(0, Math.floor((box.expiresAt - tick) / 1000))
    : 0;
  const remainingText = `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`;
  const messages = (query.data?.messages ?? []).filter((m) =>
    `${m.subject} ${m.envelope_from}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const disabled = busy || !config || (config.turnstile.enabled && !token);

  return (
    <>
      <section className="controls panel" aria-label="邮箱操作">
        <div className="panel-top">
          <span className="section-label">
            <Icon name="mail" size={16} /> 临时邮箱
          </span>
          {box && (
            <span className="expiry">
              <Icon name="clock" size={14} />
              {remainingText} 后到期
            </span>
          )}
        </div>
        <div className="controls-layout">
          <div className="controls-main">
            <div className="address-line">
              <div className={`address ${box ? "" : "placeholder"}`}>
                {box ? box.address.split(/(?<=[._-])/).map((part, index) => (
                  <React.Fragment key={index}>{part}<wbr /></React.Fragment>
                )) : "创建收件地址"}
              </div>
              {box && <CopyButton value={box.address}>复制地址</CopyButton>}
            </div>
            <div className="control-row">
              <div className="control-actions">
                <label className="select-wrap">
                  <Icon name="mail" size={15} />
                  <select
                    aria-label="邮箱域名"
                    value={selectedDomain}
                    onChange={(e) => setDomain(e.target.value)}
                  >
                    {config?.emailDomains.map((d) => (
                      <option key={d} value={d}>
                        @{d}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={disabled}
                  onClick={() => changeMailbox()}
                >
                  <Icon
                    name={busy ? "refresh" : "plus"}
                    className={busy ? "spin" : ""}
                  />
                  {busy ? "处理中…" : box ? "重新创建" : "创建邮箱"}
                </button>
                <button
                  className={`button subtle ${restore ? "active" : ""}`}
                  onClick={() => setRestore(!restore)}
                >
                  <Icon name="key" /> 恢复邮箱
                </button>
                {box && (
                  <button
                    className={`button subtle ${showPassword ? "active" : ""}`}
                    disabled={!mailboxPassword}
                    onClick={() => setShowPassword(!showPassword)}
                    title={mailboxPassword ? "查看并保存恢复密码" : "收到首封邮件后生成密码"}
                  >
                    <Icon name="lock" /> 查看密码
                  </button>
                )}
              </div>
            </div>
            {showPassword && mailboxPassword && (
              <div className="password-row" role="status">
                <span>邮箱密码</span>
                <code>{mailboxPassword}</code>
                <CopyButton value={mailboxPassword}>复制密码</CopyButton>
              </div>
            )}
            {restore && (
              <form
                className="restore-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void changeMailbox(true);
                }}
              >
                <input
                  aria-label="邮箱密码"
                  type="password"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  placeholder="粘贴首封邮件生成的邮箱密码"
                  autoComplete="off"
                  maxLength={22}
                />
                <button className="button primary" disabled={disabled || !recovery}>
                  恢复邮箱 <Icon name="arrow" size={16} />
                </button>
              </form>
            )}
            {restore && (
              <p className="password-help">
                收到首封邮件后可查看并保存密码，用于有效期内恢复邮箱。
              </p>
            )}
            {config?.passwordRequired && (
              <label className="site-password">
                <Icon name="lock" size={14} />
                <input
                  type="password"
                  autoComplete="current-password"
                  aria-label="站点密码"
                  placeholder="站点访问密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="challenge">
            <Challenge
              config={config}
              onToken={setToken}
              reference={challenge}
            />
          </div>
        </div>
        <Notice>{notice}</Notice>
      </section>
      <section className="inbox panel" aria-label="收件箱">
        <div className="inbox-heading">
          <div>
            <span className="section-label">
              <Icon name="inbox" /> 收件箱{" "}
              <span className="count">{query.data?.messages.length ?? 0}</span>
            </span>
          </div>
          <div className="inbox-tools">
            {box && (
              <input
                className="search"
                placeholder="搜索本页邮件"
                aria-label="搜索邮件"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            <button
              className="button subtle"
              disabled={!box || query.isFetching}
              onClick={() => void query.refetch()}
            >
              <Icon name="refresh" className={query.isFetching ? "spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
        </div>
        <div className="list-labels">
          <span>发件人 / 主题</span>
          <span>接收时间</span>
        </div>
        <Notice>{query.error?.message}</Notice>
        {query.isPending && box ? (
          <Loading />
        ) : messages.length ? (
          <div className="mail-list">
            {messages.map((message) => (
              <div className="mail-row" key={message.id}>
                <a
                  className="mail-link"
                  href={`/mail/${box.id}/${message.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="avatar">
                    {message.envelope_from[0]?.toUpperCase()}
                  </span>
                  <div className="mail-summary">
                    <strong>{message.subject || "（无主题）"}</strong>
                    <span>
                      {message.envelope_from}
                      <span className="preview"> · {message.preview}</span>
                    </span>
                  </div>
                  <time>
                    {new Date(message.received_at).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  <Icon name="external" size={15} />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-art">
              <Icon name="inbox" size={36} />
              <span className="empty-spark">✦</span>
            </div>
            <h2>{search ? "没有匹配的邮件" : "收件箱里，暂时很安静"}</h2>
            <p>
              {box
                ? "把上方的地址留给需要的地方，来信会自动出现在这里。"
                : "在上方创建一个邮箱，即可开始接收邮件。"}
            </p>
            <span className="empty-status">
              <span className="status-dot" />
              {box ? "等待新邮件" : "等待创建邮箱"}
            </span>
          </div>
        )}
        <div className="inbox-footer">
          <span>
            <span className="status-dot" />
            {query.isFetching
              ? "正在同步…"
              : box
                ? "自动同步已开启"
                : "创建后自动同步"}
          </span>
          <div>
            {offset > 0 && (
              <button
                className="text-button"
                onClick={() => setOffset(Math.max(0, offset - 30))}
              >
                上一页
              </button>
            )}
            {query.data?.hasMore && (
              <button
                className="text-button"
                onClick={() => setOffset(offset + 30)}
              >
                下一页
              </button>
            )}
          </div>
          <span>
            {query.dataUpdatedAt
              ? `更新于 ${new Date(query.dataUpdatedAt).toLocaleTimeString("zh-CN")}`
              : ""}
          </span>
        </div>
      </section>
      <div className="benefits">

      </div>
    </>
  );
}

function App() {
  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: async ({ signal }) => {
      const result = await api("/api/config", { signal });
      writeCache("site", "config", result.data, 300000);
      return result.data;
    },
    initialData: readCache("site", "config"),
    initialDataUpdatedAt: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 300000,
  });
  const config = configQuery.data,
    path = window.location.pathname;
  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="/">
          <span>
            {config?.name ?? "Tmail"}<span className="brand-period">.</span>
          </span>
        </a>
        <nav>
          <a href={config?.github} target="_blank" rel="noreferrer">
            <Icon name="github" size={17} />
            <span>GitHub</span>
            <Icon name="external" size={12} />
          </a>
        </nav>
      </header>
      <main>
        <Notice>{configQuery.error?.message}</Notice>
        <Suspense fallback={<Loading />}>
          {config && !config.features?.temporaryMail ? (
            <div className="loading">临时邮箱功能未启用</div>
          ) : path.startsWith("/mail/") ? (
            <MailPage />
          ) : config ? (
            <Inbox config={config} />
          ) : configQuery.isError ? (
            <div className="loading">
              <button className="button" onClick={() => configQuery.refetch()}>
                重新加载
              </button>
            </div>
          ) : (
            <Loading />
          )}
        </Suspense>
      </main>
      <footer className="footer">
        <span>
          © {new Date().getFullYear()} {config?.name ?? "Tmail"}
        </span>
        <div>
          <a href={config?.github} target="_blank" rel="noreferrer">
            GitHub <Icon name="external" size={12} />
          </a>
        </div>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
