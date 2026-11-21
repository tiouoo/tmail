import { isTemporaryDomain } from "./src/worker/domains.js";

// 本站的直收域名在 Turso 中登记为 cloudflare，例如 t.chilo.top。
// 如果部署需要额外的域名匹配条件，在这个函数里添加。
export function canReceiveCloudflareMail(domain, registration, config) {
  return (
    config.features.temporaryMail &&
    isTemporaryDomain(domain, config) &&
    registration.enabled === 1 &&
    registration.delivery === "cloudflare"
  );
}
