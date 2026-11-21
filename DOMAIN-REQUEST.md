# 将自己的域名添加至 Tmail

你可以申请将自己管理的域名加入 Tmail。请先写好邮件接收和 API 投递代码，再提交申请。[tmail.chilo.top](https://tmail.chilo.top)

1. 按接入文档写好域名匹配和投递请求的代码，将 `TMAIL_KEY` 留待审核后配置。[投递 API 接入文档](./INBOUND.md#cloudflare-email-worker-示例)
2. 创建 GitHub Issue，填写完整域名、收信方式和长期维护计划。上传接入代码截图或贴上可公开查看的代码链接，展示域名匹配和 API 请求的实现。附上可核验的长期使用材料，例如公开的域名到期记录或脱敏的续费凭证。提交后等待管理员回复。[创建域名接入申请](https://github.com/tiouoo/tmail/issues/new?template=domain-request.yml)
3. 管理员审核通过并登记域名后，才会私下发放投递密钥。收到密钥后，将其配置为 `TMAIL_KEY`，再发一封测试邮件，确认它出现在 Tmail 收件箱。
