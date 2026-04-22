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
    { name: 'ping', pattern: /^ping( -4)? -c 1 -W 1( -I [\w.@-]+)? [0-9.]+( > \/dev\/null 2>&1 && echo true \|\| echo false)?$/ },
    { name: 'ip-read', pattern: /^(ip -o -4 addr show|ip -o link show|ip( -4)? (a|addr|o link|o -4 addr show)( .+)?)$/ },
    { name: 'proc-read', pattern: /^(cat \/proc\/uptime \| awk '\{print \$1\}'|cat \/proc\/uptime|cat \/proc\/cpuinfo \| grep 'cpu MHz' \| head -1 \| awk '\{print \$4\}'|cat \/proc\/net\/dev)$/ },
    { name: 'host-read', pattern: /^(uname -r|grep PRETTY_NAME \/etc\/os-release \| cut -d'"' -f2|lscpu \| grep 'CPU max MHz' \| awk '\{print \$4\}'|vmstat 1 2 \| tail -1 \| awk '\{print 100-\$15\}'|free \| grep Mem \| awk '\{print \$3\/\$2 \* 100\}')$/ },
    { name: 'filesystem-read', pattern: /^(mount \| grep "on .+ " \|\| echo ""|df -B1 --output=size,used,pcent .+ \| tail -1|chmod \+x .+)$/ },
    { name: 'postgres-dump', pattern: new RegExp(`^sudo -u postgres pg_dump ${env.dbName} > ${env.projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/db_dump\\.sql$`) },
    { name: 'tar-backup', pattern: /^tar -czf .+$/ },
    { name: 'wireguard-gen', pattern: /^(wg genkey|wg genpsk|echo ".+" \| wg pubkey)$/ },
    { name: 'wireguard-manage', pattern: /^sudo wg( set [\w@.-]+ peer .+|(-quick save [\w@.-]+))$/ },
    { name: 'user-mgmt', pattern: /^sudo (useradd|userdel|mkdir|chown|chmod|smbpasswd|chpasswd).+$/ },
    { name: 'iptables-forward', pattern: /^sudo iptables (-I|-D) FORWARD .+$/ },
    { name: 'tc', pattern: /^sudo tc .+$/ },
    { name: 'journal-grep', pattern: /^sudo (grep 'UFW BLOCK' \/var\/log\/kern\.log .+|grep 'Ban ' \/var\/log\/fail2ban\.log .+)$/ },
    { name: 'journalctl', pattern: /^sudo journalctl -u unbound --no-pager -n 5000$/ },
    { name: 'dig', pattern: /^dig @127\.0\.0\.1 .+ \+short$/ },
    { name: 'cron-sync', pattern: new RegExp(`^sudo ${env.projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/backend\\/(999_sync_cron|999_vlan_scheduler)\\.sh .+$`) },
    { name: 'background-script', pattern: /^bash .+ > \/dev\/null 2>&1 &$/ },
    { name: 'misc-safe', pattern: /^(sync|sudo sysctl -w vm\.drop_caches=3)$/ },
    { name: 'nmap-scan', pattern: /^sudo nmap -sn -n --min-rate 1000 .+$/ },
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

export const read = async (path: string): Promise<string> => {
    try {
        if (fs.existsSync(path)) return fs.readFileSync(path, 'utf-8').trim();
    } catch {}
    return '';
};
