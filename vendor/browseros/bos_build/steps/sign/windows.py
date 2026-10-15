#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# Copyright 2026 Janghoon Lee (Redrob) and contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Windows signing module: Authenticode through Azure Artifact Signing.

Upstream signs with SSL.com's eSigner, which takes a username, a password and
a TOTP secret. This fork signs with Azure Artifact Signing instead, through
signtool's ``/dlib`` plug-in from the Microsoft.ArtifactSigning.Client NuGet
package. There is no certificate file, no password and no client secret
anywhere in this module: the plug-in authenticates with DefaultAzureCredential,
so the credential is whatever ``az login`` left behind -- in CI the
``azure/login`` step that exchanged the job's OpenID Connect token right before
this step runs, on a developer machine an interactive ``az login``.

Three plain identifiers configure it (``ARTIFACT_SIGNING_ENDPOINT``,
``ARTIFACT_SIGNING_ACCOUNT``, ``ARTIFACT_SIGNING_CERT_PROFILE``); none of them
is a secret. The signature is then checked twice -- ``signtool verify /pa /v``
and ``Get-AuthenticodeSignature`` -- and anything but ``Valid`` from a signer
other than the organisation's certificate fails the step.
"""

import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import List, Optional
from ...core.step import Step, ValidationError, step
from ...core.context import Context
from ...lib.env import EnvConfig
from ...products.server_binaries import (
    all_server_bundles,
    expected_windows_bundle_binary_paths,
    server_bundles_for_product,
)
from ...lib.utils import (
    log_info,
    log_error,
    log_success,
    log_warning,
    join_paths,
    IS_WINDOWS,
)


ARTIFACT_SIGNING_ENV_VARS: tuple[str, ...] = (
    "ARTIFACT_SIGNING_ENDPOINT",
    "ARTIFACT_SIGNING_ACCOUNT",
    "ARTIFACT_SIGNING_CERT_PROFILE",
)

# The signtool plug-in. The package is fetched from NuGet at signing time; a
# pre-extracted copy can be named with ARTIFACT_SIGNING_DLIB to skip that.
ARTIFACT_SIGNING_CLIENT_PACKAGE = "Microsoft.ArtifactSigning.Client"
ARTIFACT_SIGNING_CLIENT_URL = (
    f"https://www.nuget.org/api/v2/package/{ARTIFACT_SIGNING_CLIENT_PACKAGE}"
)
ARTIFACT_SIGNING_DLIB_NAME = "Azure.CodeSigning.Dlib.dll"

# Azure Artifact Signing's own RFC 3161 timestamp authority. /tr, never the
# legacy /t: without an RFC 3161 timestamp the signature expires with the
# certificate.
DEFAULT_TIMESTAMP_URL = "http://timestamp.acs.microsoft.com"

# Only the credentials a CI runner or a developer shell can satisfy. Without
# this list a missing login falls through to InteractiveBrowserCredential, which
# opens a browser nobody sees and waits forever. With it, a missing login fails
# in seconds and names the credential chain.
EXCLUDED_CREDENTIALS: tuple[str, ...] = (
    "InteractiveBrowserCredential",
    "ManagedIdentityCredential",
    "SharedTokenCacheCredential",
    "VisualStudioCredential",
    "VisualStudioCodeCredential",
    "AzurePowerShellCredential",
    "AzureDeveloperCliCredential",
    "WorkloadIdentityCredential",
)

# The organisation's Public Trust certificate. A signature from any other
# subject -- a test profile, a mis-pointed account -- is a failure, not a
# warning. ARTIFACT_SIGNING_EXPECTED_SUBJECT overrides it for another
# organisation's build of this tree.
DEFAULT_EXPECTED_SIGNER_SUBJECT = "CN=McKinley Rice, Inc."


@step(
    "sign_windows",
    phase="sign",
    platforms=("windows",),
    env=ARTIFACT_SIGNING_ENV_VARS,
)
class WindowsSignModule(Step):
    produces = ["signed_installer"]
    requires = ["built_app"]
    description = "Sign Windows binaries and create signed installer"

    def validate(self, ctx: Context) -> None:
        if not IS_WINDOWS():
            raise ValidationError("Windows signing requires Windows")

        build_output_dir = join_paths(ctx.chromium_src, ctx.out_dir)
        if not build_output_dir.exists():
            raise ValidationError(
                f"Build output directory not found: {build_output_dir}"
            )

        missing = missing_artifact_signing_env(ctx.env)
        if missing:
            raise ValidationError(
                f"Missing environment variables: {', '.join(missing)}"
            )

        _warn_about_suspicious_values(ctx.env)

    def execute(self, ctx: Context) -> None:
        log_info("\n🔏 Signing Windows binaries...")

        build_output_dir = join_paths(ctx.chromium_src, ctx.out_dir)

        self._sign_executables(build_output_dir, ctx)
        self._build_mini_installer(ctx)
        mini_installer_path = self._sign_installer(build_output_dir, ctx.env)

        ctx.artifact_registry.add("signed_installer", mini_installer_path)
        log_success("✅ All binaries signed successfully!")

    def _sign_executables(self, build_output_dir: Path, ctx: Context) -> None:
        log_info("\nStep 1/3: Signing executables before packaging...")
        env = ctx.env
        chrome_path = build_output_dir / "chrome.exe"
        if not chrome_path.exists():
            raise RuntimeError(f"Missing primary browser executable: {chrome_path}")

        missing = get_missing_required_browseros_server_binary_paths(
            build_output_dir, ctx.product.id
        )
        if missing:
            raise RuntimeError(
                "Missing bundled server binaries: "
                + ", ".join(str(path) for path in missing)
            )

        binaries_to_sign = [chrome_path]
        binaries_to_sign.extend(
            get_existing_browseros_server_binary_paths(build_output_dir, ctx.product.id)
        )
        for binary in binaries_to_sign:
            log_info(f"Found binary to sign: {binary.name}")

        if not sign_with_artifact_signing(binaries_to_sign, env):
            raise RuntimeError("Failed to sign executables")

    def _build_mini_installer(self, ctx: Context) -> None:
        log_info("\nStep 2/3: Building mini_installer with signed binaries...")
        if not build_mini_installer(ctx):
            raise RuntimeError("Failed to build mini_installer")

    def _sign_installer(self, build_output_dir: Path, env: EnvConfig) -> Path:
        log_info("\nStep 3/3: Signing mini_installer.exe...")
        mini_installer_path = build_output_dir / "mini_installer.exe"
        if not mini_installer_path.exists():
            raise RuntimeError(
                f"mini_installer.exe not found at: {mini_installer_path}"
            )

        if not sign_with_artifact_signing([mini_installer_path], env):
            raise RuntimeError("Failed to sign mini_installer.exe")

        return mini_installer_path


def get_browseros_server_binary_paths(
    build_output_dir: Path,
    product_id: str | None = None,
) -> List[Path]:
    """Return absolute paths to bundled server binaries for signing."""
    return expected_windows_bundle_binary_paths(build_output_dir, product_id)


def get_existing_browseros_server_binary_paths(
    build_output_dir: Path,
    product_id: str | None = None,
) -> List[Path]:
    """Return bundled server binary paths that exist in a build output dir."""
    return [
        path
        for path in expected_windows_bundle_binary_paths(build_output_dir, product_id)
        if path.exists()
    ]


def get_missing_required_browseros_server_binary_paths(
    build_output_dir: Path,
    product_id: str | None = None,
) -> List[Path]:
    """Return missing bundled server binaries that should already be packaged."""
    missing: List[Path] = []
    bundles = (
        server_bundles_for_product(product_id) if product_id else all_server_bundles()
    )
    for bundle in bundles:
        bundle_root = build_output_dir / bundle.windows_bundle_resources_root
        should_exist = (
            product_id is not None
            or bundle.required_in_chromium_output
            or bundle_root.exists()
        )
        if not should_exist:
            continue
        for rel in bundle.windows_binaries:
            path = bundle_root / "bin" / rel
            if not path.exists():
                missing.append(path)
    return missing


def build_mini_installer(ctx: Context) -> bool:
    """Build the mini_installer.exe"""
    from ..compile import build_target

    log_info("Building mini_installer target...")
    return build_target(ctx, "mini_installer")


def missing_artifact_signing_env(env: EnvConfig) -> List[str]:
    """Return the ARTIFACT_SIGNING_* names that are unset or blank."""
    values = (
        env.artifact_signing_endpoint,
        env.artifact_signing_account,
        env.artifact_signing_cert_profile,
    )
    return [
        name
        for name, value in zip(ARTIFACT_SIGNING_ENV_VARS, values)
        if not (value or "").strip()
    ]


def _warn_about_suspicious_values(env: EnvConfig) -> None:
    """Warn when configuration values look copied with shell-only decoration."""
    for name, value in (
        ("ARTIFACT_SIGNING_ENDPOINT", env.artifact_signing_endpoint),
        ("ARTIFACT_SIGNING_ACCOUNT", env.artifact_signing_account),
        ("ARTIFACT_SIGNING_CERT_PROFILE", env.artifact_signing_cert_profile),
    ):
        if not value:
            continue
        if value != value.strip():
            log_warning(f"{name} has leading or trailing whitespace")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            log_warning(f"{name} appears to include wrapping quote characters")


def find_signtool() -> Optional[Path]:
    """Locate signtool.exe: SIGNTOOL, then PATH, then the newest x64 Windows Kit."""
    configured = os.environ.get("SIGNTOOL")
    if configured:
        path = Path(configured)
        return path if path.exists() else None

    on_path = shutil.which("signtool.exe") or shutil.which("signtool")
    if on_path:
        return Path(on_path)

    program_files = os.environ.get("ProgramFiles(x86)") or os.environ.get(
        "PROGRAMFILES(X86)"
    )
    if not program_files:
        return None
    kits = Path(program_files) / "Windows Kits" / "10" / "bin"
    if not kits.exists():
        return None
    candidates = sorted(
        (
            p
            for p in kits.rglob("signtool.exe")
            if p.parent.name.lower() == "x64"
        ),
        key=lambda p: str(p),
    )
    return candidates[-1] if candidates else None


def resolve_artifact_signing_dlib(work_dir: Path) -> Path:
    """Return the x64 Azure.CodeSigning.Dlib.dll, downloading the client if needed.

    ARTIFACT_SIGNING_DLIB names an already-extracted plug-in (a developer machine
    or an offline runner). Otherwise the NuGet package is fetched into work_dir
    and expanded there; a NuGet package is a zip.
    """
    configured = os.environ.get("ARTIFACT_SIGNING_DLIB")
    if configured:
        dlib = Path(configured)
        if not dlib.exists():
            raise RuntimeError(f"ARTIFACT_SIGNING_DLIB does not exist: {dlib}")
        return dlib

    import requests

    package = work_dir / "artifact-signing-client.nupkg"
    log_info(f"Downloading {ARTIFACT_SIGNING_CLIENT_PACKAGE} from NuGet...")
    response = requests.get(ARTIFACT_SIGNING_CLIENT_URL, timeout=120)
    response.raise_for_status()
    package.write_bytes(response.content)

    client_dir = work_dir / "client"
    with zipfile.ZipFile(package) as archive:
        archive.extractall(client_dir)

    for candidate in sorted(client_dir.rglob(ARTIFACT_SIGNING_DLIB_NAME)):
        if "x64" in {part.lower() for part in candidate.parts}:
            return candidate
    raise RuntimeError(
        f"{ARTIFACT_SIGNING_DLIB_NAME} (x64) not found in "
        f"{ARTIFACT_SIGNING_CLIENT_PACKAGE}"
    )


def write_artifact_signing_metadata(path: Path, env: EnvConfig) -> Path:
    """Write the /dmdf metadata signtool hands to the Artifact Signing plug-in."""
    endpoint = (env.artifact_signing_endpoint or "").strip().rstrip("/")
    metadata = {
        "Endpoint": endpoint,
        "CodeSigningAccountName": (env.artifact_signing_account or "").strip(),
        "CertificateProfileName": (env.artifact_signing_cert_profile or "").strip(),
        "ExcludeCredentials": list(EXCLUDED_CREDENTIALS),
    }
    path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return path


def expected_signer_subject() -> str:
    return (
        os.environ.get("ARTIFACT_SIGNING_EXPECTED_SUBJECT")
        or DEFAULT_EXPECTED_SIGNER_SUBJECT
    )


def _log_process_output(result) -> None:
    if result.stdout:
        for line in result.stdout.splitlines():
            if line.strip():
                log_info(line.strip())
    if result.stderr:
        for line in result.stderr.splitlines():
            if line.strip():
                log_error(line.strip())


def verify_authenticode(signtool: Path, binary: Path) -> bool:
    """Full Authenticode verification, twice, and the signer must be ours.

    `signtool verify /pa /v` walks the chain to a trusted root and checks the
    timestamp; a Public Trust certificate chains to a Microsoft root every
    Windows trusts, so this MUST pass -- there is no NotTrusted or UnknownError
    allowance. Get-AuthenticodeSignature then has to say Valid, and the subject
    it reports has to be the organisation's certificate.
    """
    verify = subprocess.run(
        [str(signtool), "verify", "/pa", "/v", str(binary)],
        capture_output=True,
        text=True,
    )
    _log_process_output(verify)
    if getattr(verify, "returncode", 0) != 0:
        log_error(f"✗ signtool verify /pa failed for {binary.name}")
        return False

    escaped = str(binary).replace("'", "''")
    script = (
        f"$s = Get-AuthenticodeSignature -LiteralPath '{escaped}'; "
        "Write-Output $s.Status; "
        "Write-Output $s.SignerCertificate.Subject"
    )
    probe = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
    )
    lines = [line.strip() for line in (probe.stdout or "").splitlines() if line.strip()]
    status = lines[0] if lines else ""
    subject = lines[1] if len(lines) > 1 else ""
    if getattr(probe, "returncode", 0) != 0 or status != "Valid":
        log_error(
            f"✗ {binary.name} Authenticode status is '{status or 'unknown'}', not Valid"
        )
        if probe.stderr:
            log_error(probe.stderr.strip())
        return False

    expected = expected_signer_subject()
    if expected not in subject:
        log_error(
            f"✗ {binary.name} is signed by '{subject}', expected '{expected}'"
        )
        return False

    log_success(f"{binary} signed by {subject}")
    return True


def sign_with_artifact_signing(
    binaries: List[Path],
    env: Optional[EnvConfig] = None,
) -> bool:
    """Sign binaries with Azure Artifact Signing and verify every signature.

    Args:
        binaries: Binary paths to sign, in place.
        env: Optional EnvConfig instance. If not provided, creates a new one.
    """
    log_info("Using Azure Artifact Signing (signtool /dlib)...")

    if env is None:
        env = EnvConfig()

    missing = missing_artifact_signing_env(env)
    if missing:
        log_error("Missing required Artifact Signing environment variables:")
        for name in missing:
            log_error(f"  {name}")
        log_error(
            "The Azure credential itself comes from `az login` "
            "(azure/login with the job's OpenID Connect token in CI)."
        )
        return False

    signtool = find_signtool()
    if signtool is None:
        log_error("signtool.exe not found (install the Windows SDK or set SIGNTOOL)")
        return False

    missing_files = [binary for binary in binaries if not binary.exists()]
    if missing_files:
        for binary in missing_files:
            log_error(f"✗ Binary to sign does not exist: {binary}")
        return False

    timestamp_url = os.environ.get("WINDOWS_TIMESTAMP_URL") or DEFAULT_TIMESTAMP_URL
    work_dir = Path(tempfile.mkdtemp(prefix="artifact-signing-"))
    try:
        dlib = resolve_artifact_signing_dlib(work_dir)
        metadata = write_artifact_signing_metadata(work_dir / "metadata.json", env)
        log_info(
            f"Signing with {env.artifact_signing_account} / "
            f"{env.artifact_signing_cert_profile}: "
            + ", ".join(binary.name for binary in binaries)
        )

        cmd = [
            str(signtool),
            "sign",
            "/v",
            "/fd",
            "SHA256",
            "/td",
            "SHA256",
            "/tr",
            timestamp_url,
            "/dlib",
            str(dlib),
            "/dmdf",
            str(metadata),
            *(str(binary) for binary in binaries),
        ]
        log_info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, shell=False, capture_output=True, text=True)
        _log_process_output(result)
        if getattr(result, "returncode", 0) != 0:
            log_error(
                f"✗ signtool sign failed with exit code {result.returncode} "
                "- authentication or signing error"
            )
            return False
    except Exception as e:
        log_error(f"Failed to sign: {e}")
        return False
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    all_success = True
    for binary in binaries:
        try:
            if not verify_authenticode(signtool, binary):
                all_success = False
        except Exception as e:
            # Windows releases require successful Authenticode verification. A
            # broken verifier must stop packaging and OTA publication.
            log_error(f"Could not verify signature for {binary.name}: {e}")
            all_success = False

    return all_success


def check_signing_environment(env: Optional[EnvConfig] = None) -> bool:
    """Check if Windows signing environment is properly configured

    Args:
        env: Optional EnvConfig instance. If not provided, creates a new one.
    """
    if env is None:
        env = EnvConfig()

    missing = missing_artifact_signing_env(env)
    if missing:
        log_error(f"Missing environment variables: {', '.join(missing)}")
        return False

    _warn_about_suspicious_values(env)

    return True
