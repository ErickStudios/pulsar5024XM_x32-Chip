
// 2P D:(X:Y) XX YY = OP D,X,Y
export function ReprModi(t, byte) {
    if (t == 0) {
        let registers = [
            undefined,
            undefined,
            'sp',
            'r0',
            'r1',
            'r2',
            'r3',
            'r4',
            'r5',
            'r6',
            'lnk',
            'bp',
            'ip',
            'r7',
            'r8',
            'r9'
        ]
        if ((byte & 0xF) <= 15)
            return registers[byte & 0xF];
    }
    if (t == 1) {
        return `i(${byte.toString()})`
    }
    if (t == 2) {
        return byte.toString();
    }
    if (t == 3) {
        if (byte >= 0 && byte <= 7)
            return String.fromCharCode(byte + 97) + "s";
    }
}

export function EmitOpr(bytes) {
    let oprInd = bytes[0] & 0xF;
    let oprDex = [
        'add',
        'sub',
        'mul',
        'div',
        'and',
        'or',
        'shr',
        'shl'
    ]
    if (oprInd >= (oprDex.length)) return;
    let oprName = oprDex[oprInd];
    let opr1T = (bytes[1] >> 2) & 0b11;
    let opr2T = (bytes[1] & 0b11);
    let oprDT = 0;
    let oprD = (bytes[1] >> 4) & 0xF;
    let opr1 = bytes[2];
    let opr2 = bytes[3];
    let repr1 = ReprModi(oprDT, oprD);
    if (!repr1) return;
    let repr2 = ReprModi(opr1T, opr1);
    if (!repr2) return;
    let repr3 = ReprModi(opr2T, opr2);
    if (!repr3) return;

    return `${oprName} ${repr1}, ${repr2}, ${repr3}`;
}

export function TryInmOprs(bytes) {
    if (bytes[1] == 0xFF) {
        if (bytes[2] == 0x1) {
            return `slcinm ${bytes[3]}`;
        }
        else if (bytes[2] == 0x2) {
            let repr1 = ReprModi(0, bytes[3]);
            if (!repr1) return;
            return `ltbl ${repr1}`
        }
        else if (bytes[2] == 0x3) {
            return `int ${bytes[3]}`
        }
        else if ((bytes[2] & 0xF0) == 0x30) {
            let repr1 = ReprModi((bytes[3] >> 4) & 0xF, bytes[3] & 0xF);
            if (!repr1) return;
            return `gb ${bytes[2] & 0x0F} ${repr1}`
        }
        else if (bytes[2] == 0xFF) {
            if (bytes[3] == 0x1) {
                return `rstinm`;
            }
            else if ((bytes[3] & 0xF0) == 0x20) {
                let repr1 = ReprModi(0, bytes[3] & 0xF);
                if (!repr1) return;
                return `calc ${repr1}`
            }
            else if (bytes[3] == 0x2) {
                return `iret`
            }
            else if (bytes[3] == 0x3) {
                return `hlt`
            }
        }
    }
    else if ((bytes[1] & 0xF0) == 0x10) {
        let inumba = bytes[1] & 0xF;
        if (inumba == 2) {
            return `addinmb2 ${bytes[2]}, ${bytes[3]}`;
        }
        else if (inumba == 1) {
            return `addinmb ${bytes[2]}`;
        }
    }
    else if ((bytes[1] & 0xF0) == 0x40) {
        let repr1 = ReprModi(0, bytes[2] & 0xF);
        if (!repr1) return;
        return `linm ${repr1}, ${bytes[3]}`
    }
    else if ((bytes[1] & 0xF0) == 0x30) {
        let repr1 = ReprModi((bytes[2] & 0xF0) >> 4, bytes[2] & 0xF);
        if (!repr1) return;
        return `ifm${(bytes[1] & 0xF) * 8} ${repr1}, ${bytes[3]}`
    }
    else if (bytes[1] == 0x5) {
        let repr1 = ReprModi(3, bytes[2]);
        if (!repr1) return;
        let repr2 = ReprModi(0, bytes[3] & 0xF);
        if (!repr2) return;
        return `srw ${repr1}, ${repr2}`
    }
    else if ((bytes[1] & 0xF0) == 0x50) {
        let repr1 = ReprModi(3, bytes[1] & 0xF);
        if (!repr1) return;
        let repr2 = ReprModi(0, bytes[2]);
        if (!repr2) return;
        let repr3 = ReprModi(0, bytes[3]);
        if (!repr3) return;
        return `srr ${repr1}:${repr2}, ${repr3}`
    }
}

export function EmitDis(bytes) {
    if ((bytes[0] & 0xF0) == 0x20) {
        return EmitOpr(bytes);
    }
    else if (bytes[0] == 1) {
        return TryInmOprs(bytes);
    }
    else if (bytes[0] == 2) {
        if ((bytes[1] & 0xF0) == 0x10) {
            let repr1 = ReprModi(0, bytes[1] & 0xF);
            if (!repr1) return;
            let repr2 = ReprModi(bytes[2] & 0xF, bytes[3]);
            if (!repr2) return;
            return `mwr${((bytes[2] & 0xF0) >> 4) * 8} ${repr1}, ${repr2}`
        }
    }
    //return `dd ${(bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | (bytes[3])}`;
}

/** @param {number[]} codeBytes  */
export function DisCode(codeBytes) {
    let codeComplA = [];
    let count = 0;

    // Función auxiliar para vaciar ceros acumulados como 'reserve'
    const flushReserves = () => {
        if (count > 0) {
            codeComplA.push(`reserve ${count}` + ` ; 0x${index.toString(16)}`);
            count = 0;
        }
    };

    let index = 0;
    while (index < codeBytes.length) {
        // Asegurarnos de que queden al menos 4 bytes para una instrucción
        if (index + 3 < codeBytes.length) {
            const codeInstr = codeBytes.slice(index, index + 4);
            const codeRepr = EmitDis(codeInstr);

            if (codeRepr) {
                flushReserves(); // Vaciar ceros pendientes antes de la instrucción
                codeComplA.push(codeRepr + `; 0x${index.toString(16)}`);
                index += 4; // ¡Avanzamos los 4 bytes exactos de la instrucción!
                continue;
            }
        }

        // Si no es una instrucción válida:
        let currentByte = codeBytes[index];
        if (currentByte === 0) {
            count++;
            index++;
        } else {
            flushReserves(); // Si había ceros acumulados, los imprimimos primero
            codeComplA.println?.() || codeComplA.push(`db 0x${currentByte.toString(16).padStart(2, '0')}` + ` ; 0x${index.toString(16)}`);
            index++;
        }
    }
    
    flushReserves(); // Por si el archivo termina en ceros
    return codeComplA.join("\n");
}