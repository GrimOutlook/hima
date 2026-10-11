"""Parse shipped units with systemd and inspect their offline sandbox assessment.

The temporary root supplies executable/target stubs only; this does not run the
services or prove kernel namespace/BPF enforcement on a production host.
"""

import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    deploy = Path(__file__).resolve().parent
    names = ["hima-api.service", "hima-migrate.service"]
    with tempfile.TemporaryDirectory(prefix="hima-systemd-") as directory:
        root = Path(directory)
        units = root / "etc/systemd/system"
        units.mkdir(parents=True)
        for name in names:
            shutil.copyfile(deploy / name, units / name)
        for name in ["sysinit.target", "basic.target", "shutdown.target", "network-online.target"]:
            (units / name).write_text("[Unit]\nDescription=Verification fixture\n")
        binaries = root / "opt/hima/current/backend/bin"
        binaries.mkdir(parents=True)
        for name in ["hima-api", "migrate"]:
            shutil.copyfile(shutil.which("true"), binaries / name)
            (binaries / name).chmod(0o755)
        result = subprocess.run(
            ["systemd-analyze", "verify", "--man=no", "--generators=no",
             f"--root={root}", *names],
            capture_output=True, text=True, check=True,
        )
        # Unknown directives can be warnings rather than a nonzero exit status.
        if result.stderr.strip():
            raise AssertionError(result.stderr)
    for name in names:
        result = subprocess.run(
            ["systemd-analyze", "security", "--offline=yes", "--json=short",
             str(deploy / name)],
            capture_output=True, text=True, check=True,
        )
        assessment = {row["name"]: row for row in json.loads(result.stdout)}
        for directive in ["ProtectProc=", "ProcSubset=", "PrivateUsers=",
                          "ProtectKernelLogs=", "ProtectClock=", "ProtectHostname=",
                          "RestrictRealtime=", "RestrictNamespaces=~user"]:
            if assessment[directive]["exposure"] is not None:
                raise AssertionError(f"{name}: {directive} is not protected")
        print(f"{name}: unit verification and eight sandbox assessments passed")


if __name__ == "__main__":
    main()
