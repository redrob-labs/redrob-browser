#!/bin/bash
# @license
# Copyright 2025 BrowserOS
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file for provenance.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/run.sh" setup "$@"
