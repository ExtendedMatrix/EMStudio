// MICRO-OVERLAY-PER-FINESTRA p.0 · the hand of check-desktop-detach.mjs: real
// mouse and key events for ONE running app (macOS), so WKWebView sees a user's
// gesture (a window opens only inside one), and the app's windows as the
// system lists them.
//
//   swiftc -O post-events.swift -o /tmp/post-events
//   post-events windows <pid>                 → JSON: the pid's on-screen windows
//   post-events front <pid>                   → activates it; exit 3 if it is not frontmost after
//   post-events run <pid> '<json actions>'    → posts them; refuses (exit 3) unless <pid> is frontmost
//   actions: {"t":"move"|"down"|"drag"|"up"|"click"|"rclick","x":…,"y":…,"shift":bool}
//            {"t":"key","code":<virtual key>,"cmd":bool,"shift":bool}   {"t":"sleep","ms":…}
//
// Screen coordinates are the global display's (top-left origin), as
// `window.screenX + rect.x` gives them.
import AppKit
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 3, let pid = pid_t(args[2]) else { print("usage"); exit(2) }

func frontmost() -> pid_t { NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1 }

switch args[1] {
case "windows":
  let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
  let mine = list.filter { ($0[kCGWindowOwnerPID as String] as? pid_t) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
  let out = mine.map { w -> [String: Any] in
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    return ["id": w[kCGWindowNumber as String] ?? 0, "x": b["X"] ?? 0, "y": b["Y"] ?? 0, "w": b["Width"] ?? 0, "h": b["Height"] ?? 0,
            "name": w[kCGWindowName as String] ?? ""]
  }
  let data = try! JSONSerialization.data(withJSONObject: out)
  print(String(data: data, encoding: .utf8)!)
case "front":
  NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateAllWindows])
  for _ in 0..<15 { if frontmost() == pid { break }; usleep(100_000) }
  // macOS may refuse an activation asked by another process: System Events
  if frontmost() != pid {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    p.arguments = ["-e", "tell application \"System Events\" to set frontmost of (first process whose unix id is \(pid)) to true"]
    try? p.run(); p.waitUntilExit()
    for _ in 0..<20 { if frontmost() == pid { break }; usleep(100_000) }
  }
  print(frontmost() == pid ? "front" : "not-front \(frontmost())")
  exit(frontmost() == pid ? 0 : 3)
case "run":
  guard args.count >= 4, let data = args[3].data(using: .utf8),
        let actions = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { print("bad actions"); exit(2) }
  // never a click on whatever else is in front: a press goes only where the
  // TOPMOST window under the point is this app's (a press there brings it
  // forward, as a hand would); a key only while it is the frontmost app
  func ownsPoint(_ p: CGPoint) -> Bool {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]) ?? []
    for w in list where (w[kCGWindowLayer as String] as? Int) == 0 {
      let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
      let r = CGRect(x: (b["X"] as? NSNumber)?.doubleValue ?? 0, y: (b["Y"] as? NSNumber)?.doubleValue ?? 0,
                     width: (b["Width"] as? NSNumber)?.doubleValue ?? 0, height: (b["Height"] as? NSNumber)?.doubleValue ?? 0)
      if r.contains(p) { return (w[kCGWindowOwnerPID as String] as? pid_t) == pid }
    }
    return false
  }
  let src = CGEventSource(stateID: .hidSystemState)
  var last = CGPoint(x: 0, y: 0)
  func num(_ a: [String: Any], _ k: String) -> Double { (a[k] as? NSNumber)?.doubleValue ?? 0 }
  func mouse(_ type: CGEventType, _ p: CGPoint, _ shift: Bool, _ button: CGMouseButton = .left) {
    let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: p, mouseButton: button)!
    if shift { e.flags = .maskShift }
    e.post(tap: .cghidEventTap)
    usleep(16_000)
  }
  for a in actions {
    let t = a["t"] as? String ?? ""
    let p = CGPoint(x: num(a, "x"), y: num(a, "y"))
    let shift = (a["shift"] as? Bool) ?? false
    if ["down", "click", "rclick"].contains(t) && !ownsPoint(p) { print("not-mine \(p)"); exit(3) }
    if t == "key" && frontmost() != pid { print("not-front \(frontmost())"); exit(3) }
    switch t {
    case "move": mouse(.mouseMoved, p, shift); last = p
    case "down": mouse(.leftMouseDown, p, shift); last = p
    case "drag":
      // in steps, as a hand
      let n = 8
      for i in 1...n {
        let q = CGPoint(x: last.x + (p.x - last.x) * Double(i) / Double(n), y: last.y + (p.y - last.y) * Double(i) / Double(n))
        mouse(.leftMouseDragged, q, shift)
      }
      last = p
    case "up": mouse(.leftMouseUp, p, shift); last = p
    case "click": mouse(.leftMouseDown, p, shift); mouse(.leftMouseUp, p, shift); last = p
    case "rclick": mouse(.rightMouseDown, p, shift, .right); mouse(.rightMouseUp, p, shift, .right); last = p
    case "key":
      let code = CGKeyCode(num(a, "code"))
      var flags: CGEventFlags = []
      if (a["cmd"] as? Bool) == true { flags.insert(.maskCommand) }
      if shift { flags.insert(.maskShift) }
      for down in [true, false] {
        let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down)!
        e.flags = flags
        e.post(tap: .cghidEventTap)
        usleep(16_000)
      }
    case "sleep": usleep(useconds_t(num(a, "ms") * 1000))
    default: break
    }
  }
  print("ok")
default:
  print("usage"); exit(2)
}
