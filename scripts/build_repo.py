#!/usr/bin/env python3
"""Build a signed apt repository from the .deb files in out/artifacts.

This is the last piece between "a tag" and "something a user can install and keep updated". A .deb on a releases
page is installable exactly once; an apt repository is what makes `apt upgrade` work, and a SIGNED one is what
makes it safe -- an unsigned repo means every future update is whatever the network hands you.

WHAT THIS DOES NOT DO, deliberately: it does not create a signing key, and no key is stored in this repository.
The private key arrives at run time from REDROB_SIGNING_KEY (ASCII-armoured) or is already in the host's keyring
and named by REDROB_SIGNING_KEY_ID. A signing key committed to a repo is not a signing key, it is a published
secret, and the whole point of the signature is that only the publisher can produce it.

It also writes the Release file itself rather than calling apt-ftparchive, which is not on every host that has
dpkg-dev. One fewer thing a build machine has to have installed, and the format is a short deb822 document.
"""
from __future__ import annotations

import argparse
import email.utils
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Kept in step with the .info file's PACKAGE and with redrob-version.txt, both of which check_repo.py verifies.
ORIGIN = "Redrob"
LABEL = "Redrob Browser"
SUITE = "stable"
COMPONENT = "main"
ARCH = "amd64"


def run(cmd: list[str], cwd: pathlib.Path | None = None, stdin_text: str | None = None) -> str:
    result = subprocess.run(cmd, cwd=cwd, text=True, input=stdin_text, capture_output=True)
    if result.returncode != 0:
        # stderr only. A gpg failure can echo the material it was handed, and this runs in CI logs.
        sys.exit(f"{cmd[0]} failed ({result.returncode}): {result.stderr.strip().splitlines()[-1:] or ''}")
    return result.stdout


def hash_file(path: pathlib.Path) -> tuple[int, str, str]:
    data = path.read_bytes()
    return len(data), hashlib.md5(data).hexdigest(), hashlib.sha256(data).hexdigest()


def build_release(dists: pathlib.Path, files: list[pathlib.Path]) -> str:
    lines = [
        f"Origin: {ORIGIN}",
        f"Label: {LABEL}",
        f"Suite: {SUITE}",
        f"Codename: {SUITE}",
        f"Architectures: {ARCH}",
        f"Components: {COMPONENT}",
        f"Date: {email.utils.formatdate(usegmt=True)}",
        "Description: Redrob Browser packages",
    ]
    # Both digests. apt has preferred SHA256 for years, but a stale client that only reads MD5Sum would
    # otherwise reject the repository outright rather than degrade.
    for field, index in (("MD5Sum", 1), ("SHA256", 2)):
        lines.append(f"{field}:")
        for path in files:
            size, md5, sha256 = hash_file(path)
            digest = md5 if index == 1 else sha256
            lines.append(f" {digest} {size} {path.relative_to(dists).as_posix()}")
    return "\n".join(lines) + "\n"


def sign(repo_dists: pathlib.Path, release: pathlib.Path, key_id: str, home: pathlib.Path) -> None:
    env = os.environ | {"GNUPGHOME": str(home)}
    base = ["gpg", "--batch", "--yes", "--local-user", key_id]
    # Both forms, because apt clients in the wild fetch one or the other: InRelease is the clear-signed document
    # modern apt prefers, Release.gpg the detached signature older sources.list entries still expect.
    subprocess.run(base + ["--clearsign", "--output", str(repo_dists / "InRelease"), str(release)],
                   env=env, check=True, capture_output=True)
    subprocess.run(base + ["--detach-sign", "--armor", "--output", str(repo_dists / "Release.gpg"),
                           str(release)], env=env, check=True, capture_output=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=pathlib.Path, default=ROOT / "out" / "artifacts")
    parser.add_argument("--out", type=pathlib.Path, default=ROOT / "out" / "repo")
    parser.add_argument("--unsigned", action="store_true",
                        help="build the repository without signing it. An unsigned apt repository means every "
                             "future update is whatever the network hands the user, so this has to be asked for")
    args = parser.parse_args()

    debs = sorted(args.artifacts.glob("*.deb"))
    if not debs:
        sys.exit(f"no .deb in {args.artifacts}: run `redrob.py package` first")

    key_material = os.environ.get("REDROB_SIGNING_KEY")
    key_id = os.environ.get("REDROB_SIGNING_KEY_ID")
    if not args.unsigned and not key_material and not key_id:
        sys.exit("no signing key: set REDROB_SIGNING_KEY (ASCII-armoured private key) or "
                 "REDROB_SIGNING_KEY_ID (a key already in the host keyring), or pass --unsigned and mean it")

    if args.out.exists():
        shutil.rmtree(args.out)
    pool = args.out / "pool" / COMPONENT
    binary = args.out / "dists" / SUITE / COMPONENT / f"binary-{ARCH}"
    pool.mkdir(parents=True)
    binary.mkdir(parents=True)
    for deb in debs:
        shutil.copy2(deb, pool / deb.name)

    # Paths inside Packages must be relative to the repository root, which is what apt joins onto the
    # sources.list URL -- an absolute path here produces a repository that resolves to nothing.
    packages = run(["dpkg-scanpackages", "--multiversion", str(pool.relative_to(args.out)), "/dev/null"],
                   cwd=args.out)
    (binary / "Packages").write_text(packages)
    run(["gzip", "-9", "-k", "-f", str(binary / "Packages")])

    dists = args.out / "dists" / SUITE
    release = dists / "Release"
    release.write_text(build_release(dists, sorted(p for p in binary.iterdir() if p.name != "Release")))

    if args.unsigned:
        print("WARNING: repository is UNSIGNED. apt will refuse it without [trusted=yes], and a user who adds "
              "that flag has turned off the only check that update path has.")
    else:
        with tempfile.TemporaryDirectory(prefix="redrob-gpg-") as tmp:
            home = pathlib.Path(tmp)
            home.chmod(0o700)
            if key_material:
                # Through stdin, never a file and never an argument: a key on the command line sits in the
                # process table for every other user on the machine to read. And into a THROWAWAY GNUPGHOME
                # under a temporary directory, so a CI run does not leave a private key in the runner's own
                # keyring for the next job on that machine to find.
                env = os.environ | {"GNUPGHOME": str(home)}
                subprocess.run(["gpg", "--batch", "--import"], env=env, input=key_material, text=True,
                               check=True, capture_output=True)
                listing = subprocess.run(["gpg", "--batch", "--list-secret-keys", "--with-colons"],
                                         env=env, text=True, capture_output=True).stdout
                fingerprints = [line.split(":")[9] for line in listing.splitlines()
                                if line.startswith("fpr:")]
                if not fingerprints:
                    sys.exit("REDROB_SIGNING_KEY imported no secret key")
                key_id = fingerprints[0]
            else:
                shutil.rmtree(home, ignore_errors=True)
                home = pathlib.Path(os.environ.get("GNUPGHOME", pathlib.Path.home() / ".gnupg"))
            sign(dists, release, key_id, home)
        # The fingerprint, never the key. It is public by definition and it is what a user pins.
        print(f"signed with {key_id}")

    for path in sorted(args.out.rglob("*")):
        if path.is_file():
            print(f"  {path.relative_to(args.out)}  {path.stat().st_size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
