import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

export type EndpointIdentity = {
    agent_id?: string;
    user?: string;
    display_user?: string;
    computer?: string;
    ip?: string;
    mac?: string;
    vlan?: string;
    logged?: boolean;
    source?: string;
    agent_version?: string;
    checked_at?: string;
    received_at?: string;
};

const latestFile = path.join(env.projectRoot, 'data', 'identity', 'latest.json');

const normalizeIp = (value: unknown) => String(value || '').trim();

export const identityEnrichmentService = {
    loadLatestByIp(): Map<string, EndpointIdentity> {
        const byIp = new Map<string, EndpointIdentity>();
        try {
            const raw = JSON.parse(fs.readFileSync(latestFile, 'utf8')) as Record<string, EndpointIdentity>;
            for (const item of Object.values(raw || {})) {
                const ip = normalizeIp(item?.ip);
                if (ip) byIp.set(ip, item);
            }
        } catch {
            // optional enrichment
        }
        return byIp;
    },

    enrichRow<T extends Record<string, any>>(row: T, byIp: Map<string, EndpointIdentity>): T {
        const ip = normalizeIp(row.client_ip || row.ip || row.actor_ip);
        const identity = ip ? byIp.get(ip) || null : null;
        return {
            ...row,
            identity,
            identity_user: identity?.user || null,
            identity_display_user: identity?.display_user || null,
            identity_computer: identity?.computer || null,
            identity_mac: identity?.mac || null,
            identity_agent_id: identity?.agent_id || null,
            identity_checked_at: identity?.checked_at || null,
        };
    },

    enrichRows<T extends Record<string, any>>(rows: T[]): T[] {
        const byIp = this.loadLatestByIp();
        return rows.map((row) => this.enrichRow(row, byIp));
    },
};
