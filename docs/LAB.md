# The lab (private) — EMStudio Lab

Unpublished research lives in a **lab**: the same repositories on a branch
`lab`, pushed to **private** twins, and released as a separate app, «EMStudio
Lab», that installs beside the public EMStudio without touching it.

## Folders

| folder | what | branch |
|---|---|---|
| `~/Documents/GitHub/s3Dgraphy-lab` | git worktree of s3Dgraphy | `lab` |
| `~/Documents/GitHub/EMStudio-lab` | git worktree of EMStudio | `lab` |

They are **worktrees** of the public checkouts (`~/Documents/GitHub/s3Dgraphy`,
`~/Documents/GitHub/EMStudio`): one repository each, so branches, remotes **and
tags** are shared with the public folder. Hence no lab tag is ever created
locally (see below).

## Remotes

| remote | points to | used for |
|---|---|---|
| `lab` | `ExtendedMatrix/EMStudio-lab`, `ExtendedMatrix/s3Dgraphy-lab` (private) | everything that leaves the lab |
| `origin` | `ExtendedMatrix/EMStudio`, `ExtendedMatrix/s3Dgraphy` (public) | **never from branch `lab`** |

`./em.sh devrel` and `./em.sh ghrelease` push to `origin`, so they **refuse on
branch `lab`**, always (dry run included). `./em.sh labrel` refuses on any other
branch, and publishes only to `ExtendedMatrix/EMStudio-lab` — a constant in
`em.sh`, checked against the `lab` remote's fetch and push URLs (a different
URL is a refusal, not a redirect).

## The flow rule

- **public → lab, always**: `git merge main` on `lab`, as often as you like.
- **lab → public, only when the paper is out**: then the work is merged into
  `main` and released the public way (`devrel`).

## Commands

```bash
# s3dgraphy-lab → the frontend's vendored datamodels (review, commit on lab)
./em.sh sync ../s3Dgraphy-lab

# a lab release
./em.sh labrel --dry-run       # guards, gate, the WHOLE local build; no commit/push/release
./em.sh labrel                 # …then asks, commits .lab-version, pushes `lab`, releases
./em.sh labrel --yes           # without the question
./em.sh labrel --s3d-worktree  # freeze s3Dgraphy-lab's working tree, uncommitted edits included
```

What `labrel` does:

1. **Guards**: branch `lab` (here and in `../s3Dgraphy-lab`); both `lab`
   remotes are the private repos; macOS arm64; a real run also wants a clean
   tree, `gh` signed in, `ExtendedMatrix/EMStudio-lab` private, and no release
   with the same tag.
2. **Version** `<x.y.z>-lab.N`: `x.y.z` is the numeric core of the committed
   version (`1.6.0-dev.70` → `1.6.0`), because a lab build is not a point in
   the public dev series; `N` is the lab's own counter, kept in `.lab-version`
   (the last lab version released, committed by `labrel`; no file = `N` is 1;
   `N` restarts at 1 when `x.y.z` moves). The version files
   (`package.json`, `Cargo.toml`, `tauri.conf.json`, `Cargo.lock`) get
   `-lab.N` only for the length of the build and are **put back** afterwards,
   also on failure or Ctrl-C: a committed lab version would conflict with
   every `merge main`.
3. **Gate**: the app opens in a browser (`./em.sh apertura`, as `devrel`).
4. **Sidecar**: s3dgraphy installed, **not editable**, from `../s3Dgraphy-lab`
   (its committed `HEAD` via `git archive`, or the working tree with
   `--s3d-worktree`) into `~/.cache/emstudio-labrel/venv` (`LAB_VENV=` to
   move it), then frozen by `apps/desktop/build-bridge.sh` — the same
   layout trick as `release.yml`. Nothing comes from PyPI.
5. **App**: `EMSTUDIO_LAB=1 cargo tauri build --config
   src-tauri/tauri.lab.conf.json --bundles app`, then a `.dmg` with `hdiutil`:
   `apps/desktop/src-tauri/target/labrel/EMStudio-Lab_<version>_aarch64.dmg`
   (the `.app` is in `target/release/bundle/macos/EMStudio Lab.app`).
   Built locally, unsigned: the first open is right-click ▸ Open.
6. **Release** (not in a dry run): commit `.lab-version`, `git push lab lab`,
   `gh release create lab-v<version> <dmg> -R ExtendedMatrix/EMStudio-lab
   --prerelease --target <commit>`. The tag is made **on GitHub** by `gh`, and
   it is `lab-v…`, not `v…`: a `v*` tag would start `release.yml` and
   `immagine.yml`.

## Beside the public app

| | EMStudio | EMStudio Lab |
|---|---|---|
| bundle | `EMStudio.app` | `EMStudio Lab.app` (icon with a red «LAB» band) |
| identifier | `org.extendedmatrix.emstudio` | `org.extendedmatrix.emstudio.lab` |
| app data, WebKit storage | `~/Library/…/org.extendedmatrix.emstudio` | `~/Library/…/org.extendedmatrix.emstudio.lab` |
| bridge port | 8765 (fallback …8775) | 8865 (fallback …8875) |
| bridge state (`EM_BRIDGE_STATE_DIR`) | `~/.config/emstudio` | `~/.config/emstudio-lab` |
| keychain (LLM key) | `org.extendedmatrix.emstudio` | `org.extendedmatrix.emstudio.lab` |
| `.emj` / `.json` | default editor | «Open With» only (rank Alternate) |
| `stratigraph://`, sign-in return scheme | registered | **not** registered |
| updates | Check for updates → install | never installs one (lab: next `labrel`) |

The port matters: each app closes an `em-bridge` it finds on its own default
port as an orphan of its own, so on a shared port the second app to start
would kill the first one's bridge.

Not registering the URL schemes means: «Open in EMStudio» links go to the
public app, and a sign-in in the lab app is finished by pasting the address
the browser was sent to (the field under the sign-in is there for this).

The configuration is an overlay, `apps/desktop/src-tauri/tauri.lab.conf.json`;
the runtime differences are `LAB` in `src-tauri/src/main.rs`, compiled in by
`EMSTUDIO_LAB=1`. The icons in `src-tauri/icons-lab/` are made by
`scripts/lab-icon.py` (how, in its header).
