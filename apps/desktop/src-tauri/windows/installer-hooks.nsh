; MICRO-INSTALLER-PULSANTE p.1 · the Windows installer closes em-bridge before
; it copies.
;
; Measured on E.D.'s Windows (21 Oct 2026): every update stopped on «Error
; opening file for writing: …\AppData\Local\EMStudio\em-bridge.exe» (Abort /
; Retry / Ignore). Three em-bridge.exe were still running — sidecars of
; earlier sessions, left behind because the updater ends the app with
; `std::process::exit(0)` and a bridge older than dev.57 does not notice its
; app is gone. «Ignore» kept the OLD bridge (level 33), and the Space showed no
; models: that was the real cause.
;
; Tauri's template (tauri-cli 2.11, installer.nsi) checks only the MAIN binary
; (`CheckIfAppIsRunning "${MAINBINARYNAME}.exe"`); the sidecar it copies under
; `File /a "/oname=em-bridge.exe"` is nobody's. These hooks are inserted at the
; top of `Section Install` and `Section Uninstall`, before that check and
; before any file is touched, for the automatic update (`/UPDATE`) and for an
; installer started by hand alike.
;
; What they do:
;   1. close EVERY em-bridge.exe of this user — `KillProcessCurrentUser` of
;      nsis_tauri_utils, the plugin the template itself uses for the app (no
;      console window, only this user's processes). A PyInstaller bridge is two
;      processes with the same name, so both go;
;   2. wait until no em-bridge.exe of this user is left and the installed
;      em-bridge.exe opens for writing — up to 20 × 250 ms;
;   3. still locked: `taskkill /F /T /IM em-bridge.exe` filtered on this user
;      (the tree, for a child the plugin could not end), and wait again;
;   4. go on either way. If the file is still held, NSIS's own «Error opening
;      file for writing» comes, as before — this never makes an install fail
;      that would not have failed without it.
;
; The app being open when an installer is started by hand: its bridge is
; closed here, then the template asks to close the app. Answered «Cancel», the
; app stays open without its local bridge until it is restarted (declared).

!include LogicLib.nsh

!define EM_BRIDGE_EXE "em-bridge.exe"

; $R0 plugin answer · $R1 tries · $R2 file handle · $R3 «still there»
!macro EM_BRIDGE_WAIT_FREE
  StrCpy $R1 0
  ${Do}
    StrCpy $R3 0
    nsis_tauri_utils::FindProcessCurrentUser "${EM_BRIDGE_EXE}"
    Pop $R0
    ${If} $R0 = 0
      StrCpy $R3 1
    ${ElseIf} ${FileExists} "$INSTDIR\${EM_BRIDGE_EXE}"
      ClearErrors
      FileOpen $R2 "$INSTDIR\${EM_BRIDGE_EXE}" a
      ${If} ${Errors}
        StrCpy $R3 1
      ${Else}
        FileClose $R2
      ${EndIf}
    ${EndIf}
    ${IfThen} $R3 = 0 ${|} ${Break} ${|}
    IntOp $R1 $R1 + 1
    ${IfThen} $R1 >= 20 ${|} ${Break} ${|}
    Sleep 250
  ${Loop}
!macroend

!macro EM_STOP_BRIDGE
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  DetailPrint "EMStudio: closing em-bridge.exe (the local bridge) before the files are copied"
  nsis_tauri_utils::KillProcessCurrentUser "${EM_BRIDGE_EXE}"
  Pop $R0
  !insertmacro EM_BRIDGE_WAIT_FREE
  ${If} $R3 = 1
    ReadEnvStr $R4 USERNAME
    DetailPrint "EMStudio: em-bridge.exe still holds its file — taskkill /F /T"
    nsExec::ExecToLog 'taskkill /F /T /IM "${EM_BRIDGE_EXE}" /FI "USERNAME eq $R4"'
    Pop $R0
    !insertmacro EM_BRIDGE_WAIT_FREE
  ${EndIf}
  ${If} $R3 = 1
    DetailPrint "EMStudio: em-bridge.exe could not be closed — close it in Task Manager if the copy fails"
  ${EndIf}
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro EM_STOP_BRIDGE
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro EM_STOP_BRIDGE
!macroend
