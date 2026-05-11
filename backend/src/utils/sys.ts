import { exec } from 'child_process';
import fs from 'fs';
import { env } from '../config/env';

export const SHELL_ALLOWLIST: Array<{ name: string; pattern: RegExp }> = [
    { name: 'systemctl-active', pattern: /^(sudo\s+)?systemctl is-active [\w@.-]+(\s+\|\|\s+echo\s+"?inactive"?)?$/ },
    { name: 'systemctl-manage', pattern: /^(sudo\s+)?systemctl (start|stop|restart|reload) [\w@.-]+$/ },
    { name: 'unbound-control', pattern: /^(sudo\s+)?unbound-control (reload|flush_zone \.)$/ },
    { name: 'ufw-read', pattern: /^sudo ufw status numbered$/ },
    { name: 'ufw-write', pattern: /^(sudo )?(echo ['"]?y['"]?\s*\|\s*)?sudo ufw (allow|deny|delete|enable|reset).+$/ },
    { name: 'fail2ban', pattern: /^sudo fail2ban-client (status sshd|set sshd (banip|unbanip) [0-9.]+|unban --all)$/ },
    { name: 'iptables-save-read', pattern: /^iptables-save -t (filter|nat)$/ },
    { name: 'iptables-chain-read', pattern: /^iptables( -t nat)? -S (PREROUTING|FORWARD)$/ },
    { name: 'iptables-chain-comment-read', pattern: /^iptables( -t nat)? -S (PREROUTING|FORWARD) \| grep -- "--comment sgcg-(total-vlan-block|vip-bypass)" \|\| true$/ },
    { name: 'hotspot-ipset', pattern: /^ipset (create sgcg_hotspot_v70_auth hash:ip timeout (43200|14400) -exist|add sgcg_hotspot_v70_auth 192\.168\.70\.\d{1,3} timeout (43200|14400) -exist|del sgcg_hotspot_v70_auth 192\.168\.70\.\d{1,3}|list sgcg_hotspot_v70_auth)$/ },
    { name: 'hotspot-conntrack', pattern: /^conntrack -D -(s|d) 192\.168\.70\.\d{1,3}$/ },
    { name: 'hotspot-iptables-nat-check', pattern: /^iptables -t nat -(C PREROUTING|D PREROUTING|I PREROUTING \d+) -i enp6s0\.70 -p tcp --dport 80 -m set ! --match-set sgcg_hotspot_v70_auth src -j DNAT --to-destination 192\.168\.70\.1:80$/ },
    { name: 'hotspot-iptables-auth-http-return', pattern: /^iptables -t nat -(C PREROUTING|D PREROUTING|I PREROUTING \d+) -i enp6s0\.70 -p tcp --dport 80 -m set --match-set sgcg_hotspot_v70_auth src -j RETURN$/ },
    { name: 'hotspot-iptables-forward-check', pattern: /^iptables -(C FORWARD|D FORWARD|I FORWARD \d+) -i enp6s0\.70 -o enp8s0 -m set ! --match-set sgcg_hotspot_v70_auth src -j REJECT --reject-with icmp-port-unreachable$/ },
    { name: 'collab-ipset', pattern: /^ipset (create sgcg_collab_v30_auth hash:ip timeout 28800 -exist|add sgcg_collab_v30_auth 192\.168\.30\.\d{1,3} timeout 28800 -exist|del sgcg_collab_v30_auth 192\.168\.30\.\d{1,3}|list sgcg_collab_v30_auth)$/ },
    { name: 'collab-conntrack', pattern: /^conntrack -D -(s|d) 192\.168\.30\.\d{1,3}$/ },
    { name: 'collab-iptables-nat-check', pattern: /^iptables -t nat -(C PREROUTING|D PREROUTING|I PREROUTING \d+) -i enp6s0\.30 -p tcp --dport 80 -m set ! --match-set sgcg_collab_v30_auth src -j DNAT --to-destination 192\.168\.30\.1:80$/ },
    { name: 'collab-iptables-forward-check', pattern: /^iptables -(C FORWARD|D FORWARD|I FORWARD \d+) -i enp6s0\.30 -o enp8s0 -m set ! --match-set sgcg_collab_v30_auth src -j REJECT --reject-with icmp-port-unreachable$/ },
    { name: 'ping', pattern: /^ping( -4)? -c 1 -W 1( -I [\w.@-]+)? [0-9.]+( > \/dev\/null 2>&1 && echo true \|\| echo false)?$/ },
    { name: 'ip-read', pattern: /^(ip -o -4 addr show|ip -o link show|ip( -4)? (a|addr|o link|o -4 addr show)( .+)?)$/ },
    { name: 'ip-neigh-read', pattern: /^ip neigh show [0-9.]+$/ },
    { name: 'proc-read', pattern: /^(cat \/proc\/uptime \| awk '\{print \$1\}'|cat \/proc\/uptime|cat \/proc\/cpuinfo \| grep 'cpu MHz' \| head -1 \| awk '\{print \$4\}'|cat \/proc\/net\/dev)$/ },
    { name: 'host-read', pattern: /^(uname -r|grep PRETTY_NAME \/etc\/os-release \| cut -d'"' -f2|lscpu \| grep 'CPU max MHz' \| awk '\{print \$4\}'|vmstat 1 2 \| tail -1 \| awk '\{print 100-\$15\}'|free \| grep Mem \| awk '\{print \$3\/\$2 \* 100\}'|free -m \| awk '\/\^Mem:\/ \{print \$3, \$2, \$3\/\$2 \* 100\}'|free -m \| awk '\/\^Mem:\/ \{print \$3, \$2, \$3\/\$2 \* 100\}')$/ },
    { name: 'filesystem-read', pattern: /^(mount \| grep "on .+ " \|\| echo ""|df -B1 --output=size,used,pcent .+ \| tail -1|chmod \+x .+)$/ },
    { name: 'postgres-dump', pattern: new RegExp(`^sudo -u postgres pg_dump ${env.dbName} > ${env.projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/db_dump\\.sql$`) },
    { name: 'tar-backup', pattern: /^tar -czf .+$/ },
    { name: 'wireguard-gen', pattern: /^(wg genkey|wg genpsk|echo ".+" \| wg pubkey)$/ },
    { name: 'wireguard-manage', pattern: /^sudo wg( set [\w@.-]+ peer .+|(-quick save [\w@.-]+))$/ },
    { name: 'user-mgmt', pattern: /^sudo (useradd|userdel|mkdir|chown|chmod|smbpasswd|chpasswd).+$/ },
    { name: 'iptables-forward', pattern: /^sudo iptables (-I|-D) FORWARD .+$/ },
    { name: 'tc', pattern: /^sudo tc .+$/ },
    { name: 'modprobe-ifb', pattern: /^sudo modprobe ifb( numifbs=\d+)?$/ },
    { name: 'ip-link-write', pattern: /^sudo ip link (add [\w.-]+ type ifb|set dev [\w.-]+ up)$/ },
    { name: 'journal-grep', pattern: /^sudo (grep 'UFW BLOCK' \/var\/log\/kern\.log .+|grep 'Ban ' \/var\/log\/fail2ban\.log .+)$/ },
    { name: 'journalctl', pattern: /^sudo journalctl -u unbound --no-pager -n 5000$/ },
    { name: 'dig', pattern: /^dig @127\.0\.0\.1 .+ \+short$/ },
    { name: 'cron-sync', pattern: new RegExp(`^sudo ${env.projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/backend\\/(999_sync_cron|999_vlan_scheduler)\\.sh .+$`) },
    { name: 'background-script', pattern: /^bash .+ > \/dev\/null 2>&1 &$/ },
    { name: 'misc-safe', pattern: /^(sync|sudo sysctl -w vm\.drop_caches=3)$/ },
    { name: 'nmap-scan', pattern: /^sudo nmap -sn -n --min-rate 1000 .+$/ },
    { name: 'clamav-control', pattern: /^(sudo\s+)?systemctl (start|stop|restart) clamav-(daemon|freshclam|clamonacc)(\.service)?$/ },
    { name: 'clamav-status', pattern: /^(sudo\s+)?systemctl is-active clamav-(daemon|freshclam|clamonacc)(\.service)?(\s+\|\|\s+echo\s+"?inactive"?)?$/ },
    { name: 'clamav-update', pattern: /^(sudo\s+)?freshclam(--stdout)?$/ },
    { name: 'clamav-scan', pattern: /^(sudo\s+)?clamscan -ri --max-filesize=256M --max-scansize=512M .+$/ },
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

export const execCmdStrict = (cmd: string): Promise<string> => {
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
                const message = stderr?.trim() || error.message || `Falha ao executar comando: ${normalized}`;
                console.error(`[CMD FAIL] ${normalized}: ${message}`);
                reject(new Error(message));
                return;
            }
            resolve(stdout.trim());
        });
    });
};

export const read = async (path: string): Promise<string> => {
    try {
        if (fs.existsSync(path)) return fs.readFileSync(path, 'utf-8').trim();
    } catch {}
    return '';
};
