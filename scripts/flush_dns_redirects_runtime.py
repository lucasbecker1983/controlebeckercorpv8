#!/usr/bin/env python3
from __future__ import annotations

import subprocess


RULES = [
    ["-i", "enp6s0.10", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.10", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.30", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.30", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.40", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.40", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.50", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.50", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.70", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.70", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.80", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.80", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.99", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-i", "enp6s0.99", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-d", "208.67.222.222/32", "-i", "enp6s0.10", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-d", "208.67.222.222/32", "-i", "enp6s0.10", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-d", "208.67.220.220/32", "-i", "enp6s0.10", "-p", "udp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
    ["-d", "208.67.220.220/32", "-i", "enp6s0.10", "-p", "tcp", "--dport", "53", "-j", "REDIRECT", "--to-ports", "53"],
]


def delete_all(rule: list[str]) -> int:
    removed = 0
    while True:
        result = subprocess.run(["iptables", "-t", "nat", "-D", "PREROUTING", *rule], capture_output=True, text=True)
        if result.returncode != 0:
            return removed
        removed += 1


def main() -> None:
    removed_total = 0
    for rule in RULES:
        removed_total += delete_all(rule)
    print(removed_total)


if __name__ == "__main__":
    main()
