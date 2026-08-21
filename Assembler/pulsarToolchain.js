// Assembler/Pulsar3264toolchain.js
import { argv, exit } from "node:process";

// Assembler/AsmLibrary/StandardAssembler.js
var Context = class {
  constructor() {
    this.symbols = /* @__PURE__ */ new Map();
    this.equs = /* @__PURE__ */ new Map();
    this.codelen = 0;
    this.orgIn = 0;
    this.result = [];
    this.in64 = false;
  }
};
function tokenize(code) {
  const tokens = [];
  let i = 0;
  const isLetter = (c) => /[a-zA-Z_]/.test(c);
  const isNumber = (c) => /[0-9]/.test(c);
  while (i < code.length) {
    let c = code[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === "'") {
      let quoteType = c;
      let value = "";
      i++;
      while (i < code.length && code[i] !== quoteType) {
        value += code[i++];
      }
      i++;
      for (let a = 0; a < value.length; a++) {
        tokens.push({ type: "number", value: value.charCodeAt(a) });
        if (a !== value.length - 1) {
          tokens.push({ type: "symbol", value: "," });
        }
      }
      continue;
    }
    if (isLetter(c)) {
      let value = "";
      while (i < code.length && (isLetter(code[i]) || isNumber(code[i]))) {
        value += code[i++];
      }
      tokens.push({ type: "identifier", value });
      continue;
    }
    if (isNumber(c)) {
      let value = "";
      while (i < code.length && (isNumber(code[i]) || "ABCDEFabcdef".includes(code[i]))) {
        value += code[i++];
      }
      if (i < code.length && code[i].toLowerCase() === "h") {
        i++;
        value = parseInt(value, 16);
      } else if (value === "0" && code[i] === "x") {
        i++;
        let value2 = "";
        while (i < code.length && (isNumber(code[i]) || ["A", "B", "C", "D", "E", "F"].includes(code[i].toUpperCase()))) {
          value2 += code[i++];
        }
        value = parseInt(value2, 16);
      } else {
        value = Number(value);
      }
      tokens.push({
        type: "number",
        value
      });
      continue;
    }
    tokens.push({ type: "symbol", value: c });
    i++;
  }
  return tokens;
}
function toBigEndianBytes(n, x) {
  let bytes = [];
  while (n > 0) {
    bytes.push(n & 255);
    n = n >>> 8;
  }
  bytes.reverse();
  while (bytes.length < x) {
    bytes.unshift(0);
  }
  return bytes;
}
function AssembleLineWithoutContext(line, ctx2, len = null) {
  if (len == null) {
    len = ctx2.codelen;
  }
  let tokens = tokenize(line);
  let i = 0;
  let result = [];
  function peek() {
    return tokens[i];
  }
  function fmt7(a) {
    return a.toUpperCase();
  }
  function fmt8(a) {
    return fmt7(a.value);
  }
  function psfmt7() {
    return parseSize(fmt8(consume()));
  }
  function psfmt72(a) {
    return a.value !== void 0 ? parseSize(fmt8(a)) : void 0;
  }
  function peek7() {
    return typeof peek().value === "string" ? fmt7(peek().value) : false;
  }
  function consume() {
    let axa = peek();
    i++;
    return axa;
  }
  function expect(value) {
    let t = consume();
    if (!t || t.value !== value) {
      throw new Error("Expected " + value);
    }
  }
  function parseSize(name) {
    switch (fmt7(name)) {
      case "BYTE":
        return 1;
      case "WORD":
        return 2;
      case "DWORD":
        return 4;
      case "QWORD":
        return 8;
      case "DB":
        return 1;
      case "DW":
        return 2;
      case "DD":
        return 4;
      case "DQ":
        return 8;
    }
  }
  function parsePrimary() {
    if (peek().value === "[") {
      consume();
      let v1 = parsePrimary();
      if (peek7() === "IN") {
        consume();
        let v2 = parsePrimary();
        let result2 = v2.value + (v1.value - ctx2.orgIn);
        expect("]");
        return { type: "inm", value: result2 };
      } else if (peek7() === "SEGMENT") {
        consume();
        let v2 = parsePrimary();
        expect(":");
        let v3 = parsePrimary();
        let result2 = v3.value - v2.value + v1.value;
        expect("]");
        return { type: "inm", value: result2 };
      } else if (peek7() === "OUT") {
        consume();
        let v2 = parsePrimary();
        let result2 = v1.value - v2.value + ctx2.orgIn;
        expect("]");
        return { type: "inm", value: result2 };
      }
    }
    if (peek().value === "(") {
      consume();
      let x = parsePrimary();
      let opr = consume().value;
      let y = parsePrimary();
      x = parseIdent(x.value);
      y = parseIdent(y.value);
      expect(")");
      let bz = 0;
      if (opr === "+") {
        bz = Math.ceil(x + y);
      } else if (opr === "-") {
        bz = Math.ceil(x - y);
      } else if (opr === "/") {
        bz = Math.ceil(x / y);
      } else if (opr === "*") {
        bz = Math.ceil(x * y);
      }
      return { type: "inm", value: bz };
    }
    if (peek().value === "$") {
      consume();
      return { type: "inm", value: len !== null ? len : 0 };
    }
    if (typeof peek().value === "number") return { type: "inm", value: consume().value };
    if (peek7() === "SP") {
      consume();
      return { type: "stack" };
    }
    let ident;
    if (peek().type === "identifier") {
      ident = consume();
      if (fmt7(ident.value) === "__ORG") {
        return { type: "inm", value: ctx2.orgIn };
      }
      if (fmt7(ident.value) === "OUT") {
        return { type: "symbol", value: "cpu.registers.result" };
      }
      if (fmt7(ident.value) === "PX") {
        return { type: "symbol", value: "cpu.registers.ptr" };
      }
      if (fmt7(ident.value) === "AX") {
        return { type: "symbol", value: "cpu.registers.ax" };
      }
      if (fmt7(ident.value) === "BX") {
        return { type: "symbol", value: "cpu.registers.bx" };
      }
      if (fmt7(ident.value) === "CX") {
        return { type: "symbol", value: "cpu.registers.cx" };
      }
      if (fmt7(ident.value) === "DX") {
        return { type: "symbol", value: "cpu.registers.dx" };
      }
      if (fmt7(ident.value) === "AH") {
        return { type: "symbol", value: "cpu.registers.ah" };
      }
      if (fmt7(ident.value) === "AL") {
        return { type: "symbol", value: "cpu.registers.al" };
      }
      if (fmt7(ident.value) === "BH") {
        return { type: "symbol", value: "cpu.registers.bh" };
      }
      if (fmt7(ident.value) === "BL") {
        return { type: "symbol", value: "cpu.registers.bl" };
      }
      if (fmt7(ident.value) === "SS") {
        return { type: "symbol", value: "cpu.registers.ss" };
      }
      if (ctx2.symbols.has(ident.value)) {
        return { type: "inm", value: ctx2.symbols.get(ident.value) + ctx2.orgIn };
      }
      if (ctx2.equs.has(ident.value)) {
        return { type: "inm", value: ctx2.equs.get(ident.value) };
      }
      return { type: "inm", value: 0 };
    }
    if (ctx2.symbols.has(ident.value)) {
      return { type: "inm", value: ctx2.symbols.get(ident.value) + ctx2.orgIn };
    }
    if (ctx2.equs.has(ident.value)) {
      return { type: "inm", value: ctx2.equs.get(ident.value) };
    }
    return { type: "inm", value: 0 };
  }
  function movBytea(sizeof) {
    result.push(4);
    result.push(8);
    result.push(sizeof, 0);
  }
  function parseSymbol(name) {
    if (name === "cpu.registers.result") {
      return 0;
    }
    if (name === "cpu.registers.data") {
      return 1;
    }
    if (name === "cpu.registers.ptr") {
      return 2;
    }
    if (name === "cpu.registers.ax") {
      return 3;
    }
    if (name === "cpu.registers.bx") {
      return 4;
    }
    if (name === "cpu.registers.cx") {
      return 5;
    }
    if (name === "cpu.registers.dx") {
      return 6;
    }
    if (name === "cpu.registers.ah") {
      return 7;
    }
    if (name === "cpu.registers.al") {
      return 8;
    }
    if (name === "cpu.registers.bh") {
      return 9;
    }
    if (name === "cpu.registers.bl") {
      return 10;
    }
    if (name === "cpu.registers.ss") {
      return 11;
    }
  }
  function operandParse(op) {
    if (fmt7(op) == "SP") return { type: "stack", bind: 2 };
    if (fmt7(op) == "INM") return { type: "inm", bind: 0 };
    if (fmt7(op) == "REG") return { type: "reg", bind: 1 };
  }
  function parseJmpType(id, ignore_start = false) {
    if (!ignore_start) {
      consume();
      result.push(7);
    }
    let sizeof = 4;
    if (peek7() === "SHORT") {
      consume();
      sizeof = 2;
    }
    result.push(sizeof);
    let expr = parsePrimary();
    if (expr.type === "inm") {
      result.push(0);
    } else if (expr.type == "symbol") {
      result.push(1);
    } else if (expr.type == "stack") {
      result.push(2);
    }
    result.push(id);
    if (expr.type === "inm") {
      result.push(...toBigEndianBytes(expr.value, sizeof));
    } else if (expr.type == "symbol") {
      result.push(parseSymbol(expr.value));
    }
  }
  function parseCmp(sizeof) {
    consume();
    result.push(6);
    result.push(sizeof);
    let operand1 = parsePrimary();
    expect(",");
    let operand2 = parsePrimary();
    result.push((operand1.type == "inm" ? 0 : operand1.type == "symbol" ? 1 : operand1.type == "stack" ? 2 : 0) << 4 | (operand2.type == "inm" ? 0 : operand2.type == "symbol" ? 1 : operand2.type == "stack" ? 2 : 0));
    if (operand1.type === "inm") {
      result.push(...toBigEndianBytes(operand1.value, sizeof));
    } else if (operand1.type == "symbol") {
      result.push(parseSymbol(operand1.value));
    }
    if (operand2.type === "inm") {
      result.push(...toBigEndianBytes(operand2.value, sizeof));
    } else if (operand2.type == "symbol") {
      result.push(parseSymbol(operand2.value));
    }
  }
  function parseOperation(id) {
    consume();
    result.push(4);
    result.push(id);
    expect("-");
    let sizeof = parseSize(consume().value);
    result.push(sizeof);
    expect("-");
    let operand1 = operandParse(consume().value);
    expect("-");
    let operand2 = operandParse(consume().value);
    result.push(operand1.bind << 4 | operand2.bind);
    let casterA = (operand) => {
      if (operand.type !== "stack") {
        let primary = parsePrimary();
        if (primary.type === "symbol" && operand.type === "reg") {
          result.push(parseSymbol(primary.value));
          return true;
        }
        if (primary.type === "inm" && operand.type === "inm") {
          result.push(...toBigEndianBytes(primary.value, sizeof));
          return true;
        }
      }
      return false;
    };
    let a0 = casterA(operand1);
    if (a0 && operand2.type !== "stack") expect(",");
    let a1 = casterA(operand2);
  }
  function parseIdent(value) {
    if (typeof value === "number") return value;
    else if (ctx2.symbols.has(value)) return ctx2.symbols.get(value);
    return 0;
  }
  function parseStos(sizeof) {
    consume();
    result.push(8);
    let expr = parsePrimary();
    if (expr.type === "inm") {
      result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
    } else if (expr.type == "symbol") {
      result.push(1, sizeof, parseSymbol(expr.value));
    }
  }
  function parse64bitReg() {
    let f3 = fmt7(consume().value);
    if (f3 === "SP") return 2;
    if (f3 === "R0") return 3;
    if (f3 === "R1") return 4;
    if (f3 === "R2") return 5;
    if (f3 === "R3") return 6;
    if (f3 === "R4") return 7;
    if (f3 === "R5") return 8;
    if (f3 === "R6") return 9;
    if (f3 === "LNK") return 10;
    if (f3 === "BP") return 11;
    if (f3 === "IP") return 12;
    if (f3 === "R7") return 13;
    if (f3 === "R8") return 14;
    if (f3 === "R9") return 15;
    return 0;
  }
  function parseSegmentRegister() {
    let f3 = fmt7(consume().value);
    if (f3 === "AS") return 0;
    if (f3 === "BS") return 1;
    if (f3 === "CS") return 2;
    if (f3 === "DS") return 3;
    if (f3 === "ES") return 4;
    if (f3 === "FS") return 5;
    if (f3 === "GS") return 6;
    return 0;
  }
  function parse64bitExpr() {
    if (typeof peek().value === "number") {
      return { t: "n", n: consume().value };
    }
    if (peek7() == "I") {
      consume();
      expect("(");
      let a = parseIdent(parsePrimary().value);
      expect(")");
      return { t: "i", i: a };
    }
    let reg = parse64bitReg();
    if (reg !== 0) {
      return { t: "s", s: reg };
    }
    i--;
    return { t: "a", a: parseIdent(parsePrimary().value) };
  }
  function parseJmpIfFlag64(flag) {
    consume();
    let expr = parse64bitExpr();
    if (expr.t === "a") {
      result.push(...AssembleLineWithoutContext(
        `li64 lnk, ${expr.a} gb ${flag.toString()} lnk`,
        ctx2,
        len
      ));
    } else {
      result.push(
        1,
        255,
        48 | flag
      );
      if (expr.t === "s") {
        result.push(0 | expr.s);
      } else if (expr.t === "i") {
        result.push(16 | expr.i);
      }
    }
  }
  function parseInmFromMem(sizeof) {
    consume();
    result.push(1);
    result.push(48 | sizeof);
    let ab = parseIdent(parsePrimary().value);
    expect(",");
    let expr = parse64bitExpr();
    if (expr.t === "s") {
      result.push(0 | expr.s);
    } else if (expr.t === "i") {
      result.push(16 | expr.i);
    }
    result.push(ab);
  }
  function parse64bitOperation(op, sizeof) {
    consume();
    result.push(32 | op);
    let rega = parse64bitReg();
    expect(",");
    let expr1 = parse64bitExpr();
    expect(",");
    let expr2 = parse64bitExpr();
    let expr1n = [0, 0];
    let expr2n = [0, 0];
    let x = (a, b) => {
      if (a.t === "s") {
        b[0] = 0;
        b[1] = a.s;
      } else if (a.t === "i") {
        b[0] = 1;
        b[1] = a.i;
      } else if (a.t === "n") {
        b[0] = 2;
        b[1] = a.n;
      } else if (a.t === "a") {
        b[0] = 2;
        b[1] = a.a;
      }
    };
    x(expr1, expr1n);
    x(expr2, expr2n);
    let nib = expr1n[0] << 2 | expr2n[0];
    let coda = rega << 4 | nib;
    result.push(coda, expr1n[1], expr2n[1]);
  }
  function parseMemWrite(sizeof) {
    result.push(2);
    consume();
    result.push(16 | parse64bitReg());
    expect(",");
    let expr = parse64bitExpr();
    if (expr.t === "s") {
      result.push(sizeof << 4 | 0, expr.s);
    } else if (expr.t === "i") {
      result.push(sizeof << 4 | 1, expr.i);
    }
  }
  function parseLoadAddr(sizeof) {
    consume();
    let dir = parseIdent(parsePrimary().value);
    const hexCompleto = dir.toString(16).padStart(sizeof * 2, "0");
    const bytes = hexCompleto.match(/.{1,2}/g);
    const paresDeBytes = [];
    for (let i2 = 0; i2 < bytes.length; i2 += 2) {
      paresDeBytes.push(["0" + bytes[i2] + "h", "0" + bytes[i2 + 1] + "h"]);
    }
    let codeExpand = "";
    paresDeBytes.forEach((v) => {
      codeExpand += `addinmb2 ${v[0]}, ${v[1]} `;
    });
    result.push(...AssembleLineWithoutContext(codeExpand, ctx2, len));
  }
  function parseCalc() {
  }
  function lvParse(sizeindicator) {
    consume();
    let regAddr = consume().value;
    expect(",");
    let regDst = consume().value;
    result.push(...AssembleLineWithoutContext(`ifm${(sizeindicator * 8).toString()} 04h, ${regAddr} linm ${regDst}, 04h`, ctx2, len));
  }
  function loadInmediate64bits(sizeof) {
    consume();
    let register = consume().value;
    expect(",");
    let valu = parseIdent(parsePrimary().value);
    result.push(...AssembleLineWithoutContext(`slcinm 0Fh rstinm ld${(sizeof * 8).toString()} ${valu.toString()} linm ${register}, 0Fh`, ctx2, len));
  }
  while (i < tokens.length) {
    if (!ctx2.in64 && peek7() === "PUSH") {
      consume();
      result.push(3);
      let sizeof = 4;
      if (peek().value === "-") {
        expect("-");
        sizeof = parseSize(consume().value);
      } else {
        if (peek7() === "SHORT") {
          consume();
          sizeof = 2;
        } else if (peek7() === "NEAR") {
          consume();
          sizeof = 1;
        }
      }
      let expr = parsePrimary();
      if (expr.type === "inm") {
        result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
      } else if (expr.type == "symbol") {
        result.push(1, sizeof, parseSymbol(expr.value));
      }
    } else if (peek7() === "ORG32") {
      consume();
      ctx2.in64 = false;
    } else if (peek7() === "ORG64") {
      consume();
      ctx2.in64 = true;
    } else if (!ctx2.in64 && peek7() === "DBGAC64") {
      consume();
      result.push(11);
    } else if (ctx2.in64 && peek7() === "SLCINM") {
      consume();
      result.push(1, 255, 1, parseIdent(parsePrimary().value));
    } else if (ctx2.in64 && peek7() === "SRW") {
      consume();
      result.push(1, 5, [parseSegmentRegister(), expect(",")][0], parse64bitReg());
    } else if (ctx2.in64 && peek7() === "SRR") {
      consume();
      result.push(1, 80 | [parseSegmentRegister(), expect(":")][0], [parse64bitReg(), expect(",")][0], parse64bitReg());
    } else if (ctx2.in64 && peek7() === "LD64") {
      parseLoadAddr(8);
    } else if (ctx2.in64 && peek7() === "LD32") {
      parseLoadAddr(4);
    } else if (ctx2.in64 && peek7() === "LD16") {
      parseLoadAddr(2);
    } else if (ctx2.in64 && peek7() === "INT") {
      consume();
      result.push(1, 255, 3, consume().value);
    } else if (ctx2.in64 && peek7() === "RSTINM") {
      consume();
      result.push(1, 255, 255, 1);
    } else if (ctx2.in64 && peek7() === "CALC") {
      consume();
      result.push(1, 255, 255, 32 | parse64bitReg());
    } else if (ctx2.in64 && peek7() === "CMP") {
      consume();
      let a0 = consume().value;
      expect(",");
      let a1 = consume().value;
      expect(",");
      let a2 = consume().value;
      result.push(...AssembleLineWithoutContext(`sub ${a0}, ${a1}, ${a2} calc ${a0}`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "INC") {
      consume();
      let a1 = consume().value;
      result.push(...AssembleLineWithoutContext(`add ${a1}, ${a1}, 1`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "DEC") {
      consume();
      let a1 = consume().value;
      result.push(...AssembleLineWithoutContext(`sub ${a1}, ${a1}, 1`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "MOV") {
      consume();
      let a1 = consume().value;
      expect(",");
      let a2 = consume().value;
      let operationXd = {
        base: void 0,
        steps: [],
        siz: 0
      };
      if (a2 == "[") {
        let siz = parseSize(consume().value);
        let base = consume().value;
        operationXd.siz = siz;
        operationXd.base = base;
        while (peek().value !== "]") {
          let operation = consume().value;
          let dicta = {
            "+": "add",
            "-": "sub",
            "*": "mul",
            "/": "div"
          };
          operation = dicta[operation];
          let v3 = parseIdent(parsePrimary().value);
          operationXd.steps.push({
            opcode: operation,
            operand: v3
          });
        }
        expect("]");
        result.push(...AssembleLineWithoutContext(`mov ${a1}, ${operationXd.base}`, ctx2, len));
        operationXd.steps.forEach((v) => {
          result.push(...AssembleLineWithoutContext(`${v.opcode} ${a1}, ${a1}, ${String(v.operand)}`, ctx2, len));
        });
        result.push(...AssembleLineWithoutContext(`lv${operationXd.siz * 8} ${a1}, ${a1}`, ctx2, len));
      } else result.push(...AssembleLineWithoutContext(`add ${a1}, ${a2}, 0`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LEA") {
      consume();
      let a1 = consume().value;
      expect(",");
      expect("[");
      let operationXd = {
        base: void 0,
        steps: [],
        siz: 0
      };
      let base = consume().value;
      operationXd.base = base;
      while (peek().value !== "]") {
        let operation = consume().value;
        let dicta = {
          "+": "add",
          "-": "sub",
          "*": "mul",
          "/": "div"
        };
        operation = dicta[operation];
        let v3 = parseIdent(parsePrimary().value);
        operationXd.steps.push({
          opcode: operation,
          operand: v3
        });
      }
      expect("]");
      result.push(...AssembleLineWithoutContext(`mov ${a1}, ${operationXd.base}`, ctx2, len));
      operationXd.steps.forEach((v) => {
        result.push(...AssembleLineWithoutContext(`${v.opcode} ${a1}, ${a1}, ${String(v.operand)}`, ctx2, len));
      });
    } else if (ctx2.in64 && peek7() === "ENTER") {
      consume();
      let psize = parseIdent(parsePrimary().value);
      result.push(...AssembleLineWithoutContext(`
          push bp
          add bp, sp, 8
          add bp, bp, ${psize.toString()}
          push lnk
        `, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LEAVE") {
      consume();
      result.push(...AssembleLineWithoutContext(`
          pop lnk
          pop bp
        `, ctx2, len));
    } else if (ctx2.in64 && peek7() === "PUSHA") {
      consume();
      result.push(...AssembleLineWithoutContext(`
          push r0
          push r1
          push r2
          push r3
          push r4
          push r5
          push r6
        `, ctx2, len));
    } else if (ctx2.in64 && peek7() === "POPA") {
      consume();
      result.push(...AssembleLineWithoutContext(`
          pop r6
          pop r5
          pop r4
          pop r3
          pop r2
          pop r1
          pop r0
        `, ctx2, len));
    } else if (ctx2.in64 && peek7() === ".") {
      consume();
      let directive = consume().value;
      if (directive.toUpperCase() === "PIC") {
        ctx2.pic = consume().value;
      }
    } else if (ctx2.in64 && peek7() === "MWR8") parseMemWrite(1);
    else if (ctx2.in64 && peek7() === "MWR16") parseMemWrite(2);
    else if (ctx2.in64 && peek7() === "MWR32") parseMemWrite(4);
    else if (ctx2.in64 && peek7() === "MWR64") parseMemWrite(8);
    else if (ctx2.in64 && peek7() === "LV8") lvParse(1);
    else if (ctx2.in64 && peek7() === "LV16") lvParse(2);
    else if (ctx2.in64 && peek7() === "LV32") lvParse(4);
    else if (ctx2.in64 && peek7() === "LV64") lvParse(8);
    else if (ctx2.in64 && peek7() === "IFM8") parseInmFromMem(1);
    else if (ctx2.in64 && peek7() === "IFM16") parseInmFromMem(2);
    else if (ctx2.in64 && peek7() === "IFM32") parseInmFromMem(4);
    else if (ctx2.in64 && peek7() === "IFM64") parseInmFromMem(8);
    else if (ctx2.in64 && peek7() === "RET") {
      consume();
      result.push(...AssembleLineWithoutContext(`jmp lnk`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "ADD") parse64bitOperation(0);
    else if (ctx2.in64 && peek7() === "SUB") parse64bitOperation(1);
    else if (ctx2.in64 && peek7() === "MUL") parse64bitOperation(2);
    else if (ctx2.in64 && peek7() === "DIV") parse64bitOperation(3);
    else if (ctx2.in64 && peek7() === "AND") parse64bitOperation(4);
    else if (ctx2.in64 && peek7() === "OR") parse64bitOperation(5);
    else if (ctx2.in64 && peek7() === "SHR") parse64bitOperation(6);
    else if (ctx2.in64 && peek7() === "SHL") parse64bitOperation(7);
    else if (ctx2.in64 && peek7() === "LI16") loadInmediate64bits(2);
    else if (ctx2.in64 && peek7() === "LI32") loadInmediate64bits(4);
    else if (ctx2.in64 && peek7() === "LI64") loadInmediate64bits(8);
    else if (ctx2.in64 && peek7() === "LADDR") {
      if ("pic" in ctx2) {
        consume();
        let re = parse64bitReg();
        expect(",");
        let dir = parseIdent(parsePrimary().value) - len;
        dir -= 4;
        if (dir < 0) {
          dir = -dir & 8388607 | 8388608;
        }
        result.push(48 | re, ...toBigEndianBytes(dir, 3));
      } else loadInmediate64bits(8);
    } else if (ctx2.in64 && peek7() === "DEREF") {
      consume();
      let r = consume().value;
      result.push(...AssembleLineWithoutContext(`mov ${r}, [qword ${r}]`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LALTS64") {
      consume();
      let r = consume().value;
      result.push(...AssembleLineWithoutContext(`lv64 ${r}, ${r}`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LALTS32") {
      consume();
      let r = consume().value;
      result.push(...AssembleLineWithoutContext(`lv32 ${r}, ${r}`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LALTS16") {
      consume();
      let r = consume().value;
      result.push(...AssembleLineWithoutContext(`lv16 ${r}, ${r}`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LALTS8") {
      consume();
      let r = consume().value;
      result.push(...AssembleLineWithoutContext(`lv8 ${r}, ${r}`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "JIFEQ") parseJmpIfFlag64(0);
    else if (ctx2.in64 && peek7() === "JINEG") parseJmpIfFlag64(1);
    else if (ctx2.in64 && peek7() === "JIPOS") parseJmpIfFlag64(2);
    else if (ctx2.in64 && peek7() === "JITRUE") parseJmpIfFlag64(3);
    else if (ctx2.in64 && peek7() === "JMP") parseJmpIfFlag64(3);
    else if (ctx2.in64 && peek7() === "BL") parseJmpIfFlag64(4);
    else if (ctx2.in64 && peek7() === "JL") parseJmpIfFlag64(1);
    else if (ctx2.in64 && peek7() === "JG") parseJmpIfFlag64(2);
    else if (ctx2.in64 && peek7() === "JZ") parseJmpIfFlag64(0);
    else if (ctx2.in64 && peek7() === "JE") parseJmpIfFlag64(0);
    else if (ctx2.in64 && peek7() === "GB") {
      consume();
      let flag = peek().value;
      parseJmpIfFlag64(flag);
    } else if (ctx2.in64 && peek7() === "PUSH") {
      consume();
      let valpush = consume().value;
      result.push(...AssembleLineWithoutContext(`sub sp, sp, 8`, ctx2, len));
      if (typeof valpush === "number") {
        result.push(...AssembleLineWithoutContext(`mov r6, ${valpush.toString()} mwr64 sp, r6`, ctx2, len));
      } else {
        result.push(...AssembleLineWithoutContext(`mwr64 sp, ${valpush}`, ctx2, len));
      }
    } else if (ctx2.in64 && peek7() === "POP") {
      consume();
      result.push(...AssembleLineWithoutContext(`ifm64 02h, sp add sp, sp, 8 linm ${consume().value}, 02h`, ctx2, len));
    } else if (ctx2.in64 && peek7() === "LTBL") {
      consume();
      result.push(
        1,
        255,
        2,
        parse64bitReg()
      );
    } else if (!ctx2.in64 && peek7() === "IRET") {
      consume();
      result.push(12);
    } else if (ctx2.in64 && peek7() === "IRET") {
      consume();
      result.push(1, 255, 255, 2);
    } else if (ctx2.in64 && peek7() === "HLT") {
      consume();
      result.push(1, 255, 255, 3);
    } else if (ctx2.in64 && peek7() === "ADDINMB2") {
      consume();
      result.push(
        1,
        18,
        [parseIdent(parsePrimary().value), expect(",")][0],
        parseIdent(parsePrimary().value)
      );
    } else if (ctx2.in64 && peek7() === "LINM") {
      consume();
      result.push(
        1,
        64,
        [parse64bitReg(), expect(",")][0],
        parseIdent(parsePrimary().value)
      );
    } else if (!ctx2.in64 && peek7() === "STOSB") parseStos(1);
    else if (!ctx2.in64 && peek7() === "STOSW") parseStos(2);
    else if (!ctx2.in64 && peek7() === "STOSD") parseStos(4);
    else if (!ctx2.in64 && peek7() === "OUT") {
      consume();
      expect("-");
      result.push(8);
      let sizeof = parseSize(consume().value);
      let expr = parsePrimary();
      if (expr.type === "inm") {
        result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
      } else if (expr.type == "symbol") {
        result.push(1, sizeof, parseSymbol(expr.value));
      }
    } else if (!ctx2.in64 && peek7() === "INT") {
      consume();
      expect("-");
      result.push(9);
      let sizeof = parseSize(consume().value);
      let expr = parsePrimary();
      if (expr.type === "inm") {
        result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
      } else if (expr.type == "symbol") {
        result.push(1, sizeof, parseSymbol(expr.value));
      } else if (expr.type == "stack") {
        result.push(2, sizeof);
      }
    } else if (!ctx2.in64 && peek7() === "LEA") {
      consume();
      let sizeof = 4;
      result.push(1);
      if (peek().value == "-") {
        sizeof = parseSize(consume().value);
      }
      let expr = parsePrimary();
      if (expr.type === "inm") {
        result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
      } else if (expr.type == "symbol") {
        result.push(1, sizeof, parseSymbol(expr.value));
      } else if (expr.type == "stack") {
        result.push(2, sizeof);
      }
    } else if (!ctx2.in64 && peek7() === "MOV") {
      consume();
      if (peek().value == "-") {
        consume();
        result.push(4);
        result.push(8);
        let sizeof = parseSize(consume().value);
        result.push(sizeof, 0);
      } else if (peek().value === "[") {
        expect("[");
        let sizeof;
        let expr;
        let sizeof1 = parseSize(consume().value);
        let expr1 = parsePrimary();
        expect("]");
        expect(",");
        let sizeof2 = parseSize(consume().value);
        let expr2 = parsePrimary();
        result.push(1);
        sizeof = sizeof1;
        expr = expr1;
        if (expr.type === "inm") {
          result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
        } else if (expr.type == "symbol") {
          result.push(1, sizeof, parseSymbol(expr.value));
        } else if (expr.type == "stack") {
          result.push(2, sizeof);
        }
        result.push(8);
        sizeof = sizeof2;
        expr = expr2;
        if (expr.type === "inm") {
          result.push(0, sizeof, ...toBigEndianBytes(expr.value, sizeof));
        } else if (expr.type == "symbol") {
          result.push(1, sizeof, parseSymbol(expr.value));
        }
      } else {
        result.push(10);
        let sizeof = 4;
        if (peek7() === "SHORT") {
          consume();
          sizeof = 2;
        } else if (peek7() === "NEAR") {
          consume();
          sizeof = 1;
        }
        let reg = parsePrimary();
        if (reg.type === "symbol") {
          let a = parseSymbol(reg.value);
          expect(",");
          let expr = parsePrimary();
          if (expr.type === "inm") {
            result.push(0, sizeof, a, ...toBigEndianBytes(expr.value, sizeof));
          } else if (expr.type == "symbol") {
            result.push(1, sizeof, a, parseSymbol(expr.value));
          } else if (expr.type == "stack") {
            result.push(2, sizeof, a);
          }
        }
      }
    } else if (!ctx2.in64 && peek7() === "LODSB") [consume(), movBytea(1)];
    else if (!ctx2.in64 && peek7() === "LODSW") [consume(), movBytea(2)];
    else if (!ctx2.in64 && peek7() === "LODSD") [consume(), movBytea(4)];
    else if (!ctx2.in64 && peek7() === "HLT") {
      consume();
      result.push(5);
    } else if (!ctx2.in64 && peek7() === "CMP") {
      consume();
      result.push(6);
      expect("-");
      let sizeof = parseSize(consume().value);
      result.push(sizeof);
      expect("-");
      let operand1 = operandParse(consume().value);
      expect("-");
      let operand2 = operandParse(consume().value);
      result.push(operand1.bind << 4 | operand2.bind);
      let casterA = (operand) => {
        if (operand.type !== "stack") {
          let primary = parsePrimary();
          if (primary.type === "symbol" && operand.type === "reg") {
            result.push(parseSymbol(primary.value));
            return true;
          }
          if (primary.type === "inm" && operand.type === "inm") {
            result.push(...toBigEndianBytes(primary.value, sizeof));
            return true;
          }
        }
        return false;
      };
      let a0 = casterA(operand1);
      if (a0 && operand2.type !== "stack") expect(",");
      let a1 = casterA(operand2);
    } else if (!ctx2.in64 && peek7() === "CMPSB") parseCmp(1);
    else if (!ctx2.in64 && peek7() === "CMPSW") parseCmp(2);
    else if (!ctx2.in64 && peek7() === "CMPSD") parseCmp(4);
    else if (!ctx2.in64 && peek7() === "JMP") {
      consume();
      result.push(7);
      if (peek().value !== "-") {
        parseJmpType(0, true);
      } else {
        expect("-");
        let sizeof = parseSize(consume().value);
        result.push(sizeof);
        expect("-");
        let mode = consume().value;
        let expr = parsePrimary();
        if (expr.type === "inm") {
          result.push(0);
        } else if (expr.type == "symbol") {
          result.push(1);
        } else if (expr.type == "stack") {
          result.push(2);
        }
        if (fmt7(mode) === "CLASIC") {
          result.push(0);
        } else if (fmt7(mode) === "ZERO") {
          result.push(1);
        } else if (fmt7(mode) === "LESS") {
          result.push(2);
        } else if (fmt7(mode) === "GREATER") {
          result.push(3);
        } else if (fmt7(mode) === "CALL") {
          result.push(4);
        }
        if (expr.type === "inm") {
          result.push(...toBigEndianBytes(expr.value, sizeof));
        } else if (expr.type == "symbol") {
          result.push(parseSymbol(expr.value));
        }
      }
    } else if (peek7() === "RESERVE") {
      consume();
      let a = parseIdent(parsePrimary().value);
      result.push(...Array(a).fill(0));
    } else if (!ctx2.in64 && peek7() === "JZ") parseJmpType(1);
    else if (!ctx2.in64 && peek7() === "JL") parseJmpType(2);
    else if (!ctx2.in64 && peek7() === "JG") parseJmpType(3);
    else if (!ctx2.in64 && peek7() === "CALL") parseJmpType(4);
    else if (!ctx2.in64 && peek7() === "ADD") parseOperation(1);
    else if (!ctx2.in64 && peek7() === "SUB") parseOperation(2);
    else if (!ctx2.in64 && peek7() === "MUL") parseOperation(3);
    else if (!ctx2.in64 && peek7() === "DIV") parseOperation(4);
    else if (!ctx2.in64 && peek7() === "AND") parseOperation(5);
    else if (!ctx2.in64 && peek7() === "OR") parseOperation(6);
    else if (!ctx2.in64 && peek7() === "XOR") parseOperation(7);
    else if (!ctx2.in64 && peek7() === "SHL") parseOperation(9);
    else if (!ctx2.in64 && peek7() === "SHR") parseOperation(10);
    else if (!ctx2.in64 && peek7() === "MOD") parseOperation(15);
    else if (!ctx2.in64 && peek7() === "ASSUME") {
      consume();
      expect("-");
      let action = consume();
      if (fmt7(action.value) === "ORG") {
        let inWhere = parseIdent(parsePrimary().value);
        ctx2.orgIn = inWhere;
      } else if (parseSize(fmt8(action)) !== void 0) {
        let sizeof = psfmt72(action.value);
        let primarys = toBigEndianBytes(parseIdent(parsePrimary().value), sizeof);
        while (peek() && peek().value === ",") {
          consume();
          primarys.push(...toBigEndianBytes(
            parseIdent(parsePrimary().value),
            sizeof
          ));
        }
        result.push(...primarys);
      } else if (fmt8(action) === "FILL") {
        let fillto = consume().value;
        let bytesfill = fillto - len;
        result.push(...Array(bytesfill).fill(0));
      }
    } else if (peek7() === "ALIGN") {
      consume();
      let primarys = parseIdent(parsePrimary().value);
      let alignTo = primarys;
      let bytesfill = (alignTo - len % alignTo) % alignTo;
      result.push(...Array(bytesfill).fill(0));
    } else if (!ctx2.in64 && peek7() === "ROR") {
      consume();
      result.push(10);
      expect("-");
      let sizeof = parseSize(consume().value);
      let reg = parsePrimary();
      if (reg.type === "symbol") {
        let a = parseSymbol(reg.value);
        expect(",");
        let expr = parsePrimary();
        if (expr.type === "inm") {
          result.push(0, sizeof, a, ...toBigEndianBytes(expr.value, sizeof));
        } else if (expr.type == "symbol") {
          result.push(1, sizeof, a, parseSymbol(expr.value));
        } else if (expr.type == "stack") {
          result.push(2, sizeof, a);
        }
      }
    } else if (parseSize(fmt8(peek())) !== void 0) {
      let sizeof = psfmt7();
      let primarys = toBigEndianBytes(parseIdent(parsePrimary().value), sizeof);
      while (peek() && peek().value === ",") {
        consume();
        primarys.push(...toBigEndianBytes(
          parseIdent(parsePrimary().value),
          sizeof
        ));
      }
      result.push(...primarys);
    } else if (peek().type === "symbol" && peek().value === ";") break;
    else if (peek().type === "identifier" && typeof peek().value === "string") {
      let varName = consume().value;
      if (peek().type === "symbol" && peek().value === ":") {
        consume();
        if (!("passDefedNot" in ctx2)) ctx2.symbols.set(varName, ctx2.codelen);
        continue;
      } else if (peek7() === "EQU") {
        consume();
        let v = consume().value;
        if (!("passDefedNot" in ctx2)) ctx2.equs.set(varName, v);
        continue;
      } else {
        throw new Error("Unexpected identifier: " + varName);
      }
    }
  }
  return result;
}
function AssembleCode(code) {
  let lines = code.split("\n");
  let result = [];
  let context = new Context();
  lines.forEach((line, i) => {
    let lineAssembled = AssembleLineWithoutContext(line, context, context.codelen);
    context.codelen += lineAssembled.length;
  });
  context.passDefedNot = true;
  let len = 0;
  lines = code.split("\n");
  lines.forEach((line, i) => {
    let lineAssembled = AssembleLineWithoutContext(line, context, len);
    result.push(...lineAssembled);
    len += lineAssembled.length;
  });
  return { result, context };
}
var LibraryAssembler = class {
  static asm = class {
    static assembleLine(line, ctx2 = new Context(), len = null) {
      return AssembleLineWithoutContext(line, ctx2, len);
    }
    static assembleCode(code) {
      return AssembleCode(code);
    }
  };
};

// Assembler/AsmLibrary/Pulsar64CCompiler.js
function tokenize2(code) {
  const tokens = [];
  let i = 0;
  const isLetter = (c) => /[a-zA-Z_]/.test(c);
  const isNumber = (c) => /[0-9]/.test(c);
  while (i < code.length) {
    let c = code[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === "-" && code[i + 1] === ">") {
      i += 2;
      tokens.push({ type: "arrow", value: "->" });
      continue;
    }
    if (c === "0" && (code[i + 1] === "x" || code[i + 1] === "X")) {
      i += 2;
      let value = "";
      while (i < code.length && (isNumber(code[i]) || "ABCDEFabcdef".includes(code[i]))) {
        value += code[i++];
      }
      tokens.push({
        type: "number",
        value: parseInt(value, 16)
      });
      continue;
    }
    if (c === "'") {
      let quoteType = c;
      let value = "";
      i++;
      while (i < code.length && code[i] !== quoteType) {
        value += code[i++];
      }
      i++;
      tokens.push({ type: "number", value: value.charCodeAt(0) });
      continue;
    }
    if (c === '"' || c === "'") {
      let quoteType = c;
      let value = "";
      i++;
      while (i < code.length && code[i] !== quoteType) {
        value += code[i++];
      }
      i++;
      tokens.push({ type: "string", value });
      continue;
    }
    if (isLetter(c)) {
      let value = "";
      while (i < code.length && (isLetter(code[i]) || isNumber(code[i]))) {
        value += code[i++];
      }
      tokens.push({ type: "identifier", value });
      continue;
    }
    if (isNumber(c)) {
      let value = "";
      while (i < code.length && (isNumber(code[i]) || "ABCDEFabcdef".includes(code[i]))) {
        value += code[i++];
      }
      if (i < code.length && code[i].toLowerCase() === "h") {
        i++;
        value = parseInt(value, 16);
      } else if (value === "0" && code[i] === "x") {
        i++;
        let value2 = "";
        while (i < code.length && (isNumber(code[i]) || ["A", "B", "C", "D", "E", "F"].includes(code[i].toUpperCase()))) {
          value2 += code[i++];
        }
        value = parseInt(value2, 16);
      } else {
        value = Number(value);
      }
      tokens.push({
        type: "number",
        value
      });
      continue;
    }
    if (c === "=" && code[i + 1] === "=") {
      i += 2;
      tokens.push({ type: "symbol", value: "==" });
      continue;
    }
    if (c === "!" && code[i + 1] === "=") {
      i += 2;
      tokens.push({ type: "symbol", value: "!=" });
      continue;
    }
    if (c === "<" && code[i + 1] === "<") {
      i += 2;
      tokens.push({ type: "symbol", value: "<<" });
      continue;
    }
    if (c === ">" && code[i + 1] === ">") {
      i += 2;
      tokens.push({ type: "symbol", value: ">>" });
      continue;
    }
    tokens.push({ type: "symbol", value: c });
    i++;
  }
  return tokens;
}
var IrInstruction = class {
  constructor(name, ps) {
    this.name = name;
    this.ps = ps;
  }
  getType() {
    return this.name;
  }
  toString() {
    return this.name + " " + this.ps.join(",");
  }
};
var CtxTempExp = class {
  constructor() {
    this.structs = {};
  }
};
function parse(tokens, ctx2 = null) {
  let i = 0;
  let functions = {};
  let variables = {};
  let structs = {};
  let befvars = [];
  let endname = "";
  let funcinitvr;
  function peek() {
    return tokens[i];
  }
  function consume() {
    let a2 = peek();
    i++;
    return a2;
  }
  function expect(value) {
    let t = consume();
    if (!t || t.value !== value) {
      throw new Error("Expected " + value);
    }
  }
  function isFunction() {
    let save = i;
    if (!isType(peek().value)) {
      return false;
    }
    consume();
    if (peek().type !== "identifier") {
      i = save;
      return false;
    }
    consume();
    let result = peek().value === "(";
    i = save;
    return result;
  }
  function parseFunction(saveBody = true, nameV = "xd", retiv = "char") {
    let returnType = retiv;
    let name = nameV;
    if (saveBody) {
      returnType = consume().value;
      name = consume().value;
    }
    expect("(");
    let params = [];
    while (peek().value !== ")") {
      if (peek().value === "struct") consume();
      let type = consume().value;
      let pointer = false;
      if (peek().value === "*") {
        consume();
        pointer = true;
      }
      let param = consume().value;
      params.push({
        name: param,
        type,
        pointer
      });
      if (peek().value === ",")
        consume();
    }
    expect(")");
    let ssa = /* @__PURE__ */ Symbol(0);
    let offset = 0;
    for (const p of params) {
      variables[p.name] = {
        type: p.type,
        pointer: p.pointer,
        parameter: true,
        offset,
        pp: ssa
      };
      offset += 8;
    }
    let body = [];
    let fna = [];
    let nobj = {
      name,
      ir: fna,
      ssa,
      offsa: offset,
      params
    };
    let befa = funcinitvr;
    if (saveBody) {
      expect("{");
      while (peek().value !== "}") {
        funcinitvr = nobj;
        let oi = i;
        try {
          let ab = inCodeSpace();
          body.push(...ab);
        } catch (e) {
          i = oi;
          body.push(...inDataSpace());
        }
      }
      funcinitvr = befa;
      expect("}");
    }
    Object.keys(variables).filter((a2) => variables[a2].pp === ssa).forEach((a2) => delete variables[a2]);
    let fn = {
      type: "Function",
      name: saveBody ? name : nameV,
      returnType: saveBody ? returnType : retiv,
      params,
      body: saveBody ? body : [],
      preb: fna,
      sas: offset,
      ses: nobj.offsa - offset
    };
    variables[name] = {
      type: "long",
      pointer: true
    };
    functions[saveBody ? name : nameV] = fn;
    return new IrInstruction("Function", [fn]);
  }
  function loadPointer() {
    return new IrInstruction("Desreference", []);
  }
  function loadValue(name) {
    let v = variables[name];
    if ("offsata" in v) {
      let bc = [];
      bc.push(new IrInstruction("LoadFlat", [v.offsata]));
      bc.push(new IrInstruction("Inline", ["sub $$m, bp, $$m"]));
      return bc;
    }
    if (v?.parameter)
      return new IrInstruction("LoadParameter", [v.offset, getTypeSize(v.type)]);
    return new IrInstruction("LoadValue", ["altna" in v ? v.altna : name]);
  }
  function loadField(offset) {
    return new IrInstruction("Field", [offset]);
  }
  function getSize(field) {
    if (field.pointer || field.function)
      return 8;
    if (field.type === "long")
      return 8;
    if (field.type === "int")
      return 4;
    if (field.type === "short")
      return 2;
    if (field.type === "char")
      return 1;
    if (field.type === "bool")
      return 1;
    return structs[field.type]?.size ?? 0;
  }
  function calcStructSize(fields) {
    let size = 0;
    for (const field of fields) {
      size += getSize(field);
    }
    return size;
  }
  function isType(name) {
    return name === "long" || name === "int" || name === "short" || name === "char" || name === "bool" || structs[name];
  }
  function variableReference() {
    let ir = [];
    let deref = false;
    if (peek().value === "*") {
      consume();
      deref = true;
    }
    let name = consume().value;
    let variable = variables[name];
    let currentType = variable.type;
    let ab = loadValue(name);
    let msr = false;
    if (!Array.isArray(ab) && ab.getType() == "LoadParameter") {
      msr = true;
    }
    ab = Array.isArray(ab) ? ab : [ab];
    ir.push(...ab);
    if (deref && !msr) {
      ir.push(loadPointer());
    }
    let levelo = 0;
    while (peek() && (peek().value === "." || peek().value === "->")) {
      let op = consume().value;
      let field = consume().value;
      if (op === "->") {
        if (levelo == 0 && msr) {
        } else ir.push(loadPointer());
      }
      levelo++;
      let offset = getFieldOffset(
        currentType,
        field
      );
      ir.push(loadField(offset));
      let fieldInfo = structs[currentType].fields.find((f) => f.name === field);
      if (fieldInfo.function) {
        currentType = "function";
      } else {
        currentType = fieldInfo.type;
      }
    }
    let pointer = variable.pointer;
    if (deref) {
      if (!pointer)
        throw new Error("Cannot dereference non-pointer");
      pointer = false;
    }
    return {
      ir,
      type: currentType,
      pointer,
      deref,
      msr
    };
  }
  function parseVariableDecl(addFile = true, externed = false) {
    let type = consume().value;
    let pointer = false;
    if (peek().value === "*") {
      consume();
      pointer = true;
    }
    let name = consume().value;
    let stra = null;
    if (!externed && peek().value == "=") {
      consume();
      stra = consume().value;
    }
    if (externed) {
      if (peek().value == "(") {
        parseFunction(false, name, type);
        expect(";");
        return;
      }
    }
    expect(";");
    variables[name] = {
      type,
      pointer
    };
    if (funcinitvr) {
      variables[name].altna = "__" + funcinitvr.name + "_" + name;
      variables[name].pp = funcinitvr.ssa;
      variables[name].offsata = funcinitvr.offsa + 16 + (pointer ? 8 : getTypeSize(type));
      funcinitvr.offsa += pointer ? 8 : getTypeSize(type);
    }
    if (addFile) {
      if (funcinitvr) {
        return new IrInstruction("Nop", []);
      }
      return new IrInstruction(
        "Declare",
        [
          name,
          type,
          pointer ? 8 : getTypeSize(type),
          8,
          stra
        ]
      );
    }
  }
  function getFieldOffset(structName, fieldName) {
    let st = structs[structName];
    let offset = 0;
    for (let f of st.fields) {
      if (f.name === fieldName)
        return offset;
      offset += getSize(f);
    }
    throw new Error("field not found");
  }
  function parseReturn() {
    let ir = [];
    expect("return");
    ir.push(new IrInstruction("ChgPrimRe", []));
    ir.push(...parseSymbol().ir);
    ir.push(new IrInstruction("ExitFunction", [funcinitvr.name + "__stdend"]));
    expect(";");
    return ir;
  }
  function parseSymbol() {
    if (peek().value in functions) {
      return {
        ir: [
          new IrInstruction(
            "LoadFlat",
            [consume().value]
          )
        ],
        type: "long",
        pointer: false
      };
    }
    if (peek().value === "&") {
      consume();
      let ref = variableReference();
      return {
        ir: ref.ir,
        type: ref.type,
        pointer: true
      };
    }
    if (peek().type === "number") {
      return {
        ir: [
          new IrInstruction(
            "LoadFlat",
            [consume().value]
          )
        ],
        type: "long",
        pointer: false
      };
    }
    if (peek().value === "sizeof") {
      consume();
      expect("(");
      let ptr = false;
      let name;
      if (peek().value === "struct") consume();
      name = consume().value;
      if (peek().value === "*") {
        ptr = true;
        consume();
      }
      expect(")");
      return {
        ir: [
          new IrInstruction(
            "LoadFlat",
            [ptr ? 8 : getSize(name)]
          )
        ],
        type: "long",
        pointer: false
      };
    }
    let a2 = variableReference();
    if (a2.type === "function" || !a2.msr)
      a2.ir.push(
        new IrInstruction(
          "Get",
          [
            a2.pointer ? 8 : getTypeSize(a2.type)
          ]
        )
      );
    return a2;
  }
  function newLabel(name) {
    return name + "_" + Math.floor(Math.random() * 1e4);
  }
  function getTypeSize(type) {
    if (type === "long")
      return 8;
    if (type === "int")
      return 4;
    if (type === "short")
      return 2;
    if (type === "char")
      return 1;
    if (type === "function")
      return 8;
    return structs[type]?.size ?? 0;
  }
  function parseCall(tar = null) {
    let target = tar !== null ? tar : parseSymbol();
    expect("(");
    let args = [];
    while (peek().value !== ")") {
      let arg = parseSymbol();
      args.push(arg);
      if (peek().value === ",")
        consume();
    }
    expect(")");
    if (tar === null) expect(";");
    return [
      new IrInstruction(
        "Call",
        [
          target.ir,
          args
        ]
      )
    ];
  }
  function inCodeSpace() {
    if (peek().value === "return") {
      return parseReturn();
    }
    if (peek().value === "__asm__") {
      consume();
      expect("(");
      let v = consume().value;
      expect(")");
      expect(";");
      return [new IrInstruction("AsmInsert", [v])];
    }
    if (peek().value === "while") {
      return parseWhile();
    }
    if (peek().value === "break") {
      consume();
      expect(";");
      return [new IrInstruction("Jump", [endname])];
    }
    if (peek().value === "if") {
      return parseIf();
    }
    if (peek().type === "identifier" && tokens[i + 1]?.value === "(") {
      return parseCall();
    }
    let boda = [new IrInstruction("ChgPrimRe", [])];
    let ab = variableReference();
    if (peek().value == "(") {
      if (ab.type === "function")
        ab.ir.push(loadPointer());
      boda.push(...parseCall(ab));
    } else if (peek().value == "=") {
      boda.push(...ab.ir);
      consume();
      boda.push(new IrInstruction("ChgSecRe", []));
      let s = parseSymbol();
      boda.push(...s.ir);
      let modifier = "";
      let symbols = {
        "+": "Add",
        "-": "Sub",
        "*": "Mul",
        "/": "Div",
        "<<": "Shl",
        ">>": "Shr",
        "&": "And"
      };
      if (peek().value !== ";") {
        if (peek().value in symbols) {
          modifier = symbols[consume().value];
        }
      }
      if (modifier !== "") {
        let d = parseSymbol();
        boda.push(new IrInstruction("ChgTerRe", []));
        boda.push(...d.ir);
        boda.push(new IrInstruction(`${modifier}`));
      }
      boda.push(new IrInstruction(`Store`, [
        ab.pointer ? 8 : getTypeSize(ab.type),
        s.pointer ? 8 : getTypeSize(s.type)
      ]));
    } else if (peek().value == "+") {
      consume();
      if (peek().value == "+") {
        boda.push(...ab.ir);
        consume();
        boda.push(new IrInstruction("ChgSecRe", []));
        boda.push(...ab.ir);
        boda.push(new IrInstruction("Get", [ab.pointer ? 8 : getTypeSize(ab.type)]));
        boda.push(new IrInstruction("ChgTerRe", []));
        boda.push(new IrInstruction("LoadFlat", [1]));
        boda.push(new IrInstruction(`Add`));
        boda.push(new IrInstruction(`Store`, [
          ab.pointer ? 8 : getTypeSize(ab.type),
          ab.pointer ? 8 : getTypeSize(ab.type)
        ]));
      }
    } else if (peek().value == "-") {
      consume();
      if (peek().value == "-") {
        boda.push(...ab.ir);
        consume();
        boda.push(new IrInstruction("ChgSecRe", []));
        boda.push(...ab.ir);
        boda.push(new IrInstruction("Get", [ab.pointer ? 8 : getTypeSize(ab.type)]));
        boda.push(new IrInstruction("ChgTerRe", []));
        boda.push(new IrInstruction("LoadFlat", [1]));
        boda.push(new IrInstruction(`Sub`));
        boda.push(new IrInstruction(`Store`, [
          ab.pointer ? 8 : getTypeSize(ab.type),
          ab.pointer ? 8 : getTypeSize(ab.type)
        ]));
      }
    }
    expect(";");
    return boda;
  }
  function parseCondition() {
    let ada = [];
    ada.push(new IrInstruction("ChgPrimRe", []));
    let left = parseSymbol();
    ada.push(...left.ir);
    let op = consume().value;
    ada.push(new IrInstruction("ChgSecRe", []));
    let right = parseSymbol();
    ada.push(...right.ir);
    ada.push(new IrInstruction("Compare", [op]));
    if (op === "<") {
      let jal = newLabel("setl");
      ada.push(new IrInstruction("LoadFlat", [1]));
      ada.push(new IrInstruction("JmpIfLess", [jal]));
      ada.push(new IrInstruction("LoadFlat", [0]));
      ada.push(new IrInstruction("Label", [jal]));
    } else if (op === ">") {
      let jal = newLabel("setg");
      ada.push(new IrInstruction("LoadFlat", [1]));
      ada.push(new IrInstruction("JmpIfGreater", [jal]));
      ada.push(new IrInstruction("LoadFlat", [0]));
      ada.push(new IrInstruction("Label", [jal]));
    }
    return {
      ir: ada
    };
  }
  function parseWhile() {
    expect("while");
    expect("(");
    let start = newLabel("while");
    let end = newLabel("end");
    let condition = parseCondition();
    let preir = [];
    expect(")");
    expect("{");
    let body = [];
    while (peek().value !== "}") {
      endname = end;
      body.push(...inCodeSpace());
    }
    expect("}");
    preir.push(new IrInstruction(
      "SaveRet",
      []
    ));
    return [
      ...preir,
      new IrInstruction(
        "Label",
        [start]
      ),
      ...condition.ir,
      new IrInstruction(
        "JumpFalse",
        [end]
      ),
      ...body,
      new IrInstruction(
        "Jump",
        [start]
      ),
      new IrInstruction(
        "Label",
        [end]
      ),
      new IrInstruction(
        "RestoreEnd",
        []
      )
    ];
  }
  function parseIf() {
    expect("if");
    expect("(");
    let condition = parseCondition();
    expect(")");
    expect("{");
    let body = [];
    while (peek().value !== "}") {
      body.push(...inCodeSpace());
    }
    expect("}");
    let start = newLabel("if");
    let end = newLabel("endif");
    return [
      new IrInstruction(
        "Label",
        [start]
      ),
      ...condition.ir,
      new IrInstruction(
        "JumpFalse",
        [end]
      ),
      ...body,
      new IrInstruction(
        "Label",
        [end]
      )
    ];
  }
  function inDataSpace() {
    if (peek().value == "/") {
      let oldi = i;
      consume();
      if (peek().value == "*") {
        consume();
        let dis = false;
        if (peek().value === "!") {
          dis = true;
          consume();
        }
        let ca = consume().value;
        expect("*");
        expect("/");
        return [new IrInstruction(dis ? "Disable" : "Enable", [ca])];
      } else i = oldi;
    }
    if (isFunction()) {
      return [parseFunction()];
    }
    if (peek().value === "extern") {
      consume();
      if (peek().value === "struct") {
        let oldi = i;
        consume();
        let sname = consume().value;
        if (peek().value !== ";") {
          i = oldi;
        } else {
          if (ctx2 && ctx2 instanceof CtxTempExp) {
            structs[sname] = ctx2.structs[sname];
          }
          expect(";");
          return [];
        }
      }
      if (peek().value === "struct") consume();
      parseVariableDecl(false, true);
      return [];
    }
    if (peek().value === "struct") {
      let ac = parseStruct();
      if (ac)
        return [new IrInstruction("CrtStruct", [ac])];
      else {
        i--;
        return inDataSpace();
      }
    }
    if (peek().type === "identifier" && isType(peek().value)) {
      return [
        parseVariableDecl()
      ];
    }
  }
  function parseStruct() {
    expect("struct");
    const name = consume().value;
    if (peek().value !== "{") return null;
    expect("{");
    const fields = [];
    while (peek().value !== "}") {
      if (peek().value === "struct") consume();
      let type = consume().value;
      let params = [];
      let castFunc1 = false;
      let field = null;
      if (peek().value == "(") {
        consume();
        expect("*");
        field = consume().value;
        expect(")");
        castFunc1 = true;
      }
      let pointer = false;
      if (!field) {
        pointer = false;
        if (peek().value === "*") {
          consume();
          pointer = true;
        }
        field = consume().value;
      } else if (castFunc1) {
        expect("(");
        while (peek().value !== ")") {
          if (peek().value === "struct") consume();
          let type2 = consume().value;
          let pointer2 = false;
          if (peek().value === "*") {
            consume();
            pointer2 = true;
          }
          let param = consume().value;
          params.push({
            name: param,
            type: type2,
            pointer: pointer2
          });
          if (peek().value === ",")
            consume();
        }
        expect(")");
      }
      expect(";");
      let fd = {
        name: field,
        type,
        pointer,
        function: castFunc1
      };
      if (castFunc1) {
        fd.params = params;
      }
      fields.push(fd);
    }
    expect("}");
    expect(";");
    let result = {
      type: "Struct",
      name,
      fields,
      size: calcStructSize(fields)
    };
    structs[name] = result;
    return result;
  }
  function parseProgram() {
    let ir = [];
    while (peek()) {
      let pk = inDataSpace();
      if (!pk) {
        pk = inCodeSpace();
      }
      if (!pk) pk = [];
      ir.push(...pk);
    }
    return ir;
  }
  let a = parseProgram();
  if (ctx2 && ctx2 instanceof CtxTempExp) {
    for (let m of Object.getOwnPropertyNames(structs)) {
      ctx2.structs[m] = structs[m];
    }
  }
  return a;
}
function codeGen(pparsed) {
  let secondary = 0;
  let enableds = {};
  function mainReg() {
    return `r${secondary}`;
  }
  let xas = {
    1: "byte",
    2: "word",
    4: "dword",
    8: "qword"
  };
  function optimizeNumLoader(n) {
    if (n <= 255) {
      return `mov`;
    } else if (n <= 65535) {
      return `li16`;
    } else if (n <= 4294967295) {
      return `li32`;
    }
    return "li64";
  }
  function genB(p) {
    if (p.getType() === "ChgPrimRe") {
      secondary = 0;
    } else if (p.getType() === "ChgSecRe") {
      secondary = 1;
    } else if (p.getType() === "ChgTerRe") {
      secondary = 2;
    } else if (p.getType() === "LoadValue") {
      return `${"use32Addr" in enableds ? "li32" : "laddr"} ${mainReg()}, ${String(p.ps[0])}`;
    } else if (p.getType() === "Enable") {
      enableds[p.ps[0]] = "xd";
      if (p.ps[0] === "pic") return ".pic sss_unused";
    } else if (p.getType() === "Disable") {
      delete enableds[p.ps[0]];
    } else if (p.getType() === "Field") {
      if (p.ps[0] !== 0)
        return `add ${mainReg()}, ${mainReg()}, ${String(p.ps[0])}`;
      return "";
    } else if (p.getType() === "Desreference") {
      return `deref ${mainReg()}`;
    } else if (p.getType() === "Store") {
      return `mwr${String(p.ps[0] * 8)} r0, r1`;
    } else if (p.getType() === "Add") {
      return `add r1, r1, r2`;
    } else if (p.getType() === "Sub") {
      return `sub r1, r1, r2`;
    } else if (p.getType() === "Div") {
      return `div r1, r1, r2`;
    } else if (p.getType() === "Mul") {
      return `mul r1, r1, r2`;
    } else if (p.getType() === "Shl") {
      return `shl r1, r1, r2`;
    } else if (p.getType() === "Shr") {
      return `shr r1, r1, r2`;
    } else if (p.getType() === "And") {
      return `and r1, r1, r2`;
    } else if (p.getType() === "LoadFlat") {
      if (typeof p.ps[0] === "number") {
        if (p.ps[0] <= 255) {
          return `mov ${mainReg()}, ${String(p.ps[0])}`;
        } else if (p.ps[0] <= 65535) {
          return `li16 ${mainReg()}, ${String(p.ps[0])}`;
        } else if (p.ps[0] <= 4294967295) {
          return `li32 ${mainReg()}, ${String(p.ps[0])}`;
        }
      }
      return `li64 ${mainReg()}, ${String(p.ps[0])}`;
    } else if (p.getType() === "Get") {
      return `lalts${String(p.ps[0] * 8)} ${mainReg()}`;
    } else if (p.getType() === "Declare") {
      if (p.ps[4] !== null) {
        return `${p.ps[0]}: db ${[...Buffer.from(p.ps[4]), 0].map((v) => "0" + Number(v).toString(16) + "h").join(",")}`;
      }
      return `${p.ps[0]}: reserve ${p.ps[2]}`;
    } else if (p.getType() === "LoadParameter") {
      return `mov ${mainReg()}, [qword bp-${p.ps[0]}]`;
    } else if (p.getType() === "Label") {
      return p.ps[0] + ":";
    } else if (p.getType() === "Jump") {
      return `jmp ${p.ps[0]}`;
    } else if (p.getType() === "JumpTrue") {
      return `jifeq ${p.ps[0]}`;
    } else if (p.getType() === "JmpIfLess") {
      return `jineg ${p.ps[0]}`;
    } else if (p.getType() === "JmpIfGreater") {
      return `jipos ${p.ps[0]}`;
    } else if (p.getType() === "AsmInsert") {
      return p.ps[0];
    } else if (p.getType() == "ExitFunction") {
      let out = [];
      out.push(`jmp ${p.ps[0]}`);
      return out.join("\n");
    } else if (p.getType() === "JumpFalse") {
      return `cmp r2, r2, 0 jifeq ${p.ps[0]}`;
    } else if (p.getType() === "SaveRet") {
      return `push lnk`;
    } else if (p.getType() === "RestoreEnd") {
      return `pop lnk`;
    } else if (p.getType() === "Compare") {
      return `cmp r2, r0, r1`;
    } else if (p.getType() === "Inline") {
      return p.ps[0].replaceAll("$$m", mainReg());
    } else if (p.getType() === "Call") {
      let target = p.ps[0];
      let args = p.ps[1];
      let out = [];
      let argn = 0;
      for (let arg of args) {
        for (let ins of arg.ir) {
          out.push((argn !== 0 ? `   ` : "") + genA(ins));
          argn++;
        }
        out.push(
          `   push ${mainReg()}`
        );
        argn++;
      }
      for (let ins of target) {
        out.push((argn !== 0 ? `   ` : "") + genA(ins));
        argn++;
      }
      out.push(
        `${argn !== 0 ? `   ` : ""}bl ${mainReg()}`
      );
      argn++;
      out.push(
        `   add sp, sp, ${args.length * 8}`
      );
      argn++;
      return out.filter((x) => x.trim() !== "").join("\n");
    } else if (p.getType() === "Function") {
      let fn = p.ps[0];
      let out = [];
      for (let ins of fn.preb) {
        out.push((ins.getType() !== "Label" ? "   " : "") + genA(ins));
      }
      out.push(`${fn.name}:`);
      let v = (fn.sas / 8 - 1) * 8;
      if (!(v >= 0)) v = 0;
      out.push(`   enter ${v}`);
      out.push(`   ${optimizeNumLoader(fn.ses + 8)} r4, ${fn.ses + 8}`);
      out.push(`   sub sp, sp, r4`);
      for (let ins of fn.body) {
        out.push((ins.getType() !== "Label" ? "   " : "") + genA(ins));
      }
      out.push(`${fn.name}__stdend:`);
      out.push(`   ${optimizeNumLoader(fn.ses + 8)} r4, ${fn.ses + 8}`);
      out.push(`   add sp, sp, r4`);
      out.push("   leave");
      out.push("   ret");
      return out.filter((x) => x.trim() !== "").join("\n");
    }
    return "";
  }
  function genA(p) {
    return genB(p);
  }
  return pparsed.map(genA).filter((x) => x.trim() !== "").join("\n");
}

// Assembler/Pulsar3264toolchain.js
import * as fileSystem from "node:fs";

// Assembler/AsmLibrary/Dis64.js
function ReprModi(t, byte) {
  if (t == 0) {
    let registers = [
      void 0,
      void 0,
      "sp",
      "r0",
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
      "r6",
      "lnk",
      "bp",
      "ip",
      "r7",
      "r8",
      "r9"
    ];
    if ((byte & 15) <= 15)
      return registers[byte & 15];
  }
  if (t == 1) {
    return `i(${byte.toString()})`;
  }
  if (t == 2) {
    return byte.toString();
  }
  if (t == 3) {
    if (byte >= 0 && byte <= 7)
      return String.fromCharCode(byte + 97) + "s";
  }
}
function EmitOpr(bytes) {
  let oprInd = bytes[0] & 15;
  let oprDex = [
    "add",
    "sub",
    "mul",
    "div",
    "and",
    "or",
    "shr",
    "shl"
  ];
  if (oprInd >= oprDex.length) return;
  let oprName = oprDex[oprInd];
  let opr1T = bytes[1] >> 2 & 3;
  let opr2T = bytes[1] & 3;
  let oprDT = 0;
  let oprD = bytes[1] >> 4 & 15;
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
function TryInmOprs(bytes) {
  if (bytes[1] == 255) {
    if (bytes[2] == 1) {
      return `slcinm ${bytes[3]}`;
    } else if (bytes[2] == 2) {
      let repr1 = ReprModi(0, bytes[3]);
      if (!repr1) return;
      return `ltbl ${repr1}`;
    } else if (bytes[2] == 3) {
      return `int ${bytes[3]}`;
    } else if ((bytes[2] & 240) == 48) {
      let repr1 = ReprModi(bytes[3] >> 4 & 15, bytes[3] & 15);
      if (!repr1) return;
      return `gb ${bytes[2] & 15} ${repr1}`;
    } else if (bytes[2] == 255) {
      if (bytes[3] == 1) {
        return `rstinm`;
      } else if ((bytes[3] & 240) == 32) {
        let repr1 = ReprModi(0, bytes[3] & 15);
        if (!repr1) return;
        return `calc ${repr1}`;
      } else if (bytes[3] == 2) {
        return `iret`;
      } else if (bytes[3] == 3) {
        return `hlt`;
      }
    }
  } else if ((bytes[1] & 240) == 16) {
    let inumba = bytes[1] & 15;
    if (inumba == 2) {
      return `addinmb2 ${bytes[2]}, ${bytes[3]}`;
    } else if (inumba == 1) {
      return `addinmb ${bytes[2]}`;
    }
  } else if ((bytes[1] & 240) == 64) {
    let repr1 = ReprModi(0, bytes[2] & 15);
    if (!repr1) return;
    return `linm ${repr1}, ${bytes[3]}`;
  } else if ((bytes[1] & 240) == 48) {
    let repr1 = ReprModi((bytes[2] & 240) >> 4, bytes[2] & 15);
    if (!repr1) return;
    return `ifm${(bytes[1] & 15) * 8} ${repr1}, ${bytes[3]}`;
  } else if (bytes[1] == 5) {
    let repr1 = ReprModi(3, bytes[2]);
    if (!repr1) return;
    let repr2 = ReprModi(0, bytes[3] & 15);
    if (!repr2) return;
    return `srw ${repr1}, ${repr2}`;
  } else if ((bytes[1] & 240) == 80) {
    let repr1 = ReprModi(3, bytes[1] & 15);
    if (!repr1) return;
    let repr2 = ReprModi(0, bytes[2]);
    if (!repr2) return;
    let repr3 = ReprModi(0, bytes[3]);
    if (!repr3) return;
    return `srr ${repr1}:${repr2}, ${repr3}`;
  }
}
function EmitDis(bytes) {
  if ((bytes[0] & 240) == 32) {
    return EmitOpr(bytes);
  } else if (bytes[0] == 1) {
    return TryInmOprs(bytes);
  } else if (bytes[0] == 2) {
    if ((bytes[1] & 240) == 16) {
      let repr1 = ReprModi(0, bytes[1] & 15);
      if (!repr1) return;
      let repr2 = ReprModi(bytes[2] & 15, bytes[3]);
      if (!repr2) return;
      return `mwr${((bytes[2] & 240) >> 4) * 8} ${repr1}, ${repr2}`;
    }
  }
}
function DisCode(codeBytes) {
  let codeComplA = [];
  let count = 0;
  const flushReserves = () => {
    if (count > 0) {
      codeComplA.push(`reserve ${count} ; 0x${index.toString(16)}`);
      count = 0;
    }
  };
  let index = 0;
  while (index < codeBytes.length) {
    if (index + 3 < codeBytes.length) {
      const codeInstr = codeBytes.slice(index, index + 4);
      const codeRepr = EmitDis(codeInstr);
      if (codeRepr) {
        flushReserves();
        codeComplA.push(codeRepr + `; 0x${index.toString(16)}`);
        index += 4;
        continue;
      }
    }
    let currentByte = codeBytes[index];
    if (currentByte === 0) {
      count++;
      index++;
    } else {
      flushReserves();
      codeComplA.println?.() || codeComplA.push(`db 0x${currentByte.toString(16).padStart(2, "0")} ; 0x${index.toString(16)}`);
      index++;
    }
  }
  flushReserves();
  return codeComplA.join("\n");
}

// Assembler/Pulsar3264toolchain.js
var debug = false;
var cContext = new CtxTempExp();
var Arguments = ["--c", "--asm", "--dis"];
var argsIndex = 2;
function Peek() {
  return argv[argsIndex];
}
function Consume() {
  return argv[argsIndex++];
}
var ctx = {
  "--asm": {
    active: false,
    inFiles: [],
    outFile: "a.hex",
    format: "hex"
  },
  "--dis": {
    active: false,
    inFiles: [],
    outFile: "a.hex",
    format: "hex"
  },
  "--c": {
    active: false,
    inFiles: [],
    outFile: "out.asm"
  },
  currentMode: "list"
};
function ConvertCFileToAsm(filePath) {
  let asmFile = filePath;
  let asmFileContent = fileSystem.readFileSync(asmFile, "utf-8");
  let tok = tokenize2(asmFileContent);
  let par = parse(tok, cContext);
  let result = codeGen(par);
  return result;
}
function UnsiA() {
  ctx[ctx.currentMode].active = false;
  if (ctx.currentMode == "--c") {
    let asmGigantFile = "";
    let ar = ctx[ctx.currentMode].inFiles;
    ar.forEach((v) => {
      asmGigantFile += ConvertCFileToAsm(v) + "\n";
    });
    cContext = new CtxTempExp();
    fileSystem.writeFileSync(ctx[ctx.currentMode].outFile, asmGigantFile);
  } else if (ctx.currentMode == "--dis") {
    let asmGigantFile = "";
    let ar = ctx[ctx.currentMode].inFiles;
    asmGigantFile = Buffer.from(fileSystem.readFileSync(ar[0], "ascii"), "ascii");
    let outpudFile = ctx["--dis"].outFile;
    let hex = "";
    if (ctx["--dis"].format === "decimal" || ctx["--dis"].format === "hex") {
      let nums = asmGigantFile.toString().split(/\s+/).map((n) => Number.parseInt(n, ctx["--dis"].format === "decimal" ? 10 : 16));
      hex = DisCode(nums);
    } else if (ctx["--dis"].format === "flat") {
      let nums = Array.from(Uint8Array.from(asmGigantFile));
      hex = DisCode(nums);
    }
    fileSystem.writeFileSync(outpudFile, hex);
  } else if (ctx.currentMode == "--asm") {
    let asmGigantFile = "";
    let ar = ctx[ctx.currentMode].inFiles;
    ar.forEach((v) => {
      asmGigantFile += fileSystem.readFileSync(v) + "\n";
    });
    let outpudFile = ctx["--asm"].outFile;
    let resulta = LibraryAssembler.asm.assembleCode(asmGigantFile);
    let result = resulta.result;
    let hex = result.map((b) => b.toString(16).padStart(2, "0")).join("\n");
    if (debug) console.log(resulta.context);
    if (ctx["--asm"].format === "decimal") {
      hex = result.map((b) => b.toString()).join("\n");
    } else if (ctx["--asm"].format === "flat") {
      fileSystem.writeFileSync(outpudFile, Buffer.from(result));
      return;
    }
    fileSystem.writeFileSync(outpudFile, hex);
  }
}
function Check() {
  if (Arguments.includes(Peek())) {
    if (ctx.currentMode in ctx) {
      UnsiA();
    }
    let modeActive = Consume();
    ctx[modeActive].active = true;
    ctx.currentMode = modeActive;
    if ("inFiles" in ctx[modeActive] && Array.isArray(ctx[modeActive].inFiles)) {
      ctx[modeActive].inFiles = [];
    }
    if (modeActive == "--c") {
      ctx["--c"].outFile = "out.asm";
    } else if (modeActive == "--dis") {
      ctx["--dis"].format = "hex";
    }
  }
  if (Peek() == "--dbg") {
    Consume();
    debug = true;
  } else if (ctx.currentMode === "--c") {
    if (Peek() === "-out") {
      Consume();
      let ofa = Consume();
      ctx["--c"].outFile = ofa;
    } else {
      let fd = Consume();
      ctx["--c"].inFiles.push(fd);
    }
  } else if (ctx.currentMode === "--asm") {
    if (Peek() === "-out") {
      Consume();
      let ofa = Consume();
      ctx["--asm"].outFile = ofa;
    } else if (Peek() === "-f") {
      Consume();
      let ofa = Consume();
      ctx["--asm"].format = ofa;
    } else {
      let fd = Consume();
      ctx["--asm"].inFiles.push(fd);
    }
  } else if (ctx.currentMode === "--dis") {
    if (Peek() === "-out") {
      Consume();
      let ofa = Consume();
      ctx["--dis"].outFile = ofa;
    } else if (Peek() === "-f") {
      Consume();
      let ofa = Consume();
      ctx["--dis"].format = ofa;
    } else {
      let fd = Consume();
      ctx["--dis"].inFiles.push(fd);
    }
  }
}
while (argsIndex < argv.length) {
  Check();
}
UnsiA();
