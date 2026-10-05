#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""OTA (Over-The-Air) update modules for BrowserOS Server and Browser"""

from .common import (
    sparkle_sign_file,
    generate_server_appcast,
    parse_existing_appcast,
    ExistingAppcast,
    SignedArtifact,
    SERVER_PLATFORMS,
    find_server_resources_dir,
    create_server_bundle_zip,
)
from .sign_binary import (
    sign_macos_binary,
    notarize_macos_binary,
    notarize_macos_zip,
    sign_windows_binary,
    sign_server_bundle_macos,
    sign_server_bundle_windows,
)
from .server import ServerOTAModule

AVAILABLE_MODULES = {
    "server_ota": ServerOTAModule,
}

__all__ = [
    "AVAILABLE_MODULES",
    "ServerOTAModule",
    "sparkle_sign_file",
    "generate_server_appcast",
    "parse_existing_appcast",
    "ExistingAppcast",
    "SignedArtifact",
    "find_server_resources_dir",
    "create_server_bundle_zip",
    "sign_macos_binary",
    "notarize_macos_binary",
    "notarize_macos_zip",
    "sign_windows_binary",
    "sign_server_bundle_macos",
    "sign_server_bundle_windows",
    "SERVER_PLATFORMS",
]
