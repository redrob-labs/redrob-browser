#!/usr/bin/env python3
# Copyright 2025 BrowserOS contributors
# Copyright 2026 Janghoon Lee (Redrob) and contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
# See the NOTICE file at the repository root for provenance.
"""Tests for Windows signing: path discovery and the Artifact Signing invocation."""

import json
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest import mock

from bos_build.core.context import Context
from bos_build.core.products import get_product_descriptor
from bos_build.lib.env import EnvConfig
from . import windows as windows_module
from .windows import (
    DEFAULT_EXPECTED_SIGNER_SUBJECT,
    EXCLUDED_CREDENTIALS,
    WindowsSignModule,
    check_signing_environment,
    get_browseros_server_binary_paths,
    get_existing_browseros_server_binary_paths,
    get_missing_required_browseros_server_binary_paths,
    sign_with_artifact_signing,
    write_artifact_signing_metadata,
)


class WindowsSignPathsTest(unittest.TestCase):
    def test_browseros_and_claw_server_binaries_are_expected_for_signing(self):
        build_output_dir = Path("/tmp/out/Default")

        self.assertEqual(
            get_browseros_server_binary_paths(build_output_dir),
            [
                build_output_dir
                / "BrowserOSServer"
                / "default"
                / "resources"
                / "bin"
                / "browseros_server.exe",
                build_output_dir
                / "BrowserClawServer"
                / "default"
                / "resources"
                / "bin"
                / "browseros-claw-server.exe",
            ],
        )

    def test_missing_optional_claw_binary_is_not_required_before_packaging(self):
        with TemporaryDirectory() as tmp:
            build_output_dir = Path(tmp)
            self._write_binary(
                build_output_dir
                / "BrowserOSServer"
                / "default"
                / "resources"
                / "bin"
                / "browseros_server.exe"
            )

            self.assertEqual(
                get_existing_browseros_server_binary_paths(build_output_dir),
                [
                    build_output_dir
                    / "BrowserOSServer"
                    / "default"
                    / "resources"
                    / "bin"
                    / "browseros_server.exe"
                ],
            )
            self.assertEqual(
                get_missing_required_browseros_server_binary_paths(build_output_dir),
                [],
            )

    def test_missing_claw_binary_is_required_once_root_is_packaged(self):
        with TemporaryDirectory() as tmp:
            build_output_dir = Path(tmp)
            self._write_binary(
                build_output_dir
                / "BrowserOSServer"
                / "default"
                / "resources"
                / "bin"
                / "browseros_server.exe"
            )
            (
                build_output_dir / "BrowserClawServer" / "default" / "resources" / "bin"
            ).mkdir(parents=True)

            self.assertEqual(
                get_missing_required_browseros_server_binary_paths(build_output_dir),
                [
                    build_output_dir
                    / "BrowserClawServer"
                    / "default"
                    / "resources"
                    / "bin"
                    / "browseros-claw-server.exe"
                ],
            )

    def test_sign_executables_fails_when_required_server_binary_missing(self):
        with TemporaryDirectory() as tmp:
            build_output_dir = Path(tmp)
            self._write_binary(build_output_dir / "chrome.exe")

            with self.assertRaisesRegex(RuntimeError, "browseros_server.exe"):
                WindowsSignModule()._sign_executables(
                    build_output_dir, self._ctx("browseros")
                )

    def test_missing_chrome_is_fatal_for_each_product(self):
        for product_id in ("browseros", "browserclaw"):
            with self.subTest(product=product_id), TemporaryDirectory() as tmp:
                build_output_dir = Path(tmp)
                for binary in get_browseros_server_binary_paths(
                    build_output_dir, product_id
                ):
                    self._write_binary(binary)

                with mock.patch(
                    "bos_build.steps.sign.windows.sign_with_artifact_signing"
                ) as sign:
                    with self.assertRaisesRegex(
                        RuntimeError, "Missing primary browser executable:.*chrome.exe"
                    ):
                        WindowsSignModule()._sign_executables(
                            build_output_dir, self._ctx(product_id)
                        )

                sign.assert_not_called()

    def test_browserclaw_requires_claw_binary(self):
        with TemporaryDirectory() as tmp:
            build_output_dir = Path(tmp)
            self._write_binary(build_output_dir / "chrome.exe")

            with self.assertRaisesRegex(RuntimeError, "browseros-claw-server.exe"):
                WindowsSignModule()._sign_executables(
                    build_output_dir, self._ctx("browserclaw")
                )

    def _write_binary(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"binary")

    def _ctx(self, product: str):
        return cast(
            Context,
            SimpleNamespace(product=get_product_descriptor(product), env=mock.Mock()),
        )


def _env(**overrides):
    values = dict(
        artifact_signing_endpoint="https://krc.codesigning.azure.net",
        artifact_signing_account="redrob-signing",
        artifact_signing_cert_profile="redrob-public-trust",
    )
    values.update(overrides)
    return cast(EnvConfig, SimpleNamespace(**values))


def _result(stdout: str = "", stderr: str = "", returncode: int = 0):
    return SimpleNamespace(stdout=stdout, stderr=stderr, returncode=returncode)


def _valid_probe(subject: str = DEFAULT_EXPECTED_SIGNER_SUBJECT):
    return _result(stdout=f"Valid\n{subject}\n")


class ArtifactSigningMetadataTest(unittest.TestCase):
    def test_metadata_names_account_profile_and_excludes_interactive_credentials(self):
        with TemporaryDirectory() as tmp:
            path = write_artifact_signing_metadata(
                Path(tmp) / "metadata.json",
                _env(artifact_signing_endpoint="https://krc.codesigning.azure.net/"),
            )
            metadata = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(metadata["Endpoint"], "https://krc.codesigning.azure.net")
        self.assertEqual(metadata["CodeSigningAccountName"], "redrob-signing")
        self.assertEqual(metadata["CertificateProfileName"], "redrob-public-trust")
        self.assertEqual(
            metadata["ExcludeCredentials"],
            [
                "InteractiveBrowserCredential",
                "ManagedIdentityCredential",
                "SharedTokenCacheCredential",
                "VisualStudioCredential",
                "VisualStudioCodeCredential",
                "AzurePowerShellCredential",
                "AzureDeveloperCliCredential",
                "WorkloadIdentityCredential",
            ],
        )
        self.assertEqual(list(EXCLUDED_CREDENTIALS), metadata["ExcludeCredentials"])
        # No credential of any kind in the metadata: the login is ambient.
        self.assertEqual(
            set(metadata),
            {
                "Endpoint",
                "CodeSigningAccountName",
                "CertificateProfileName",
                "ExcludeCredentials",
            },
        )


class SignWithArtifactSigningTest(unittest.TestCase):
    """Drive the signer with fake signtool/powershell and inspect what it ran."""

    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.signtool = self.root / "kits" / "x64" / "signtool.exe"
        self.signtool.parent.mkdir(parents=True)
        self.signtool.write_bytes(b"signtool")
        self.dlib = self.root / "client" / "bin" / "x64" / "Azure.CodeSigning.Dlib.dll"
        self.dlib.parent.mkdir(parents=True)
        self.dlib.write_bytes(b"dlib")
        self.binary = self.root / "out dir" / "chrome.exe"
        self.binary.parent.mkdir()
        self.binary.write_bytes(b"binary")
        self.installer = self.root / "out dir" / "mini_installer.exe"
        self.installer.write_bytes(b"installer")

        self.env_patch = mock.patch.dict(
            windows_module.os.environ,
            {
                "SIGNTOOL": str(self.signtool),
                "ARTIFACT_SIGNING_DLIB": str(self.dlib),
            },
            clear=False,
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        for name in ("ARTIFACT_SIGNING_EXPECTED_SUBJECT", "WINDOWS_TIMESTAMP_URL"):
            windows_module.os.environ.pop(name, None)

        self.info_logs: list[str] = []
        self.error_logs: list[str] = []
        for name, sink in (
            ("log_info", self.info_logs),
            ("log_success", self.info_logs),
            ("log_warning", self.info_logs),
            ("log_error", self.error_logs),
        ):
            patcher = mock.patch.object(windows_module, name, side_effect=sink.append)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _run(self, binaries, side_effect):
        with mock.patch.object(
            windows_module.subprocess, "run", side_effect=side_effect
        ) as run:
            ok = sign_with_artifact_signing(binaries, _env())
        return ok, run.call_args_list

    def test_signs_every_binary_in_one_signtool_call_then_verifies_each(self):
        ok, calls = self._run(
            [self.binary, self.installer],
            [
                _result(stdout="Successfully signed\n"),
                _result(),  # signtool verify chrome.exe
                _valid_probe(),  # Get-AuthenticodeSignature chrome.exe
                _result(),  # signtool verify mini_installer.exe
                _valid_probe(),
            ],
        )

        self.assertTrue(ok)
        self.assertEqual(len(calls), 5)
        sign_cmd = calls[0].args[0]
        self.assertIsInstance(sign_cmd, list)
        self.assertEqual(calls[0].kwargs["shell"], False)
        self.assertEqual(sign_cmd[0], str(self.signtool))
        self.assertEqual(sign_cmd[1], "sign")
        self.assertEqual(sign_cmd[sign_cmd.index("/fd") + 1], "SHA256")
        self.assertEqual(sign_cmd[sign_cmd.index("/td") + 1], "SHA256")
        self.assertEqual(
            sign_cmd[sign_cmd.index("/tr") + 1], "http://timestamp.acs.microsoft.com"
        )
        self.assertNotIn("/t", sign_cmd)
        self.assertEqual(sign_cmd[sign_cmd.index("/dlib") + 1], str(self.dlib))
        metadata_path = Path(sign_cmd[sign_cmd.index("/dmdf") + 1])
        self.assertEqual(metadata_path.name, "metadata.json")
        self.assertEqual(sign_cmd[-2:], [str(self.binary), str(self.installer)])
        # No certificate file, password or client secret ever reaches signtool.
        for flag in ("/f", "/p", "/sha1", "/csp", "/kc"):
            self.assertNotIn(flag, sign_cmd)
        joined = " ".join(sign_cmd)
        self.assertNotIn("pfx", joined.lower())
        self.assertNotIn("AZURE_CLIENT_SECRET", joined)

        verify_cmd = calls[1].args[0]
        self.assertEqual(
            verify_cmd, [str(self.signtool), "verify", "/pa", "/v", str(self.binary)]
        )
        probe_cmd = calls[2].args[0]
        self.assertEqual(probe_cmd[0], "powershell")
        self.assertIn("Get-AuthenticodeSignature", probe_cmd[-1])
        self.assertIn(str(self.binary), probe_cmd[-1])
        self.assertEqual(calls[3].args[0][-1], str(self.installer))

        signed_lines = [line for line in self.info_logs if " signed by " in line]
        self.assertEqual(
            signed_lines,
            [
                f"{self.binary} signed by {DEFAULT_EXPECTED_SIGNER_SUBJECT}",
                f"{self.installer} signed by {DEFAULT_EXPECTED_SIGNER_SUBJECT}",
            ],
        )
        self.assertEqual(self.error_logs, [])
        # The metadata file is temporary and is gone once signing returns.
        self.assertFalse(metadata_path.exists())

    def test_nonzero_sign_returncode_fails_without_verifying(self):
        ok, calls = self._run([self.binary], [_result(returncode=3)])

        self.assertFalse(ok)
        self.assertEqual(len(calls), 1)
        self.assertTrue(
            any("signtool sign failed with exit code 3" in m for m in self.error_logs)
        )

    def test_signtool_verify_pa_failure_is_fatal(self):
        ok, calls = self._run(
            [self.binary],
            [
                _result(),
                _result(stderr="SignTool Error: A certificate chain processed, but terminated in a root certificate which is not trusted", returncode=1),
            ],
        )

        self.assertFalse(ok)
        self.assertEqual(len(calls), 2)
        self.assertTrue(any("verify /pa failed" in m for m in self.error_logs))

    def test_only_valid_authenticode_status_is_accepted(self):
        for status in ("NotTrusted", "UnknownError", "NotSigned", "HashMismatch"):
            with self.subTest(status=status):
                self.error_logs.clear()
                ok, _ = self._run(
                    [self.binary],
                    [
                        _result(),
                        _result(),
                        _result(stdout=f"{status}\n{DEFAULT_EXPECTED_SIGNER_SUBJECT}\n"),
                    ],
                )
                self.assertFalse(ok)
                self.assertTrue(
                    any(f"'{status}', not Valid" in m for m in self.error_logs),
                    self.error_logs,
                )

    def test_signature_from_another_subject_is_rejected(self):
        ok, _ = self._run(
            [self.binary],
            [
                _result(),
                _result(),
                _valid_probe("CN=Somebody Else, O=Elsewhere"),
            ],
        )

        self.assertFalse(ok)
        self.assertTrue(
            any(
                "signed by 'CN=Somebody Else, O=Elsewhere', expected "
                f"'{DEFAULT_EXPECTED_SIGNER_SUBJECT}'" in m
                for m in self.error_logs
            ),
            self.error_logs,
        )

    def test_expected_subject_override_is_honoured(self):
        with mock.patch.dict(
            windows_module.os.environ,
            {"ARTIFACT_SIGNING_EXPECTED_SUBJECT": "CN=Other Org"},
        ):
            ok, _ = self._run(
                [self.binary],
                [_result(), _result(), _valid_probe("CN=Other Org, C=KR")],
            )

        self.assertTrue(ok)

    def test_missing_configuration_fails_before_running_anything(self):
        for missing in (
            "artifact_signing_endpoint",
            "artifact_signing_account",
            "artifact_signing_cert_profile",
        ):
            with self.subTest(missing=missing):
                self.error_logs.clear()
                with mock.patch.object(windows_module.subprocess, "run") as run:
                    ok = sign_with_artifact_signing(
                        [self.binary], _env(**{missing: None})
                    )
                self.assertFalse(ok)
                run.assert_not_called()
                self.assertTrue(
                    any(missing.upper() in m for m in self.error_logs), self.error_logs
                )

    def test_missing_signtool_fails_before_running_anything(self):
        with (
            mock.patch.dict(windows_module.os.environ, {"SIGNTOOL": str(self.root / "nope.exe")}),
            mock.patch.object(windows_module.subprocess, "run") as run,
        ):
            ok = sign_with_artifact_signing([self.binary], _env())

        self.assertFalse(ok)
        run.assert_not_called()
        self.assertTrue(any("signtool.exe not found" in m for m in self.error_logs))

    def test_timestamp_url_override(self):
        with mock.patch.dict(
            windows_module.os.environ, {"WINDOWS_TIMESTAMP_URL": "http://ts.example"}
        ):
            ok, calls = self._run([self.binary], [_result(), _result(), _valid_probe()])

        self.assertTrue(ok)
        sign_cmd = calls[0].args[0]
        self.assertEqual(sign_cmd[sign_cmd.index("/tr") + 1], "http://ts.example")


class SigningEnvironmentTest(unittest.TestCase):
    def test_suspicious_env_values_warn_in_environment_check(self):
        env = _env(
            artifact_signing_endpoint=" https://krc.codesigning.azure.net",
            artifact_signing_account="'redrob-signing'",
            artifact_signing_cert_profile='"redrob-public-trust"',
        )

        with mock.patch.object(windows_module, "log_warning") as log_warning:
            self.assertTrue(check_signing_environment(env))

        messages = [call.args[0] for call in log_warning.call_args_list]
        self.assertIn(
            "ARTIFACT_SIGNING_ENDPOINT has leading or trailing whitespace", messages
        )
        self.assertIn(
            "ARTIFACT_SIGNING_ACCOUNT appears to include wrapping quote characters",
            messages,
        )
        self.assertIn(
            "ARTIFACT_SIGNING_CERT_PROFILE appears to include wrapping quote characters",
            messages,
        )

    def test_environment_check_names_every_missing_variable(self):
        env = _env(artifact_signing_account="", artifact_signing_cert_profile=None)

        with mock.patch.object(windows_module, "log_error") as log_error:
            self.assertFalse(check_signing_environment(env))

        messages = [call.args[0] for call in log_error.call_args_list]
        self.assertEqual(
            messages,
            [
                "Missing environment variables: ARTIFACT_SIGNING_ACCOUNT, "
                "ARTIFACT_SIGNING_CERT_PROFILE"
            ],
        )

    def test_suspicious_env_values_warn_in_validate(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            build_output_dir = root / "out" / "Default"
            build_output_dir.mkdir(parents=True)
            env = _env(
                artifact_signing_endpoint="https://krc.codesigning.azure.net ",
                artifact_signing_account='"redrob-signing"',
                artifact_signing_cert_profile=" redrob-public-trust",
            )
            ctx = SimpleNamespace(chromium_src=root, out_dir="out/Default", env=env)

            with (
                mock.patch.object(windows_module, "IS_WINDOWS", return_value=True),
                mock.patch.object(windows_module, "log_warning") as log_warning,
            ):
                WindowsSignModule().validate(cast(Context, ctx))

        messages = [call.args[0] for call in log_warning.call_args_list]
        self.assertIn(
            "ARTIFACT_SIGNING_ENDPOINT has leading or trailing whitespace", messages
        )
        self.assertIn(
            "ARTIFACT_SIGNING_ACCOUNT appears to include wrapping quote characters",
            messages,
        )
        self.assertIn(
            "ARTIFACT_SIGNING_CERT_PROFILE has leading or trailing whitespace", messages
        )

    def test_validate_refuses_missing_configuration(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "out" / "Default").mkdir(parents=True)
            ctx = SimpleNamespace(
                chromium_src=root,
                out_dir="out/Default",
                env=_env(artifact_signing_cert_profile=None),
            )
            with (
                mock.patch.object(windows_module, "IS_WINDOWS", return_value=True),
                self.assertRaisesRegex(
                    windows_module.ValidationError, "ARTIFACT_SIGNING_CERT_PROFILE"
                ),
            ):
                WindowsSignModule().validate(cast(Context, ctx))


if __name__ == "__main__":
    unittest.main()
