"""Build a public-files-only static site; never publish backend code or data."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"


def main():
    # Only this generated folder, directly under this repository, may be cleared.
    if OUTPUT.resolve().parent != ROOT.resolve() or OUTPUT.name != "_site" or OUTPUT.is_symlink():
        raise RuntimeError("Unsafe output path")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()
    for page in ROOT.glob("*.html"):
        shutil.copy2(page, OUTPUT / page.name)
    for name in ("robots.txt", "sitemap.xml"):
        shutil.copy2(ROOT / name, OUTPUT / name)
    shutil.copytree(ROOT / "assets", OUTPUT / "assets")
    web_output = OUTPUT / "frontends" / "web"
    web_output.mkdir(parents=True)
    for extension in ("*.js", "*.css", "*.html"):
        for asset in (ROOT / "frontends" / "web").glob(extension):
            shutil.copy2(asset, web_output / asset.name)
    vendor = ROOT / "frontends" / "web" / "vendor"
    if vendor.exists():
        shutil.copytree(vendor, web_output / "vendor")
    (OUTPUT / ".nojekyll").touch()
    # Directory-style aliases also work on hosts without rewrite support.
    for page in ("auth", "plans", "payment", "settings", "privacy-policy", "delete-account", "demo"):
        source = ROOT / f"{page}.html"
        if source.exists():
            alias = OUTPUT / page
            alias.mkdir()
            # Redirect aliases to canonical files so relative JS navigation stays
            # correct on both custom-domain and project-path static hosts.
            content = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>KeeperBMA</title><script>location.replace("../{page}.html" + location.search + location.hash);</script>
</head><body><a href="../{page}.html">Continue to KeeperBMA</a></body></html>'''
            (alias / "index.html").write_text(content, encoding="utf-8")
    print(f"Public static site built at {OUTPUT}")


if __name__ == "__main__":
    main()
