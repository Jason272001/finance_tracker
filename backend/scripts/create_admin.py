"""Create only the initial owner from an authenticated operator shell."""
import argparse
from getpass import getpass
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import core


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--phone", required=True)
    args = parser.parse_args()
    password = getpass("Initial owner password (10+ characters): ")
    if len(password) < 10 or password != getpass("Confirm password: "):
        raise SystemExit("Passwords must match and contain at least 10 characters.")
    with core.atomic_operation():
        admins = core.Admin1957()
        if admins.count():
            raise SystemExit("An administrator already exists. Use the authenticated owner account to manage administrators.")
        admin = admins.register(args.name, args.email, args.phone, password, "owner")
    print(f"Initial owner created (administrator ID {admin['id']}). No password was logged.")


if __name__ == "__main__":
    main()
