#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

npx esbuild "$SCRIPT_DIR/Assembler/Pulsar3264toolchain.js" --bundle --platform=node --format=esm "--outfile=$SCRIPT_DIR/Assembler/pulsarToolchain.js"
$SHELL "$SCRIPT_DIR/CpuSource/LinkCpu.sh"

$SHELL "$SCRIPT_DIR/TestsAndPcs/ExperimentsInPotato2020pad/Compile.sh"