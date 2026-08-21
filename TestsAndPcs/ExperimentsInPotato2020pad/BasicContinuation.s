    org32
    dd start
start:
    ;dbgAc64
    org64
    mov         r0, 0
    calc        r0
    jmp         bootstrap

    LETLEN      equ 10
    NUMLEN      equ 3   ;0 - 999 (well, 255 xD)

    ; tokens type
    TYIDENT     equ 0
    TYNUM       equ 1
    TYOPR       equ 2
    TYUNKNOW    equ 3
    TYEOF       equ 4

    align 20
identifiers:
    db          (print_ident/20)
    db          (input_ident/20)
    db          (goto_ident/20)
    db          (gosub_ident/20)
    db          (return_ident/20)
    db          (clear_ident/20)
    db          (rem_ident/20)
    db          (append_ident/20)
    db          (run_ident/20)
    db          (clc_ident/20)

    db          0

    align       20
spaces:
    db          20h
    db          0Ah
    db          0Ch
    db          00h

    align       20
symbols:
    db          '+'
    db          '-'
    db          '*'
    db          '/'
    db          0

align 20 
print_ident: 
    db 5,'print'
align 20 
input_ident: 
    db 5,'input'
align 20
goto_ident: 
    db 4,'goto'
align 20 
gosub_ident: 
    db 5,'gosub'
align 20 
return_ident: 
    db 6,'return'
align 20 
clear_ident:
    db 5,'clear'
align 20
append_ident:
    db 3,'add'
align 20
rem_ident:
    db 3,'rem'
align 20
run_ident:
    db 3,'run'
align 20
clc_ident:
    db 5,'erase'

    align 20
vars:
    reserve ((LETLEN+NUMLEN)*100)

    align   2
returnstack: reserve (2*128)
retTOS:
basicsp: word 0

    align   8
reserve 128 logicalstack:
bufferline: reserve 128
tokens:     reserve (2*20)

strtemp: db  0          ; count
strtmpc: reserve 10     ; str content

msg: db 'Welcome to BASINICA',10,10,'BASINICA is a BASIC',10,'for P64-LITE',10,0

toki:       word 0

put_str:
    push    lnk
put_str_loop:
    mov     r1, [byte r0]
    cmp     r2, r1, 0
    jz      put_str_end
    li32    r4, 10000h
    mwr8    r4, r1
    inc     r0
    jmp     put_str_loop
put_str_end:
    pop     lnk
    ret

bootstrap:
    ; configure real stack
    li32    sp, logicalstack

    ; return basic sp
    li32    r0, retTOS
    bl      config_sp

    li32    r0, msg
    bl      put_str

loopKy:
	li32	r0, testcode
	mov		r1, 0
waitKey:
	li64    r2, 10010h
	mov     r3, [byte r2]
	cmp    	r4, r3, 0
	jz 		waitKey
	mov		r4, 0
	mwr8	r2, r4
	add 	r5, r0, r1
	mwr8 	r5, r3
    push    r0
    li32    r0, 10000h
    mwr8    r0, r3
    pop     r0
	inc		r1
	cmp		r4, r3, 0Ah
	jz 		parseLn
	jmp		waitKey

parseLn:
	mwr8	r5, r4
	bl  	parse
    ; preserve r0 for the param xD
    bl      runTok

    jmp     loopKy

config_sp:
    li32    r7, basicsp ; stack ptr addr
    mwr16   r7, r0      ; put stack
    ret

push_value_bsp:
    li32    r7, basicsp ; put stack
    lv16    r7, r8      ; read pointer
    sub     r8, r8, 2   ; sub 2
    mwr16   r7, r8      ; write
    mwr16   r8, r0      ; write stack
    ret

push_new_token:
    push    r0
    push    r1
    li32    r0, tokens
    li32    r1, toki
    lv16    r1, r1

    push    r1
    push    r2
    add     r0, r0, r1
    mwr8    r0, r7
    inc     r0
    mwr8    r0, r8
    pop     r2
    pop     r1

    push    r2
    li32    r2, toki
    add     r1, r1, 2
    mwr16   r2, r1
    pop     r2

    pop     r1
    pop     r0
    ret

strcmp:
    mov     r9, 0
    push    lnk
    pusha
    mov     r2, [byte r0]   ; len1
    mov     r3, [byte r1]   ; len2
    cmp     r4, r2, r3
    jz      strcmpokle
    jmp     strcmpend
strcmpokle:
    inc     r0
    inc     r1
strcmploop:
    cmp     r8, r2, 0
    jz      scmpyesFinish
    mov     r4, [byte r0]
    mov     r5, [byte r1]
    cmp     r4, r4, r5
    jz      stcmpne
    mov     r9, 0
    jmp     strcmpend
stcmpne:
    inc     r0
    inc     r1
    dec     r2
    dec     r3
    jmp     strcmploop
scmpyesFinish:
    mov     r9, 1
strcmpend:
    popa
    pop     lnk
    ret

parse:
    li32    r7, toki
    mov     r8, 0
    mwr16   r7, r8
    push    lnk
loopp:
    pop     lnk
    push    lnk

    mov     r1, [byte r0]   ; character
    cmp     r4, r1, 0       ; end of file
    jz      endParse

    cmp		r4, r1, ' '
    jz		skipSpace

tryParseSymbolStart:
    add     r2, 0, (symbols/20) ; little trap
    mul     r2, r2, 20      ; multiply trap
    mov     r7, TYUNKNOW    ; unknown symbol
tryParseSymbol:
    mov     r3, [byte r2]   ; get symbol
    cmp     r4, r1, r3      ; compare
    inc     r2              
    jz      isSymbol        ; is the symbol

    cmp     r4, r3, 0       ; end?
    jz      iGiveUpItIsNotSymbol ; yes

    jmp     tryParseSymbol

isSymbol:
    mov     r7, TYOPR       ; yes
    mov     r8, r3          ; symbol
    jmp     yeahIFindIt     ; i find
iGiveUpItIsNotSymbol:
    jmp     tryParseNumberMain ; try numbers?
tryParseNumberMain:
    cmp     r4, r1, '0'         ; compare
    jg      hmmINotSureNum      ; i not sure xD
    jz      isNumberPrefix      ; yes is number

    jmp     endTryNum

hmmINotSureNum:
    cmp     r4, r1, '9'         ; verify bounds
    jl      isNumberPrefix      ; is num
    jz      isNumberPrefix      ; is num
    jmp     iGiveUpItIsNotNumber ; no is not

isNumberPrefix:
    mov     r8, 0
    mov     r7, [byte r0]
    sub     r7, r7, '0'
    add     r8, r8, r7
    mov     r7, [byte r0+1]
    sub     r7, r7, '0'
    mul     r8, r8, 10
    add     r8, r8, r7
    mov     r7, [byte r0+2]
    sub     r7, r7, '0'
    mul     r8, r8, 10
    add     r8, r8, r7
    add     r0, r0, 2
    mov     r7, TYNUM
    jmp     yeahIFindIt         ; i find it
iGiveUpItIsNotNumber:
tryIdentifier:
    cmp     r4, r1, 'a'
    jz      tryIdentifierYes
    jg      tryIdentifierYes
    jmp     iGiveUpItIsNotIdentifier
tryIdentifierYes:
    li32    r8, strtemp
    inc     r8
    mov     r7, 0
tidentLoop:
    mov     r1, [byte r0]
    cmp     r4, r1, 'a'
    jl      endIdentifier
    mwr8    r8, r1
    inc     r0
    inc     r7
    inc     r8
    jmp     tidentLoop
endIdentifier:
    li32    r8, strtemp
    mwr8    r8, r7              ; write len
tryIdentifyWhatIdentIs:
    li32    r6, identifiers
loop50:
    li32    r8, strtemp
    mov     r7, [byte r6]
    cmp     r9, r7, 0
    jz      skipSpace       ; no more
    mul     r7, r7, 20
    push    r7
    pusha
    mov     r0, r8
    mov     r1, r7
    bl      strcmp
    popa
    pop     r7
    cmp     r4, r9, 1
    jz      isFinded
    inc     r6
    jmp     loop50
isFinded:		
    dec     r0
    div     r8, r7, 20
    mov     r7, TYIDENT
    jmp     yeahIFindIt
iGiveUpItIsNotIdentifier:
    hlt                         ; is nothing bye
yeahIFindIt:
    bl      push_new_token      ; push token
skipSpace:
    inc     r0                  ; inc char index
    jmp     loopp               ; next entry

endParse:
    pop     lnk
    li32    r0, tokens
    push    lnk
    mov     r7, TYEOF
    bl      push_new_token
    pop     lnk
    ret

runTok:
    push    lnk             ; fix bug PPLS
runTokLoop:
    pop     lnk             ; xd
    push    lnk             ; a

    bl      runPeek         ; check token
    cmp     r3, r1, TYEOF   ; verify file end
    jz      end
    cmp     r3, r1, TYIDENT
    jz      execIdent

    cmp     r3, r1, TYNUM   ; check if number
    jz      tryPlayNum      ; yes

    jmp     ignoreItsNotNum ; is not number

tryPlayNum:
    bl      tryPlayNum2
    jmp     runTokLoop

tryPlayNum2:
    push    lnk
    bl      runConsume      ; consume it
    mov     r7, r2          ; save number to fixed HEHE
    bl      runPeek         ; peek
    cmp     r1, r1, TYOPR   ; verify if operator
    jz      isOpr
    
    jmp     isNormalNum     ; no, continue

; ============ OPERATIONS TABLE ============
oprTable:
    dw      runMultiply
    dw      runAddition
    dw      0
    dw      runSubstract
    dw      0
    dw      runDivition

; ============ OPERATIONS FUNCS ============
runMultiply:    mul r7, r7, r8 
                ret
runAddition:    add r7, r7, r8 
                ret
runSubstract:   sub r7, r7, r8 
                ret  
runDivition:    div r7, r7, r8 
                ret
isOpr:
    bl      runConsume      ; check operator
    mov     r9, r2
    bl      runConsume      ; check second number
    mov     r8, r2

    push    r7
    cmp     r7, r1, TYNUM   ; check if number
    pop     r7
    jz      okIsNumberOp2
    jmp     syntax_error    ; no, its not, frozen CPU

okIsNumberOp2:
    li32    r4, oprTable    ; operation table
    sub     r9, r9, '*'     ; trap for smaller code
    mul     r9, r9, 2       ; its word
    add     r4, r4, r9      ; add

    mov     r4, [word r4]   ; get label
    bl      r4              ; jump and link
isNormalNum:
ignoreItsNotNum:
    pop     lnk
    ret      ; jump
    
end:pop     lnk             ; recovery link reg
    ret
syntax_error: hlt           ; error of syntax
execIdent:
	bl      runConsume

    mov     r4, r2 ; get ky

    add     r9, 0, (clear_ident/20)
	cmp     r3, r4, r9
	jz      clearScreen

    add     r9, 0, (rem_ident/20)
	cmp     r3, r4, r9
	jz      runTokLoop

    add     r9, 0, (append_ident/20)
	cmp     r3, r4, r9
	jz      appendCode

    add     r9, 0, (print_ident/20)
	cmp     r3, r4, r9
	jz      printNumber

    add     r9, 0, (clc_ident/20)
	cmp     r3, r4, r9
	jz      earseLines

    add     r9, 0, (run_ident/20)
	cmp     r3, r4, r9
	jz      runProg

	jmp     runTokLoop
runProg:
    li32    r4, testrun
    li32    r3, testrun_i
    mov     r3, [word r3]
    mov     r5, 0
runProgl:
    pusha
    mul     r5, r5, 12
    add     r0, r4, r5
    bl      runPeek

    push    r9
    pusha
    add     r9, 0, (goto_ident/20)
	cmp     r3, r2, r9
    popa
    pop     r9
	jz      gotoLine

    push    lnk
    bl      runTok
    pop     lnk
    popa
finishRunLine:
    mov     r6, r5
    inc     r5
    cmp     r2, r6, r3
    jz      runProgEnd
    jmp     runProgl
runProgEnd:
    jmp     runTokLoop
gotoLine:
    bl      runConsume
    popa
    push    r0
    mul     r5, r5, 12
    add     r0, r4, r5
    add     r0, r0, 2
    bl      runConsume
    mov     r5, r2
    pop     r0
    jmp     runProgl

appendCode:
    li32    r9, testrun_i
    li32    r8, testrun
    mov     r6, [word r9]
    mul     r6, r6, 12
    add     r8, r8, r6
    mov     r7, r0
appendCodeLoop:
    mov     r6, [word r7]
    mwr16   r8, r6

    mov     r1, [byte r0]
    cmp     r2, r1, TYEOF
    jz      appendCodeInc

    add     r8, r8, 2
    add     r0, r0, 2
    add     r7, r7, 2
    jmp     appendCodeLoop
    jmp     runTokLoop
appendCodeInc:
    mov     r6, [word r9]
    inc     r6
    mwr16   r9, r6
    jmp     runTokLoop
clearScreen:
   	li64    r8, 10001h
    mov     r9, 0
   	mwr8 	r8, r9
    jmp     runTokLoop
earseLines:
    push    r7
    push    r6
    li32    r7, testrun_i
    mov     r6, 0
    mwr16   r7, r6
    pop     r6
    pop     r7
    jmp     runTokLoop

printNumber:
	push 	r4
    bl  	tryPlayNum2
    pop 	r4
    push    r4
    push    r3
    push    r7
    mov     r3, r7
    mov     r2, 0
pnuCntDigits:
    div     r3, r3, 10
    cmp     r4, r3, 0
    jz      endCntDi
    inc		r2
    jmp     pnuCntDigits
tenPotspnum:
    db      1
    db      10
    db 		100
endCntDi:
    pop     r7
	pop     r3
    pop     r4
digitpnumll:
    ; r7==30 =10p, r9:3, r4=3/10=0
    li16    r6, tenPotspnum
    add     r6, r6, r2
    mov     r6, [byte r6]
    div     r9, r7, r6
    div     r4, r9, 10
    mul     r4, r4, 10
   	sub     r9, r9, r4
   	add     r9, r9, '0'
   	li64    r8, 10000h
   	mwr8 	r8, r9
    cmp     r3, r2, 0
    dec     r2
    jz      pnumend
    jmp     digitpnumll
pnumend:
    push    r9
    pusha
    li32    r9, 10000h
    mov     r3, 10
    mwr8    r9, r3
    popa
    pop     r9
    jmp     runTokLoop
runPeek:
    mov     r1, [byte r0+0] ; get type
    mov     r2, [byte r0+1] ; get value
    ret
runConsume:
    push    lnk
    bl      runPeek         ; get token
    add     r0, r0, 2       ; next token
    pop     lnk
    ret

testcode:
    reserve 128
testrun:
    reserve ((6*2)*240) ; 240 MAX lines each have only tokens
testrun_i:
    dw 0

align 10000h reserve 32
