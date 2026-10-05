# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Deep interface for producing and recovering Linux release packages.

Callers see one required AppImage/DEB pair. Payload assembly, format policy,
external tools, verification, rollback, and sliced-run recovery stay hidden.
"""

from .pipeline import (
    LinuxArtifactPair,
    LinuxPackagingError,
    build_linux_artifacts,
    require_linux_artifacts,
)

__all__ = [
    "LinuxArtifactPair",
    "LinuxPackagingError",
    "build_linux_artifacts",
    "require_linux_artifacts",
]
