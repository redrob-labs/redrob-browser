#!/usr/bin/env python3
"""List module - Display release artifacts from R2"""

from ...common.context import Context
from ...common.module import CommandModule, ValidationError
from ...common.utils import log_info
from ..upload import BOTO3_AVAILABLE
from .common import (
    PLATFORMS,
    PLATFORM_DISPLAY_NAMES,
    fetch_all_release_metadata,
    format_size,
)


class ListModule(CommandModule):
    """List release artifacts from R2 for a version"""

    produces = []
    requires = []
    description = "List release artifacts from R2"

    def validate(self, ctx: Context) -> None:
        if not BOTO3_AVAILABLE:
            raise ValidationError(
                "boto3 library not installed - run: pip install boto3"
            )

        if not ctx.env.has_r2_config():
            raise ValidationError("R2 configuration not set")

        if not ctx.release_version:
            raise ValidationError("--version is required")

    def execute(self, ctx: Context) -> None:
        version = ctx.release_version
        metadata = fetch_all_release_metadata(version, ctx.env)

        if not metadata:
            log_info(f"No release metadata found for version {version}")
            return

        log_info(f"\n{'='*60}")
        log_info(f"Release: v{version}")
        log_info(f"{'='*60}")

        download_urls: dict[str, list[str]] = {}

        for platform in PLATFORMS:
            if platform not in metadata:
                continue

            release = metadata[platform]
            log_info(f"\n{PLATFORM_DISPLAY_NAMES[platform]}:")
            log_info(f"  Build Date: {release.get('build_date', 'N/A')}")
            log_info(f"  Chromium: {release.get('chromium_version', 'N/A')}")

            if platform == "macos" and "sparkle_version" in release:
                log_info(f"  Sparkle Version: {release['sparkle_version']}")

            platform_urls = []
            for key, artifact in release.get("artifacts", {}).items():
                size = format_size(artifact.get("size", 0))
                sig_indicator = " [signed]" if "sparkle_signature" in artifact else ""
                log_info(f"  - {key}: {artifact['filename']} ({size}){sig_indicator}")
                if "url" in artifact:
                    platform_urls.append(artifact["url"])

            if platform_urls:
                download_urls[platform] = platform_urls

        log_info(f"\n{'='*60}")
        log_info("Downloads:")
        log_info(f"{'='*60}")

        for platform in PLATFORMS:
            if platform not in download_urls:
                continue
            log_info(f"\n{PLATFORM_DISPLAY_NAMES[platform]}:")
            for url in download_urls[platform]:
                log_info(f"  {url}")

        log_info(f"\n{'='*60}")
