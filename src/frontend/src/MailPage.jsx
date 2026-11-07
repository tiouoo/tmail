import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { htmlDocument } from './message-document.js';
import { useMailbox, CopyButton, Notice } from "./main.jsx";
import { mailboxRequest } from "./api.js";
import { readCache } from "./cache.js";
import Icon from "./Icon.jsx";

export default function MailPage() {
  const box = useMailbox(),
    [, , boxId, messageId] = window.location.pathname.split("/");
  const valid = box?.id === boxId;
  const [images, setImages] = useState(false),
    [plain, setPlain] = useState(false);
  const cached = valid ? readCache(box.id, `mail:${messageId}`) : undefined;
  const query = useQuery({
    queryKey: ["mail", boxId, messageId],
    enabled: valid,
    queryFn: ({ signal }) =>
      mailboxRequest(
        box,
        `mail:${messageId}`,
        `/api/mailboxes/${boxId}/messages/${messageId}`,
        signal,
        300000,
      ),
    initialData: cached?.data,
    staleTime: 300000,
  });
  const message = query.data;
  useEffect(() => {
    document.title = `${valid && message?.subject ? message.subject : "邮件"} · Tmail`;
  }, [message, valid]);
  if (!valid)
    return (
      <section className="panel detail-empty">
        <h1>这个邮箱已切换或过期</h1>
        <p className="muted">旧标签页不会继续显示上一个邮箱的邮件。</p>
        <a className="button primary" href="/">
          返回收件箱
        </a>
      </section>
    );
  return (
    <article className="detail">
      <section className="message-header panel" aria-label="邮件概括信息">
        <div className="detail-toolbar">
          <span className="section-label">
            <Icon name="mail" /> 邮件详情
          </span>
          <a href="/" className="button subtle">
            收件箱 <Icon name="external" size={14} />
          </a>
        </div>
        <Notice>{query.error?.message}</Notice>
        {message ? (
          <>
            <h1>{message.subject || "（无主题）"}</h1>
            <dl className="message-meta">
              <dt>发件人</dt>
              <dd>{message.envelope_from}</dd>
              <dt>收件人</dt>
              <dd>{message.envelope_to}</dd>
              <dt>时间</dt>
              <dd>
                <time dateTime={message.received_at}>
                  {new Date(message.received_at).toLocaleString("zh-CN")}
                </time>
              </dd>
            </dl>
          </>
        ) : !query.isError ? (
          <div className="loading">
            <span className="spinner" /> 正在读取邮件…
          </div>
        ) : null}
      </section>
      {message && (
        <section className="message-content panel" aria-label="邮件正文">
          <div className="message-options">
            <button
              className="button subtle"
              onClick={() => setPlain(!plain)}
              aria-pressed={plain}
            >
              {plain ? "HTML 正文" : "纯文本"}
            </button>
            <button
              className="button subtle"
              onClick={() => setImages(!images)}
              aria-pressed={images}
            >
              {images ? "屏蔽远程图片" : "加载远程图片"}
            </button>
            <CopyButton value={message.text_body || ""}>复制正文</CopyButton>
          </div>
          <iframe
            className="message-frame"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            title="邮件正文"
            srcDoc={htmlDocument(
              plain ? null : message.html_body,
              message.text_body,
              images,
            )}
          />
        </section>
      )}
    </article>
  );
}
