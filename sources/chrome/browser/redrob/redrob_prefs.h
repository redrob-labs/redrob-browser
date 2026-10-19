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

// Memory. The memory itself is files under <profile>/Redrob/memory (memory_store.h); these are its
// settings and its run log. Retention is in days for episodic files; 0 means keep indefinitely, and the
// sweep runs on startup and daily after that.
inline constexpr char kMemoryEnabled[] = "redrob.memory.enabled";
// The pre-files store, a list of dicts {id, text, source, created_ms, pinned}. Read once by the
// migration into files and then emptied; kept registered so that read has something to read.
inline constexpr char kMemoryEntries[] = "redrob.memory.entries";
inline constexpr char kMemoryRetentionDays[] = "redrob.memory.retention_days";
// True once kMemoryEntries has been moved into files.
inline constexpr char kMemoryMigrated[] = "redrob.memory.migrated";
// Memory runs, oldest first, at most 30: dicts {id, kind, started_ms, duration_ms, tokens, finished,
// has_snapshot, files: [{path, added, removed}]}. Each row's id names its snapshot directory.
inline constexpr char kMemoryRuns[] = "redrob.memory.runs";
// When the last consolidation run started, unix ms. 0 = never.
inline constexpr char kMemoryLastConsolidationMs[] = "redrob.memory.last_consolidation_ms";
// Whether extraction is shown the titles and URLs the agent's tab visited during the task. Off.
inline constexpr char kMemoryHistoryInput[] = "redrob.memory.history_input";

// Model providers: a list of dicts {id, kind, label, model, endpoint, secret_b64}. `secret_b64` is
// OSCrypt-encrypted bytes, base64'd for prefs -- never a plaintext key, and never sent to a renderer.
inline constexpr char kModelProviders[] = "redrob.model.providers";
// Which provider entry answers tasks. Empty means the built-in Redrob engine.
inline constexpr char kSelectedProviderId[] = "redrob.model.selected_provider_id";

// What the user chose on the onboarding subscription screen: "redrob" (the built-in plan), "chatgpt"
// or "claude" (reuse a subscription they already pay for). A FAMILY, not a model id and not a provider
// id -- which is why it is a separate pref from kSelectedProviderId above rather than being folded
// into it.
//
// It was previously declared as a local constant in two different .cc files and registered NOWHERE, so
// Chromium's pref system dropped every write: the user picked a plan during first run and the choice
// went nowhere at all. Registering it here, in the one place that can answer "what does this thing
// keep about me", is the fix.
//
// Recording the choice is NOT the same as honouring it. Making "claude" actually route a task needs a
// configured provider to point kSelectedProviderId at, and which provider that is depends on what the
// user has signed in to. That is the subscription-delegation work; this pref is its input, and
// pretending otherwise by guessing a provider id here would route tasks somewhere the user never
// chose.
inline constexpr char kOnboardingModelChoice[] = "redrob.onboarding.model_choice";

// What the user chose about passwords during onboarding: "redrob" (use this browser's manager),
// "external" (they keep another one, so stop offering to save), or "skip".
inline constexpr char kPasswordManagerChoice[] = "redrob.passwords.choice";

// The loopback RPC endpoint that serves the CLI, the MCP server and the REPL. Off by default:
// a local socket that can drive the browser is, to any other local process, the browser.
inline constexpr char kRpcEnabled[] = "redrob.rpc.enabled";

// Set once the import step has run, so a second first-run does not re-offer it. Records what was
// imported, honestly: a source that could not bring cookies says so rather than being listed.
inline constexpr char kImportCompleted[] = "redrob.import.completed";

// Browser behaviour the user chose, as opposed to agent state. These four sit in this file for the
// same reason as everything above -- one place that can be enumerated -- but they describe windows
// and tabs, not what the agent remembers.
//
// Each default below is TODAY'S BEHAVIOUR, deliberately. Nothing reads these prefs yet; the window
// and tab code that will read them lands as its own item. A default that differed from current
// behaviour would therefore change nothing now and silently change everything the day the first
// reader arrives, which is the one outcome a stored-only pref must not have.

// Where a newly opened tab goes in the vertical tab rail. "after_current" puts it directly below the
// tab that opened it; "end" appends to the bottom of the rail. An unrecognised value is treated as
// "after_current" by the setter rather than stored.
inline constexpr char kVerticalTabInsertionPosition[] =
    "redrob.tabs.vertical_insertion_position";

// Whether horizontal tabs keep shrinking as they multiply (true) or hold a minimum width and let the
// strip scroll (false). True matches Chromium's own strip, which shrinks to a floor.
inline constexpr char kHorizontalTabShrinkEnabled[] =
    "redrob.tabs.horizontal_shrink_enabled";

// Whether the window paints a translucent background behind its chrome. Off by default: it costs
// compositing work on every frame and can cost text contrast, so it is a thing a user turns on.
inline constexpr char kWindowTranslucencyEnabled[] =
    "redrob.window.translucency_enabled";

// Whether a video entering the background may open picture-in-picture on its own. Off by default
// because the effect is a window appearing that the user did not ask for.
inline constexpr char kAutomaticPictureInPictureEnabled[] =
    "redrob.picture_in_picture.automatic";

// CAP-4. Whether an agent task keeps the browser running after its last window closes. On by default:
// a task that stops because a window closed is a chat, not an agent. While any task is queued, running
// or waiting for the user, TaskStore holds a process and a profile keep-alive; with this off it holds
// neither and closing the last window ends the task with the browser, which was the old behaviour.
inline constexpr char kKeepTasksRunning[] = "redrob.tasks.keep_running_after_close";

// --- Agent sign-in (CAP-9). See credential_tools.h and docs/CREDENTIALS.md. ---
//
// None of these hold a secret. The passwords stay in the profile's own password store; these say when the
// agent may ask that store to fill, and record that it did.

// CredentialTools::Policy as an integer: 0 always, 1 while unlocked (the default), 2 never.
inline constexpr char kAgentCredentialsPolicy[] = "redrob.agent_credentials.policy";
// How long one OS re-authentication keeps the agent's sign-in unlocked, in minutes.
inline constexpr char kAgentCredentialsUnlockMinutes[] = "redrob.agent_credentials.unlock_minutes";
// Per-site overrides: a dict {serialized origin: "allow" | "deny"}. "deny" refuses that site under every
// policy; "allow" lets that site fill without the unlock window under kWhileUnlocked. kNever wins over both.
inline constexpr char kAgentCredentialsSites[] = "redrob.agent_credentials.sites";
// The audit trail: a list of dicts {time_ms, origin, username, task_id, outcome}, newest last, capped at
// CredentialTools::kMaxAuditRecords. Usernames only -- there is no field a password could go in.
inline constexpr char kAgentCredentialsAudit[] = "redrob.agent_credentials.audit";

// The quick window's global shortcut (CAP-5), as a PRESET ID rather than a key string. A key string
// would arrive from the settings page and could name any combination on the machine -- including a
// plain letter, which a global shortcut would then steal from every other application. The window
// code maps each id to an accelerator with the platform's primary modifier (Ctrl, or Command on
// macOS). "off" disables the shortcut; an id this build does not know behaves as "off".
inline constexpr char kQuickWindowShortcut[] = "redrob.quick_window.shortcut";
inline constexpr char kQuickWindowShortcutPrimaryShiftSpace[] = "primary_shift_space";
inline constexpr char kQuickWindowShortcutAltShiftSpace[] = "alt_shift_space";
inline constexpr char kQuickWindowShortcutOff[] = "off";

void RegisterProfilePrefs(user_prefs::PrefRegistrySyncable* registry);

}  // namespace redrob::prefs

#endif  // CHROME_BROWSER_REDROB_REDROB_PREFS_H_
