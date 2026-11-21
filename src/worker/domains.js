export function addressDomain(address) {
  const separator = address.lastIndexOf("@");
  return separator === -1 ? "" : address.slice(separator + 1).toLowerCase();
}

export function isDomain(domain) {
  return domain.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain);
}

function reservedDomains(config) {
  return [addressDomain(config.destination), addressDomain(config.privateRecipient)];
}

export function isTemporaryDomain(domain, config) {
  return isDomain(domain) && !reservedDomains(config).includes(domain);
}

export async function listDomains(db, config) {
  const { rows } = await db.execute({
    sql: "SELECT domain FROM tmail_domains WHERE enabled = 1 AND domain NOT IN (?, ?) ORDER BY domain",
    args: reservedDomains(config),
  });
  return rows.map(({ domain }) => domain).filter(isDomain);
}

export async function findDomain(db, domain) {
  const { rows } = await db.execute({
    sql: "SELECT delivery, key_digest, enabled FROM tmail_domains WHERE domain = ?",
    args: [domain],
  });
  return rows[0];
}
