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

// ── EMStudio Lab (`./em.sh labrel`, docs/LAB.md) ──────────────────────────
//
// The lab build is the SAME shell, compiled with `EMSTUDIO_LAB=1` in the
// environment (labrel sets it; `option_env!` makes cargo rebuild when it
// changes). It installs BESIDE the public app (its own identifier, from
// tauri.lab.conf.json) and must not touch it while both run:
//
//   * the bridge's port: the public app considers an `em-bridge` on 8765 an
//     orphan of its own and CLOSES it (`decide_launch`). A lab app on the same
//     port would kill the public app's bridge, and vice versa — so the lab
//     starts at 8865, whose 10 fallbacks (…8875) never meet the public ones;
//   * the keychain entry, and the bridge's state directory (EM_BRIDGE_STATE_DIR,
//     ~/.config/emstudio-lab): granted folders, geo cache, staging;
//   * the updater: a lab app never installs a public release over itself.
const LAB: bool = option_env!("EMSTUDIO_LAB").is_some();

/// Port the local sidecar listens on (matches the frontend browser-dev
/// default, so `?bridge=`/`EM_BRIDGE` overrides still line up). The lab build
/// uses its own (see `LAB`).
const BRIDGE_PORT_DEFAULT: u16 = if LAB { 8865 } else { 8765 };
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

const KEYRING_SERVICE: &str = if LAB { "org.extendedmatrix.emstudio.lab" } else { "org.extendedmatrix.emstudio" };
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

/// MICRO-DOVE-CHI-MENU p.7 · the repository whose Releases carry the updates.
const RELEASES_REPO: &str = "ExtendedMatrix/EMStudio";

/// Install the update of release `tag` and restart.
///
/// WHICH release is the page's choice (it asked GitHub for the newest one of
/// the installed version's channel); this only refuses a tag that is not newer
/// than what runs, and lets the plugin do the rest: `latest.json` of THAT
/// release, the platform's archive, its signature checked against the public
/// key in tauri.conf.json — an unsigned or foreign archive is refused there.
///
/// The plugin's own "is it newer" is switched off on purpose: it compares the
/// BUNDLE's version, which is `x.y.z` for every dev build (set-version.mjs), so
/// dev.51 would never look newer than dev.50. Cargo's version is the full one.
#[tauri::command]
async fn update_install(app: tauri::AppHandle, tag: String) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    if LAB {
        // RELEASES_REPO is the PUBLIC channel: its archive would turn this
        // EMStudio Lab into the public EMStudio, in place. A lab build is
        // updated by installing the next `./em.sh labrel` (docs/LAB.md).
        return Err("EMStudio Lab non si aggiorna da sé: installa la prossima \
                    release lab (ExtendedMatrix/EMStudio-lab)".to_string());
    }
    if !tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err(format!("not a release tag: {tag}"));
    }
    let wanted = semver::Version::parse(tag.trim_start_matches('v'))
        .map_err(|e| format!("{tag}: {e}"))?;
    let installed = semver::Version::parse(env!("CARGO_PKG_VERSION"))
        .map_err(|e| e.to_string())?;
    if wanted <= installed {
        return Err(format!("{wanted} is not newer than {installed}"));
    }
    let url: tauri::Url = format!("https://github.com/{RELEASES_REPO}/releases/download/{tag}/latest.json")
        .parse()
        .map_err(|e| format!("{e}"))?;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .version_comparator(|_, _| true)
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("{tag} has no update for this platform"))?;
    // MICRO-WINDOWS-MODELLI p.3 · the sidecar is closed BEFORE the installer:
    // on Windows `install` ends the app with `std::process::exit(0)` (no
    // `RunEvent::Exit`), and the sidecar left behind kept port 8765 for the
    // version just installed. Downloaded first, so a failed download leaves
    // the bridge running; a failed install starts it again.
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    stop_bridge(&app);
    if let Err(e) = update.install(bytes) {
        spawn_bridge(&app);
        return Err(e.to_string());
    }
    app.restart();
}

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

// ── the main window never leaves the app without a way back ────────────────
//
// APRI IN EMSTUDIO (13 Oct 2026) · Blender's «Open in EMStudio» sent the room
// EMStudio was already in, and the MAIN WINDOW went to the realm's login page —
// «Parametro non valido: redirect_uri», no button, no menu: E.D. got back by
// pressing ⌫ by chance. Two rules, in this order:
//
//   1. a SIGN-IN page (an OAuth authorization request, a logout, the realm's
//      login actions) is never shown in the main window: it opens in the system
//      browser — where the sign-in belongs — and the window stays where it was;
//   2. if the main window shows a page that is not EMStudio anyway (an error
//      page, a link followed by accident), a bar «Torna a EMStudio» goes on top
//      of it, and ⌘[ goes back.
//
// Only sign-in pages are stopped, not every foreign URL: on macOS the webview
// asks the same question for an IFRAME (wry does not tell the main frame apart),
// and the 3D embeds of a chapter are iframes on other origins.

/// Is this one of the app's own pages? The bundle's (`tauri://localhost`,
/// `http(s)://tauri.localhost`), `tauri dev`'s (`devUrl`, localhost:5173), and
/// the URLs a page makes for itself.
fn is_app_url(url: &str) -> bool {
    let Ok(u) = tauri::Url::parse(url) else { return false };
    match u.scheme() {
        "tauri" | "asset" | "about" | "data" | "blob" => true,
        "http" | "https" => {
            let host = u.host_str().unwrap_or("");
            host == "tauri.localhost"
                || (cfg!(debug_assertions)
                    && matches!(host, "localhost" | "127.0.0.1")
                    && u.port() == Some(5173))
        }
        _ => false,
    }
}

/// Is this a sign-in (or sign-out) page of an identity provider? Recognised by
/// what makes it one — the OAuth request's own parameters, or Keycloak's
/// endpoints — not by a list of hosts that would be wrong on the next node.
fn is_sign_in_page(url: &str) -> bool {
    let Ok(u) = tauri::Url::parse(url) else { return false };
    if !matches!(u.scheme(), "http" | "https") || is_app_url(url) {
        return false;
    }
    let path = u.path();
    if path.contains("/protocol/openid-connect/") || path.contains("/login-actions/") {
        return true;
    }
    let has = |k: &str| u.query_pairs().any(|(key, _)| key == k);
    (has("client_id") && (has("response_type") || has("redirect_uri")))
        || has("post_logout_redirect_uri")
}

/// What goes on top of a page that is not EMStudio: the bar, and ⌘[. `back`
/// is where the bar goes when the page has no history to go back to.
fn return_bar_script(back: &str) -> String {
    let back = serde_json::to_string(back).unwrap_or_else(|_| "\"tauri://localhost/\"".into());
    format!(
        r#"(function () {{
  if (document.getElementById("emstudio-return-bar")) return;
  var back = {back};
  function go() {{ if (history.length > 1) history.back(); else location.href = back; }}
  var bar = document.createElement("div");
  bar.id = "emstudio-return-bar";
  bar.setAttribute("style", "position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:8px 14px;background:#1f2933;color:#fff;font:14px -apple-system,system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4)");
  var b = document.createElement("button");
  b.textContent = "← Torna a EMStudio";
  b.setAttribute("style", "font:inherit;padding:4px 12px;border-radius:4px;border:0;background:#fff;color:#1f2933;cursor:pointer");
  b.onclick = go;
  var s = document.createElement("span");
  s.textContent = "Questa pagina non è EMStudio (⌘[ per tornare)";
  bar.appendChild(b); bar.appendChild(s);
  (document.body || document.documentElement).appendChild(bar);
  document.addEventListener("keydown", function (e) {{
    if ((e.metaKey || e.ctrlKey) && e.key === "[") {{ e.preventDefault(); go(); }}
  }}, true);
}})();"#
    )
}

/// The last app page the main window showed — where «Torna a EMStudio» goes
/// when there is no history.
static APP_PAGE: Mutex<Option<String>> = Mutex::new(None);

fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|webview, url| {
            if !is_sign_in_page(url.as_str()) {
                return true;
            }
            eprintln!("[emstudio] sign-in page sent to the system browser: {}",
                      url.as_str().split('?').next().unwrap_or(""));
            use tauri_plugin_opener::OpenerExt;
            if let Err(e) = webview.app_handle().opener().open_url(url.as_str(), None::<&str>) {
                eprintln!("[emstudio] the system browser did not open: {e}");
            }
            false
        })
        .on_page_load(|webview, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }
            let url = payload.url().as_str();
            if is_app_url(url) {
                *APP_PAGE.lock().unwrap() = Some(url.to_string());
                return;
            }
            let back = APP_PAGE.lock().unwrap().clone()
                .unwrap_or_else(|| "tauri://localhost/".to_string());
            let _ = webview.eval(&return_bar_script(&back));
        })
        .build()
}

/// Bring the main window forward — a deep link was meant for it.
fn bring_forward(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
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
    // MICRO-WINDOWS-MODELLI p.3 · the bridge watches THIS process and leaves
    // with it, however it ends (on Windows `getppid` never changes, and the
    // updater ends the app with `std::process::exit`): an environment variable,
    // so an older sidecar binary is not refused an argument it does not know
    env.insert("EM_BRIDGE_PARENT_PID".to_string(), std::process::id().to_string());
    // EMStudio Lab · its own state directory (see `LAB`), unless the person
    // chose one in the environment
    if LAB && std::env::var_os("EM_BRIDGE_STATE_DIR").is_none() {
        if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let dir = std::path::Path::new(&home).join(".config").join("emstudio-lab");
            env.insert("EM_BRIDGE_STATE_DIR".to_string(), dir.to_string_lossy().into_owned());
        }
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

/// What to say when the default port belongs to another program — WHO holds it
/// (the program and its PID, when the system says), and what the app did about
/// it. Not a word about the keychain: the key has nothing to do with it.
fn port_taken_message(taken: u16, used: Option<u16>, owner: Option<&PortOwner>) -> String {
    let who = match owner {
        Some(o) if !o.name.is_empty() => format!("dal programma «{}» (PID {}), che non è il bridge di EMStudio", o.name, o.pid),
        Some(o) => format!("dal processo PID {}, che non è il bridge di EMStudio", o.pid),
        None => "da un processo che non risponde come il bridge di EMStudio".to_string(),
    };
    match used {
        Some(p) => format!(
            "La porta {taken} è tenuta {who}: l'app non lo tocca e il bridge \
             locale usa la porta {p}."
        ),
        None => format!(
            "La porta {taken} è tenuta {who}, e le porte fino alla {} sono \
             occupate: il bridge locale non è partito (import/export GraphML, \
             modelli dal disco e generazione non disponibili). Libera la porta \
             {taken} e riavvia l'app.",
            taken.saturating_add(BRIDGE_PORT_TRIES)
        ),
    }
}

// ── MICRO-WINDOWS-MODELLI p.3 · the orphan of an earlier session ───────────
//
// E.D., Windows, 21 Oct 2026, dev.56 at 12:36:19: «La porta 8765 è occupata da
// un processo che non risponde come il bridge di EMStudio: il bridge locale usa
// la porta 8766», right after «Installa e riavvia» from dev.55. Read in the
// code, three things make it: the Windows updater ends the app with
// `std::process::exit(0)` before the installer runs (tauri-plugin-updater 2.12,
// updater.rs:882) — no `RunEvent::Exit`, the sidecar is never killed; the
// bridge's watch (`getppid()` changing) never fires on Windows, which does not
// re-parent an orphan; and the orphan, its pipes closed, failed every request
// on its first log line, so it kept the port answering nothing. Now: the app
// asks the SYSTEM who holds the port (netstat + tasklist on Windows, lsof
// elsewhere); a bridge of EMStudio's — its executable is `em-bridge…`, or its
// /health says `sidecar` — that is not this app's child is closed and the port
// taken back. A bridge started by hand (./dev.sh: a Python, no `sidecar`) is
// left alone (K1's message), and so is any other program.

/// Who holds a port, as the system says.
#[derive(Debug, Clone, PartialEq)]
struct PortOwner {
    pid: u32,
    name: String,
}

/// An executable of EMStudio's bridge: `em-bridge` (PyInstaller's name, the
/// sidecar's `em-bridge-<triple>[.exe]`), whatever the case.
fn is_bridge_executable(name: &str) -> bool {
    name.to_ascii_lowercase().starts_with("em-bridge")
}

/// `netstat -ano -p TCP` (Windows): the PID listening on `port`. The state
/// word is localised (LISTENING, ABHÖREN…); a listener's remote address
/// `0.0.0.0:0` / `[::]:0` is not, so that is what is read.
fn parse_netstat_listener(text: &str, port: u16) -> Option<u32> {
    let local = format!(":{port}");
    text.lines().find_map(|line| {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() >= 5 && f[0].eq_ignore_ascii_case("TCP") && f[1].ends_with(&local) && f[2].ends_with(":0") {
            f[f.len() - 1].parse::<u32>().ok().filter(|&p| p > 0)
        } else {
            None
        }
    })
}

/// `tasklist /FI "PID eq n" /FO CSV /NH` (Windows): the image name.
fn parse_tasklist_csv(text: &str) -> Option<String> {
    let line = text.lines().find(|l| l.starts_with('"'))?;
    line[1..].split('"').next().map(str::to_string).filter(|n| !n.is_empty())
}

/// `lsof -nP -iTCP:<port> -sTCP:LISTEN -Fpc`: the first process, its command.
fn parse_lsof(text: &str) -> Option<PortOwner> {
    let mut pid = None;
    let mut name = String::new();
    for l in text.lines() {
        if let Some(p) = l.strip_prefix('p') {
            if pid.is_some() {
                break;
            }
            pid = p.trim().parse::<u32>().ok();
        } else if let Some(c) = l.strip_prefix('c') {
            if name.is_empty() {
                name = c.trim().to_string();
            }
        }
    }
    Some(PortOwner { pid: pid?, name })
}

/// A system tool, without a console window flashing on Windows.
fn quiet(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut c = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c
}

/// Who listens on `port` on 127.0.0.1, as the system says. None when the
/// system tool is not there or says nothing.
fn port_owner(port: u16) -> Option<PortOwner> {
    #[cfg(windows)]
    {
        let out = quiet("netstat").args(["-ano", "-p", "TCP"]).output().ok()?;
        let pid = parse_netstat_listener(&String::from_utf8_lossy(&out.stdout), port)?;
        let name = quiet("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output()
            .ok()
            .and_then(|o| parse_tasklist_csv(&String::from_utf8_lossy(&o.stdout)))
            .unwrap_or_default();
        Some(PortOwner { pid, name })
    }
    #[cfg(not(windows))]
    {
        let out = quiet("lsof")
            .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-Fpc"])
            .output()
            .ok()?;
        parse_lsof(&String::from_utf8_lossy(&out.stdout))
    }
}

/// End a process and what it started (a PyInstaller bridge is two processes).
fn kill_tree(pid: u32) -> bool {
    #[cfg(windows)]
    {
        quiet("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).status().map(|s| s.success()).unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        quiet("kill").args(["-TERM", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
    }
}

/// Wait until nothing answers on `port`. Returns false on timeout.
fn wait_port_free(port: u16, timeout: std::time::Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if !port_busy(port) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    !port_busy(port)
}

/// The JSON a bridge's /health gives, if it gives one.
fn health_json(port: u16) -> Option<serde_json::Value> {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(150)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    stream.write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n").ok()?;
    let mut buf = Vec::new();
    let _ = stream.take(16 * 1024).read_to_end(&mut buf);
    let text = String::from_utf8_lossy(&buf);
    let body = text.split("\r\n\r\n").nth(1)?;
    serde_json::from_str(body.trim()).ok()
}

/// What the launch does with the bridge's port.
#[derive(Debug, PartialEq)]
struct Launch {
    port: u16,
    spawn: bool,
    notice: Option<String>,
}

/// MICRO-WINDOWS-MODELLI p.3 · the launch's decision on the bridge's port:
/// free → ours; an orphaned bridge of EMStudio's → closed, and ours; a bridge
/// started by hand → used, said (K1); another program → the next free port,
/// said with the program's name.
fn decide_launch(default: u16, tries: u16) -> Launch {
    let holder = port_holder(default);
    if holder == PortHolder::Free {
        return Launch { port: default, spawn: true, notice: None };
    }
    let owner = port_owner(default);
    let health = if holder == PortHolder::Bridge { health_json(default) } else { None };
    let sidecar = health.as_ref().and_then(|h| h.get("sidecar")).and_then(|v| v.as_bool()).unwrap_or(false);
    let health_pid = health.as_ref().and_then(|h| h.get("pid")).and_then(|v| v.as_u64()).map(|p| p as u32);
    let ours = match &owner {
        Some(o) if is_bridge_executable(&o.name) => Some(o.clone()),
        _ if sidecar => health_pid.map(|pid| PortOwner { pid, name: owner.as_ref().map(|o| o.name.clone()).unwrap_or_default() }),
        _ => None,
    }
    .filter(|o| o.pid != std::process::id());
    if let Some(o) = ours {
        kill_tree(o.pid);
        if wait_port_free(default, std::time::Duration::from_secs(5)) {
            return Launch { port: default, spawn: true, notice: Some(orphan_closed_message(default, &o)) };
        }
        let next = next_free_port(default, tries);
        return Launch { port: next.unwrap_or(default), spawn: next.is_some(), notice: Some(orphan_stuck_message(default, &o, next)) };
    }
    match holder {
        PortHolder::Bridge => Launch { port: default, spawn: false, notice: Some(foreign_bridge_message_at(default, owner.as_ref())) },
        _ => {
            let next = next_free_port(default, tries);
            Launch { port: next.unwrap_or(default), spawn: next.is_some(), notice: Some(port_taken_message(default, next, owner.as_ref())) }
        }
    }
}

fn orphan_closed_message(port: u16, o: &PortOwner) -> String {
    format!(
        "La porta {port} era tenuta da un bridge di EMStudio rimasto aperto da una \
         sessione precedente («{}», PID {}): l'app l'ha chiuso e il bridge locale \
         usa di nuovo la porta {port}.",
        if o.name.is_empty() { "em-bridge" } else { &o.name },
        o.pid
    )
}

fn orphan_stuck_message(port: u16, o: &PortOwner, used: Option<u16>) -> String {
    let then = match used {
        Some(p) => format!("il bridge locale usa la porta {p}"),
        None => "il bridge locale non è partito".to_string(),
    };
    format!(
        "La porta {port} è tenuta da un bridge di EMStudio rimasto aperto da una \
         sessione precedente («{}», PID {}): l'app ha provato a chiuderlo ma la \
         porta è ancora occupata, e {then}. Chiudi «em-bridge» in Gestione \
         attività (Monitoraggio Attività sul Mac) e riavvia l'app.",
        if o.name.is_empty() { "em-bridge" } else { &o.name },
        o.pid
    )
}

/// K1's message at launch, naming the process when the system says.
fn foreign_bridge_message_at(port: u16, owner: Option<&PortOwner>) -> String {
    let who = owner.map(|o| format!(" («{}», PID {})", o.name, o.pid)).unwrap_or_default();
    format!(
        "Un altro bridge{who} è già in ascolto sulla porta {port} e non è stato \
         avviato dall'app: l'app lo usa così com'è, ma la key del portachiavi non \
         lo raggiunge. Chiudi quel processo (tipicamente ./dev.sh) e riavvia \
         l'app, oppure esporta ANTHROPIC_API_KEY nell'ambiente di quel bridge."
    )
}

/// Stop this app's sidecar and what it started, and wait for its port.
fn stop_bridge(app: &tauri::AppHandle) {
    let taken = app.state::<BridgeChild>().0.lock().unwrap().take();
    if let Some(child) = taken {
        // a PyInstaller bridge is two processes: on Windows the tree, then the handle
        #[cfg(windows)]
        let _ = kill_tree(child.pid());
        let _ = child.kill();
        let _ = wait_port_free(bridge_port(), std::time::Duration::from_secs(5));
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
    wait_port_free(bridge_port(), timeout)
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

/// MICRO-FINESTRE-MULTIPLE · the label of a detached window: `detached-<n>`.
fn detached_label(n: usize) -> String {
    format!("detached-{n}")
}

fn is_detached_label(label: &str) -> bool {
    label.strip_prefix("detached-").is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// The main window, from tauri.conf.json, with the answer to `window.open`.
///
/// The page opens `about:blank` with the position and size it wants (near the
/// cursor, or where the window was last time) and draws into it: the answer is
/// a real system window — movable to another screen, with its own title — that
/// KEEPS ITS OPENER, which is what lets the page script it.
/// `window_features` hands the new webview the opener's configuration (macOS),
/// environment (Windows) and related view (Linux), as Tauri requires for
/// `Create`. Any other URL (a link with `target=_blank`) is not a window of the
/// app: the system browser opens it.
fn build_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    use std::sync::atomic::AtomicUsize;
    static NEXT: AtomicUsize = AtomicUsize::new(1);
    let conf = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .expect("tauri.conf.json declares the main window");
    let handle = app.clone();
    tauri::WebviewWindowBuilder::from_config(app, &conf)?
        .on_new_window(move |url, features| {
            if url.scheme() != "about" {
                use tauri_plugin_opener::OpenerExt;
                if url.scheme() == "https" || url.scheme() == "http" {
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                }
                return tauri::webview::NewWindowResponse::Deny;
            }
            let label = detached_label(NEXT.fetch_add(1, Ordering::Relaxed));
            let built = tauri::WebviewWindowBuilder::new(
                &handle,
                label,
                tauri::WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .window_features(features)
            .title("EMStudio")
            .min_inner_size(240.0, 180.0)
            .on_document_title_changed(|window, title| {
                let _ = window.set_title(&title);
            })
            .build();
            match built {
                Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                Err(e) => {
                    eprintln!("[emstudio] a detached window could not be opened: {e}");
                    tauri::webview::NewWindowResponse::Deny
                }
            }
        })
        .build()?;
    Ok(())
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
        // APRI IN EMSTUDIO · sign-in pages go to the system browser; any other
        // page that is not EMStudio gets «Torna a EMStudio»
        .plugin(navigation_guard())
        // MICRO-DOVE-CHI-MENU p.7 · the update of a release, signed (see
        // `update_install`; the public key is in tauri.conf.json)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BridgeChild(Mutex::new(None)))
        .manage(Pending(Mutex::new(DesktopQueue::default())))
        .invoke_handler(tauri::generate_handler![
            transformer_url,
            take_desktop_queue,
            llm_key_status,
            set_llm_key,
            clear_llm_key,
            update_install
        ])
        .setup(|app| {
            // MICRO-FINESTRE-MULTIPLE · the main window is built HERE, from its
            // entry in tauri.conf.json (`create: false`), because only a builder
            // can answer `window.open`: a window detached from the page (Shift +
            // a corner dragged) is a system window of the SAME page, which the
            // page draws into (frontend/src/shell/detach.ts). Built first, so
            // everything below runs exactly as it did when Tauri created it.
            build_main_window(app.handle())?;
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
            // MICRO-DOVE-CHI-MENU p.1 · the menu bar is no longer built here:
            // the page builds it from its table of commands
            // (frontend/src/menu-table.ts) through Tauri's menu API, so the
            // system's menus and the page's are one definition. Until the page
            // has loaded, macOS shows Tauri's default menu.
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
            //
            // MICRO-WINDOWS-MODELLI p.3 · …and an orphaned bridge of EMStudio's
            // (an earlier session's sidecar) is closed and the port taken back
            // (`decide_launch`). The decision is made here, in `setup`, and the
            // page cannot read a port before it: Tauri creates the window before
            // `setup` runs (tauri 2.11.5, app.rs:2524–2530), but `transformer_url`
            // is a synchronous command, run on the main thread, which `setup`
            // holds until it returns.
            let launch = decide_launch(BRIDGE_PORT_DEFAULT, BRIDGE_PORT_TRIES);
            BRIDGE_PORT.store(launch.port, Ordering::Relaxed);
            if let Some(n) = launch.notice {
                queue_notice(app.handle(), n);
            }
            if launch.spawn {
                spawn_bridge(app.handle());
            }
            Ok(())
        })
        // MICRO-FINESTRE-MULTIPLE · closing the main window closes the detached
        // ones: their content is drawn by the main page, which is gone (the
        // question about unsaved changes is the main page's, asked once)
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                for (label, other) in window.app_handle().webview_windows() {
                    if is_detached_label(&label) {
                        let _ = other.destroy();
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building EMStudio")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => stop_bridge(app),
            // B2 · macOS hands files over as an Apple event (double click,
            // «Open With», `open -a EMStudio file.em.json`), at launch or while
            // the app runs. Deep links come this way too: only `file:` URLs
            // are files.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                // APRI IN EMSTUDIO · a link (`stratigraph://open?…` from
                // Blender, a sign-in's answer) is meant for the window that is
                // open: it comes forward. Windows and Linux do it in
                // single-instance; files do it in `queue_files`.
                if urls.iter().any(|u| u.scheme() != "file") {
                    bring_forward(app);
                }
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

    /// APRI IN EMSTUDIO · the page measured on 13 Oct 2026 (the realm's login
    /// with `redirect_uri=tauri://localhost/`) never reaches the main window;
    /// the app's own pages and a 3D embed's iframe are left alone.
    #[test]
    fn sign_in_pages_leave_the_main_window_and_app_pages_stay() {
        let measured = "https://localhost:8443/auth/realms/em-dev/protocol/openid-connect/auth\
                        ?response_type=code&client_id=em-console\
                        &redirect_uri=tauri%3A%2F%2Flocalhost%2F&code_challenge=x&state=y";
        assert!(is_sign_in_page(measured));
        assert!(is_sign_in_page(
            "https://kc.example.org/realms/x/login-actions/authenticate?session_code=1"));
        assert!(is_sign_in_page(
            "https://orcid.org/oauth/authorize?client_id=APP-1&response_type=token&redirect_uri=x"));
        assert!(is_sign_in_page(
            "https://kc.example.org/logout?post_logout_redirect_uri=x"));
        // the app, in the bundle and in `tauri dev`
        for app in ["tauri://localhost/", "http://tauri.localhost/index.html",
                    "https://tauri.localhost/", "about:blank", "blob:tauri://localhost/1"] {
            assert!(is_app_url(app), "{app}");
            assert!(!is_sign_in_page(app), "{app}");
        }
        assert_eq!(is_app_url("http://localhost:5173/"), cfg!(debug_assertions));
        // a 3D embed, a node's page, a study: not sign-in pages, not the app
        for other in ["https://sketchfab.com/models/abc/embed",
                      "https://em.example.org/work/?room=r",
                      "https://em.example.org/catalog/study/s/emjson"] {
            assert!(!is_sign_in_page(other), "{other}");
            assert!(!is_app_url(other), "{other}");
        }
        // the bar knows its way back, and says where it goes
        let bar = return_bar_script("tauri://localhost/");
        assert!(bar.contains("Torna a EMStudio") && bar.contains("\"tauri://localhost/\"")
                && bar.contains("history.back()") && bar.contains("e.key === \"[\""));
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
        let m = port_taken_message(8765, Some(8766), None);
        assert!(m.contains("8765") && m.contains("8766") && !m.contains("portachiavi"), "{m}");
        // …and the page reads the port it moved to, as it always read it
        if std::env::var("EM_TRANSFORMER_URL").is_err() {
            BRIDGE_PORT.store(8771, Ordering::Relaxed);
            assert_eq!(transformer_url(), "http://localhost:8771");
            BRIDGE_PORT.store(BRIDGE_PORT_DEFAULT, Ordering::Relaxed);
        }
        let none = port_taken_message(8765, None, None);
        assert!(none.contains("8765") && none.contains("8775") && !none.contains("portachiavi"), "{none}");
    }

    /// MICRO-WINDOWS-MODELLI p.3 · what the system tools say, read: Windows'
    /// netstat (its state word localised: the remote `:0` is what is read) and
    /// tasklist, and lsof elsewhere.
    #[test]
    fn the_owner_of_a_port_is_read_from_the_system_tools() {
        let netstat = "\r\nConnessioni attive\r\n\r\n  Proto  Indirizzo locale       Indirizzo esterno      Stato           PID\r\n\
          TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1088\r\n\
          TCP    127.0.0.1:8765         127.0.0.1:51234        ESTABLISHED     4242\r\n\
          TCP    127.0.0.1:8765         0.0.0.0:0              LISTENING       9876\r\n\
          TCP    127.0.0.1:8766         0.0.0.0:0              ABHÖREN         5555\r\n\
          TCP    [::1]:8767             [::]:0                 LISTENING       7777\r\n";
        assert_eq!(parse_netstat_listener(netstat, 8765), Some(9876), "the listener, not a connection to it");
        assert_eq!(parse_netstat_listener(netstat, 8766), Some(5555), "a localised state word");
        assert_eq!(parse_netstat_listener(netstat, 8767), Some(7777), "IPv6");
        assert_eq!(parse_netstat_listener(netstat, 876), None, "a port is not a prefix");
        assert_eq!(parse_tasklist_csv("\"em-bridge-x86_64-pc-windows-msvc.exe\",\"9876\",\"Console\",\"1\",\"212.340 K\"\r\n"),
                   Some("em-bridge-x86_64-pc-windows-msvc.exe".to_string()));
        assert_eq!(parse_tasklist_csv("INFORMAZIONI: nessuna attività in esecuzione corrisponde ai criteri specificati.\r\n"), None);
        assert_eq!(parse_lsof("p4321\ncem-bridge-aarch\nf5\n"), Some(PortOwner { pid: 4321, name: "em-bridge-aarch".into() }));
        assert_eq!(parse_lsof(""), None);
        assert!(is_bridge_executable("em-bridge-x86_64-pc-windows-msvc.exe") && is_bridge_executable("EM-BRIDGE.EXE"));
        assert!(!is_bridge_executable("python3.12") && !is_bridge_executable("Python"));
        // the messages say who and what was done
        let o = PortOwner { pid: 9876, name: "em-bridge-x86_64-pc-windows-msvc.exe".into() };
        let m = orphan_closed_message(8765, &o);
        assert!(m.contains("9876") && m.contains("em-bridge") && m.contains("chiuso") && m.contains("8765"), "{m}");
        let other = PortOwner { pid: 31, name: "jupyter.exe".into() };
        let m = port_taken_message(8765, Some(8766), Some(&other));
        assert!(m.contains("jupyter.exe") && m.contains("31") && m.contains("8766") && m.contains("non lo tocca"), "{m}");
    }

    /// …measured on this machine: who holds a port of this test, and the
    /// launch's decision with a process named like the sidecar that answers
    /// nothing (the wedged orphan) and with another program.
    #[cfg(unix)]
    #[test]
    fn an_orphaned_bridge_is_closed_and_another_program_is_left_alone() {
        let me = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = me.local_addr().unwrap().port();
        let o = port_owner(port).expect("lsof names the holder");
        assert_eq!(o.pid, std::process::id());
        drop(me);
        // the listeners are this test binary, copied under the name to be read
        // (a system binary copied elsewhere is killed by macOS; a symlink keeps
        // its own name): `mute_listener_when_asked` holds the port, answering nothing
        let dir = std::env::temp_dir().join(format!("emstudio-orphan-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let free = || { let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap(); l.local_addr().unwrap().port() };
        let listen = |name: &str, port: u16| {
            let exe = dir.join(name);
            std::fs::copy(std::env::current_exe().unwrap(), &exe).unwrap();
            let child = std::process::Command::new(&exe)
                .args(["--exact", "tests::mute_listener_when_asked", "--nocapture"])
                .env("EMSTUDIO_TEST_MUTE_PORT", port.to_string())
                .stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().unwrap();
            for _ in 0..100 { if port_busy(port) { break; } std::thread::sleep(std::time::Duration::from_millis(30)); }
            child
        };
        // a sidecar of an earlier session, answering nothing: closed, the port taken back
        let p1 = free();
        let mut orphan = listen("em-bridge-test", p1);
        let l = decide_launch(p1, 3);
        assert_eq!((l.port, l.spawn), (p1, true), "{l:?}");
        assert!(l.notice.as_deref().unwrap_or("").contains("chiuso"), "{l:?}");
        assert!(orphan.try_wait().unwrap().is_some() || { std::thread::sleep(std::time::Duration::from_millis(300)); orphan.try_wait().unwrap().is_some() },
                "the orphan is gone");
        // another program: left alone, the next port, named
        let p2 = free();
        let mut other = listen("altro-programma", p2);
        let l = decide_launch(p2, 3);
        assert!(l.spawn && l.port != p2, "{l:?}");
        assert!(l.notice.as_deref().unwrap_or("").contains("altro-programma"), "{l:?}");
        assert!(other.try_wait().unwrap().is_none(), "another program is not touched");
        let _ = other.kill();
        let _ = other.wait();
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Not a test by itself: the listener the test above starts (a port held,
    /// nothing answered — the wedged orphan). Without its variable, nothing.
    #[test]
    fn mute_listener_when_asked() {
        let Ok(port) = std::env::var("EMSTUDIO_TEST_MUTE_PORT") else { return };
        let l = std::net::TcpListener::bind(format!("127.0.0.1:{port}")).unwrap();
        let mut held = Vec::new();
        for s in l.incoming().flatten() {
            held.push(s);
        }
    }

    /// MICRO-DOVE-CHI-MENU p.7 · the updater's configuration is what the plugin
    /// reads at launch (a key it refused would stop the app from starting): a
    /// minisign PUBLIC key, an https endpoint, and no update archives in a
    /// build without the private key (the release workflow turns them on).
    #[test]
    fn updater_config_is_read_by_the_plugin() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let raw = conf["plugins"]["updater"].clone();
        let cfg: tauri_plugin_updater::Config = serde_json::from_value(raw).unwrap();
        assert!(cfg.endpoints.iter().all(|u| u.scheme() == "https"), "{:?}", cfg.endpoints);
        assert!(!cfg.endpoints.is_empty());
        let key = cfg.pubkey.trim();
        assert!(!key.is_empty());
        assert!(!key.to_ascii_lowercase().contains("secret"), "a private key in the config");
        assert_eq!(conf["bundle"]["createUpdaterArtifacts"], serde_json::json!(false));
    }

    /// MICRO-FINESTRE-MULTIPLE · the main window is built in `setup` (only a
    /// builder answers `window.open`), so the config must not create it too;
    /// a detached window's label is never the main one's nor a stray one's.
    #[test]
    fn the_main_window_is_built_by_setup_and_detached_labels_are_recognised() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &conf["app"]["windows"][0];
        assert_eq!(main["label"], "main");
        assert_eq!(main["create"], false, "Tauri would create it before setup, without the handler");
        let caps: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        assert_eq!(caps["windows"], serde_json::json!(["main"]),
                   "a detached window gets no IPC of its own: the main page draws it");
        assert_eq!(detached_label(3), "detached-3");
        assert!(is_detached_label(&detached_label(12)));
        for other in ["main", "detached-", "detached-x", "detached", "updater"] {
            assert!(!is_detached_label(other), "{other}");
        }
    }

    #[test]
    fn a_dev_tag_is_newer_than_the_dev_before_it() {
        let v = |s: &str| semver::Version::parse(s).unwrap();
        assert!(v("1.6.0-dev.51") > v("1.6.0-dev.50"));
        assert!(v("1.6.0-dev.100") > v("1.6.0-dev.99"));
        assert!(v("1.6.0") > v("1.6.0-dev.99"));
    }
}
