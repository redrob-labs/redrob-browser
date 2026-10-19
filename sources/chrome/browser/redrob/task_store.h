// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_TASK_STORE_H_
#define CHROME_BROWSER_REDROB_TASK_STORE_H_

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/observer_list.h"
#include "base/timer/timer.h"
#include "base/values.h"
#include "url/gurl.h"
#include "base/files/file_path.h"
#include "chrome/browser/redrob/memory_store.h"
#include "chrome/browser/redrob/sidecar_client.h"
#include "chrome/browser/ui/thumbnails/thumbnail_image.h"
#include "chrome/browser/ui/webui/redrob/redrob.mojom.h"
#include "components/keyed_service/core/keyed_service.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"

class Profile;
class ScopedKeepAlive;
class ScopedProfileKeepAlive;

namespace content {
class WebContents;
}  // namespace content

namespace redrob {

class ModelStore;

// The tasks of one profile, the sidecar that answers them, and the tool loop between the two.
//
// This is a profile service rather than state on the WebUI's Mojo handler, and that is the whole
// point: a task opens as a TAB. Navigating creates a new document, a new handler and -- when the
// tasks lived on the handler -- a new empty list, so the task tab you had just opened said "task not
// found". Tasks outlive documents because the product treats them as something you go back to.
//
// The engine does inference and proposes tools; THIS class runs them. That division is the engine's
// own contract for this endpoint ("leaving dynamic tool execution to the calling UI"), and it is also
// the security boundary: the browser decides what a model's output is allowed to make the browser do,
// and it decides it here, in one place, in the browser process.
class TaskStore : public KeyedService, public SidecarClient::CompletionDelegate {
 public:
  class Observer : public base::CheckedObserver {
   public:
    virtual void OnTaskChanged(const mojom::Task& task) = 0;
  };

  TaskStore(Profile* profile,
            scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory,
            MemoryStore* memory,
            ModelStore* models);
  TaskStore(const TaskStore&) = delete;
  TaskStore& operator=(const TaskStore&) = delete;
  ~TaskStore() override;

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // Returns the new task's id, or the reason it could not start. Every argument came from a renderer,
  // so this is where the bounds live.
  std::pair<std::optional<std::string>, std::optional<mojom::StartError>> StartTask(
      const std::string& prompt,
      const std::vector<std::string>& context_refs,
      mojom::PermissionMode mode,
      mojom::Effort effort,
      // The wire model id. Empty falls back to the default, which is what every caller got before this
      // was a parameter at all.
      const std::string& model);
  // What the local engine says this machine can run. Empty when no engine is reachable, which is the
  // normal state on a machine that never installed one -- the caller must say so rather than render an
  // empty list as if it were a catalogue.
  std::vector<mojom::ModelOptionPtr> ListModels() const;
  // The built-in engine's state, for the settings page's provider row. That row used to be invented in
  // the renderer -- a fixed model id and an empty endpoint -- so it claimed a configured engine on a
  // machine that had never installed one.
  SidecarClient::Status EngineStatus() const;

  // The credential and listener of the engine this profile launched, for the one
  // caller that needs them: redrobPrivate.getEngineCredential (F-5).
  //
  // Two strings rather than the SidecarClient itself, deliberately. The client can
  // start and stop processes and stream completions; handing it out so a caller
  // can read two fields would put all of that behind an extension function. Both
  // are empty when no engine is running, and an empty credential means the caller
  // must refuse -- not that it may send an unauthenticated request.
  std::string EngineCredential() const;
  std::string EngineBaseUrl() const;
  size_t ModelOptionCount() const;
  // The wire id the built-in path routes with when nothing is chosen.
  static std::string DefaultModel();

  void CancelTask(const std::string& task_id);
  bool SetPermissionMode(const std::string& task_id, mojom::PermissionMode mode);
  // Records a folder the USER picked. The picker itself lives on the WebUI handler, which is the only
  // place with a window to parent a native dialog to; this is where the choice becomes state. Returns
  // the display name the page may show, or nullopt if the task is unknown.
  std::optional<std::string> SetWorkingFolder(const std::string& task_id,
                                              const base::FilePath& folder);
  // A message typed into a task's own composer. See mojom::FollowUpMode.
  mojom::FollowUpOutcome SendFollowUp(const std::string& task_id,
                                      const std::string& prompt,
                                      mojom::FollowUpMode mode);
  // Removes one not-yet-run queued message. False when `index` does not currently hold
  // `expected_prompt`, which means the queue moved under the page and nothing should be deleted.
  bool WithdrawQueuedFollowUp(const std::string& task_id,
                              uint32_t index,
                              const std::string& expected_prompt);
  std::vector<mojom::TaskPtr> ListTasks() const;
  mojom::TaskPtr GetTask(const std::string& task_id) const;

  // Starts a task the way a ROUTINE starts one: same bounds, same loop, but marked in the trace as
  // something the browser did on a schedule rather than something the user just typed. Returns the new
  // task's id, or empty when it could not start.
  std::string StartRoutineTask(const std::string& title,
                               const std::string& prompt,
                               mojom::PermissionMode mode,
                               mojom::Effort effort);
  // Wakes an existing task with its context intact -- a heartbeat routine, as distinct from a cron
  // routine that starts a fresh one. False when the id is unknown.
  bool WakeTask(const std::string& task_id, const std::string& prompt);

  // Starts a hidden consolidation run over the memory files. Without `force` it runs only when at least
  // three extraction runs finished since the last one and the last one is a day old -- the built-in
  // routine calls it that way; Settings' "Run consolidation now" passes force. False when nothing
  // started: memory off, not due, one already running, or no engine.
  bool StartConsolidation(bool force);

  // SidecarClient::CompletionDelegate
  void OnCompletionText(std::string_view text) override;
  void OnCompletionReasoning(std::string_view text) override;
  void OnCompletionToolCall(const std::string& id,
                            const std::string& name,
                            const std::string& arguments_json) override;
  void OnCompletionFinished(const std::string& finish_reason) override;
  void OnCompletionFailed(const std::string& message) override;

  // KeyedService. Drops the keep-alives before the profile goes away; see UpdateKeepAlive.
  void Shutdown() override;

  // CAP-4 / guard. Answers the confirmation a guard-mode task is waiting on (Task.awaiting_confirmation).
  // `allow` performs exactly that one action and nothing else; declining answers the engine that the
  // user said no. False when the task is unknown or is not waiting on one. Reached from the task
  // notification's buttons and from redrobPrivate.answerTaskConfirmation.
  bool AnswerConfirmation(const std::string& task_id, bool allow);

  // SUB-1..4. The engine's own account surface, asked through the sidecar -- never a list kept in the
  // browser, because a second list is a second truth (docs/PRODUCT-BACKLOG.md SUB-1). Nothing secret is
  // in these structs: the engine's provider records can carry a key, and it is dropped while parsing.
  struct EngineAuthMethod {
    // The index the engine's authorize/callback routes take.
    int index = 0;
    // "oauth" (a subscription or account sign-in) or "api" (a key).
    std::string type;
    std::string label;
  };
  struct EngineProvider {
    std::string id;
    std::string name;
    // Where the engine says this provider's credential came from: "env", "config", "custom", "api" or
    // "launcher". Reported so the surface can say WHERE a connection lives rather than only that it does.
    std::string source;
    bool connected = false;
    // True when Redrob Console manages this provider for the signed-in organisation.
    bool console_managed = false;
    size_t model_count = 0;
    std::vector<EngineAuthMethod> methods;
  };
  struct EngineAccount {
    // False when the engine is not serving yet (or is not installed); everything else is then empty and
    // the caller must say so rather than render an empty list as "no providers".
    bool engine_ready = false;
    std::vector<EngineProvider> providers;
    // The Redrob Console organisation the engine is signed in to, when it reports one.
    std::string console_org;
  };
  using EngineAccountCallback = base::OnceCallback<void(EngineAccount)>;
  void GetEngineAccount(EngineAccountCallback callback);

  struct SignInStart {
    // Empty on success.
    std::string error;
    // What the engine says to tell the user, e.g. which code to expect.
    std::string instructions;
    // True when the provider shows the user a code to paste back (the engine's "code" method); false when
    // the engine catches the redirect itself ("auto") and FinishEngineSignIn just waits for it.
    bool needs_code = false;
  };
  // Asks the engine for the provider's authorize page and opens it in a new tab -- the browser opens it,
  // not the page that asked, so the user sees exactly where they are signing in.
  void BeginEngineSignIn(const std::string& provider_id,
                         int method,
                         base::OnceCallback<void(SignInStart)> callback);
  // Completes it. For "auto" the engine answers once the provider redirected back to it, which can take
  // as long as the user takes in the other tab. `code` is empty for "auto". Answers an empty string on
  // success, otherwise the engine's reason.
  void FinishEngineSignIn(const std::string& provider_id,
                          int method,
                          const std::string& code,
                          base::OnceCallback<void(std::string)> callback);
  // SUB-3. Hands the engine a key for `provider_id`. The key goes one way: into the engine's store, never
  // back out of the browser, never into a pref and never into a log.
  void SetEngineApiKey(const std::string& provider_id,
                       const std::string& key,
                       base::OnceCallback<void(std::string)> callback);
  void DisconnectEngineProvider(const std::string& provider_id,
                                base::OnceCallback<void(bool)> callback);

 private:
  // What the engine proposed, held until the turn ends. Tools are run only after a turn completes: a
  // tool call whose arguments arrived in a stream that then failed is one the browser must not run.
  struct ProposedToolCall {
    std::string id;
    std::string name;
    std::string arguments_json;
  };

  // The wire history of one task. Kept out of mojom::Task deliberately -- a renderer has no business
  // seeing raw system prompts or tool plumbing, only the trace built from them.
  struct Conversation {
    base::ListValue messages;
    int tool_rounds = 0;
    std::string assistant_text;
    std::vector<ProposedToolCall> proposed;
    // The tab the agent most recently opened. Every page tool acts on this rather than on whatever the
    // user happens to be looking at -- a task must not read or click the tab in front of the person.
    base::WeakPtr<content::WebContents> page;
    // Tool calls still waiting on an async result. A turn cannot continue until they are all answered,
    // because the engine expects one tool message per call it proposed.
    int pending_tools = 0;
    // Instructions the user typed while the task was mid-run, waiting for a safe boundary. Delivered
    // BETWEEN turns rather than into one: a message appended while the engine is mid-completion would
    // land in a history the engine is already answering.
    std::vector<std::string> queued;
    // Whether the current turn has said anything yet. A turn's prose is a paragraph of its own -- two
    // turns' text appended to one string ran together mid-sentence, which read as one confused
    // statement rather than as an answer and then a correction.
    bool turn_text_started = false;
    // CAP-1: the http(s) tab the user was on when they started the task, sent as
    // redrob_context until the agent opens a tab of its own. URL and title only -- never the
    // page's contents, and never anything the agent may act on.
    std::string context_url;
    std::string context_title;
    // True from creation until the memory search for this task's prompt has answered. The first turn
    // waits for it, because the hits go into the history BEFORE the user's message.
    bool awaiting_memory = false;
    // Pages the agent's tab visited, {url, title}. Handed to extraction only when the user turned
    // history input on; never the user's own history.
    std::vector<std::pair<std::string, std::string>> visited;
    // CAP-4 / guard: the click this task is waiting for the user to allow or decline. Held while the
    // task is kBlockedOnPolicy; it is counted in `pending_tools`, so the turn cannot move on without it.
    std::optional<ProposedToolCall> awaiting;
    // The last page the agent opened. When the window holding the task's tab is closed, the next page
    // tool tells the engine to open this again rather than just "there is no page".
    GURL last_url;
  };

  // A hidden task that maintains memory: extraction after a task, or consolidation. Not listed, not
  // notified, opens no tabs, and is the ONLY kind of task offered memory_write / memory_edit.
  struct MemoryTaskInfo {
    std::string run_id;
    bool consolidate = false;
  };

  void OnSidecarStatusChanged(SidecarClient::Status status);
  void StartTurn(const std::string& task_id);
  // Dispatches one proposed call. Synchronous tools answer immediately through `FinishTool`;
  // asynchronous ones answer from their own callback. Either way the turn resumes only once every
  // call it proposed has an answer.
  void RunTool(const std::string& task_id, const ProposedToolCall& call);
  // Records the engine's answer for one call and, when the last one lands, starts the next turn.
  void FinishTool(const std::string& task_id,
                  const ProposedToolCall& call,
                  const std::string& result);
  // True when `mode` covers `tool`. The single place this question is answered.
  static bool ModeAllows(mojom::PermissionMode mode, const std::string& tool);
  // Moves anything the user queued into the conversation, at a boundary where doing so is safe.
  // Returns true when something was moved, which is what tells the caller a turn is owed.
  bool DrainQueued(const std::string& task_id);
  // The shared tail of StartTask and StartRoutineTask: id, task record, conversation, history trim.
  std::string CreateTask(const std::string& prompt,
                         mojom::PermissionMode mode,
                         mojom::Effort effort,
                         // Empty for a routine, which has no chooser of its own and takes the default.
                         const std::string& model);
  void FinishTask(const std::string& task_id, mojom::TaskState state, const std::string& error);
  mojom::Step* AddStep(const std::string& task_id, mojom::StepKind kind, const std::string& label);
  void AddStepDetail(const std::string& task_id, const std::string& text, const std::string& source);
  // Asks the engine for its providers and replaces the cache. Called when the engine becomes ready
  // rather than per chooser-open: the list only changes when someone edits the engine's own config.
  void RefreshModels();
  void OnProvidersFetched(std::optional<std::string> body);
  void Notify(const std::string& task_id);
  // Subscribes to the frames Chromium already captures for a tab, and files each one on the step that
  // opened it. Nothing new is captured for us: subscribing is what makes the existing thumbnail
  // machinery keep a backgrounded tab's image fresh.
  void WatchTabFrames(const std::string& task_id, content::WebContents* contents, size_t step_index);
  void OnTabFrame(std::string task_id, size_t step_index, ThumbnailImage::CompressedThumbnailData data);
  // Prose arrives token by token; a Mojo message per token would send the whole task hundreds of times
  // for one paragraph. Coalesced so the page updates promptly without that traffic.
  void ScheduleNotify(const std::string& task_id);
  // CAP-1: records the user's active http(s) tab on a new task (see Conversation::context_url).
  void CaptureContextTab(const std::string& task_id);
  // CAP-1: {page_url, page_title} of the task's agent tab, else of the tab it started from; nullopt
  // when neither is an http(s) page.
  static std::optional<base::DictValue> RedrobContext(const Conversation& conversation);

  // --- Memory runs ----------------------------------------------------------------------------------
  bool IsMemoryTask(const std::string& task_id) const;
  // Creates and posts the first turn of a hidden memory task. Returns its id, or empty.
  std::string StartMemoryTask(bool consolidate, const std::string& prompt);
  // Queues the extraction run for a task that just succeeded.
  void StartExtraction(const std::string& task_id);
  // The memory_* and recall tools. Returns false when `call` is not one of them.
  bool RunMemoryTool(const std::string& task_id,
                     const ProposedToolCall& call,
                     const base::DictValue& arguments);
  void OnMemoryPrefill(std::string task_id, std::vector<MemoryStore::SearchHit> hits);
  // Starts the oldest queued task when nothing is streaming. Posted from FinishTask, because a task
  // that finished while another waited used to leave the waiting one queued for good.
  void StartNextQueued();
  // Drops a finished memory task from every map.
  void ForgetMemoryTask(const std::string& task_id);

  std::map<std::string, MemoryTaskInfo> memory_tasks_;

  // CAP-4. Holds the process and the profile alive while any task is not finished, and lets go when the
  // last one ends. Called from Notify, because every state change goes through Notify.
  void UpdateKeepAlive();
  // Raises the OS notification for a task that finished while no user window is open, or that is waiting
  // on the user. At most once per state.
  void AnnounceTask(const std::string& task_id);
  void OnTaskNotificationClicked(const std::string& task_id, std::optional<int> button);
  // Runs a click or a type the permission check has already passed. Split out so an allowed
  // confirmation runs the identical code path the unconfirmed click would have.
  void DispatchPageAction(const std::string& task_id,
                          const ProposedToolCall& call,
                          bool is_click,
                          const std::string& target,
                          const std::string& text);
  // Ultrabrowse never stops for silence; the other efforts give up on a turn the engine has said nothing
  // in for kTurnIdleTimeout, instead of spinning a card forever. Re-armed on every streamed event.
  void ArmIdleWatch();
  void OnTurnIdle();
  // Starts the engine if needed. True when it is serving now.
  bool EngineReady();
  void OnEngineAuthorize(base::OnceCallback<void(SignInStart)> callback,
                         int status,
                         std::optional<std::string> body);
  // Shared tail of finishing a sign-in, saving a key and disconnecting: success refreshes the model list;
  // failure answers the engine's reason. `expect_true` is for the OAuth callback, which answers a boolean.
  void OnEngineAccountChange(base::OnceCallback<void(std::string)> callback,
                             bool expect_true,
                             int status,
                             std::optional<std::string> body);

  std::map<std::string, mojom::TaskPtr> tasks_;
  std::map<std::string, Conversation> conversations_;
  // Held for the life of the task: the subscription IS the request, so dropping it stops the frames.
  struct PreviewWatch {
    scoped_refptr<ThumbnailImage> image;
    std::unique_ptr<ThumbnailImage::Subscription> subscription;
  };
  std::map<std::string, std::vector<PreviewWatch>> previews_;
  // Where each task may write. Kept here rather than on mojom::Task: the page is shown the folder's
  // NAME so the user can see where files go, and never the path -- a renderer with the absolute path
  // has learned something about the machine it has no use for.
  std::map<std::string, base::FilePath> working_folders_;
  // The task whose turn the sidecar is currently answering. Only one runs at a time because one client
  // holds one stream; queueing is what kMaxConcurrentTasks bounds.
  std::string active_task_id_;

  raw_ptr<Profile> profile_;
  // Both outlive this service: the factory declares the dependency, so these are raw.
  raw_ptr<MemoryStore> memory_;
  raw_ptr<ModelStore> models_;
  // Resolved once, on this thread, so the blocking-thread write check compares against a value it did
  // not have to go and look up. Never sent anywhere near a renderer.
  base::FilePath user_data_dir_;
  scoped_refptr<network::SharedURLLoaderFactory> url_loader_factory_;
  std::unique_ptr<SidecarClient> sidecar_;
  base::OneShotTimer notify_timer_;
  std::string pending_notify_task_id_;
  base::ObserverList<Observer> observers_;

  // Tool results arrive from callbacks the store may not outlive -- a page closed, a write
  // finishing after the profile went away.
  base::WeakPtrFactory<TaskStore> weak_factory_{this};

  // What the engine last said it can route to. Plain records rather than mojom pointers: those are
  // move-only, and this is read once per chooser-open and must survive being read twice.
  struct ModelRecord {
    std::string id;
    std::string provider_id;
    std::string name;
    std::vector<std::string> capabilities;
    std::string price_band;
  };
  std::vector<ModelRecord> model_options_;

  // CAP-4. Present exactly while some task is unfinished and the user has left the keep-running setting
  // on. See UpdateKeepAlive.
  std::unique_ptr<ScopedKeepAlive> keep_alive_;
  std::unique_ptr<ScopedProfileKeepAlive> profile_keep_alive_;
  // The state each task was last announced in, so one finish raises one notification.
  std::map<std::string, mojom::TaskState> announced_;
  base::OneShotTimer idle_timer_;
  bool shutting_down_ = false;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_TASK_STORE_H_
