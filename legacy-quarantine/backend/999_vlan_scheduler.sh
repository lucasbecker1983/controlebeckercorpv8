#!/bin/bash
VLAN=$1
ACTION=$2
INTERFACE="enp6s0.$VLAN"

if [ "$ACTION" == "open" ]; then
    sudo iptables -D FORWARD -i $INTERFACE -j DROP 2>/dev/null
    sudo iptables -D FORWARD -o $INTERFACE -j DROP 2>/dev/null
    logger -t BECKERCORP "🌐 VLAN $VLAN ( $INTERFACE ) - ABERTA"
elif [ "$ACTION" == "close" ]; then
    sudo iptables -D FORWARD -i $INTERFACE -j DROP 2>/dev/null
    sudo iptables -I FORWARD -i $INTERFACE -j DROP
    sudo iptables -I FORWARD -o $INTERFACE -j DROP
    logger -t BECKERCORP "🚫 VLAN $VLAN ( $INTERFACE ) - FECHADA"
fi
