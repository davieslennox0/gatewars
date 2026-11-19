#!/usr/bin/env bash
# Phase 0 exploration on an anvil BSC fork: create a processor, mint transistors, tape out TFT.
set -u
export PATH=$HOME/.foundry/bin:$PATH
R=http://127.0.0.1:8545
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil default key #0 (public test key)
ME=$(cast wallet address $PK)
F=0x68224F668083c29e9800Be2a646d42d18cedF7e2
echo "deployFee $(cast call $F 'deployFee()(uint256)' --rpc-url $R) protocolFee $(cast call $F 'protocolFee()(uint256)' --rpc-url $R)"
N0=$(cast call $F 'cpuCount()(uint256)' --rpc-url $R)
DF=$(cast call $F 'deployFee()(uint256)' --rpc-url $R)
cast send $F 'createCPU(string,string,string,uint256,uint256)' "GateWars Bench" "GWB" "phase0" 1000000000000 1000000 --value $DF --private-key $PK --rpc-url $R --json | jq -r '.status+" gas "+.gasUsed'
CPU=$(cast call $F 'cpuAt(uint256)(address)' $N0 --rpc-url $R); echo CPU $CPU
T=$(cast call $CPU 'transistors()(address)' --rpc-url $R); echo T $T
for s in 'mintPrice()(uint256)' 'supplyCap()(uint256)' 'protocolFee()(uint256)' 'creator()(address)' 'cpuName()(string)'; do echo "  $s $(cast call $T $s --rpc-url $R)"; done
