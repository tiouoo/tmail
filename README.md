# Tmail

基于 React、Vercel、Cloudflare Email Workers 和 Turso 的临时邮箱, 支持普通邮件转发至指定邮箱/回流邮件归档和过期数据清理, 以及只读秘密收件箱

## 部署

0. 部署此项目需要Vercel和Cloudflare账户/Turso数据库

1. 点击下方 **Deploy with Vercel** 按钮, Deploy Button 会在创建项目时提示填写核心环境变量. 部署完成后, 绑定访问域名

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftiouoo%2Ftmail&env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN,SESSION_SECRET,EMAIL_DOMAINS,FORWARD_TO,ARCHIVE_RECIPIENT,TURNSTILE_ENABLED,TURNSTILE_SITE_KEY,TURNSTILE_SECRET,TURNSTILE_HOSTNAMES&envDescription=Configure%20database%2C%20mail%20routing%2C%20session%20signing%2C%20and%20optional%20Turnstile%20credentials.&envLink=https%3A%2F%2Fgithub.com%2Ftiouoo%2Ftmail%2Fblob%2Fmain%2F.env.example&project-name=tmail&repository-name=tmail)

2. 在 Cloudflare 创建与 `wrangler.jsonc` 中 `name` 一致的 Worker, 并在 Worker 的 Settings → Variables and Secrets 中设置相同的应用变量. 并且在 GitHub 仓库 Setting → Secrets and variables → Actions 添加两个secret `CLOUDFLARE_ACCOUNT_ID` , `CLOUDFLARE_API_TOKEN` 分别为你的Cloudflare账户ID和拥有编辑worker权限的token

3. 为 `EMAIL_DOMAINS` 中的域名启用 Cloudflare Email Routing, 按 Cloudflare 指引添加 MX/TXT 并将 Catch-all 指向该 Worker

4. 普通邮件转发到指定邮箱功能(可选): 验证 `FORWARD_TO` 为允许的转发目标. 邮件归档功能(可选): 在邮箱设置自动转发至 `ARCHIVE_RECIPIENT`

## 环境变量

`config.js` 提供站点名称/GitHub 链接/功能默认值/邮箱保留时间/邮件大小上限和创建额度. 部署凭据及地址使用环境变量: 

| 变量                                                                              | 用途                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`                                          | Turso/libSQL 连接地址和读写令牌                                               |
| `SESSION_SECRET`                                                                  | 至少 32 字符；Vercel 与 Worker 必须使用相同值, 轮换会使现有会话和邮箱凭据失效 |
| `EMAIL_DOMAINS`                                                                   | 临时邮箱域名, 逗号分隔                                                        |
| `FORWARD_TO`                                                                      | 普通邮件的转发目标；启用转发时必填                                            |
| `ARCHIVE_RECIPIENT`                                                               | QQ 自动转发回来的归档收件地址                                                 |
| `SITE_PASSWORD`                                                                   | 可选的站点访问密码                                                            |
| `PRIVATE_MAIL_PATH`、`PRIVATE_MAIL_PASSWORD` | 可选的秘密邮箱路径与密码，仅在 Vercel/Worker 环境变量中设置；完整入口为 `/<路径>/<密码>`，只读 `private` 表，无人机验证，错误入口返回 404 |
| `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET`、`TURNSTILE_HOSTNAMES`                   | Turnstile 公钥、私钥和获准域名列表                                            |
| `TURNSTILE_ENABLED`                                                               | 是否启用验证, 设为 `false` 可关闭                                             |
| `TEMPORARY_MAIL_ENABLED`、`FORWARD_ENABLED`、`ARCHIVE_ENABLED`、`CLEANUP_ENABLED` | 功能开关, 值为 `true` 或 `false`                                              |

秘密入口不出现在公开配置、链接或站点地图中，并设置禁止索引和缓存；请勿分享完整 URL（浏览器历史及托管访问日志仍可能记录它）。

可使用以下代码生成 `SESSION_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```
