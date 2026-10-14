#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# Copyright 2026 Janghoon Lee (Redrob) and contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Tests for OTA binary signing."""

import tempfile
import subprocess
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest import mock

from ...lib.env import EnvConfig
from ...products.browserclaw.product import BROWSERCLAW_SERVER_BUNDLE
from ...products.browseros.product import BROWSEROS_SERVER_BUNDLE
from ...steps.sign import windows as windows_signing
from . import sign_binary


def _write_exe(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"exe")


class SignServerBundleWindowsTest(unittest.TestCase):
    def _assert_signs_bundle_binary(self, bundle, binary_name):
        with tempfile.TemporaryDirectory() as tmp:
            resources = Path(tmp) / "resources"
            _write_exe(resources / "bin" / binary_name)

            signed = []

            def fake_sign(path, env):
                signed.append(path.relative_to(resources / "bin").as_posix())
                return True

            with mock.patch.object(
                sign_binary, "sign_windows_binary", side_effect=fake_sign
            ):
                self.assertTrue(
                    sign_binary.sign_server_bundle_windows(
                        resources, EnvConfig(), bundle
                    )
                )

            self.assertEqual(signed, [binary_name])

    def test_signs_browseros_descriptor_binary(self):
        self._assert_signs_bundle_binary(
            BROWSEROS_SERVER_BUNDLE, "browseros_server.exe"
        )

    def test_signs_browserclaw_descriptor_binary(self):
        self._assert_signs_bundle_binary(
            BROWSERCLAW_SERVER_BUNDLE, "browseros-claw-server.exe"
        )

    def test_fails_when_browserclaw_descriptor_binary_is_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            resources = Path(tmp) / "resources"
            _write_exe(resources / "bin" / "browseros_server.exe")

            with mock.patch.object(sign_binary, "sign_windows_binary") as signer:
                self.assertFalse(
                    sign_binary.sign_server_bundle_windows(
                        resources, EnvConfig(), BROWSERCLAW_SERVER_BUNDLE
                    )
                )

            signer.assert_not_called()

    def test_preflights_all_descriptor_binaries_before_signing(self):
        bundle = replace(
            BROWSERCLAW_SERVER_BUNDLE,
            windows_binaries=("browseros-claw-server.exe", "missing.exe"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            resources = Path(tmp) / "resources"
            _write_exe(resources / "bin" / "browseros-claw-server.exe")

            with mock.patch.object(
                sign_binary, "sign_windows_binary", return_value=True
            ) as signer:
                self.assertFalse(
                    sign_binary.sign_server_bundle_windows(
                        resources, EnvConfig(), bundle
                    )
                )

            signer.assert_not_called()


class SignWindowsBinaryTest(unittest.TestCase):
    """Exercise OTA through the real Artifact Signing path with fake subprocesses."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        self.signtool = root / "kits" / "x64" / "signtool.exe"
        self.dlib = root / "client" / "x64" / "Azure.CodeSigning.Dlib.dll"
        self.resources = root / "staged resources"
        self.binary = self.resources / "bin" / "browseros_server.exe"
        for path in (self.signtool, self.dlib, self.binary):
            _write_exe(path)
        self.env = cast(
            EnvConfig,
            SimpleNamespace(
                artifact_signing_endpoint="https://krc.codesigning.azure.net",
                artifact_signing_account="redrob-signing",
                artifact_signing_cert_profile="redrob-public-trust",
            ),
        )
        env_patch = mock.patch.dict(
            windows_signing.os.environ,
            {"SIGNTOOL": str(self.signtool), "ARTIFACT_SIGNING_DLIB": str(self.dlib)},
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)
        windows_signing.os.environ.pop("ARTIFACT_SIGNING_EXPECTED_SUBJECT", None)
        self.logs = []
        for module in (sign_binary, windows_signing):
            for name in ("log_info", "log_error", "log_success"):
                patcher = mock.patch.object(module, name, side_effect=self.logs.append)
                patcher.start()
                self.addCleanup(patcher.stop)

    def test_bundle_signing_signs_in_place_and_verifies_the_signer(self):
        subject = windows_signing.DEFAULT_EXPECTED_SIGNER_SUBJECT
        with mock.patch.object(
            subprocess,
            "run",
            side_effect=[
                subprocess.CompletedProcess([], 0, "Successfully signed", ""),
                subprocess.CompletedProcess([], 0, "", ""),
                subprocess.CompletedProcess([], 0, f"Valid\n{subject}\n", ""),
            ],
        ) as run:
            self.assertTrue(
                sign_binary.sign_server_bundle_windows(
                    self.resources, self.env, BROWSEROS_SERVER_BUNDLE
                )
            )

        command = run.call_args_list[0].args[0]
        self.assertIsInstance(command, list)
        self.assertEqual(command[:2], [str(self.signtool), "sign"])
        self.assertFalse(run.call_args_list[0].kwargs["shell"])
        self.assertEqual(command[command.index("/dlib") + 1], str(self.dlib))
        self.assertEqual(command[-1], str(self.binary))
        self.assertEqual(
            run.call_args_list[1].args[0],
            [str(self.signtool), "verify", "/pa", "/v", str(self.binary)],
        )
        self.assertEqual(run.call_count, 3)
        self.assertIn(f"{self.binary} signed by {subject}", self.logs)

    def test_signer_errors_stop_before_verification(self):
        with mock.patch.object(
            subprocess,
            "run",
            return_value=subprocess.CompletedProcess(
                [], 3, "", "SignTool Error: An unexpected internal error has occurred"
            ),
        ) as run:
            self.assertFalse(sign_binary.sign_windows_binary(self.binary, self.env))

        run.assert_called_once()
        logged = "\n".join(self.logs)
        self.assertIn("SignTool Error: An unexpected internal error has occurred", logged)
        self.assertIn("signtool sign failed with exit code 3", logged)

    def test_windows_verification_exception_prevents_release(self):
        with mock.patch.object(
            subprocess,
            "run",
            side_effect=[
                subprocess.CompletedProcess([], 0, "Successfully signed", ""),
                subprocess.CompletedProcess([], 0, "", ""),
                FileNotFoundError("powershell"),
            ],
        ):
            self.assertFalse(sign_binary.sign_windows_binary(self.binary, self.env))

    def test_untrusted_or_foreign_signature_prevents_release(self):
        for status, subject in (
            ("NotTrusted", windows_signing.DEFAULT_EXPECTED_SIGNER_SUBJECT),
            ("UnknownError", windows_signing.DEFAULT_EXPECTED_SIGNER_SUBJECT),
            ("Valid", "CN=Not Us"),
        ):
            with self.subTest(status=status, subject=subject):
                with mock.patch.object(
                    subprocess,
                    "run",
                    side_effect=[
                        subprocess.CompletedProcess([], 0, "Successfully signed", ""),
                        subprocess.CompletedProcess([], 0, "", ""),
                        subprocess.CompletedProcess([], 0, f"{status}\n{subject}\n", ""),
                    ],
                ):
                    self.assertFalse(
                        sign_binary.sign_windows_binary(self.binary, self.env)
                    )


if __name__ == "__main__":
    unittest.main()
