#!/usr/bin/env python3
"""Sparkle signing module for macOS auto-update"""

import base64
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple

from ...common.module import CommandModule, ValidationError
from ...common.context import Context
from ...common.utils import (
    log_info,
    log_error,
    log_success,
    log_warning,
    IS_MACOS,
    join_paths,
)


class SparkleSignModule(CommandModule):
    """Sign DMGs with Sparkle for macOS auto-update"""

    produces = ["sparkle_signatures"]
    requires = []
    description = "Sign DMG files with Sparkle Ed25519 key for auto-update"

    def validate(self, ctx: Context) -> None:
        if not IS_MACOS():
            raise ValidationError("Sparkle signing is macOS only")

        # Check sign_update tool exists
        sign_update = self._get_sign_update_path(ctx)
        if not sign_update.exists():
            raise ValidationError(f"sign_update not found: {sign_update}")

        # Check Sparkle private key is available
        if not ctx.env.has_sparkle_key():
            raise ValidationError(
                "SPARKLE_PRIVATE_KEY environment variable not set"
            )

    def _get_sign_update_path(self, ctx: Context) -> Path:
        """Get path to Sparkle sign_update tool"""
        return join_paths(ctx.chromium_src, "third_party", "sparkle", "bin", "sign_update")

    def execute(self, ctx: Context) -> None:
        log_info("\n🔐 Signing DMGs with Sparkle...")

        # Find DMG files in dist directory
        dist_dir = ctx.get_dist_dir()
        if not dist_dir.exists():
            log_warning(f"Dist directory not found: {dist_dir}")
            return

        dmg_files = list(dist_dir.glob("*.dmg"))
        if not dmg_files:
            log_warning("No DMG files found to sign")
            return

        # Sign each DMG and collect signatures
        signatures = sign_dmgs_with_sparkle(ctx, dmg_files)

        # Store signatures in artifact registry for upload module
        for filename, (sig, length) in signatures.items():
            ctx.artifact_registry.add(f"sparkle_sig_{filename}", Path(filename))
            log_info(f"  {filename}: sig={sig[:20]}... length={length}")

        # Store signatures for upload module to access via ctx.artifacts
        ctx.artifacts["sparkle_signatures"] = signatures

        log_success(f"✅ Signed {len(signatures)} DMG(s) with Sparkle")


def sign_dmgs_with_sparkle(
    ctx: Context,
    dmg_files: list,
) -> Dict[str, Tuple[str, int]]:
    """Sign DMG files with Sparkle and return signatures

    Args:
        ctx: Build context
        dmg_files: List of DMG file paths to sign

    Returns:
        Dict mapping filename to (signature, length) tuple
    """
    env = ctx.env
    sign_update = join_paths(ctx.chromium_src, "third_party", "sparkle", "bin", "sign_update")

    if not sign_update.exists():
        log_error(f"sign_update not found: {sign_update}")
        return {}

    if not env.has_sparkle_key():
        log_error("SPARKLE_PRIVATE_KEY not set")
        return {}

    signatures = {}

    # Write private key to temp file
    key_file = None
    try:
        # Decode base64 key if it looks encoded, otherwise use as-is
        key_data = env.sparkle_private_key
        try:
            # Try to decode as base64
            decoded = base64.b64decode(key_data)
            key_data = decoded.decode("utf-8")
        except Exception:
            # Not base64, use as-is
            pass

        # Write key to temp file
        key_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".key", delete=False
        )
        key_file.write(key_data)
        key_file.close()

        # Sign each DMG
        for dmg_path in dmg_files:
            sig, length = _sign_single_dmg(sign_update, key_file.name, dmg_path)
            if sig:
                signatures[dmg_path.name] = (sig, length)

    finally:
        # Clean up temp key file
        if key_file and os.path.exists(key_file.name):
            os.unlink(key_file.name)

    return signatures


def _sign_single_dmg(
    sign_update: Path,
    key_file: str,
    dmg_path: Path,
) -> Tuple[Optional[str], int]:
    """Sign a single DMG and parse the output

    Args:
        sign_update: Path to sign_update binary
        key_file: Path to temporary key file
        dmg_path: Path to DMG file

    Returns:
        (signature, length) tuple, or (None, 0) on failure
    """
    log_info(f"🔐 Signing {dmg_path.name}...")

    try:
        result = subprocess.run(
            [str(sign_update), "--ed-key-file", key_file, str(dmg_path)],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode != 0:
            log_error(f"sign_update failed: {result.stderr}")
            return None, 0

        # Parse output: sparkle:edSignature="..." length="..."
        output = result.stdout.strip()
        sig, length = parse_sparkle_output(output)

        if sig:
            log_success(f"✓ Signed {dmg_path.name}")
            return sig, length
        else:
            log_error(f"Failed to parse sign_update output: {output}")
            return None, 0

    except Exception as e:
        log_error(f"Error signing {dmg_path.name}: {e}")
        return None, 0


def parse_sparkle_output(output: str) -> Tuple[Optional[str], int]:
    """Parse sign_update output to extract signature and length

    Example output:
        sparkle:edSignature="abc123..." length="126911210"

    Args:
        output: Raw output from sign_update

    Returns:
        (signature, length) tuple, or (None, 0) if parsing fails
    """
    # Match: sparkle:edSignature="..." length="..."
    sig_match = re.search(r'sparkle:edSignature="([^"]+)"', output)
    len_match = re.search(r'length="(\d+)"', output)

    if sig_match and len_match:
        return sig_match.group(1), int(len_match.group(1))

    return None, 0


def get_sparkle_signatures(ctx: Context) -> Dict[str, Tuple[str, int]]:
    """Get stored Sparkle signatures from context

    Args:
        ctx: Build context

    Returns:
        Dict mapping filename to (signature, length) tuple
    """
    return ctx.artifacts.get("sparkle_signatures", {})
