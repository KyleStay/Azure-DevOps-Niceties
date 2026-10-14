"""Build a standalone publishing helper from the reviewed listing and release ZIP."""
import base64
import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "manifest.json").read_text())
version = manifest["version"]
upload = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "release" / version / f"azure-devops-niceties-{version}.zip"
outputs = [Path(value) for value in sys.argv[2:]] or [upload.parent / "publish.html", root / "docs/publish.html"]
listing = (root / "store/LISTING.md").read_text()

def block(heading):
    match = re.search(r"^#{2,3} " + re.escape(heading) + r"\n.*?```text\n(.*?)\n```", listing, re.M | re.S)
    if not match:
        raise ValueError(f"Missing listing field: {heading}")
    return match.group(1)

def listing_url(label):
    match = re.search(r"^\| " + re.escape(label) + r" \| (https://\S+) \|$", listing, re.M)
    if not match:
        raise ValueError(f"Missing listing URL: {label}")
    return match.group(1)

def field(key, label, value, note="", multiline=False):
    return {"key": key, "label": label, "value": value, "note": note, "multiline": multiline}

with zipfile.ZipFile(upload) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read("manifest.json")) == manifest, "Rebuild the release ZIP before generating the helper"

reviewer = (root / "store/REVIEWER-TESTS.md").read_text()
procedure = reviewer.split("## Essential procedure\n", 1)[1].split("## Implementation notes for reviewers", 1)[0].strip()
procedure = re.sub(r"`([^`]+)`", r"\1", procedure).replace("**", "")
data = {
    "version": version,
    "zipName": upload.name,
    "zipSha": hashlib.sha256(upload.read_bytes()).hexdigest(),
    "zipData": base64.b64encode(upload.read_bytes()).decode(),
    "guideName": f"azure-devops-niceties-{version}-submission-guide.md",
    "guideData": base64.b64encode((root / "store/SUBMISSION.md").read_bytes()).decode(),
    "listing": [
        field("name", "Name", block("Name")),
        field("short", "Short description", block("Short description"), "132 characters maximum"),
        field("description", "Detailed description", block("Detailed description"), multiline=True),
        field("homepage", "Homepage", listing_url("Homepage")),
        field("support", "Support URL", listing_url("Support URL")),
    ],
    "privacy": [
        field("policy", "Privacy policy URL", listing_url("Privacy policy URL")),
        field("purpose", "Single purpose", block("Single purpose"), multiline=True),
        field("clipboard", "clipboardWrite justification", block("clipboardWrite"), multiline=True),
        field("storage", "storage justification", block("storage"), multiline=True),
        field("sites", "Site access justification", block("Website access / content-script matches"), multiline=True),
        field("remote", "Remote code explanation", block("Remote-code review note"), "Select Yes for the remote-code question, with this explanation.", True),
    ],
    "reviewerProcedure": procedure,
    "assets": [],
}
for name, label, use in [
    ("icon-128.png", "Extension icon", "128 × 128 PNG"),
    ("promo-440x280.png", "Small promotional tile", "440 × 280 PNG"),
    ("settings-light-1280x800.png", "Light settings screenshot", "1280 × 800 PNG"),
    ("settings-dark-1280x800.png", "Dark settings screenshot", "1280 × 800 PNG"),
    ("release-selection-demo-1280x800.png", "Release selection demo", "1280 × 800 PNG · synthetic sample"),
]:
    data["assets"].append({"name": name, "label": label, "use": use,
                           "data": base64.b64encode((root / "store/assets" / name).read_bytes()).decode()})
payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
template = (root / "scripts/publisher-template.html").read_text()
assert template.count("@@PUBLISHING_DATA@@") == 1
html = template.replace("@@PUBLISHING_DATA@@", payload)
for output in outputs:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html)
print(f"Built standalone publishing helper for {version} ({len(html.encode()):,} bytes).")
