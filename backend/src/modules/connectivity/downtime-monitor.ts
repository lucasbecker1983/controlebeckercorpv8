import { execCmd } from '../../utils/sys';
import { env } from '../../config/env';
import { pool } from '../../config/db';

const GATEWAY_IP = env.gatewayIp;
const WAN_IFACE = env.wanInterface;
const THRESHOLD = 10;

let consecutiveFailures = 0;
let currentIncidentId: number | null = null;

export const startLinkMonitor = async () => {
    setInterval(async () => {
        try {
            const isOnline = await pingCheck();
            if (!isOnline) {
                consecutiveFailures++;
                if (consecutiveFailures >= THRESHOLD && !currentIncidentId) {
                    const res = await pool.query(
                        "INSERT INTO net_link_downtime (gateway_ip, start_at, reason, packets_lost) VALUES ($1, NOW(), $2, $3) RETURNING id",
                        [GATEWAY_IP, `Link Down via ${WAN_IFACE}`, consecutiveFailures]
                    );
                    currentIncidentId = res.rows[0].id;
                } 
                if (currentIncidentId) {
                    await pool.query("UPDATE net_link_downtime SET packets_lost = $1 WHERE id = $2", [consecutiveFailures, currentIncidentId]);
                }
            } else {
                if (currentIncidentId) {
                    await pool.query(
                        "UPDATE net_link_downtime SET end_at = NOW(), duration = EXTRACT(EPOCH FROM (NOW() - start_at)) WHERE id = $1",
                        [currentIncidentId]
                    );
                    currentIncidentId = null;
                }
                consecutiveFailures = 0;
            }
        } catch (e) {}
    }, 2000);
};

const pingCheck = async (): Promise<boolean> => {
    try {
        await execCmd(`ping -c 1 -W 1 -I ${WAN_IFACE} ${GATEWAY_IP}`);
        return true;
    } catch { return false; }
};
