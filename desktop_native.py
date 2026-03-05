import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import webview


def _find_free_port(start=8502, end=8600):
    for p in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise RuntimeError("No available local port found for KeeperBMA.")


def _wait_until_ready(host, port, timeout=25.0):
    start = time.time()
    while time.time() - start < timeout:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex((host, port)) == 0:
                return True
        time.sleep(0.2)
    return False


def main():
    root = Path(__file__).resolve().parent
    pythonw_exe = root / "env" / "pythonw.exe"
    app_py = root / "app.py"
    if not pythonw_exe.exists():
        raise FileNotFoundError(f"Missing {pythonw_exe}")
    if not app_py.exists():
        raise FileNotFoundError(f"Missing {app_py}")

    port = _find_free_port()
    cmd = [
        str(pythonw_exe),
        "-m",
        "streamlit",
        "run",
        str(app_py),
        "--server.address",
        "127.0.0.1",
        "--server.port",
        str(port),
        "--server.headless",
        "true",
        "--browser.gatherUsageStats",
        "false",
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=str(root),
        creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW) if os.name == "nt" else 0,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    ready = _wait_until_ready("127.0.0.1", port, timeout=30.0)
    if not ready:
        proc.terminate()
        raise RuntimeError("KeeperBMA backend did not start in time.")

    url = f"http://127.0.0.1:{port}"
    try:
        window = webview.create_window("KeeperBMA", url, width=1280, height=860, min_size=(980, 680))
        webview.start()
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()


if __name__ == "__main__":
    main()
