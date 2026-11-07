import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { htmlDocument } from './message-document.js';
import Icon from './Icon.jsx';

// Private mail stays in memory; never use the public mailbox/localStorage cache.
export default function PrivateInbox() {
  const parts = window.location.pathname.split('/');
  const entryPath = parts.slice(0, 3).join('/');
  const messageId = parts.length === 4 ? decodeURIComponent(parts[3]) : null;
  useEffect(() => { document.title = messageId ? '邮件详情' : '收件箱'; }, [messageId]);
  const [offset, setOffset] = useState(0);
  const list = useQuery({
    queryKey: ['private-list', offset],
    queryFn: async ({ signal }) => (await api(`/api/private/messages?offset=${offset}`, { signal })).data,
    enabled: !messageId, refetchInterval: messageId ? false : 30000, gcTime: 0,
  });
  const detail = useQuery({
    queryKey: ['private-message', messageId], enabled: Boolean(messageId),
    queryFn: async ({ signal }) => (await api(`/api/private/messages/${encodeURIComponent(messageId)}`, { signal })).data,
    gcTime: 0,
  });
  const error = list.error || detail.error;
  const message = detail.data;
  return <div className="app-shell private-shell">
    <main>
      {error && <div className="notice" role="status">{error.status === 404 ? '邮件不存在或访问已失效，请重新打开完整入口。' : error.message}</div>}
      {messageId ? <article className="detail">
        <section className="message-header panel">
          <div className="detail-toolbar"><span className="section-label"><Icon name="mail" /> 邮件详情</span><a className="button subtle" href={entryPath} rel="noreferrer">收件箱</a></div>
          {message ? <><h1>{message.subject || '（无主题）'}</h1><dl className="message-meta">
            <dt>发件人</dt><dd>{message.envelope_from}</dd><dt>收件人</dt><dd>{message.envelope_to}</dd>
            <dt>时间</dt><dd>{new Date(message.received_at).toLocaleString('zh-CN')}</dd>
          </dl></> : detail.isPending && <div className="loading">正在读取邮件…</div>}
        </section>
        {message && <section className="message-content panel"><iframe className="message-frame"
          sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" title="邮件正文"
          srcDoc={htmlDocument(message.html_body, message.text_body, false)} /></section>}
      </article> : <section className="inbox panel" aria-label="收件箱">
        <div className="inbox-heading"><span className="section-label"><Icon name="inbox" /> 收件箱</span></div>
        <div className="list-labels"><span>发件人 / 主题</span><span>接收时间</span></div>
        {list.isPending ? <div className="loading">正在读取邮件…</div> : list.data?.messages.length ?
          <div className="mail-list">{list.data.messages.map(item => <div className="mail-row" key={item.id}>
            <a className="mail-link private-mail-link" href={`${entryPath}/${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer">
              <span className="avatar">{item.envelope_from[0]?.toUpperCase()}</span>
              <span className="mail-summary"><strong>{item.subject || '（无主题）'}</strong><span>{item.envelope_from}<span className="preview"> · {item.preview}</span></span></span>
              <time>{new Date(item.received_at).toLocaleString('zh-CN')}</time><Icon name="arrow" size={15} />
            </a></div>)}</div> : !list.error && <div className="empty">
              <div className="empty-art"><Icon name="inbox" size={36} /><span className="empty-spark">✦</span></div>
              <h2>收件箱里，暂时很安静</h2>
            </div>}
        <div className="inbox-footer"><span><span className="status-dot" />自动同步已开启</span><div>
          {offset > 0 && <button className="text-button" onClick={() => setOffset(offset - 30)}>上一页</button>}
          {list.data?.hasMore && <button className="text-button" onClick={() => setOffset(offset + 30)}>下一页</button>}
        </div></div>
      </section>}
    </main>
  </div>;
}
