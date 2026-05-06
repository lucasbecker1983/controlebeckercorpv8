import path from 'path';
import dotenv from 'dotenv';

dotenv.config({
    path: path.resolve(__dirname, '../../.env'),
});

const toNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: string | undefined, fallback: boolean) => {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const env = {
    proxyPort: toNumber(process.env.PROXY_PORT, 6779),
    databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:change_me@127.0.0.1:5432/controlebeckercorp_v8',
    jwtSecret: process.env.JWT_SECRET || 'change_me',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    projectRoot: process.env.PROJECT_ROOT || '/opt/controlebeckercorp-v8',
    appBaseUrl: process.env.APP_BASE_URL || 'https://console.jacarezinho.cloud',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://console.jacarezinho.cloud',
    letsencryptPrivkey: process.env.LETSENCRYPT_PRIVKEY || '/etc/letsencrypt/live/console.jacarezinho.cloud/privkey.pem',
    letsencryptFullchain: process.env.LETSENCRYPT_FULLCHAIN || '/etc/letsencrypt/live/console.jacarezinho.cloud/fullchain.pem',
    certFile: process.env.PROXY_CERT_FILE || '/opt/controlebeckercorp-v8/backend-proxy/public/certificado.der',
    sargDir: process.env.SARG_DIR || '/opt/controlebeckercorp-v8/backend-proxy/public/sarg',
    rulesDir: process.env.PROXY_RULES_DIR || '/opt/controlebeckercorp-v8/backend-proxy/regras',
    squidAclDir: process.env.SQUID_ACL_DIR || '/etc/squid/acl',
    proxyStateDir: process.env.PROXY_STATE_DIR || '/opt/controlebeckercorp-v8/backend-proxy/runtime',
    squidConfigPath: process.env.SQUID_CONFIG_PATH || '/etc/squid/squid.conf',
    squidSslDbPath: process.env.SQUID_SSL_DB_PATH || '/var/lib/ssl_db',
    squidSslCrtdProgram: process.env.SQUID_SSL_CRTD_PROGRAM || '/usr/lib/squid/security_file_certgen',
    squidServiceName: process.env.SQUID_SERVICE_NAME || 'squid',
    ufwBeforeRulesFile: process.env.UFW_BEFORE_RULES_FILE || '/etc/ufw/before.rules',
    whitelistFile: process.env.UNBOUND_ALLOWED_RPZ || '/etc/unbound/becker/allowed.rpz',
    vipConf: process.env.UNBOUND_VIP_CONF || '/etc/unbound/becker/vip-bypass.conf',
    blockedRpzFile: process.env.UNBOUND_BLOCKED_RPZ || '/etc/unbound/becker/blocked.rpz',
    unboundLocalConf: process.env.UNBOUND_LOCAL_CONF || '/etc/unbound/unbound.conf.d/becker_blocks.conf',
    unboundPolicyConf: process.env.UNBOUND_POLICY_CONF || '/etc/unbound/unbound.conf.d/becker_policy_compiler.conf',
    unboundConfigPath: process.env.UNBOUND_CONFIG_PATH || '/etc/unbound/unbound.conf',
    vipCleanDnsPort: toNumber(process.env.VIP_CLEAN_DNS_PORT, 5355),
    proxyTestTargetIp: process.env.PROXY_TEST_TARGET_IP || '',
    proxyTestTargetIpSingle: process.env.PROXY_TEST_TARGET_IP_SINGLE || '',
    proxyLocalResolverIp: process.env.PROXY_LOCAL_RESOLVER_IP || '127.0.0.1',
    proxyDnsServerIp: process.env.PROXY_DNS_SERVER_IP || '192.168.10.1',
    proxyGatewayIp: process.env.PROXY_GATEWAY_IP || '192.168.10.1',
    wanInterface: process.env.WAN_INTERFACE || 'enp8s0',
    proxyForwardPort: toNumber(process.env.PROXY_FORWARD_PORT, 3129),
    proxyInterceptHttpPort: toNumber(process.env.PROXY_INTERCEPT_HTTP_PORT, 3128),
    proxyInterceptHttpsPort: toNumber(process.env.PROXY_INTERCEPT_HTTPS_PORT, 3130),
    proxyVisibleHostname: process.env.PROXY_VISIBLE_HOSTNAME || 'proxy-v8.beckercorp.local',
    proxyBootstrapApply: toBoolean(process.env.PROXY_BOOTSTRAP_APPLY, true),
};
