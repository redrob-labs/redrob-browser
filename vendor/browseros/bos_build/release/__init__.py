#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Release modules package - Modular release automation for BrowserOS"""

from .common import (
    PLATFORMS,
    PLATFORM_DISPLAY_NAMES,
    fetch_all_release_metadata,
    list_all_versions,
    list_legacy_versions,
    format_size,
    generate_appcast_item,
    generate_release_notes,
    get_repo_from_git,
    check_gh_cli,
)
from .list import ListModule
from .appcast import AppcastModule
from .github import GithubModule
from .publish import PublishModule
from .download import DownloadModule

AVAILABLE_MODULES = {
    "list": ListModule,
    "appcast": AppcastModule,
    "github": GithubModule,
    "publish": PublishModule,
    "download": DownloadModule,
}

__all__ = [
    "PLATFORMS",
    "PLATFORM_DISPLAY_NAMES",
    "fetch_all_release_metadata",
    "list_all_versions",
    "list_legacy_versions",
    "format_size",
    "generate_appcast_item",
    "generate_release_notes",
    "get_repo_from_git",
    "check_gh_cli",
    "ListModule",
    "AppcastModule",
    "GithubModule",
    "PublishModule",
    "DownloadModule",
    "AVAILABLE_MODULES",
]
