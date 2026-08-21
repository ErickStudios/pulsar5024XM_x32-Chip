
// p3264tools --cc file.c --as file.asm file.bin

import { argv, exit } from "node:process";
import {LibraryAssembler as p3264asm } from "./AsmLibrary/StandardAssembler.js";
import * as p64cc from "./AsmLibrary/Pulsar64CCompiler.js";
import * as fileSystem from "node:fs";
import {DisCode} from "./AsmLibrary/Dis64.js"

let debug = false;

let cContext = new p64cc.CtxTempExp();

// Arguments
let Arguments = ['--c','--asm', '--dis'];

// ArgumentIndex
let argsIndex = 2;

// Peek Argument
function Peek() {
    return argv[argsIndex];
}

// Consume Argument
function Consume() {
    return argv[argsIndex++];
}

let ctx = {
    '--asm': {
        active:     false,
        inFiles:    [],
        outFile:    'a.hex',
        format:     'hex',
    },
    '--dis': {
        active:     false,
        inFiles:    [],
        outFile:    'a.hex',
        format:     'hex',
    },
    '--c': {
        active:     false,
        inFiles:    [],
        outFile:    'out.asm'
    },
    currentMode: 'list'
};

// Convert C File To Asm
function ConvertCFileToAsm(filePath) {
    let asmFile = filePath;
    let asmFileContent = fileSystem.readFileSync(asmFile, 'utf-8');
    let tok = p64cc.tokenize(asmFileContent);
    let par = p64cc.parse(tok, cContext);
    let result = p64cc.codeGen(par);
    return result;
}

function UnsiA() {
    ctx[ctx.currentMode].active = false;

    if (ctx.currentMode == '--c') {
        let asmGigantFile = "";
        let ar = ctx[ctx.currentMode].inFiles

        ar.forEach((v) => {
            asmGigantFile += ConvertCFileToAsm(v) + "\n";
        })
        
        cContext = new p64cc.CtxTempExp();
        fileSystem.writeFileSync(ctx[ctx.currentMode].outFile, asmGigantFile);
    }
    else if (ctx.currentMode == '--dis') {
        let asmGigantFile = "";
        let ar = ctx[ctx.currentMode].inFiles;

        asmGigantFile = Buffer.from(fileSystem.readFileSync(ar[0], 'ascii'), 'ascii') ;

        let outpudFile = ctx["--dis"].outFile
        let hex = ""
        
        if (ctx["--dis"].format === 'decimal' || ctx["--dis"].format === 'hex') {
            let nums = asmGigantFile.toString().split(/\s+/).map(n => Number.parseInt(n, ctx["--dis"].format === 'decimal' ? 10 : 16));
            hex = DisCode(nums);
        }
        else if (ctx["--dis"].format === 'flat') {
            let nums = Array.from(Uint8Array.from(asmGigantFile))
            hex = DisCode(nums);
        }
        
        fileSystem.writeFileSync(outpudFile, hex);
    }
    else if (ctx.currentMode == '--asm') {
        let asmGigantFile = "";
        let ar = ctx[ctx.currentMode].inFiles;

        ar.forEach((v) => {
            asmGigantFile += fileSystem.readFileSync(v) + "\n";
        })

        let outpudFile = ctx["--asm"].outFile
        let resulta = p3264asm.asm.assembleCode(asmGigantFile);
        let result = resulta.result;
        let hex = result.map(b => b.toString(16).padStart(2, '0')).join('\n');

        if (debug) console.log(resulta.context)

        if (ctx["--asm"].format === 'decimal') {
            hex = result.map(b => b.toString()).join('\n');
        }
        else if (ctx["--asm"].format === 'flat') {
            fileSystem.writeFileSync(outpudFile, Buffer.from(result));
            return
        }
        
        fileSystem.writeFileSync(outpudFile, hex);
    }
}

// Check
function Check() {
    if (Arguments.includes(Peek())) {
        if (ctx.currentMode in ctx) {
            UnsiA();
        }

        let modeActive = Consume();
        ctx[modeActive].active = true;
        ctx.currentMode = modeActive;

        if ('inFiles' in ctx[modeActive] && Array.isArray(ctx[modeActive].inFiles)) {
            ctx[modeActive].inFiles = [];
        }

        if (modeActive == '--c') {
            ctx['--c'].outFile = 'out.asm';
        }
        else if (modeActive == '--dis') {
            ctx["--dis"].format = "hex";
        }
    }
    if (Peek() == "--dbg") {
        Consume();
        debug = true;
    }
    else if (ctx.currentMode === '--c') {
        if (Peek() === '-out') {
            Consume();
            let ofa = Consume();
            ctx["--c"].outFile = ofa;
        }
        else {
            let fd = Consume();
            ctx["--c"].inFiles.push(fd);
        }
    }
    else if (ctx.currentMode === '--asm') {
        if (Peek() === '-out') {
            Consume();
            let ofa = Consume();
            ctx["--asm"].outFile = ofa;
        }
        else if (Peek() === '-f') {
            Consume();
            let ofa = Consume();
            ctx["--asm"].format = ofa;
        }
        else {
            let fd = Consume();
            ctx["--asm"].inFiles.push(fd);
        }
    }
    else if (ctx.currentMode === '--dis') {
        if (Peek() === '-out') {
            Consume();
            let ofa = Consume();
            ctx["--dis"].outFile = ofa;
        }
        else if (Peek() === '-f') {
            Consume();
            let ofa = Consume();
            ctx["--dis"].format = ofa;
        }
        else {
            let fd = Consume();
            ctx["--dis"].inFiles.push(fd);
        }
    }
}

while (argsIndex < argv.length) {
    Check();
}
UnsiA()
