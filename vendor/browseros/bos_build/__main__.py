# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""
Allow running build package as module: python -m bos_build
"""
from .browseros import app

if __name__ == "__main__":
    app()
