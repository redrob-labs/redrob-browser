#!/usr/bin/env python3
"""Cloudflare R2 upload module for BrowserOS build artifacts"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..common.module import CommandModule, ValidationError
from ..common.context import Context
from ..common.env import EnvConfig
from ..common.utils import (
    log_info,
    log_error,
    log_success,
    log_warning,
    IS_WINDOWS,
    IS_MACOS,
    IS_LINUX,
)
from ..common.notify import get_notifier, COLOR_GREEN

# Try to import boto3 for R2 (S3-compatible)
try:
    import boto3
    from botocore.config import Config

    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


def _get_platform() -> str:
    """Get platform name for R2 path"""
    if IS_MACOS():
        return "macos"
    elif IS_WINDOWS():
        return "win"
    else:
        return "linux"


class UploadModule(CommandModule):
    """Upload build artifacts to Cloudflare R2"""

    produces = []
    requires = []
    description = "Upload build artifacts to Cloudflare R2"

    def validate(self, ctx: Context) -> None:
        if not BOTO3_AVAILABLE:
            raise ValidationError(
                "boto3 library not installed - run: pip install boto3"
            )

        if not ctx.env.has_r2_config():
            raise ValidationError(
                "R2 configuration not set. Required env vars: "
                "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
            )

    def execute(self, ctx: Context) -> None:
        log_info("\n☁️  Uploading package artifacts to R2...")

        # Build extra metadata from sparkle signatures if available
        extra_metadata = {}
        sparkle_signatures = ctx.artifacts.get("sparkle_signatures")
        if sparkle_signatures:
            for filename, (sig, length) in sparkle_signatures.items():
                extra_metadata[filename] = {
                    "sparkle_signature": sig,
                    "sparkle_length": length,
                }

        success, release_json = upload_release_artifacts(ctx, extra_metadata)
        if not success:
            raise RuntimeError("Failed to upload artifacts to R2")


def get_r2_client(env: Optional[EnvConfig] = None):
    """Create boto3 S3 client configured for R2

    Args:
        env: Optional EnvConfig instance. If not provided, creates a new one.
    """
    if env is None:
        env = EnvConfig()

    if not env.has_r2_config():
        return None

    return boto3.client(
        "s3",
        endpoint_url=env.r2_endpoint_url,
        aws_access_key_id=env.r2_access_key_id,
        aws_secret_access_key=env.r2_secret_access_key,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def upload_file_to_r2(
    client,
    local_path: Path,
    r2_key: str,
    bucket: str,
) -> bool:
    """Upload a single file to R2

    Args:
        client: boto3 S3 client
        local_path: Path to local file
        r2_key: Key (path) in R2 bucket
        bucket: R2 bucket name

    Returns:
        True if successful, False otherwise
    """
    try:
        log_info(f"📤 Uploading {local_path.name}...")
        client.upload_file(str(local_path), bucket, r2_key)
        log_success(f"✓ Uploaded: {r2_key}")
        return True
    except Exception as e:
        log_error(f"Failed to upload {local_path.name}: {e}")
        return False


def generate_release_json(
    ctx: Context,
    artifacts: List[Dict],
    platform: str,
) -> Dict:
    """Generate release.json metadata for a platform

    Args:
        ctx: Build context
        artifacts: List of artifact dicts with filename, size, and any extra fields
        platform: Platform name (macos, win, linux)

    Returns:
        Dict containing release metadata
    """
    env = ctx.env

    release_data = {
        "platform": platform,
        "version": ctx.get_semantic_version(),
        "chromium_version": ctx.chromium_version,
        "browseros_chromium_version": ctx.browseros_chromium_version,
        "build_date": datetime.now(timezone.utc).isoformat(),
        "artifacts": {},
    }

    # Add sparkle_version for macOS
    if platform == "macos":
        release_data["sparkle_version"] = ctx.get_sparkle_version()

    # Build artifacts dict
    base_url = f"{env.r2_cdn_base_url}/{ctx.get_release_path(platform)}"

    for artifact in artifacts:
        filename = artifact["filename"]
        artifact_key = _get_artifact_key(filename, platform)

        # Start with base fields
        artifact_data = {
            "filename": filename,
            "url": f"{base_url}{filename}",
        }

        # Add all other fields from artifact metadata
        for key, value in artifact.items():
            if key != "filename":  # filename already handled
                artifact_data[key] = value

        release_data["artifacts"][artifact_key] = artifact_data

    return release_data


def _get_artifact_key(filename: str, platform: str) -> str:
    """Get artifact key name from filename

    Examples:
        BrowserOS_v0.31.0_arm64.dmg -> arm64
        BrowserOS_v0.31.0_x64.dmg -> x64
        BrowserOS_v0.31.0_x64_installer.exe -> x64_installer
        BrowserOS_v0.31.0_x64.AppImage -> x64_appimage
        browseros_0.31.0_amd64.deb -> x64_deb
    """
    lower = filename.lower()

    if platform == "macos":
        if "arm64" in lower:
            return "arm64"
        elif "x64" in lower or "x86_64" in lower:
            return "x64"
        elif "universal" in lower:
            return "universal"

    elif platform == "win":
        if "installer.exe" in lower:
            return "x64_installer"
        elif "installer.zip" in lower:
            return "x64_zip"

    elif platform == "linux":
        if ".appimage" in lower:
            return "x64_appimage"
        elif ".deb" in lower:
            return "x64_deb"

    # Fallback: use filename without extension
    return Path(filename).stem


def detect_artifacts(ctx: Context) -> List[Path]:
    """Detect artifacts in dist directory based on platform

    Returns:
        List of artifact file paths found
    """
    dist_dir = ctx.get_dist_dir()
    if not dist_dir.exists():
        return []

    artifacts = []

    if IS_MACOS():
        artifacts.extend(dist_dir.glob("*.dmg"))
    elif IS_WINDOWS():
        artifacts.extend(dist_dir.glob("*.exe"))
        artifacts.extend(dist_dir.glob("*.zip"))
    else:  # Linux
        artifacts.extend(dist_dir.glob("*.AppImage"))
        artifacts.extend(dist_dir.glob("*.deb"))

    return sorted(artifacts)


def upload_release_artifacts(
    ctx: Context,
    extra_metadata: Optional[Dict[str, Dict[str, any]]] = None,
) -> Tuple[bool, Optional[Dict]]:
    """Upload release artifacts to R2 and generate release.json

    Args:
        ctx: Build context
        extra_metadata: Optional dict mapping filename to extra metadata fields
                       e.g. {"file.dmg": {"sparkle_signature": "...", "sparkle_length": 123}}

    Returns:
        (success, release_json_data) tuple
    """
    if not BOTO3_AVAILABLE:
        log_warning("boto3 not installed. Skipping R2 upload.")
        log_info("Install with: pip install boto3")
        return True, None

    env = ctx.env

    if not env.has_r2_config():
        log_warning("R2 configuration not set. Skipping upload.")
        return True, None

    # Detect artifacts
    artifacts = detect_artifacts(ctx)
    if not artifacts:
        log_info("No artifacts found to upload")
        return True, None

    platform = _get_platform()
    release_path = ctx.get_release_path(platform)

    log_info(f"\n☁️  Uploading to R2: {env.r2_bucket}/{release_path}")
    log_info(f"📦 Found {len(artifacts)} artifact(s):")
    for artifact in artifacts:
        log_info(f"  - {artifact.name}")

    # Create R2 client
    client = get_r2_client(env)
    if not client:
        log_error("Failed to create R2 client")
        return False, None

    # Upload artifacts and collect metadata
    artifact_metadata = []
    for artifact_path in artifacts:
        r2_key = f"{release_path}{artifact_path.name}"

        if not upload_file_to_r2(client, artifact_path, r2_key, env.r2_bucket):
            return False, None

        metadata = {
            "filename": artifact_path.name,
            "size": artifact_path.stat().st_size,
        }

        # Merge extra metadata if available for this file
        if extra_metadata and artifact_path.name in extra_metadata:
            metadata.update(extra_metadata[artifact_path.name])

        artifact_metadata.append(metadata)

    # Generate and upload release.json
    release_data = generate_release_json(ctx, artifact_metadata, platform)
    release_json_path = ctx.get_dist_dir() / "release.json"
    release_json_path.write_text(json.dumps(release_data, indent=2))

    r2_key = f"{release_path}release.json"
    if not upload_file_to_r2(client, release_json_path, r2_key, env.r2_bucket):
        return False, None

    # Print summary
    log_success(f"\n☁️  Successfully uploaded {len(artifacts)} artifact(s) to R2")
    log_info(f"\n📋 Release metadata:")
    log_info(f"  Version: {release_data['version']}")
    if platform == "macos":
        log_info(f"  Sparkle version: {release_data.get('sparkle_version', 'N/A')}")
    log_info(f"  Artifacts: {list(release_data['artifacts'].keys())}")

    # Send Slack notification with artifact URLs
    notifier = get_notifier()
    artifact_urls = [
        f"{a['filename']}: {a['url']}" for a in release_data["artifacts"].values()
    ]
    notifier.notify(
        "☁️ Upload Complete",
        f"Uploaded {len(artifacts)} artifact(s) to R2",
        {
            "Version": release_data["version"],
            "Platform": platform,
            "Artifacts": "\n".join(artifact_urls),
        },
        color=COLOR_GREEN,
    )

    return True, release_data


def download_from_r2(
    r2_key: str,
    dest_path: Path,
    bucket: Optional[str] = None,
    env: Optional[EnvConfig] = None,
) -> bool:
    """Download a file from R2

    Args:
        r2_key: Key (path) in R2 bucket
        dest_path: Local destination path
        bucket: Optional bucket name (uses default from env if not specified)
        env: Optional EnvConfig instance. If not provided, creates a new one.

    Returns:
        True if successful, False otherwise
    """
    if not BOTO3_AVAILABLE:
        log_error("boto3 not installed")
        return False

    if env is None:
        env = EnvConfig()

    if not env.has_r2_config():
        log_error("R2 configuration not set")
        return False

    client = get_r2_client(env)
    if not client:
        return False

    bucket = bucket or env.r2_bucket

    try:
        log_info(f"📥 Downloading {r2_key}...")
        client.download_file(bucket, r2_key, str(dest_path))
        log_success(f"Downloaded to: {dest_path}")
        return True
    except Exception as e:
        log_error(f"Failed to download from R2: {e}")
        return False


def get_release_json(
    version: str,
    platform: str,
    env: Optional[EnvConfig] = None,
) -> Optional[Dict]:
    """Fetch release.json for a specific version and platform from R2

    Args:
        version: Semantic version (e.g., "0.31.0")
        platform: Platform name (macos, win, linux)
        env: Optional EnvConfig instance. If not provided, creates a new one.

    Returns:
        Parsed release.json dict, or None if not found
    """
    if not BOTO3_AVAILABLE:
        log_error("boto3 not installed")
        return None

    if env is None:
        env = EnvConfig()

    if not env.has_r2_config():
        log_error("R2 configuration not set")
        return None

    client = get_r2_client(env)
    if not client:
        return None

    r2_key = f"releases/{version}/{platform}/release.json"

    try:
        response = client.get_object(Bucket=env.r2_bucket, Key=r2_key)
        content = response["Body"].read().decode("utf-8")
        return json.loads(content)
    except client.exceptions.NoSuchKey:
        log_warning(f"release.json not found: {r2_key}")
        return None
    except Exception as e:
        log_error(f"Failed to fetch release.json: {e}")
        return None
