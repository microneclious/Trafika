// Trafika backend: local files under ~/Zines, photo import + hashing, fonts via fontconfig,
// printing via `lp`. No network access anywhere.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
};

type R<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn root() -> R<PathBuf> {
    let home = std::env::var("HOME").map_err(err)?;
    let r = PathBuf::from(home).join("Zines");
    fs::create_dir_all(&r).map_err(err)?;
    Ok(r)
}

/// Resolve a path relative to ~/Zines, refusing absolute paths and `..`.
fn safe(rel: &str) -> R<PathBuf> {
    let p = Path::new(rel);
    if p.is_absolute() || p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("path not allowed: {rel}"));
    }
    Ok(root()?.join(p))
}

fn write_atomic(p: &Path, data: &[u8]) -> R<()> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(err)?;
    }
    let tmp = p.with_extension("tmp~");
    fs::write(&tmp, data).map_err(err)?;
    fs::rename(&tmp, p).map_err(err)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
fn zines_root() -> R<String> {
    Ok(root()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_text(rel: String) -> R<Option<String>> {
    let p = safe(&rel)?;
    if !p.exists() {
        return Ok(None);
    }
    fs::read_to_string(p).map(Some).map_err(err)
}

#[tauri::command]
fn write_text(rel: String, content: String) -> R<()> {
    write_atomic(&safe(&rel)?, content.as_bytes())
}

#[tauri::command]
fn read_bytes(rel: String) -> R<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(fs::read(safe(&rel)?).map_err(err)?))
}

/// Raw-body write: header `x-path` (percent-encoded, relative to ~/Zines), body = bytes.
#[tauri::command]
fn write_bytes(request: tauri::ipc::Request) -> R<()> {
    let rel = request
        .headers()
        .get("x-path")
        .ok_or("missing x-path header")?
        .to_str()
        .map_err(err)?;
    let rel = percent_decode(rel);
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("expected raw bytes".into());
    };
    write_atomic(&safe(&rel)?, data)
}

#[tauri::command]
fn list_dir(rel: String) -> R<Vec<String>> {
    let p = safe(&rel)?;
    if !p.exists() {
        return Ok(vec![]);
    }
    let mut v: Vec<String> = fs::read_dir(p)
        .map_err(err)?
        .filter_map(|e| e.ok().map(|e| e.file_name().to_string_lossy().into_owned()))
        .collect();
    v.sort();
    Ok(v)
}

/// Every file under `rel` (recursive), as paths relative to ~/Zines. Skips half-written temp files.
#[tauri::command]
fn list_tree(rel: String) -> R<Vec<String>> {
    let base = root()?;
    let start = safe(&rel)?;
    let mut out = vec![];
    let mut stack = vec![start];
    while let Some(dir) = stack.pop() {
        if !dir.is_dir() {
            continue;
        }
        for e in fs::read_dir(&dir).map_err(err)?.flatten() {
            let p = e.path();
            let ft = e.file_type().map_err(err)?;
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                stack.push(p);
            } else if !p.to_string_lossy().ends_with(".tmp~") {
                if let Ok(r) = p.strip_prefix(&base) {
                    out.push(r.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

/// Read a file the user picked in a file dialog (e.g. a backup .zip).
#[tauri::command]
fn read_external(path: String) -> R<tauri::ipc::Response> {
    let data = fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(tauri::ipc::Response::new(data))
}

#[derive(Serialize)]
struct Imported {
    file: String,
    hash: String,
    name: String,
}

/// Copy full-res originals into <issue_dir>/assets/<sha256[..16]>.<ext>. Files are never modified.
#[tauri::command]
fn import_photos(issue_dir: String, paths: Vec<String>) -> R<Vec<Imported>> {
    let mut out = vec![];
    for src in paths {
        let src = PathBuf::from(src);
        let data = fs::read(&src).map_err(|e| format!("{}: {e}", src.display()))?;
        let hash = format!("{:x}", Sha256::digest(&data));
        let ext = src
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_else(|| "jpg".into());
        let rel = format!("{issue_dir}/assets/{}.{ext}", &hash[..16]);
        let dest = safe(&rel)?;
        if !dest.exists() {
            write_atomic(&dest, &data)?;
        }
        out.push(Imported {
            file: rel,
            hash,
            name: src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        });
    }
    Ok(out)
}

#[derive(Serialize)]
struct FontInfo {
    file: String,
    family: String,
    style: String,
    langs: Vec<String>,
}

fn fc_query(path: &Path) -> R<(String, String, Vec<String>)> {
    let o = Command::new("fc-query")
        .args(["--format", "%{family[0]}\t%{style[0]}\t%{lang}\n"])
        .arg(path)
        .output()
        .map_err(|e| format!("fc-query: {e}"))?;
    let s = String::from_utf8_lossy(&o.stdout);
    let line = s.lines().next().ok_or("not a font file fontconfig can read")?;
    let mut parts = line.split('\t');
    let family = parts.next().unwrap_or("").to_string();
    let style = parts.next().unwrap_or("").to_string();
    let langs = parts.next().unwrap_or("").split('|').map(String::from).collect();
    Ok((family, style, langs))
}

/// Copy a font file into ~/Zines/fonts and report what languages it covers.
#[tauri::command]
fn import_font(path: String) -> R<FontInfo> {
    let src = PathBuf::from(&path);
    let name = src.file_name().ok_or("no file name")?.to_string_lossy().into_owned();
    let (family, style, langs) = fc_query(&src)?;
    if family.is_empty() {
        return Err("fontconfig could not read a family name from this file".into());
    }
    let rel = format!("fonts/{name}");
    let dest = safe(&rel)?;
    write_atomic(&dest, &fs::read(&src).map_err(err)?)?;
    Ok(FontInfo { file: rel, family, style, langs })
}

#[tauri::command]
fn list_imported_fonts() -> R<Vec<FontInfo>> {
    let dir = safe("fonts")?;
    let mut out = vec![];
    if dir.exists() {
        for e in fs::read_dir(dir).map_err(err)?.flatten() {
            let p = e.path();
            let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !["ttf", "otf", "woff", "woff2"].contains(&ext.as_str()) {
                continue;
            }
            if let Ok((family, style, langs)) = fc_query(&p) {
                out.push(FontInfo {
                    file: format!("fonts/{}", e.file_name().to_string_lossy()),
                    family,
                    style,
                    langs,
                });
            }
        }
    }
    out.sort_by(|a, b| a.family.cmp(&b.family).then(a.style.cmp(&b.style)));
    Ok(out)
}

/// Installed system font families (fontconfig), with their language coverage.
#[derive(Serialize)]
struct SystemFont {
    family: String,
    langs: Vec<String>,
}

#[tauri::command]
fn list_system_fonts() -> R<Vec<SystemFont>> {
    let o = Command::new("fc-list")
        .args(["--format", "%{family[0]}\t%{lang}\n"])
        .output()
        .map_err(|e| format!("fc-list: {e}"))?;
    let mut map: std::collections::BTreeMap<String, std::collections::BTreeSet<String>> = Default::default();
    for line in String::from_utf8_lossy(&o.stdout).lines() {
        let mut p = line.split('\t');
        let fam = p.next().unwrap_or("").trim();
        if fam.is_empty() {
            continue;
        }
        let set = map.entry(fam.to_string()).or_default();
        for l in p.next().unwrap_or("").split('|') {
            if !l.is_empty() {
                set.insert(l.to_string());
            }
        }
    }
    Ok(map
        .into_iter()
        .map(|(family, langs)| SystemFont { family, langs: langs.into_iter().collect() })
        .collect())
}

/// Characters in `text` that the installed font `family` has no glyph for (fontconfig charset check).
#[tauri::command]
fn font_missing(family: String, text: String) -> R<Vec<String>> {
    let mut seen = std::collections::BTreeSet::new();
    let mut missing = vec![];
    for ch in text.chars() {
        if ch.is_whitespace() || (ch as u32) < 0x80 || !seen.insert(ch) || seen.len() > 200 {
            continue;
        }
        let pat = format!("{}:charset={:x}", family.replace(':', "\\:").replace('-', "\\-"), ch as u32);
        let o = Command::new("fc-list").arg(&pat).arg("family").output().map_err(|e| format!("fc-list: {e}"))?;
        if String::from_utf8_lossy(&o.stdout).trim().is_empty() {
            missing.push(ch.to_string());
        }
    }
    Ok(missing)
}

#[tauri::command]
fn list_printers() -> R<Vec<String>> {
    let o = Command::new("lpstat").arg("-e").output().map_err(|e| format!("lpstat: {e}"))?;
    Ok(String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
}

/// Send a PDF under ~/Zines to `lp`. Returns lp's output (the job id).
#[tauri::command]
fn print_file(rel: String, printer: Option<String>, duplex: Option<String>) -> R<String> {
    let p = safe(&rel)?;
    let mut c = Command::new("lp");
    if let Some(pr) = printer.filter(|s| !s.is_empty()) {
        c.args(["-d", &pr]);
    }
    let sides = match duplex.as_deref() {
        Some("short") => "sides=two-sided-short-edge",
        Some("long") => "sides=two-sided-long-edge",
        _ => "sides=one-sided",
    };
    c.args(["-o", sides]);
    c.args(["-o", "fit-to-page=false", "-o", "print-scaling=none"]);
    let o = c.arg(&p).output().map_err(|e| format!("lp: {e}"))?;
    if !o.status.success() {
        return Err(String::from_utf8_lossy(&o.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
}

/// Open a folder or file under ~/Zines with the desktop's default app (local only).
#[tauri::command]
fn open_local(rel: String) -> R<()> {
    let p = safe(&rel)?;
    Command::new("xdg-open").arg(p).spawn().map_err(err)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            zines_root,
            read_text,
            write_text,
            read_bytes,
            write_bytes,
            list_dir,
            list_tree,
            read_external,
            import_photos,
            import_font,
            list_imported_fonts,
            list_system_fonts,
            font_missing,
            list_printers,
            print_file,
            open_local
        ])
        .run(tauri::generate_context!())
        .expect("error while running Trafika");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tree_lists_nested_files_and_refuses_escape() {
        let home = std::env::temp_dir().join(format!("trafika-test-{}", std::process::id()));
        fs::create_dir_all(&home).unwrap();
        // single test in this binary, so changing HOME cannot race another test
        unsafe { std::env::set_var("HOME", &home) };
        write_atomic(&safe("012-x/issue.json").unwrap(), b"{}").unwrap();
        write_atomic(&safe("012-x/assets/ab.jpg").unwrap(), b"jpg").unwrap();
        fs::write(safe("012-x/half.tmp~").unwrap(), b"x").unwrap();
        assert_eq!(list_tree("012-x".into()).unwrap(), vec!["012-x/assets/ab.jpg", "012-x/issue.json"]);
        assert!(list_tree("".into()).unwrap().contains(&"012-x/issue.json".to_string()));
        assert!(list_tree("../".into()).is_err());
        assert!(safe("/etc/passwd").is_err());
        assert!(list_tree("missing".into()).unwrap().is_empty());
        fs::remove_dir_all(&home).unwrap();
    }
}
