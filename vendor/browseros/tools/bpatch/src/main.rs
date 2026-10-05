// Copyright 2025 BrowserOS contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Ported from BrowserOS (https://github.com/browseros-ai/BrowserOS).
// See the NOTICE file at the repository root for provenance.
use clap::Parser;

fn main() {
    let cli = bpatch::cli::Cli::parse_from(bpatch::cli::normalize_args(std::env::args_os()));
    std::process::exit(bpatch::cli::run(cli));
}
