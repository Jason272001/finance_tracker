import os
import subprocess
import sys
from pathlib import Path


APP_NAME = "KeeperBMA"
DEFAULT_URL = "https://keeperbma-backend.onrender.com/docs"


def _find_browser():
    candidates = [
        Path(os.environ.get("ProgramFiles", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("ProgramFiles", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def main():
    url = DEFAULT_URL
    if len(sys.argv) > 1 and str(sys.argv[1]).strip():
        url = str(sys.argv[1]).strip()

    browser = _find_browser()
    # Use Windows special folder to support redirected Desktop paths.
    shortcut_name = f"{APP_NAME} Web.lnk"

    if browser:
        target = browser
        args = f'--app="{url}" --new-window'
        workdir = str(Path(browser).parent)
        icon = f"{browser},0"
    else:
        target = "explorer.exe"
        args = url
        workdir = str(Path.home())
        icon = "shell32.dll,220"

    ps = (
        "$w=New-Object -ComObject WScript.Shell;"
        "$desktop=$w.SpecialFolders('Desktop');"
        f"$s=$w.CreateShortcut((Join-Path $desktop '{shortcut_name}'));"
        f"$s.TargetPath='{target}';"
        f"$s.Arguments='{args}';"
        f"$s.WorkingDirectory='{workdir}';"
        f"$s.IconLocation='{icon}';"
        "$s.Save();"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)

    subprocess.Popen([target, args] if target.lower().endswith(".exe") else [target, url], shell=False)


if __name__ == "__main__":
    main()
