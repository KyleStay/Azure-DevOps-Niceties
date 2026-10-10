"""Reject real Azure instance URLs and likely credentials in publishable files."""
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent.parent
paths = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode().split("\0")
sample_organizations = {"example", "o", "other", "org-a", "org-b", "codex-extension-smoke",
                        "_hidden", "%5fhidden", "o%2fp", "_workitems", "*", "..."}
sample_legacy_hosts = {"example", "o", "org-name", "nested.o", "*"}
secret_pattern = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,}|AKIA[A-Z0-9]{16})\b"
)
errors = []
checked = 0
for name in sorted(set(paths)):
    path = root / name
    if not name or not path.is_file():
        continue
    data = path.read_bytes()
    if b"\0" in data or path.suffix.lower() in {".png", ".zip"}:
        continue
    text = data.decode("utf-8", errors="replace")
    checked += 1
    if secret_pattern.search(text):
        errors.append(f"{name}: possible credential")
    for match in re.finditer(r'https?://[^\s"\'<>`\\)]+', text):
        try:
            url = urlsplit(match.group())
            host = (url.hostname or "").lower()
            if host == "dev.azure.com":
                organization = url.path.strip("/").split("/")[0].lower()
                if organization and organization not in sample_organizations:
                    errors.append(f"{name}: non-sample Azure organization URL")
            elif host.endswith(".visualstudio.com"):
                if host.removesuffix(".visualstudio.com") not in sample_legacy_hosts:
                    errors.append(f"{name}: non-sample legacy Azure host")
        except ValueError:
            continue
if errors:
    raise SystemExit("\n".join(sorted(set(errors))))
print(f"Public-content check passed for {checked} text files; only synthetic Azure URLs found.")
