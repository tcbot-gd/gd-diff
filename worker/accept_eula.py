#!/usr/bin/env python3
"""Accept the IDA Pro EULA for headless/batch use.

IDA refuses to run in batch mode until the EULA keys are present in its
registry. On Windows that is the Windows registry; on Linux/macOS it is a
file under the IDA user dir (IDAUSR or ~/.idapro). We set them through
idalib's `ida_registry`, exactly like Hex-Rays' own HCLI does.

Source of truth: https://gist.github.com/buzzer-re/232eb738e8b6dc855381c01512187b51
(which mirrors https://github.com/HexRaysSA/ida-hcli).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

EULA_KEYS = ("EULA 90", "EULA 91", "EULA 92", "EULA 93")


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: accept_eula.py <ida_dir>", file=sys.stderr)
        return 2

    ida_dir = Path(sys.argv[1]).expanduser().resolve()
    if not ida_dir.exists():
        raise FileNotFoundError(f"IDA directory does not exist: {ida_dir}")

    idalib_python = ida_dir / "idalib" / "python"
    if not idalib_python.exists():
        raise RuntimeError(f"{idalib_python} not found. This install does not include idalib.")

    os.environ["IDADIR"] = str(ida_dir)
    sys.path.insert(0, str(idalib_python))

    try:
        import idapro  # noqa: F401
        import ida_registry
    except Exception as exc:
        raise RuntimeError(
            "Failed to load idalib. Make sure this is a full IDA Pro install and "
            "that its runtime dependencies are available."
        ) from exc

    for key in EULA_KEYS:
        ida_registry.reg_write_int(key, 1)

    print(f"Accepted IDA EULA for: {ida_dir}")
    print("Written keys:", ", ".join(EULA_KEYS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
