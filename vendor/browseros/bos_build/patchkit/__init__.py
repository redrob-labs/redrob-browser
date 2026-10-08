# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Python patch surface: dev extract + pipeline batch-apply + .features.yaml IO.

Interactive patch workflows (apply/sync/conflicts) live in the Rust tool
(tools/bpatch, `bpatch`); the build pipeline must never depend on it, so
non-interactive batch apply stays here in Python by design.
"""
