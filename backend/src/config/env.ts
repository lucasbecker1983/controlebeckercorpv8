import path from 'path';
import dotenv from 'dotenv';

dotenv.config({
    path: path.resolve(__dirname, '../../.env'),
});

const toNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean) => {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const env = {
    corePort: toNumber(process.env.CORE_PORT, 6778),
    databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:change_me@127.0.0.1:5432/controlebeckercorp_v8',
    jwtSecret: process.env.JWT_SECRET || 'change_me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30m',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    projectRoot: process.env.PROJECT_ROOT || '/opt/controlebeckercorp-v8',
    dbName: process.env.DB_NAME || 'controlebeckercorp_v8',
    appDomain: process.env.APP_DOMAIN || 'console.beckercorp.cloud',
    appBaseUrl: process.env.APP_BASE_URL || 'https://console.beckercorp.cloud',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://console.beckercorp.cloud',
    proxyRuntimeBaseUrl: process.env.PROXY_RUNTIME_BASE_URL || 'https://console.jacarezinho.cloud:6779',
    gatewayIp: process.env.GATEWAY_IP || '186.251.14.25',
    publicIps: (process.env.PUBLIC_IPS || '186.251.14.26,186.251.14.27,186.251.14.28,186.251.14.29').split(',').map((item) => item.trim()).filter(Boolean),
    lanInterface: process.env.LAN_INTERFACE || 'enp6s0',
    wanInterface: process.env.WAN_INTERFACE || 'enp8s0',
    wireguardInterface: process.env.WIREGUARD_INTERFACE || 'wg0',
    wireguardService: process.env.WIREGUARD_SERVICE || 'wg-quick@wg0',
    sshLanAllowPort: toNumber(process.env.SSH_LAN_ALLOW_PORT, 22),
    sshExternalPort: toNumber(process.env.SSH_EXTERNAL_PORT, 18122),
    storageGroup: process.env.STORAGE_GROUP || 'becker_share',
    cftvMount: process.env.CFTV_MOUNT || '/mnt/cftv_storage',
    nextcloudMount: process.env.NEXTCLOUD_MOUNT || '/mnt/nextcloud_data',
    smtpRejectUnauthorized: toBool(process.env.SMTP_REJECT_UNAUTHORIZED, false),
    hotspotSmsProvider: process.env.HOTSPOT_SMS_PROVIDER || 'smsgate',
    hotspotSmsBaseUrl: process.env.HOTSPOT_SMS_BASE_URL || '',
    hotspotSmsUsername: process.env.HOTSPOT_SMS_USERNAME || '',
    hotspotSmsPassword: process.env.HOTSPOT_SMS_PASSWORD || '',
    hotspotSmsJwtSecret: process.env.HOTSPOT_SMS_JWT_SECRET || '',
    hotspotSmsJwtIssuer: process.env.HOTSPOT_SMS_JWT_ISSUER || 'sgcg-smsgate',
    hotspotSmsUserId: process.env.HOTSPOT_SMS_USER_ID || '',
    hotspotSmsApiKey: process.env.HOTSPOT_SMS_API_KEY || '',
    hotspotSmsDeviceId: process.env.HOTSPOT_SMS_DEVICE_ID || '',
    hotspotOtpMinutes: toNumber(process.env.HOTSPOT_OTP_MINUTES, 5),
};
