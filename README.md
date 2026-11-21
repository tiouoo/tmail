# Tmail

基于 Vercel、Cloudflare Email Workers 和 Turso 的临时邮箱，支持邮件转发和归档。

## 部署

1. 在 Turso 创建数据库并生成读写令牌。用 `.env` 配置数据库连接，运行 `npm run db:init`，然后登记临时邮箱域名。[域名登记与接入](./INBOUND.md)
2. 将仓库部署到 Vercel，使用 Node.js 24，并按下表设置环境变量。启用 Turnstile 时，在控件中授权实际访问的站点域名。
3. 在 GitHub Actions Secrets 中设置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`，令牌使用 **Edit Cloudflare Workers** 模板。在默认分支运行 **Deploy Email Worker**。部署后给 Worker 设置下表中的共享变量。
4. 在 Worker 所属的 Cloudflare 账户启用 Email Routing，按控制台配置 DNS，并验证至少一个目标邮箱。为登记为 `cloudflare` 的临时邮箱域名配置 Catch-all，指向 `tmail` Worker。[Email Routing](https://developers.cloudflare.com/email-service/get-started/route-emails/)
   - 启用转发时，验证 `FORWARD_TO`，并将需要转发的收件地址路由到 Worker。转发入口使用独立于临时邮箱的域名。
   - 启用归档时，为归档域名启用 Email Routing，将 `ARCHIVE_RECIPIENT` 单独路由到 Worker，再在源邮箱设置自动转发到该地址。
5. 在 Vercel 站点创建临时邮箱并试收一封邮件。启用转发或归档时，也分别试投对应的收件地址。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftiouoo%2Ftmail&env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN,SESSION_SECRET,FORWARD_TO,ARCHIVE_RECIPIENT,TURNSTILE_SITE_KEY,TURNSTILE_SECRET&envLink=https%3A%2F%2Fgithub.com%2Ftiouoo%2Ftmail%2Fblob%2Fmain%2F.env.example&project-name=tmail&repository-name=tmail)

## 配置

功能开关在 `config.js`，默认启用。变量示例见 [.env.example](./.env.example)。

| 设置位置 | 变量 | 要求 |
| --- | --- | --- |
| Vercel 和 Worker | `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN` | 同一数据库，使用读写令牌 |
| Vercel 和 Worker | `SESSION_SECRET` | 两端使用相同的密钥，至少 32 字符 |
| Vercel 和 Worker | `FORWARD_TO`、`ARCHIVE_RECIPIENT` | 对应功能启用时必填。两个地址不同，使用临时邮箱以外的域名 |
| Vercel | `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET` | 启用 Turnstile 时必填。可用 `TURNSTILE_HOSTNAMES` 指定站点域名列表，用逗号分隔 |
| Vercel | `SITE_PASSWORD` | 可选的建箱密码 |
