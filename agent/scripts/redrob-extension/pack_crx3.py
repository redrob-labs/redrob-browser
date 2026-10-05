#!/usr/bin/env python3
"""Pack an unpacked extension directory into a signed CRX3, with no Chrome binary.

CI has no browser to run `chrome --pack-extension` with, and the format is small enough to
write directly. Layout (components/crx_file/crx3.proto):

    "Cr24" | uint32le 3 | uint32le header_len | CrxFileHeader | zip

    CrxFileHeader { 2: AsymmetricKeyProof sha256_with_rsa { 1: public_key, 2: signature },
                    10000: bytes signed_header_data = SignedData { 1: crx_id } }

The signature is RSA-SHA256 over
    "CRX3 SignedData\\x00" | uint32le len(signed_header_data) | signed_header_data | zip
and crx_id is the first 16 bytes of sha256(public key DER). Chrome re-derives both on install,
so a wrong byte here fails the install loudly rather than producing a quietly different id.

Usage: pack_crx3.py <extension-dir> <private-key.pem> <out.crx>
Prints the extension id.
"""

from __future__ import annotations

import hashlib
import io
import struct
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def field_bytes(number: int, payload: bytes) -> bytes:
    return varint((number << 3) | 2) + varint(len(payload)) + payload


def zip_dir(root: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(p for p in root.rglob("*") if p.is_file()):
            info = zipfile.ZipInfo(str(path.relative_to(root)), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, path.read_bytes())
    return buf.getvalue()


def extension_id(public_der: bytes) -> str:
    return "".join(chr(ord("a") + int(c, 16)) for c in hashlib.sha256(public_der).hexdigest()[:32])


def main() -> int:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src, key, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    public_der = subprocess.run(
        ["openssl", "pkey", "-in", str(key), "-pubout", "-outform", "DER"],
        capture_output=True, check=True,
    ).stdout
    crx_id = hashlib.sha256(public_der).digest()[:16]
    signed_header_data = field_bytes(1, crx_id)
    archive = zip_dir(src)
    to_sign = b"CRX3 SignedData\x00" + struct.pack("<I", len(signed_header_data)) + signed_header_data + archive
    with tempfile.NamedTemporaryFile() as f:
        f.write(to_sign)
        f.flush()
        signature = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", str(key), f.name], capture_output=True, check=True
        ).stdout
    proof = field_bytes(1, public_der) + field_bytes(2, signature)
    header = field_bytes(2, proof) + field_bytes(10000, signed_header_data)
    out.write_bytes(b"Cr24" + struct.pack("<II", 3, len(header)) + header + archive)
    print(extension_id(public_der))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
