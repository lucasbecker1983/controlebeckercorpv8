export const MANAGED_BLOCKING_VLAN_IDS = [10, 30, 50, 70] as const;

export const MANAGED_BLOCKING_VLAN_SET = new Set<number>(MANAGED_BLOCKING_VLAN_IDS);

export const INTERNAL_DNS_BY_VLAN: Record<number, string> = {
    10: '192.168.10.1',
    30: '192.168.30.1',
    50: '192.168.50.1',
    70: '192.168.70.1',
};

export const MANAGED_VLAN_SQL_LIST = `
    SELECT vlan_id
    FROM vlan_policies
    WHERE vlan_id BETWEEN 1 AND 4094
      AND exempt = FALSE
      AND blocking_enabled = TRUE
      AND monitoring_enabled = TRUE
`;

export const isManagedBlockingVlan = (value: unknown): value is number => {
    const vlanId = Number(value);
    return Number.isInteger(vlanId) && vlanId > 0 && vlanId <= 4094;
};

export const extractVlanIdFromIp = (value: string | null | undefined) => {
    const ip = String(value || '').trim();
    const match = ip.match(/^192\.168\.(\d+)\.\d+$/);
    return match ? Number(match[1]) : null;
};

export const isManagedBlockingIp = (value: string | null | undefined) => {
    const vlanId = extractVlanIdFromIp(value);
    return vlanId !== null && isManagedBlockingVlan(vlanId);
};

export const getInternalDnsForVlan = (vlanId: number | null | undefined) => {
    if (!isManagedBlockingVlan(vlanId)) return null;
    return INTERNAL_DNS_BY_VLAN[vlanId] || null;
};

export const getGatewayFromSubnet = (subnetCidr: string | null | undefined) => {
    const subnet = String(subnetCidr || '').trim();
    const match = subnet.match(/^(\d+\.\d+\.\d+)\.0\/\d+$/);
    return match ? `${match[1]}.1` : null;
};

export const filterManagedVlans = <T extends { vlan_id: number }>(rows: T[]) =>
    rows.filter((row) => isManagedBlockingVlan(row.vlan_id));

export const isOperationalVlan = (row: {
    vlan_id?: number | null;
    exempt?: boolean | null;
    blocking_enabled?: boolean | null;
    monitoring_enabled?: boolean | null;
}) => isManagedBlockingVlan(row.vlan_id)
    && row.exempt !== true
    && row.blocking_enabled !== false
    && row.monitoring_enabled !== false;

export const filterOperationalVlans = <T extends {
    vlan_id: number;
    exempt?: boolean | null;
    blocking_enabled?: boolean | null;
    monitoring_enabled?: boolean | null;
}>(rows: T[]) => rows.filter((row) => isOperationalVlan(row));
