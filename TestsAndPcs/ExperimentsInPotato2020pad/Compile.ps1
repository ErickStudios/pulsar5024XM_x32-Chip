$ProjectDir ="$PSScriptRoot/../../"
$AsmTools   ="$ProjectDir/Assembler"
$Launcher   ="node"

& $Launcher "$AsmTools/pulsarToolchain.js" `
        --dbg                               `
        --asm                                 `
            "$PSScriptRoot/BasicContinuation.s"   `
            -f hex -out "$PSScriptRoot/FirmwareHex.hex" `
        --asm                                 `
            "$PSScriptRoot/BasicContinuation.s"   `
            -f decimal -out "$PSScriptRoot/FirmwareHex.dec"

& $Launcher "$AsmTools/pulsarToolchain.js" `
        --dis                                 `
            "$PSScriptRoot/FirmwareHex.hex"   `
            -f hex -out "$PSScriptRoot/FirmwareHexDis.asm"