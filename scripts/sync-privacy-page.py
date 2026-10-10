"""Copy the hostable policy into GitHub Pages' publishing folder."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
(root / "docs").mkdir(exist_ok=True)
(root / "docs/privacy.html").write_bytes((root / "store/privacy.html").read_bytes())
