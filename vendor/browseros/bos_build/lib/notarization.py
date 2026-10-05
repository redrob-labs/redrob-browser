# Copyright 2025 BrowserOS contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Shared client-side wait policy for Apple notarization submissions."""

NOTARYTOOL_WAIT_TIMEOUT = "2h"


def notarytool_wait_args() -> list[str]:
    """Return a fresh bounded-wait argument list for ``notarytool submit``.

    Apple continues processing after this client timeout. The bound exists to
    release the serialized Mac runner with a diagnosable failure when the
    external service stalls, rather than consuming the 20-hour job limit.
    """

    return ["--wait", "--timeout", NOTARYTOOL_WAIT_TIMEOUT]
