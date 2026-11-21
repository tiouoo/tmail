# 临时邮箱域名接入

## 管理员登记

管理员直接在 Turso 的 `tmail_domains` 表登记域名。内置域名由 Email Routing 交给 Tmail Worker 直接入库，只需登记域名和投递方式。

```sql
INSERT INTO tmail_domains (domain, delivery)
VALUES ('inbox.example.com', 'cloudflare');
```

外部域名使用 `webhook`。申请通过审核后，为每个外部域名单独运行一次命令，将次行 SHA-256 摘要写入数据库，再把首行密钥和站点 URL 私下交给接入方。

```sh
node -e "const {randomBytes,createHash}=require('node:crypto'); const key=randomBytes(32).toString('hex'); console.log(key); console.log(createHash('sha256').update(key).digest('base64url'));"
```

```sql
INSERT INTO tmail_domains (domain, delivery, key_digest)
VALUES ('t.mymail.com', 'webhook', '<第二行的摘要>');
```

已启用的域名通过 `GET /api/config` 的 `emailDomains` 字段返回。将 `enabled` 改为 `0` 可停用域名，已有邮箱仍可读取至到期。外部域名更换 `key_digest` 后，新密钥立即生效。

## Cloudflare Email Worker 示例

把 `t.mymail.com` 的 Catch-all 指向下方的 Worker，代码中保留 `env.TMAIL_KEY`，准备好后提交申请。审核通过并收到管理员发放的密钥后，用 `npx wrangler secret put TMAIL_KEY` 保存，再试投邮件。

```js
const TMAIL_URL = "https://tmail.chilo.top";
const TMAIL_DOMAIN = "t.mymail.com";
const MAX_EMAIL_BYTES = 2 * 1024 * 1024;

export default {
  async email(message, env) {
    // 本例仅用带 t. 前缀的 t.mymail.com 接收临时邮件。
    // SMTP 信封收件域名必须等于 t.mymail.com，否则不投递到 Tmail。
    const domain = message.to.slice(message.to.lastIndexOf("@") + 1).toLowerCase();
    if (domain !== TMAIL_DOMAIN) {
      // 共用 Worker 时，可以在这个分支调用现有的收信逻辑。
      message.setReject("Recipient domain is not handled by this Worker");
      return;
    }

    if (message.rawSize > MAX_EMAIL_BYTES) {
      message.setReject("Message exceeds the 2 MiB limit");
      return;
    }

    // 把信封地址放进请求头，将原始邮件流作为请求体发送。
    const response = await fetch(new URL("/api/inbound", TMAIL_URL), {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${env.TMAIL_KEY}`,
        "X-Envelope-From": message.from || "<>",
        "X-Envelope-To": message.to,
        "Content-Type": "message/rfc822",
      },
      body: message.raw,
    });

    // Tmail 用 204 确认接收，其他状态按投递失败处理。
    if (response.status !== 204) {
      throw new Error(`Tmail delivery failed with HTTP ${response.status}`);
    }
  },
};
```

如果同一域名也有个人邮箱，先按完整收件地址处理个人邮箱，再执行域名判断。试投时，先在 Tmail 创建邮箱，再向生成的地址发送邮件并刷新收件箱。

## 用 curl 测试

```sh
curl --fail-with-body 'https://tmail.chilo.top/api/inbound' \
  -H "Authorization: Bearer $TMAIL_KEY" \
  -H 'X-Envelope-From: sender@example.net' \
  -H 'X-Envelope-To: actual-mailbox@t.mymail.com' \
  -H 'Content-Type: message/rfc822' \
  --data-binary @message.eml
```

两个地址取自 SMTP 信封。空发件人用 `<>`。请求体是完整的原始邮件，最大 2 MiB。

收到 `204` 即可结束投递。重复邮件和投给无效邮箱的邮件也返回 `204`。收到 `401` 请检查收件域名和对应密钥，`413` 表示邮件过大，`5xx` 可重试。
