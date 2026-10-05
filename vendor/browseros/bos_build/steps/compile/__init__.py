#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""
Compilation modules for BrowserOS build system

This package contains different build strategies:
- standard: Single-architecture compilation
- universal: Merge per-arch builds into a macOS universal app
"""

from .standard import CompileModule, build_target
from .universal import MergeUniversalModule

__all__ = [
    'CompileModule',
    'MergeUniversalModule',
    'build_target',
]
