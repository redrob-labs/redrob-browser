# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Chromium source provisioning (checkout, sync, cache).

Makes "get me a Chromium tree at the pin" a first-class operation so
remote/ephemeral runners need nothing outside this package.
"""

from .provision import SourceCheckoutModule, SourceSyncModule

__all__ = ["SourceCheckoutModule", "SourceSyncModule"]
