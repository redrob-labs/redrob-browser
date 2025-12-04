#!/usr/bin/env python3
"""Release modules package - Modular release automation for BrowserOS"""

from .common import (
    PLATFORMS,
    PLATFORM_DISPLAY_NAMES,
    fetch_all_release_metadata,
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

AVAILABLE_MODULES = {
    "list": ListModule,
    "appcast": AppcastModule,
    "github": GithubModule,
    "publish": PublishModule,
}

__all__ = [
    "PLATFORMS",
    "PLATFORM_DISPLAY_NAMES",
    "fetch_all_release_metadata",
    "format_size",
    "generate_appcast_item",
    "generate_release_notes",
    "get_repo_from_git",
    "check_gh_cli",
    "ListModule",
    "AppcastModule",
    "GithubModule",
    "PublishModule",
    "AVAILABLE_MODULES",
]
