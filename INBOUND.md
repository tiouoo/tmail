# 临时邮箱域名接入

## 管理域名

1. 在 Vercel 设置服务端环境变量 `DOMAINS_ADMIN_PASSWORD` 后部署站点。本地运行 `npm run dev` 时将变量写入 `.env`，使用 `npm run worker:dev` 时写入 `.dev.vars`。
2. 在浏览器地址栏直接输入站点地址加 `/domains`，例如 `https://tmail.example.com/domains`。在弹窗中输入管理员密码。
3. 输入完整域名，选择投递方式，再点击 **添加域名**。已有域名会自动显示。
   - **Cloudflare 直收** 适用于将 Catch-all 指向 Tmail Worker 的域名，例如 `inbox.example.com`。
   - **外部 Webhook** 适用于通过 `/api/inbound` 投递的域名，例如 `t.mymail.com`。添加后请立即复制页面显示的投递密钥，并在投递端保存为 `TMAIL_KEY`。密钥明文仅在生成时显示。

## Cloudflare Email Worker 示例

把 `t.mymail.com` 的 Catch-all 指向下方的 Worker。投递时需要环境变量 `TMAIL_KEY` 。

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
