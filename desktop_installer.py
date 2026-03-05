import os
import subprocess
import sys
from pathlib import Path


def _find_project_root(start: Path) -> Path:
    candidates = [start] + list(start.parents)
    for c in candidates:
        if (
            (c / "app.py").exists()
            and (c / "desktop_native.py").exists()
            and (c / "env" / "Scripts" / "streamlit.exe").exists()
            and (c / "env" / "pythonw.exe").exists()
        ):
            return c
    raise FileNotFoundError("Could not locate project root with desktop runtime dependencies")


def main():
    install_dir = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "KeeperBMA"
    install_dir.mkdir(parents=True, exist_ok=True)

    # Resolve project root from installer location.
    setup_exe = Path(sys.executable).resolve()
    project_root = _find_project_root(setup_exe.parent)
    pythonw_exe = project_root / "env" / "pythonw.exe"
    native_script = project_root / "desktop_native.py"
    icon_path = project_root / "assets" / "keeperbma-app.ico"
    icon_location = str(icon_path) if icon_path.exists() else "shell32.dll,220"

    if not pythonw_exe.exists():
        raise FileNotFoundError(f"pythonw.exe not found at {pythonw_exe}")
    if not native_script.exists():
        raise FileNotFoundError(f"desktop_native.py not found at {native_script}")

    # Cleanup legacy launchers that opened terminal/browser.
    for old_name in [
        "launch_keeperbmo.ps1",
        "launch_keeperbma.ps1",
    ]:
        old_file = install_dir / old_name
        if old_file.exists():
            try:
                old_file.unlink()
            except Exception:
                pass

    # Create shortcut via PowerShell COM.
    ps = (
        "$w=New-Object -ComObject WScript.Shell;"
        "$desktop=$w.SpecialFolders('Desktop');"
        "$old=Get-ChildItem -Path $desktop -Filter '*Desktop.lnk' -ErrorAction SilentlyContinue | "
        "Where-Object { $_.Name -match '(?i)^keeper.*desktop\\.lnk$' };"
        "foreach($f in $old){ Remove-Item -Force $f.FullName -ErrorAction SilentlyContinue };"
        "$shortcut=Join-Path $desktop 'KeeperBMA Desktop.lnk';"
        "$s=$w.CreateShortcut($shortcut);"
        f"$s.TargetPath='{str(pythonw_exe)}';"
        f"$s.Arguments='\"{str(native_script)}\"';"
        f"$s.WorkingDirectory='{str(project_root)}';"
        f"$s.IconLocation='{icon_location}';"
        "$s.Save();"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)

    # Do not auto-launch after install.


if __name__ == "__main__":
    main()
