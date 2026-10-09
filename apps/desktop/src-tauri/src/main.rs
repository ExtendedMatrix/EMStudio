// EMStudio desktop shell — wraps the web frontend. Native Open/Save/Save-As
// come from tauri-plugin-dialog + tauri-plugin-fs (routed in
// frontend/src/tauri.ts).
//
// GraphML import/export can't run in the webview (invariant 2: the EM
// transformer is s3Dgraphy, in Python). The frontend POSTs to an HTTP
// "transformer" service exposing /graphml + /import-graphml. That service is
// PLUGGABLE:
//   * EM_TRANSFORMER_URL set  → use that endpoint (e.g. a remote StratiGraph
//     server, one of several dockerised services) and start nothing locally;
//   * otherwise               → spawn the bundled `em-bridge` sidecar
//     (tools/em_bridge.py frozen with s3Dgraphy, see build-bridge.sh) on
//     localhost and use it — the silent local pipe.
// The frontend asks which URL to use via the `transformer_url` command.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Port the local sidecar listens on (matches the frontend browser-dev
/// default, so `?bridge=`/`EM_BRIDGE` overrides still line up).
const BRIDGE_PORT_DEFAULT: u16 = 8765;
/// B3 (s3Dgraphy#25, Enzo Cocca) · how many ports after the default are tried
/// when the default belongs to ANOTHER program (not an em-bridge).
const BRIDGE_PORT_TRIES: u16 = 10;
/// The port the bridge actually uses. Decided once at launch; the frontend
/// reads it through `transformer_url`, as it always did, so moving the bridge
/// to 8766 changes nothing on its side.
static BRIDGE_PORT: AtomicU16 = AtomicU16::new(BRIDGE_PORT_DEFAULT);

fn bridge_port() -> u16 {
    BRIDGE_PORT.load(Ordering::Relaxed)
}

/// Holds the spawned sidecar so we can kill it when the app exits.
struct BridgeChild(Mutex<Option<CommandChild>>);

// ── the LLM API key ────────────────────────────────────────────────────────
//
// EM Narrative can ask a model to draft a chapter (N5). That call needs an API
// key, and the key is the one genuinely dangerous thing this app holds. The
// rules, in order of importance:
//
//   * it NEVER reaches the frontend — no localStorage, no em.json, no log. The
//     webview can set it, clear it, and ask whether one exists; it can never
//     read it back.
//   * it lives in the OS keychain, not in a file we wrote.
//   * it reaches the model only through em-bridge's ENVIRONMENT, which is where
//     `tools/llm_provider.py` reads `ANTHROPIC_API_KEY` at call time.
//
// Without a keychain (a browser-served dev build) there is no safe place to put
// it, so the frontend says so and the user exports the env var before ./dev.sh.
// Degrading to "store it in plain text" would be worse than not offering it.

const KEYRING_SERVICE: &str = "org.extendedmatrix.emstudio";
const KEYRING_USER: &str = "anthropic-api-key";

/// What to say when there is no credential store to write to. Names the one
/// safe alternative instead of just reporting a failure — most often a Linux
/// box with no Secret Service daemon (headless, bare WM, or a locked keyring).
fn no_store_message(detail: &str) -> String {
    format!(
        "nessun portachiavi disponibile su questo sistema ({detail}). \
         Su Linux serve un Secret Service attivo (GNOME Keyring, KWallet). \
         In alternativa esporta la key nell'ambiente prima di avviare \
         l'applicazione:  export ANTHROPIC_API_KEY=…"
    )
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

/// The key, for injection into the sidecar's environment. Never returned to the
/// webview — only this file calls it.
fn stored_llm_key() -> Option<String> {
    keyring_entry().ok()?.get_password().ok()
}

/// What the Settings panel is allowed to know: whether a keychain answered at
/// all, and whether something is in it. Never the key.
///
/// The two flags are separate because the failures are separate. On Linux the
/// Secret Service is a running daemon, not a guarantee: a headless box, a bare
/// window manager, or a locked keyring all mean "no store here". Collapsing
/// that into `set = false` would tell the user they have no key saved when the
/// truth is that this machine cannot save one — and they would paste it again,
/// and again.
#[derive(serde::Serialize)]
struct KeyStatus {
    /// a credential store answered
    available: bool,
    /// …and it holds a non-empty key
    set: bool,
    /// why not, when `available` is false — shown verbatim to the user
    detail: String,
}

/// Probe the credential store. `NoEntry` is a WORKING store with nothing in it;
/// any other error means the store itself is out of reach.
#[tauri::command]
fn llm_key_status() -> KeyStatus {
    let entry = match keyring_entry() {
        Ok(e) => e,
        Err(detail) => {
            return KeyStatus { available: false, set: false, detail }
        }
    };
    match entry.get_password() {
        Ok(key) => KeyStatus {
            available: true,
            set: !key.trim().is_empty(),
            detail: String::new(),
        },
        Err(keyring::Error::NoEntry) => KeyStatus {
            available: true,
            set: false,
            detail: String::new(),
        },
        Err(e) => KeyStatus {
            available: false,
            set: false,
            detail: e.to_string(),
        },
    }
}

/// Store the key and restart the bridge so it picks it up.
///
/// The restart is not a nicety: the sidecar is spawned at launch, before the
/// user has pasted anything, and a process's environment cannot be changed from
/// outside. Without this, a key saved in Settings would appear to work and then
/// fail on every generation until the app was restarted.
#[tauri::command]
fn set_llm_key(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("empty key".into());
    }
    let entry = keyring_entry().map_err(|e| no_store_message(&e))?;
    entry
        .set_password(&key)
        .map_err(|e| no_store_message(&e.to_string()))?;
    restart_bridge(&app);
    Ok(true)
}

#[tauri::command]
fn clear_llm_key(app: tauri::AppHandle) -> Result<bool, String> {
    let entry = keyring_entry().map_err(|e| no_store_message(&e))?;
    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(no_store_message(&e.to_string())),
    }
    restart_bridge(&app);
    Ok(true)
}

/// Where the frontend should POST GraphML transform requests: a remote
/// StratiGraph server if configured, else the local sidecar.
#[tauri::command]
fn transformer_url() -> String {
    std::env::var("EM_TRANSFORMER_URL")
        .unwrap_or_else(|_| format!("http://localhost:{}", bridge_port()))
}

// ── what waits for the page: files to open, things to say ──────────────────
//
// B2 (s3Dgraphy#25, Enzo Cocca, 7 Oct 2026) · a file given to the app — on the
// command line (`emstudio file.em.json`, Windows/Linux and a terminal on any OS),
// by macOS (double click, «Open With», `open -a EMStudio file.em.json`, which
// arrive as an Apple event, never in argv) or to a second launch on Windows and
// Linux (handed to this instance by single-instance) — opens as «Open an
// em.json» would. They arrive BEFORE the page can listen (argv and the launch
// event come during setup), and an event emitted to nobody is lost: so they
// wait here, the page takes them when it is ready (`take_desktop_queue`), and
// a later arrival only nudges it (`desktop-queue`). The bridge's launch-time
// notices (B3) travel the same way, for the same reason: emitted from `setup`
// they reached stderr only.

#[derive(Default, serde::Serialize)]
struct DesktopQueue {
    files: Vec<String>,
    notices: Vec<String>,
}

struct Pending(Mutex<DesktopQueue>);

/// What the page has not taken yet; emptied by the call.
#[tauri::command]
fn take_desktop_queue(state: tauri::State<Pending>) -> DesktopQueue {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// The files among command-line arguments: existing files, made absolute
/// against `cwd` (a second instance's arguments are relative to ITS directory).
/// Flags (`-psn_…` from an old Finder, `--…`) and URLs (a deep link) are not files.
fn files_in_args<I: IntoIterator<Item = String>>(args: I, cwd: &std::path::Path) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-') && !a.contains("://"))
        .map(|a| {
            let p = std::path::PathBuf::from(&a);
            if p.is_absolute() { p } else { cwd.join(p) }
        })
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// Queue files to open and nudge the page (which may not be listening yet:
/// then it finds them when it asks).
fn queue_files(app: &tauri::AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    app.state::<Pending>().0.lock().unwrap().files.extend(files);
    let _ = app.emit("desktop-queue", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Queue a notice for the page (shown as a toast and logged there) and print
/// it, so a terminal launch sees it too.
fn queue_notice(app: &tauri::AppHandle, message: String) {
    eprintln!("[emstudio] {message}");
    app.state::<Pending>().0.lock().unwrap().notices.push(message);
    let _ = app.emit("desktop-queue", ());
}

/// Spawn the bundled bridge, injecting the stored API key into its environment.
///
/// The key is passed as an env var and nowhere else: it is not an argument (a
/// `ps` listing would show it), not a file, not a log line.
fn spawn_bridge(app: &tauri::AppHandle) {
    let cmd = match app.shell().sidecar("em-bridge") {
        Ok(cmd) => cmd,
        Err(e) => {
            eprintln!("[emstudio] em-bridge sidecar not found: {e}");
            return;
        }
    };
    let mut env = std::collections::HashMap::new();
    if let Some(key) = stored_llm_key() {
        env.insert("ANTHROPIC_API_KEY".to_string(), key);
    }
    match cmd
        .args(["--port", &bridge_port().to_string(), "--exit-with-parent"])
        .envs(env)
        .spawn()
    {
        Ok((mut rx, child)) => {
            app.state::<BridgeChild>().0.lock().unwrap().replace(child);
            // Drain the sidecar's stdout/stderr. If we drop the receiver, the
            // pipe's read end closes and the bridge's first print() hits EPIPE —
            // the Python server then dies with the socket already bound, i.e.
            // listening but never answering (the "transformer not reachable"
            // wedge).
            tauri::async_runtime::spawn(async move {
                while rx.recv().await.is_some() {}
            });
        }
        Err(e) => eprintln!("[emstudio] em-bridge sidecar spawn failed: {e}"),
    }
}

/// Is something listening on the bridge port right now?
///
/// A connect attempt, not a bind attempt: binding would briefly occupy the port
/// ourselves and race with the very thing we are trying to observe.
fn bridge_port_busy() -> bool {
    port_busy(bridge_port())
}

fn port_busy(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(150)).is_ok()
}

/// Who holds a port: nobody, an em-bridge (`./dev.sh`, a leftover sidecar), or
/// something else — another program, or a bridge that no longer answers (the
/// orphan of a killed app keeps the socket bound and answers nothing: measured
/// on 9 Oct 2026, it is not a bridge anyone can use).
#[derive(Debug, PartialEq)]
enum PortHolder {
    Free,
    Bridge,
    Other,
}

/// Ask the port who it is: an em-bridge answers `GET /health` with
/// `"service": "em_bridge"` (tools/em_bridge.py). Anything else — no answer,
/// another protocol, another HTTP server — is another program.
fn port_holder(port: u16) -> PortHolder {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(150)) else {
        return PortHolder::Free;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
    if stream
        .write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n")
        .is_err()
    {
        return PortHolder::Other;
    }
    let mut buf = Vec::new();
    let _ = stream.take(16 * 1024).read_to_end(&mut buf);
    if String::from_utf8_lossy(&buf).contains("em_bridge") {
        PortHolder::Bridge
    } else {
        PortHolder::Other
    }
}

/// B3 · the first free port after `start`, among the next `tries`.
fn next_free_port(start: u16, tries: u16) -> Option<u16> {
    (1..=tries)
        .filter_map(|k| start.checked_add(k))
        .find(|&p| !port_busy(p))
}

/// What to say when the default port belongs to another program — the port,
/// and what the app did about it. Not a word about the keychain: the key has
/// nothing to do with it.
fn port_taken_message(taken: u16, used: Option<u16>) -> String {
    match used {
        Some(p) => format!(
            "La porta {taken} è occupata da un processo che non risponde come \
             il bridge di EMStudio: il bridge locale usa la porta {p}."
        ),
        None => format!(
            "Le porte da {taken} a {} sono occupate da altri processi: il bridge \
             locale non è partito (import/export GraphML e generazione non \
             disponibili). Libera la porta {taken} e riavvia l'app.",
            taken.saturating_add(BRIDGE_PORT_TRIES)
        ),
    }
}

/// Wait until nothing answers on the bridge port. Returns false on timeout.
///
/// **Why this exists (K1).** `restart_bridge` used to `kill()` the sidecar and
/// call `spawn_bridge` on the next line. `kill()` sends the signal and returns —
/// it does not wait for the process to die, and the listening socket outlives it
/// by a few milliseconds. The fresh bridge, the one carrying the newly saved API
/// key in its environment, therefore hit `Address already in use` and exited,
/// leaving the OLD keyless bridge answering (or nothing at all). That is exactly
/// the bug: the keychain has the key, Settings says "key set", and generation
/// answers "no API key".
///
/// Polling the port rather than sleeping a fixed interval, because the port is
/// the actual precondition — a blind `sleep(500ms)` would be both slower than
/// needed on a fast machine and still too short on a loaded one.
fn wait_for_bridge_port_free(timeout: std::time::Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if !bridge_port_busy() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    !bridge_port_busy()
}

/// Tell the frontend that the bridge on :8765 is not ours, so the key cannot
/// reach it. Emitted instead of logging-and-carrying-on, because "silently talks
/// to a bridge without the key" is the failure mode that cost an evening.
fn foreign_bridge_message() -> String {
    format!(
        "Un altro bridge è già in ascolto sulla porta {} e non è stato \
         avviato dall'app: la key del portachiavi non lo raggiunge. Chiudi quel \
         processo (tipicamente ./dev.sh) e riavvia l'app, oppure esporta \
         ANTHROPIC_API_KEY nell'ambiente di quel bridge.",
        bridge_port()
    )
}

fn warn_foreign_bridge(app: &tauri::AppHandle) {
    let message = foreign_bridge_message();
    eprintln!("[emstudio] {message}");
    // Best effort: if the webview is not up yet the event is simply lost, and the
    // stderr line above remains.
    let _ = app.emit("bridge-foreign", message);
}

/// Kill the running sidecar and start a fresh one, so an environment change
/// (the API key) actually takes effect. A no-op when a remote transformer is
/// configured — there is no local process to restart.
///
/// The order matters and is the whole fix: kill → **wait for the port** → spawn.
fn restart_bridge(app: &tauri::AppHandle) {
    if std::env::var("EM_TRANSFORMER_URL").is_ok() {
        return;
    }
    // The state handle must outlive the lock guard, hence the `let` binding:
    // locking a temporary would drop it at the end of the statement.
    let state = app.state::<BridgeChild>();
    let taken = state.0.lock().unwrap().take();
    let had_child = match taken {
        Some(child) => {
            let _ = child.kill();
            true
        }
        None => false,
    };

    if had_child {
        // Our own sidecar was told to die; wait for it to let go of the socket.
        if !wait_for_bridge_port_free(std::time::Duration::from_secs(5)) {
            // Five seconds and still occupied: either the kill did not take, or
            // something else has taken the port in the meantime. Spawning now
            // would produce the silent keyless-bridge state, so say so instead.
            warn_foreign_bridge(app);
            return;
        }
    } else if bridge_port_busy() {
        // Nothing of ours was running and yet the port answers: a foreign bridge
        // (usually ./dev.sh). Spawning would just fail with EADDRINUSE and leave
        // the user talking to a bridge that has no key.
        warn_foreign_bridge(app);
        return;
    }

    spawn_bridge(app);
}

fn main() {
    tauri::Builder::default()
        // FIRST, as the plugin requires. On Windows and Linux the OS answers a
        // deep link by starting the app AGAIN; this hands the link to the
        // instance already open (feature `deep-link`: it arrives there through
        // `onOpenUrl`) and brings its window forward. That instance is the one
        // holding the sign-in's nonce and PKCE verifier — a second one would
        // have neither and could only refuse the answer.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            // B2 · `emstudio other.em.json` while EMStudio is open (and a
            // double click on Windows/Linux, which is the same thing): the
            // file opens HERE
            let files = files_in_args(argv.into_iter().skip(1), std::path::Path::new(&cwd));
            queue_files(app, files);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        // THE HANDOFF. The OS hands us `stratigraph://open?server=&room=` and
        // this delivers it to the frontend, which reads `{server, room}`, signs
        // in against that server by itself and joins the room — the whole point
        // being that nobody types an address, a room name, or a token.
        //
        // `register_all` at runtime as well as the bundle declaration: the
        // bundle registers the scheme at INSTALL time, and a developer running
        // `tauri dev` has installed nothing. Without this, the one person most
        // likely to test the feature is the one for whom it silently does not
        // work.
        .plugin(tauri_plugin_deep_link::init())
        // SIGN-IN in the system browser (ORCID, the node's Keycloak): the
        // webview never shows a login page. Scope in capabilities/default.json.
        .plugin(tauri_plugin_opener::init())
        .manage(BridgeChild(Mutex::new(None)))
        .manage(Pending(Mutex::new(DesktopQueue::default())))
        .invoke_handler(tauri::generate_handler![
            transformer_url,
            take_desktop_queue,
            llm_key_status,
            set_llm_key,
            clear_llm_key
        ])
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions,
                                              windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                // Best-effort and SAID rather than unwrapped: a scheme this
                // desktop cannot claim is a link that opens elsewhere, which is
                // a worse day than a log line but not a reason to refuse to
                // start.
                if let Err(error) = app.deep_link().register_all() {
                    eprintln!("deep-link: could not register stratigraph:// \
                               and org.extendedmatrix.emstudio: at runtime \
                               ({error}); the installed bundle's \
                               registration still applies");
                }
            }
            // T2 · «Settings…» (⌘,) in the app's own menu, where a Mac user
            // looks for it; it opens the same Settings as Edit › Settings….
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
                let handle = app.handle();
                let menu = Menu::default(handle)?;
                if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
                    let settings = MenuItem::with_id(handle, "settings", "Settings…", true,
                                                     Some("CmdOrCtrl+,"))?;
                    let sep = PredefinedMenuItem::separator(handle)?;
                    app_menu.insert_items(&[&sep, &settings], 1)?;
                }
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    if event.id() == "settings" {
                        let _ = app.emit("open-settings", ());
                    }
                });
            }
            // B2 · the files this launch was given on the command line
            if let Ok(cwd) = std::env::current_dir() {
                let files = files_in_args(std::env::args().skip(1), &cwd);
                app.state::<Pending>().0.lock().unwrap().files.extend(files);
            }
            // A remote transformer is configured → nothing to start locally.
            if std::env::var("EM_TRANSFORMER_URL").is_ok() {
                return Ok(());
            }
            // Silent local pipe: spawn the frozen s3Dgraphy bridge. If the
            // sidecar is missing (build-bridge.sh not run) the spawn logs and the
            // GraphML buttons surface a clear toast when nothing answers.
            //
            // If the port is ALREADY taken at launch it is somebody else's bridge
            // (./dev.sh, or a leftover). GraphML through it still works, so the
            // app carries on — but the keychain key does NOT reach it, and that is
            // now said out loud rather than discovered later as "no API key".
            //
            // B3 · …and if it is ANOTHER program (not an em-bridge), the bridge
            // moves to the next free port and the message says which port is
            // taken and which one is used — before, it spoke of the keychain.
            match port_holder(BRIDGE_PORT_DEFAULT) {
                PortHolder::Free => spawn_bridge(app.handle()),
                PortHolder::Bridge => queue_notice(app.handle(), foreign_bridge_message()),
                PortHolder::Other => {
                    let next = next_free_port(BRIDGE_PORT_DEFAULT, BRIDGE_PORT_TRIES);
                    queue_notice(app.handle(), port_taken_message(BRIDGE_PORT_DEFAULT, next));
                    if let Some(p) = next {
                        BRIDGE_PORT.store(p, Ordering::Relaxed);
                        spawn_bridge(app.handle());
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building EMStudio")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => {
                if let Some(child) = app.state::<BridgeChild>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
            // B2 · macOS hands files over as an Apple event (double click,
            // «Open With», `open -a EMStudio file.em.json`), at launch or while
            // the app runs. Deep links come this way too: only `file:` URLs
            // are files.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let files: Vec<String> = urls
                    .iter()
                    .filter(|u| u.scheme() == "file")
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                queue_files(app, files);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_in_args_keeps_existing_files_and_makes_them_absolute() {
        let dir = std::env::temp_dir().join(format!("emstudio-args-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let doc = dir.join("scavo.em.json");
        std::fs::write(&doc, "{}").unwrap();
        let got = files_in_args(
            vec![
                "scavo.em.json".to_string(),          // relative to cwd
                doc.to_string_lossy().into_owned(),   // absolute
                "-psn_0_12345".to_string(),           // an old Finder's flag
                "--verbose".to_string(),
                "stratigraph://open?room=x".to_string(), // a deep link
                "missing.em.json".to_string(),        // not there
            ],
            &dir,
        );
        let want = doc.to_string_lossy().into_owned();
        assert_eq!(got, vec![want.clone(), want]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_port_held_by_another_program_is_other_and_the_next_is_used() {
        use std::io::{Read, Write};
        // another program: answers anything with a non-bridge body
        let other = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = other.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in other.incoming().take(1) {
                let mut s = s.unwrap();
                let mut b = [0u8; 512];
                let _ = s.read(&mut b);
                let _ = s.write_all(b"HTTP/1.0 200 OK\r\n\r\n{\"service\": \"jupyter\"}");
            }
        });
        assert_eq!(port_holder(port), PortHolder::Other);
        // an em-bridge: its /health names the service
        let bridge = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let bport = bridge.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for s in bridge.incoming().take(1) {
                let mut s = s.unwrap();
                let mut b = [0u8; 512];
                let _ = s.read(&mut b);
                let _ = s.write_all(b"HTTP/1.0 200 OK\r\n\r\n{\"ok\": true, \"service\": \"em_bridge\"}");
            }
        });
        assert_eq!(port_holder(bport), PortHolder::Bridge);
        // a free port
        let free = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let fport = free.local_addr().unwrap().port();
        drop(free);
        assert_eq!(port_holder(fport), PortHolder::Free);
        // the message names the taken port and the one used, not the keychain
        let m = port_taken_message(8765, Some(8766));
        assert!(m.contains("8765") && m.contains("8766") && !m.contains("portachiavi"), "{m}");
        // …and the page reads the port it moved to, as it always read it
        if std::env::var("EM_TRANSFORMER_URL").is_err() {
            BRIDGE_PORT.store(8771, Ordering::Relaxed);
            assert_eq!(transformer_url(), "http://localhost:8771");
            BRIDGE_PORT.store(BRIDGE_PORT_DEFAULT, Ordering::Relaxed);
        }
        let none = port_taken_message(8765, None);
        assert!(none.contains("8765") && none.contains("8775") && !none.contains("portachiavi"), "{none}");
    }
}
