// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_REDROB_PREFS_H_
#define CHROME_BROWSER_REDROB_REDROB_PREFS_H_

namespace user_prefs {
class PrefRegistrySyncable;
}  // namespace user_prefs

namespace redrob::prefs {

// Everything the agent remembers between runs lives here, in ONE place, because the alternative --
// each feature registering its own prefs from its own file -- is how a browser ends up unable to
// answer "what does this thing keep about me". A settings screen that claims to show all of it has to
// be able to enumerate all of it.
//
// None of these are syncable. Agent state describes one machine's browsing and one machine's folders,
// and a routine that opens tabs would be a surprising thing to have arrive from another device.

// Absolute path of the folder agent tasks may write into, as chosen through the browser's own folder
// picker. Empty until the user picks one, and a task with no folder refuses to write rather than
// inventing a destination.
inline constexpr char kWorkingFolder[] = "redrob.working_folder";

// Routines: a list of dicts, each {id, title, prompt, mode, effort, kind, schedule fields..., enabled,
// last_run_ms, next_run_ms, task_id}. See routine_store.h for the field contract.
inline constexpr char kRoutines[] = "redrob.routines";

// Memory. Entries are a list of dicts {id, text, source, created_ms, pinned}. Retention is in days;
// 0 means keep indefinitely, and the sweep runs on startup and daily after that.
inline constexpr char kMemoryEnabled[] = "redrob.memory.enabled";
inline constexpr char kMemoryEntries[] = "redrob.memory.entries";
inline constexpr char kMemoryRetentionDays[] = "redrob.memory.retention_days";

// Model providers: a list of dicts {id, kind, label, model, endpoint, secret_b64}. `secret_b64` is
// OSCrypt-encrypted bytes, base64'd for prefs -- never a plaintext key, and never sent to a renderer.
inline constexpr char kModelProviders[] = "redrob.model.providers";
// Which provider entry answers tasks. Empty means the built-in Redrob engine.
inline constexpr char kSelectedProviderId[] = "redrob.model.selected_provider_id";

// What the user chose about passwords during onboarding: "redrob" (use this browser's manager),
// "external" (they keep another one, so stop offering to save), or "skip".
inline constexpr char kPasswordManagerChoice[] = "redrob.passwords.choice";

// The loopback RPC endpoint that serves the CLI, the MCP server and the REPL. Off by default:
// a local socket that can drive the browser is, to any other local process, the browser.
inline constexpr char kRpcEnabled[] = "redrob.rpc.enabled";

// Set once the import step has run, so a second first-run does not re-offer it. Records what was
// imported, honestly: a source that could not bring cookies says so rather than being listed.
inline constexpr char kImportCompleted[] = "redrob.import.completed";

void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry);

}  // namespace redrob::prefs

#endif  // CHROME_BROWSER_REDROB_REDROB_PREFS_H_
