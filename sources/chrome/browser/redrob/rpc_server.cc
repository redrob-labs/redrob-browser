// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/rpc_server.h"

#include <map>
#include <utility>

#include "base/base64.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/task/bind_post_task.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/process/process_handle.h"
#include "base/rand_util.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"
#include "base/task/thread_pool.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/browser_thread.h"
#include "net/base/ip_endpoint.h"
#include "net/base/net_errors.h"
#include "net/server/http_server.h"
#include "net/server/http_server_request_info.h"
#include "net/server/http_server_response_info.h"
#include "net/socket/tcp_server_socket.h"

namespace redrob {
namespace {

// The file the CLI reads to find this browser. Inside the profile directory on purpose: a process that
// can read it can already read the cookie database, so this adds no boundary that did not exist.
constexpr char kHandleFileName[] = "redrob-cli.json";
constexpr int kBacklog = 4;
constexpr size_t kMaxRequestBytes = 256 * 1024;

constexpr net::NetworkTrafficAnnotationTag kAnnotation =
    net::DefineNetworkTrafficAnnotation("redrob_local_rpc", R"(
      semantics {
        sender: "Redrob local RPC"
        description:
          "Responses from a loopback HTTP endpoint the user explicitly enabled, which lets a terminal "
          "command, an MCP client or a script drive this browser's agent. Nothing is sent to any remote "
          "host; this annotation covers writes back to a local socket."
        trigger: "A local process requests something from the endpoint the user enabled."
        data: "Agent task state: the prompts the user typed and the trace of what the agent did."
        destination: LOCAL
      }
      policy {
        cookies_allowed: NO
        setting: "Off unless enabled in Redrob settings or with --redrob-rpc."
        policy_exception_justification: "Does not contact a remote server."
      })");

// A token, not a password: generated per launch, never persisted beyond the handle file, and long
// enough that guessing it is not a strategy.
std::string GenerateToken() {
  uint8_t bytes[32];
  base::RandBytes(bytes);
  return base::Base64Encode(bytes);
}

void WriteHandleFileOnBlockingThread(base::FilePath path, std::string contents) {
  if (!base::WriteFile(path, contents)) {
    return;
  }
  // Owner only. The default would be group- and world-readable on POSIX, which for a token that grants
  // control of the browser is the difference between "behind the profile" and "available to anyone".
#if BUILDFLAG(IS_POSIX)
  base::SetPosixFilePermissions(path, base::FILE_PERMISSION_READ_BY_USER |
                                          base::FILE_PERMISSION_WRITE_BY_USER);
#endif
}

mojom::PermissionMode ModeFromString(const std::string* value) {
  if (!value) {
    return mojom::PermissionMode::kGuard;
  }
  if (*value == "read-only") {
    return mojom::PermissionMode::kReadOnly;
  }
  if (*value == "full-access") {
    return mojom::PermissionMode::kFullAccess;
  }
  // Guard for anything unrecognised. A caller that misspells the mode gets the narrow one.
  return mojom::PermissionMode::kGuard;
}

mojom::Effort EffortFromString(const std::string* value) {
  if (!value) {
    return mojom::Effort::kStandard;
  }
  if (*value == "quick") {
    return mojom::Effort::kQuick;
  }
  if (*value == "ultrabrowse") {
    return mojom::Effort::kUltrabrowse;
  }
  return mojom::Effort::kStandard;
}

const char* StateToString(mojom::TaskState state) {
  switch (state) {
    case mojom::TaskState::kQueued:
      return "queued";
    case mojom::TaskState::kRunning:
      return "running";
    case mojom::TaskState::kBlockedOnPolicy:
      return "blocked";
    case mojom::TaskState::kSucceeded:
      return "done";
    case mojom::TaskState::kFailed:
      return "failed";
    case mojom::TaskState::kCancelled:
      return "cancelled";
  }
}

base::DictValue JsonRpcError(const base::Value* id, int code, const std::string& message) {
  base::DictValue error;
  error.Set("code", code);
  error.Set("message", message);
  base::DictValue reply;
  reply.Set("jsonrpc", "2.0");
  reply.Set("id", id ? id->Clone() : base::Value());
  reply.Set("error", std::move(error));
  return reply;
}

}  // namespace

// The socket, and everything that touches it. Constructed and destroyed on the IO thread; the only
// members the UI thread holds are the task runner and a weak pointer back to the owner.
class RpcServer::Listener : public net::HttpServer::Delegate {
 public:
  Listener(base::WeakPtr<RpcServer> owner,
           scoped_refptr<base::SequencedTaskRunner> ui_runner,
           std::string token,
           std::string profile_name)
      : owner_(std::move(owner)),
        ui_runner_(std::move(ui_runner)),
        token_(std::move(token)),
        profile_name_(std::move(profile_name)) {}

  ~Listener() override = default;

  void Bind() {
    auto socket = std::make_unique<net::TCPServerSocket>(nullptr, net::NetLogSource());
    // Loopback, and port 0 so the OS picks. Never an interface anything off this machine can reach --
    // this endpoint IS the browser to whoever holds the token.
    if (socket->ListenWithAddressAndPort("127.0.0.1", 0, kBacklog) != net::OK) {
      ui_runner_->PostTask(FROM_HERE,
                           base::BindOnce(&RpcServer::OnBound, owner_, std::string()));
      return;
    }
    server_ = std::make_unique<net::HttpServer>(std::move(socket), this);
    net::IPEndPoint address;
    std::string endpoint;
    if (server_->GetLocalAddress(&address) == net::OK) {
      endpoint = "http://" + address.ToString();
    }
    ui_runner_->PostTask(FROM_HERE, base::BindOnce(&RpcServer::OnBound, owner_, endpoint));
  }

  // Called from the UI thread's observer, hopped here because the socket may only be touched from this
  // thread.
  void PushFrame(std::string task_id, std::string frame) {
    if (!server_) {
      return;
    }
    for (const auto& [connection_id, watched] : streams_) {
      if (watched == task_id) {
        server_->SendRaw(connection_id, frame, kAnnotation);
      }
    }
  }

  void Respond(int connection_id, int status, std::string body) {
    if (!server_) {
      return;
    }
    server_->Send(connection_id, static_cast<net::HttpStatusCode>(status), body,
                  "application/json", kAnnotation);
  }

  // net::HttpServer::Delegate
  void OnConnect(int connection_id) override {}

  void OnWebSocketRequest(int connection_id,
                          const net::HttpServerRequestInfo& info) override {
    // Not offered. Streaming is served by SSE over a plain GET, which every HTTP client already
    // speaks; a WebSocket upgrade would be a second protocol to defend for no capability gained.
    server_->Send404(connection_id, kAnnotation);
  }

  void OnWebSocketMessage(int connection_id, std::string data) override {}

  void OnClose(int connection_id) override { streams_.erase(connection_id); }

  void OnHttpRequest(int connection_id, const net::HttpServerRequestInfo& info) override {
    std::string path = info.path;
    const size_t query = path.find('?');
    if (query != std::string::npos) {
      path = path.substr(0, query);
    }
    std::vector<std::string> segments = base::SplitString(
        path, "/", base::TRIM_WHITESPACE, base::SPLIT_WANT_NONEMPTY);

    // GET /mcp is answered 405, not 404, and the difference is not cosmetic. MCP's streamable-HTTP
    // transport opens an optional GET stream for server-initiated messages, and the reference client
    // treats 405 as "this server does not offer one" and anything else as an error it reports. A 404
    // here makes every connect log a failure for a stream we were never going to have.
    if (info.method == "GET" && segments.size() == 1 && segments[0] == "mcp") {
      Respond(connection_id, 405, "{\"error\":\"this server does not offer a GET event stream\"}");
      return;
    }

    // GET /hello is the ONE route that does not need the token, and it exists to stop the token being
    // sent somewhere it should not go. A browser killed outright never deletes its handle file, so a
    // client can find a file naming a port that some unrelated process has since bound -- and a client
    // that opened with `Authorization: Bearer` would have handed that process the token. So: ask who is
    // there first, compare the pid and profile against the file, and only then authenticate. What this
    // discloses to a local port scan is that a Redrob is listening, which the open port already said.
    if (info.method == "GET" && segments.size() == 1 && segments[0] == "hello") {
      base::DictValue hello;
      hello.Set("server", "redrob");
      hello.Set("pid", static_cast<int>(base::GetCurrentProcId()));
      hello.Set("profile", profile_name_);
      Respond(connection_id, 200, base::WriteJson(hello).value_or("{}"));
      return;
    }

    // The token before anything else looks at the path. An unauthenticated caller must not be able to
    // learn which routes exist, and must not be able to make this process parse its JSON.
    if (token_.empty() || info.GetHeaderValue("authorization") != "Bearer " + token_) {
      Respond(connection_id, 401,
              "{\"error\":\"a bearer token from this profile's redrob-cli.json is required\"}");
      return;
    }
    if (info.data.size() > kMaxRequestBytes) {
      Respond(connection_id, 400, "{\"error\":\"request too large\"}");
      return;
    }

    // GET /task/<id>/stream: server-sent events for one task, held open. Answered with raw headers
    // because a normal response closes the connection after the body.
    if (info.method == "GET" && segments.size() == 3 && segments[0] == "task" &&
        segments[2] == "stream") {
      streams_[connection_id] = segments[1];
      server_->SendRaw(connection_id,
                       "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n"
                       "Cache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n",
                       kAnnotation);
      // The first frame comes from the UI thread, which is the only place task state lives.
      ui_runner_->PostTask(
          FROM_HERE,
          base::BindOnce(&RpcServer::HandleRequest, owner_, "GET",
                         std::vector<std::string>{"task", segments[1], "first-frame"},
                         base::DictValue(), base::DoNothing()));
      return;
    }

    base::DictValue request;
    if (!info.data.empty()) {
      std::optional<base::DictValue> parsed =
          base::JSONReader::ReadDict(info.data, base::JSON_PARSE_RFC);
      if (!parsed) {
        Respond(connection_id, 400, "{\"error\":\"body was not JSON\"}");
        return;
      }
      request = std::move(parsed).value();
    }

    // Answered on the UI thread, because that is where the tasks are.
    ui_runner_->PostTask(
        FROM_HERE,
        base::BindOnce(&RpcServer::HandleRequest, owner_, info.method, std::move(segments),
                       std::move(request),
                       base::BindPostTask(
                           base::SequencedTaskRunner::GetCurrentDefault(),
                           base::BindOnce(&Listener::Respond, weak_factory_.GetWeakPtr(),
                                          connection_id))));
  }

 private:
  base::WeakPtr<RpcServer> owner_;
  scoped_refptr<base::SequencedTaskRunner> ui_runner_;
  std::string token_;
  std::string profile_name_;
  std::unique_ptr<net::HttpServer> server_;
  // Connections watching a task's event stream, and which task each is watching.
  std::map<int, std::string> streams_;
  base::WeakPtrFactory<Listener> weak_factory_{this};
};

RpcServer::RpcServer(Profile* profile, TaskStore* tasks)
    : profile_(profile), tasks_(tasks) {}

RpcServer::~RpcServer() {
  Stop();
}

bool RpcServer::Start() {
  if (io_thread_) {
    return true;
  }
  auto thread = std::make_unique<base::Thread>("RedrobRpc");
  // An IO pump, not the default. net::HttpServer's accept loop DCHECKs on anything else, which is a
  // crash on the first connection rather than a startup failure -- the least helpful order to find out.
  base::Thread::Options options(base::MessagePumpType::IO, 0);
  if (!thread->StartWithOptions(std::move(options))) {
    return false;
  }
  io_thread_ = std::move(thread);
  token_ = GenerateToken();
  listener_ = std::make_unique<Listener>(
      weak_factory_.GetWeakPtr(), base::SequencedTaskRunner::GetCurrentDefault(), token_,
      profile_ ? profile_->GetBaseName().AsUTF8Unsafe() : std::string());
  io_thread_->task_runner()->PostTask(
      FROM_HERE, base::BindOnce(&Listener::Bind, base::Unretained(listener_.get())));
  if (!observing_ && tasks_) {
    tasks_->AddObserver(this);
    observing_ = true;
  }
  return true;
}

void RpcServer::Stop() {
  if (observing_ && tasks_) {
    tasks_->RemoveObserver(this);
    observing_ = false;
  }
  if (io_thread_) {
    // Deleted on the thread that made it, before that thread goes away: the socket and its connection
    // map may not be touched from here.
    io_thread_->task_runner()->DeleteSoon(FROM_HERE, std::move(listener_));
    io_thread_->Stop();
    io_thread_.reset();
    DeleteHandleFile();
  }
  listener_.reset();
  token_.clear();
  endpoint_.clear();
}

void RpcServer::OnBound(const std::string& endpoint) {
  endpoint_ = endpoint;
  if (endpoint_.empty()) {
    return;
  }
  WriteHandleFile();
}

void RpcServer::WriteHandleFile() {
  if (!profile_) {
    return;
  }
  base::DictValue handle;
  handle.Set("endpoint", endpoint_);
  handle.Set("token", token_);
  handle.Set("profile", profile_->GetBaseName().AsUTF8Unsafe());
  // The pid of the browser that bound it. A client can tell a stale file from a live one without
  // connecting, which matters because a browser killed outright never gets to delete this.
  handle.Set("pid", static_cast<int>(base::GetCurrentProcId()));
  std::optional<std::string> contents = base::WriteJson(handle);
  if (!contents) {
    return;
  }
  base::ThreadPool::PostTask(
      FROM_HERE, {base::MayBlock(), base::TaskShutdownBehavior::SKIP_ON_SHUTDOWN},
      base::BindOnce(&WriteHandleFileOnBlockingThread,
                     profile_->GetPath().AppendASCII(kHandleFileName),
                     std::move(contents).value()));
}

void RpcServer::DeleteHandleFile() {
  if (!profile_) {
    return;
  }
  // BLOCK_SHUTDOWN, unlike the write: this runs while the browser is going away, and a SKIP_ON_SHUTDOWN
  // unlink is one that does not happen. It is a single unlink, so blocking on it costs nothing measurable
  // and the alternative is a file that names a closed port for as long as the profile exists.
  base::ThreadPool::PostTask(
      FROM_HERE, {base::MayBlock(), base::TaskShutdownBehavior::BLOCK_SHUTDOWN},
      base::GetDeleteFileCallback(profile_->GetPath().AppendASCII(kHandleFileName)));
}

void RpcServer::HandleRequest(const std::string& method,
                              std::vector<std::string> segments,
                              base::DictValue request,
                              base::OnceCallback<void(int, std::string)> respond) {
  // The stream's opening frame, which has no response to send -- the frame goes out through the push
  // path like every later one.
  if (segments.size() == 3 && segments[2] == "first-frame") {
    mojom::TaskPtr task = tasks_ ? tasks_->GetTask(segments[1]) : nullptr;
    if (task) {
      OnTaskChanged(*task);
    }
    return;
  }

  Reply reply;
  if (method == "POST" && segments.size() == 1 && segments[0] == "task") {
    reply = HandleTask(request);
  } else if (method == "GET" && segments.size() == 2 && segments[0] == "task") {
    reply = HandleTaskGet(segments[1]);
  } else if (method == "POST" && segments.size() == 3 && segments[0] == "task" &&
             segments[2] == "follow-up") {
    reply = HandleFollowUp(segments[1], request);
  } else if (method == "POST" && segments.size() == 3 && segments[0] == "task" &&
             segments[2] == "cancel") {
    reply = HandleCancel(segments[1]);
  } else if (method == "POST" && segments.size() == 1 && segments[0] == "mcp") {
    reply = HandleMcp(request);
  } else {
    reply.status = 404;
    reply.body.Set("error", "no such route");
  }
  std::optional<std::string> body = base::WriteJson(reply.body);
  // A 202 carries no body: the empty dict would serialise to "{}", which is a body.
  std::move(respond).Run(reply.status,
                         reply.status == 202 ? std::string() : body.value_or("{}"));
}

base::DictValue RpcServer::TaskToDict(const mojom::Task& task) const {
  base::DictValue out;
  out.Set("id", task.id);
  out.Set("prompt", task.prompt);
  out.Set("state", StateToString(task.state));
  out.Set("done", task.state == mojom::TaskState::kSucceeded ||
                      task.state == mojom::TaskState::kFailed ||
                      task.state == mojom::TaskState::kCancelled);
  if (task.narration.has_value()) {
    out.Set("answer", task.narration.value());
  }
  if (task.error.has_value()) {
    out.Set("error", task.error.value());
  }
  base::ListValue steps;
  for (const mojom::StepPtr& step : task.steps) {
    base::DictValue entry;
    entry.Set("label", step->label);
    base::ListValue details;
    for (const mojom::StepDetailPtr& detail : step->details) {
      details.Append(detail->text);
    }
    entry.Set("details", std::move(details));
    // The captured frames are deliberately not here. A data URL per step would make every poll of this
    // endpoint megabytes, and a caller that wants pixels is asking the wrong interface.
    steps.Append(std::move(entry));
  }
  out.Set("steps", std::move(steps));
  return out;
}

RpcServer::Reply RpcServer::HandleTask(const base::DictValue& request) {
  Reply reply;
  const std::string* prompt = request.FindString("prompt");
  if (!prompt || prompt->empty()) {
    reply.status = 400;
    reply.body.Set("error", "prompt is required");
    return reply;
  }
  if (!tasks_) {
    reply.status = 503;
    reply.body.Set("error", "this profile has no agent");
    return reply;
  }
  // Straight into the same StartTask every other surface uses, so the bounds and the permission gate
  // are the ones already reviewed rather than a second copy of them.
  auto [task_id, error] = tasks_->StartTask(*prompt, {}, ModeFromString(request.FindString("mode")),
                                            EffortFromString(request.FindString("effort")),
                                            // No model over RPC: an external caller choosing the model
                                            // would be choosing what the user pays for.
                                            std::string());
  if (!task_id) {
    reply.status = 503;
    reply.body.Set("error", error == mojom::StartError::kSidecarUnavailable
                                ? "the engine is not available"
                                : "the task was refused");
    return reply;
  }
  reply.body.Set("task_id", task_id.value());
  reply.body.Set("stream", "/task/" + task_id.value() + "/stream");
  return reply;
}

RpcServer::Reply RpcServer::HandleTaskGet(const std::string& task_id) {
  Reply reply;
  mojom::TaskPtr task = tasks_ ? tasks_->GetTask(task_id) : nullptr;
  if (!task) {
    reply.status = 404;
    reply.body.Set("error", "no such task");
    return reply;
  }
  reply.body = TaskToDict(*task);
  return reply;
}

RpcServer::Reply RpcServer::HandleFollowUp(const std::string& task_id,
                                           const base::DictValue& request) {
  Reply reply;
  const std::string* prompt = request.FindString("prompt");
  if (!prompt || prompt->empty()) {
    reply.status = 400;
    reply.body.Set("error", "prompt is required");
    return reply;
  }
  const std::string* mode = request.FindString("when");
  const mojom::FollowUpMode when = mode && *mode == "now" ? mojom::FollowUpMode::kInterrupt
                                                          : mojom::FollowUpMode::kQueue;
  const mojom::FollowUpOutcome outcome =
      tasks_ ? tasks_->SendFollowUp(task_id, *prompt, when) : mojom::FollowUpOutcome::kRejected;
  switch (outcome) {
    case mojom::FollowUpOutcome::kRejected:
      reply.status = 409;
      reply.body.Set("error", "that could not be delivered");
      break;
    case mojom::FollowUpOutcome::kQueued:
      reply.body.Set("outcome", "queued");
      break;
    case mojom::FollowUpOutcome::kInterrupted:
      reply.body.Set("outcome", "interrupted");
      break;
    case mojom::FollowUpOutcome::kStartedTurn:
      reply.body.Set("outcome", "started");
      break;
  }
  return reply;
}

RpcServer::Reply RpcServer::HandleCancel(const std::string& task_id) {
  Reply reply;
  if (tasks_) {
    tasks_->CancelTask(task_id);
  }
  reply.body.Set("outcome", "cancelled");
  return reply;
}

RpcServer::Reply RpcServer::HandleMcp(const base::DictValue& request) {
  Reply reply;
  const base::Value* id = request.Find("id");
  const std::string* method = request.FindString("method");
  if (!method) {
    reply.body = JsonRpcError(id, -32600, "method is required");
    return reply;
  }

  // A JSON-RPC NOTIFICATION has no id and expects no answer. MCP sends `notifications/initialized`
  // immediately after initialize, and answering it with a response -- an error response, in the first
  // version of this -- is a protocol violation the reference client surfaces as a transport error. 202
  // with an empty body is what the transport is looking for.
  if (!id && base::StartsWith(*method, "notifications/")) {
    reply.status = 202;
    return reply;
  }

  if (*method == "initialize") {
    base::DictValue capabilities;
    // Tools only. This browser is not a document store and not a prompt library, and advertising
    // capabilities it does not have is how an MCP client ends up calling something that returns an
    // error for every input.
    capabilities.Set("tools", base::DictValue());
    base::DictValue info;
    info.Set("name", "redrob-browser");
    info.Set("version", "1");
    base::DictValue result;
    result.Set("protocolVersion", "2025-06-18");
    result.Set("capabilities", std::move(capabilities));
    result.Set("serverInfo", std::move(info));
    base::DictValue out;
    out.Set("jsonrpc", "2.0");
    out.Set("id", id ? id->Clone() : base::Value());
    out.Set("result", std::move(result));
    reply.body = std::move(out);
    return reply;
  }

  if (*method == "tools/list") {
    base::ListValue tools;
    {
      base::DictValue properties;
      base::DictValue prompt;
      prompt.Set("type", "string");
      prompt.Set("description", "What the browser should do, in plain language.");
      properties.Set("prompt", std::move(prompt));
      base::DictValue mode;
      mode.Set("type", "string");
      mode.Set("description",
               "read-only, guard or full-access. Defaults to guard, and an unrecognised value is "
               "treated as guard rather than widened.");
      properties.Set("mode", std::move(mode));
      base::DictValue effort;
      effort.Set("type", "string");
      effort.Set("description", "quick, standard or ultrabrowse.");
      properties.Set("effort", std::move(effort));
      base::ListValue required;
      required.Append("prompt");
      base::DictValue schema;
      schema.Set("type", "object");
      schema.Set("properties", std::move(properties));
      schema.Set("required", std::move(required));
      base::DictValue tool;
      tool.Set("name", "browse");
      tool.Set("description",
               "Run a task in a real browser that has the user's own sessions and logins. Opens real "
               "tabs the user can watch and take over. Returns the task id; poll browse_status for the "
               "answer, because a browsing task is not instantaneous.");
      tool.Set("inputSchema", std::move(schema));
      tools.Append(std::move(tool));
    }
    {
      base::DictValue properties;
      base::DictValue task_id;
      task_id.Set("type", "string");
      task_id.Set("description", "The id `browse` returned.");
      properties.Set("task_id", std::move(task_id));
      base::ListValue required;
      required.Append("task_id");
      base::DictValue schema;
      schema.Set("type", "object");
      schema.Set("properties", std::move(properties));
      schema.Set("required", std::move(required));
      base::DictValue tool;
      tool.Set("name", "browse_status");
      tool.Set("description",
               "The state, trace and answer of a task started with `browse`. `done` is false while it "
               "is still working.");
      tool.Set("inputSchema", std::move(schema));
      tools.Append(std::move(tool));
    }
    base::DictValue result;
    result.Set("tools", std::move(tools));
    base::DictValue out;
    out.Set("jsonrpc", "2.0");
    out.Set("id", id ? id->Clone() : base::Value());
    out.Set("result", std::move(result));
    reply.body = std::move(out);
    return reply;
  }

  if (*method == "tools/call") {
    const base::DictValue* params = request.FindDict("params");
    const std::string* name = params ? params->FindString("name") : nullptr;
    const base::DictValue* arguments = params ? params->FindDict("arguments") : nullptr;
    if (!name || !arguments) {
      reply.body = JsonRpcError(id, -32602, "params.name and params.arguments are required");
      return reply;
    }
    Reply inner;
    if (*name == "browse") {
      inner = HandleTask(*arguments);
    } else if (*name == "browse_status") {
      const std::string* task_id = arguments->FindString("task_id");
      inner = HandleTaskGet(task_id ? *task_id : std::string());
    } else {
      reply.body = JsonRpcError(id, -32601, "no such tool");
      return reply;
    }

    // MCP wants content blocks. The JSON goes in a text block rather than being invented into a
    // schema MCP does not have, which is what every other JSON-returning MCP server does.
    std::optional<std::string> text = base::WriteJson(inner.body);
    base::DictValue block;
    block.Set("type", "text");
    block.Set("text", text.value_or("{}"));
    base::ListValue content;
    content.Append(std::move(block));
    base::DictValue result;
    result.Set("content", std::move(content));
    result.Set("isError", inner.status >= 400);
    base::DictValue out;
    out.Set("jsonrpc", "2.0");
    out.Set("id", id ? id->Clone() : base::Value());
    out.Set("result", std::move(result));
    reply.body = std::move(out);
    return reply;
  }

  reply.body = JsonRpcError(id, -32601, "no such method");
  return reply;
}

void RpcServer::OnTaskChanged(const mojom::Task& task) {
  if (!io_thread_ || !listener_) {
    return;
  }
  std::optional<std::string> body = base::WriteJson(TaskToDict(task));
  if (!body) {
    return;
  }
  io_thread_->task_runner()->PostTask(
      FROM_HERE, base::BindOnce(&Listener::PushFrame, base::Unretained(listener_.get()), task.id,
                                "data: " + body.value() + "\n\n"));
}

}  // namespace redrob
