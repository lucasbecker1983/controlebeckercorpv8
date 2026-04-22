import { exec } from 'child_process';

const VLAN_IFACES = '(enp6s0\\.10|enp6s0\\.30|enp6s0\\.40|enp6s0\\.50|enp6s0\\.70|enp6s0\\.80|enp6s0\\.99)';
const VLAN_GATEWAYS = '(192\\.168\\.(10|30|40|50|70|80|99)\\.1)';

export const SHELL_ALLOWLIST: Array<{ name: string; pattern: RegExp }> = [
    { name: 'systemctl', pattern: /^(sudo\s+)?systemctl (is-active|start|stop|restart|reload|show) [\w@.-]+(\s+--property=[\w-]+)?(\s+\|\|\s+(echo\s+inactive|true))?$/ },
    { name: 'iptables-list-prerouting', pattern: /^iptables -t nat -S PREROUTING$/ },
    { name: 'iptables-redirect-80', pattern: new RegExp(`^iptables -t nat -[AD] PREROUTING -i ${VLAN_IFACES} -p tcp --dport 80 -j REDIRECT --to-port 3128( \\|\\| true)?$`) },
    { name: 'iptables-redirect-443', pattern: new RegExp(`^iptables -t nat -[AD] PREROUTING -i ${VLAN_IFACES} -p tcp --dport 443 -j REDIRECT --to-port 3129( \\|\\| true)?$`) },
    { name: 'iptables-return-source', pattern: new RegExp(`^iptables -t nat -[AD] PREROUTING -i ${VLAN_IFACES} -s ${VLAN_GATEWAYS} -j RETURN( \\|\\| true)?$`) },
    { name: 'iptables-return-dest', pattern: new RegExp(`^iptables -t nat -[AD] PREROUTING -i ${VLAN_IFACES} -d ${VLAN_GATEWAYS} -j RETURN( \\|\\| true)?$`) },
    { name: 'iptables-return-dns-udp', pattern: new RegExp(`^iptables -t nat -[AD] PREROUTING -i ${VLAN_IFACES} -p udp --dport 53 -j RETURN( \\|\\| true)?$`) },
    { name: 'iptables-return-dns-tcp', pattern: new RegExp(`^iptables -t nat -[AD] PREROUTING -i ${VLAN_IFACES} -p tcp --dport 53 -j RETURN( \\|\\| true)?$`) },
    { name: 'netfilter', pattern: /^netfilter-persistent save$/ },
    { name: 'ss', pattern: /^ss -tlnp \| grep -E '3127\|3128\|3129'(\s+\|\|\s+true)?$/ },
    { name: 'journalctl', pattern: /^journalctl -u squid -n 10 --no-pager$/ },
    { name: 'unbound', pattern: /^(sudo\s+)?(unbound-control reload|systemctl (reload|restart) unbound)$/ },
    { name: 'ps-grep', pattern: /^ps -ef \| grep -E 'node \.\*ingester\|dist\/ingester\.js' \| grep -v grep \|\| true$/ },
    { name: 'pkill', pattern: /^pkill -f 'dist\/ingester\.js' \|\| true$/ },
    { name: 'htpasswd', pattern: /^sudo htpasswd (-b|-c -b|-D) .+$/ },
    { name: 'ip-link', pattern: /^sudo ip link set [\w.@/-]+ (up|down)$/ },
    { name: 'sarg', pattern: /^sudo sarg -x$/ },
    { name: 'chown-chmod', pattern: /^chown proxy:root ".+" && chmod 664 ".+"$/ },
];

const isAllowedCommand = (cmd: string) => SHELL_ALLOWLIST.some((entry) => entry.pattern.test(cmd.trim()));

export const execCmd = (cmd: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const normalized = cmd.trim();
        if (!isAllowedCommand(normalized)) {
            const error = new Error(`Comando fora da allowlist: ${normalized}`);
            console.error(`[SHELL BLOCKED] ${error.message}`);
            reject(error);
            return;
        }

        exec(normalized, { shell: '/bin/bash' }, (error, stdout, stderr) => {
            if (error) {
                console.warn(`[CMD FAIL] ${normalized}: ${stderr}`);
                resolve('');
                return;
            }
            resolve(stdout.trim());
        });
    });
};
