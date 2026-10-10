"""Build an allowlisted, reproducible Chrome upload ZIP and submission kit."""
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "manifest.json").read_text())
package = json.loads((ROOT / "package.json").read_text())
version = manifest["version"]
assert version == package["version"], "Manifest/package versions differ"
assert manifest["manifest_version"] == 3
assert set(manifest["permissions"]) == {"clipboardWrite", "storage"}
assert not manifest.get("host_permissions")
files = ["manifest.json", "src/work-item.js", "src/content.js", "src/content.css",
         "src/theme.js", "options/options.html", "options/options.css", "options/options.js",
         "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png"]
referenced = list(manifest["icons"].values()) + list(manifest["action"]["default_icon"].values())
referenced += [manifest["action"]["default_popup"], manifest["options_ui"]["page"]]
for script in manifest["content_scripts"]:
    referenced += script.get("js", []) + script.get("css", [])
assert set(referenced).issubset(files), "Manifest references an unpackaged file"
for file in files:
    assert (ROOT / file).is_file(), f"Missing runtime file: {file}"

def png_size(file):
    data = file.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"Not PNG: {file}"
    return struct.unpack(">II", data[16:24])

for size, file in manifest["icons"].items():
    assert png_size(ROOT / file) == (int(size), int(size))
assets = ROOT / "store/assets"
assert png_size(assets / "promo-440x280.png") == (440, 280)
assert png_size(assets / "icon-128.png") == (128, 128)
screenshots = sorted(assets.glob("*-1280x800.png"))
assert 1 <= len(screenshots) <= 5
for screenshot in screenshots:
    assert png_size(screenshot) == (1280, 800)

destination = ROOT / "release" / version
destination.mkdir(parents=True, exist_ok=True)
upload = destination / f"azure-devops-niceties-{version}.zip"

def write_zip(target, entries):
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, source in sorted(entries):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None

write_zip(upload, [(name, ROOT / name) for name in files])
with zipfile.ZipFile(upload) as archive:
    assert set(archive.namelist()) == set(files)
    assert json.loads(archive.read("manifest.json")) == manifest

publisher = destination / "publish.html"
subprocess.run([sys.executable, str(ROOT / "scripts/build-publisher.py"), str(upload),
                str(publisher), str(ROOT / "docs/publish.html")], check=True)

store_copy = destination / "store"
if store_copy.exists():
    shutil.rmtree(store_copy)
shutil.copytree(ROOT / "store", store_copy)
kit_entries = [(upload.name, upload), (publisher.name, publisher)]
kit_entries += [(str(file.relative_to(destination)), file) for file in sorted(store_copy.rglob("*")) if file.is_file()]
checksums = destination / "SHA256SUMS.txt"
checksums.write_text("".join(f"{hashlib.sha256(source.read_bytes()).hexdigest()}  {name}\n" for name, source in kit_entries))
kit_entries.append((checksums.name, checksums))
kit = destination / f"azure-devops-niceties-{version}-submission-kit.zip"
write_zip(kit, kit_entries)
print(json.dumps({"version": version, "runtimeFiles": len(files), "upload": str(upload),
                  "sha256": hashlib.sha256(upload.read_bytes()).hexdigest(),
                  "submissionKit": str(kit), "publisher": str(publisher), "checksums": str(checksums)}, indent=2))
