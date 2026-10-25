"""Keep alternate static entry pages aligned with canonical root pages."""
import argparse
from pathlib import Path
from demo_pages import generate

ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "demo.html", "demo-settings.html", "profit-calculator.html", "watch-demo.html")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Update alternate pages instead of checking them")
    args = parser.parse_args()
    generate(write=args.write)
    mismatches = []
    for name in PAGES:
        expected = (ROOT / name).read_text(encoding="utf-8").replace("./frontends/web/", "./").replace("./assets/", "../../assets/")
        if name == "demo.html":
            expected = expected.replace('href="./"', 'href="./index.html"')
        destination = ROOT / "frontends" / "web" / name
        if args.write:
            destination.write_text(expected, encoding="utf-8")
        elif not destination.exists() or destination.read_text(encoding="utf-8") != expected:
            mismatches.append(name)
    if mismatches:
        raise SystemExit("Entry pages differ: " + ", ".join(mismatches) + ". Run python scripts/sync_web_entries.py --write")
    print("Web entry pages synchronized." if args.write else "Web entry pages match.")


if __name__ == "__main__":
    main()
