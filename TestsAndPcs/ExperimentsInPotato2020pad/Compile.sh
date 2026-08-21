#!/bin/sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_PATH="$SCRIPT_DIR/../../Assembler"
Tool2In1="$TOOLS_PATH/pulsarToolchain.js"
Launch="$(command -v node)"

cp "$TOOLS_PATH/../CpuSource/BuildCpu/PackedCpu.v" "$SCRIPT_DIR/PCCore.v"

$Launch $Tool2In1 --asm    \
        "$SCRIPT_DIR/BasicContinuation.s" \
        -out "$SCRIPT_DIR/FirmwareHex.hex" -f hex \
        --asm				\
        "$SCRIPT_DIR/BasicContinuation.s" \
        -out "$SCRIPT_DIR/FirmwareHex.dec" -f decimal

$Launch $Tool2In1 --dis    \
        "$SCRIPT_DIR/FirmwareHex.hex" \
        -out "$SCRIPT_DIR/FirmwareHexDis.asm" -f hex \