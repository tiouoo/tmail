import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { CopyButton, Notice } from "./main.jsx";
import Icon from "./Icon.jsx";

const endpoint = "/api/domains";
const deliveryLabels = { cloudflare: "Cloudflare 直收", webhook: "外部 Webhook" };

function domainRequest(credential, path = "", method = "GET", body) {
  return api(endpoint + path, {
    method,
    headers: { Authorization: `Bearer ${credential}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function PasswordDialog({ busy, notice, onUnlock }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="panel domains-dialog"
      aria-labelledby="domains-dialog-title"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="domains-dialog-title"><Icon name="lock" /> 管理员验证</h2>
      <form method="post" onSubmit={(event) => {
        event.preventDefault();
        void onUnlock(new FormData(event.currentTarget).get("password"));
      }}>
        <label className="domains-field">
          管理员密码
          <input name="password" type="password" autoComplete="current-password" autoFocus required />
        </label>
        <Notice>{notice}</Notice>
        <div className="domains-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "正在验证…" : "验证密码"}
          </button>
          <a href="/" className="button subtle">返回首页</a>
        </div>
      </form>
    </dialog>
  );
}

export default function DomainsPage({ siteName }) {
  const [credential, setCredential] = useState("");
  const [domains, setDomains] = useState([]);
  const [issuedKey, setIssuedKey] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.title = `域名管理 · ${siteName}`;
  }, [siteName]);

  function lock() {
    setCredential("");
    setDomains([]);
    setIssuedKey(null);
    setConfirmation(null);
    setNotice("");
  }

  async function unlock(password) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const encoded = btoa(Array.from(new TextEncoder().encode(password), (byte) =>
        String.fromCharCode(byte)).join(""));
      const { data } = await domainRequest(encoded);
      setDomains(data.domains);
      setCredential(encoded);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(path, method, body) {
    if (busy) return false;
    setBusy(true);
    setNotice("");
    try {
      const { data } = await domainRequest(credential, path, method, body);
      if (method === "DELETE") {
        setDomains((list) => list.filter(({ domain }) => domain !== data.domain));
        setIssuedKey((current) => current?.domain === data.domain ? null : current);
      } else {
        setDomains((list) => [...list.filter(({ domain }) => domain !== data.domain.domain), data.domain]
          .sort((a, b) => a.domain.localeCompare(b.domain)));
        if (data.key) setIssuedKey({ domain: data.domain.domain, key: data.key });
      }
      setConfirmation(null);
      return true;
    } catch (error) {
      if (error.status === 401) lock();
      setNotice(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addDomain(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const { domain, delivery } = Object.fromEntries(new FormData(form));
    if (await save("", "POST", { domain, delivery })) form.reset();
  }

  const deleting = confirmation?.action === "delete";
  return (
    <section className="panel domains-panel" aria-labelledby="domains-title">
      <div className="panel-top">
        <h1 className="section-label" id="domains-title"><Icon name="mail" size={16} /> 域名管理</h1>
        {credential && <button className="button subtle" disabled={busy} onClick={lock}>锁定</button>}
      </div>
      {credential ? (
        <>
          <form className="domains-form" onSubmit={addDomain}>
            <label className="domains-field">
              域名
              <input name="domain" placeholder="inbox.example.com" maxLength={253} autoComplete="off" required />
            </label>
            <label className="domains-field">
              投递方式
              <select className="select-wrap" name="delivery">
                {Object.entries(deliveryLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={busy}>
              <Icon name="plus" /> 添加域名
            </button>
          </form>
          <Notice>{notice}</Notice>
          {issuedKey && (
            <div className="domains-key" role="status">
              <strong>{issuedKey.domain} 的投递密钥</strong>
              <p>请现在复制并保存为投递端的 TMAIL_KEY。</p>
              <code>{issuedKey.key}</code>
              <div className="domains-actions">
                <CopyButton value={issuedKey.key}>复制密钥</CopyButton>
                <button className="button subtle" onClick={() => setIssuedKey(null)}>关闭</button>
              </div>
            </div>
          )}
          {domains.length ? (
            <ul className="domains-list" aria-label="已添加域名">
              {domains.map(({ domain, delivery, enabled }) => (
                <li className="domains-row" key={domain}>
                  <div className="domains-summary">
                    <strong>{domain}</strong>
                    <span>{deliveryLabels[delivery]} · {enabled ? "已启用" : "已停用"}</span>
                  </div>
                  {confirmation?.domain === domain ? (
                    <div className="domains-actions">
                      <span>{deleting ? "删除后将停止建箱和收信" : "旧密钥将立即失效"}</span>
                      <button className="button primary" disabled={busy}
                        onClick={() => {
                          if (deleting) void save(`/${domain}`, "DELETE");
                          else void save(`/${domain}/rotate-key`, "POST");
                        }}>
                        {deleting ? "确认删除" : "确认轮换"}
                      </button>
                      <button className="button subtle" disabled={busy} onClick={() => setConfirmation(null)}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="domains-actions">
                      <button className="button subtle" disabled={busy}
                        onClick={() => void save(`/${domain}`, "PATCH", { enabled: !enabled })}>
                        {enabled ? "停用" : "启用"}
                      </button>
                      {delivery === "webhook" && (
                        <button className="button subtle" disabled={busy}
                          onClick={() => setConfirmation({ domain, action: "rotate" })}>
                          轮换密钥
                        </button>
                      )}
                      <button className="button subtle" disabled={busy}
                        onClick={() => setConfirmation({ domain, action: "delete" })}>
                        删除
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="domains-empty">暂无域名</p>}
        </>
      ) : <PasswordDialog busy={busy} notice={notice} onUnlock={unlock} />}
    </section>
  );
}
