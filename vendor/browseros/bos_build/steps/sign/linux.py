#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Linux signing module for BrowserOS"""

from ...core.step import Step, step
from ...core.context import Context
from ...lib.utils import log_info


@step("sign_linux", phase="sign", platforms=("linux",))
class LinuxSignModule(Step):
    produces = []
    requires = []
    description = "Linux code signing (no-op)"

    def validate(self, ctx: Context) -> None:
        pass

    def execute(self, ctx: Context) -> None:
        log_info("Code signing is not required for Linux packages")


def check_signing_environment() -> bool:
    """Linux doesn't require signing environment"""
    return True
