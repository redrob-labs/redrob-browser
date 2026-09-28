# -*- bazel-starlark -*-
# Copyright 2026 Redrob. Portions copyright The Chromium Authors.
# Use of this source code is governed by the licence in the repository root.

"""Compiles a redrob/chromium_src override in place of the upstream source file.

`-iquote` (redrob/build/BUILD.gn) is enough for HEADERS: an upstream `#include "a/b.h"` finds our
override by itself, because the flag only moves the quoted search path. A `.cc` is different -- nothing
includes it, the build names it directly on the compiler command line -- so overriding one means
rewriting that argument. This handler does exactly that and nothing else:

    ../../chrome/browser/foo.cc  ->  ../../redrob/chromium_src/chrome/browser/foo.cc   (when it exists)

The override then pulls the original back in with `#include <chrome/browser/foo.cc>`, so it wraps rather
than replaces. The object file, the include paths and the target are all still upstream's; only which
source text the compiler reads changes.

Doing it at the executor is what keeps it free. The alternative -- a wrapper program in front of every
compile -- pays a process start on each of ~60,000 translation units.
"""

load("@builtin//struct.star", "module", "struct")

# Set True to print each redirection decision while debugging a miss.
__debug = False

def __configure(ctx, step_config, filegroups, handlers):
    handlers["redirect_cc"] = __redirect_cc_handler

    found_clang_rule = False
    for rule in step_config["rules"]:
        if rule["name"].startswith("clang"):
            found_clang_rule = True
            __wrap_with_redirect_cc(rule, handlers)

    # A build configured without any clang rule of its own still has to redirect, so name the compiler
    # commands directly. Without this the mechanism would silently do nothing on such a build -- an
    # override would simply never be compiled, and no error would say so.
    if not found_clang_rule:
        step_config["rules"].extend([
            {
                "name": "redrob_clang_redirect_cc",
                "command_prefix": "../../third_party/llvm-build/Release+Asserts/bin/clang",
                "handler": "redirect_cc",
            },
            {
                "name": "redrob_clang_coverage_redirect_cc",
                "command_prefix": "\"python3\" ../../build/toolchain/clang_code_coverage_wrapper.py",
                "handler": "redirect_cc",
            },
        ])

# A clang rule may already carry a handler (upstream uses them for dep scanning). Chain rather than
# replace: dropping the existing handler would trade source redirection for broken dependencies.
def __wrap_with_redirect_cc(rule, handlers):
    handler_name = rule.get("handler")
    if not handler_name:
        rule["handler"] = "redirect_cc"
        return

    chained_name = handler_name + "_redirect_cc"
    if chained_name not in handlers:
        def __make(original_name):
            original = handlers[original_name]

            def __chained(ctx, cmd):
                return original(ctx, __redirect_cc_handler(ctx, cmd))

            return __chained

        handlers[chained_name] = __make(handler_name)
    rule["handler"] = chained_name

def __redirect_cc_handler(ctx, cmd):
    # The source file is the argument after `-c` (`/c` on clang-cl). Found positionally rather than by
    # extension because a compile command carries several paths that look like sources.
    source_index = None
    for i, arg in enumerate(cmd.args):
        if arg in ["-c", "/c"]:
            source_index = i + 1
            break
    if source_index == None or source_index >= len(cmd.args):
        return cmd

    source_file = cmd.args[source_index]
    override_file = None

    if source_file.startswith("../../"):
        # A file in the checkout. The common case.
        override_file = source_file.replace("../../", "../../redrob/chromium_src/", 1)
    elif source_file.startswith("gen/"):
        # A generated file, which is overridable too -- buildflag headers among them.
        override_file = source_file.replace("gen/", "../../redrob/chromium_src/", 1)
    else:
        # A generated file under a secondary toolchain, e.g. `android_clang_arm64/gen/base/x.h`.
        parts = source_file.split("/")
        if len(parts) > 1 and parts[1] == "gen":
            override_file = "../../redrob/chromium_src/" + "/".join(parts[2:])

    if not override_file:
        return cmd

    override_path = ctx.fs.canonpath(override_file)
    if __debug:
        print("redrob: ", source_file, "->", override_file,
              "exists:", ctx.fs.exists(override_path))
    if not ctx.fs.exists(override_path):
        return cmd

    new_args = list(cmd.args)
    new_args[source_index] = override_file
    # The override joins the inputs as well as the command line: left out, a build after editing it would
    # not recompile, and the stale object would look like the edit had no effect.
    new_inputs = cmd.inputs + [override_path]
    ctx.actions.fix(args = new_args, inputs = new_inputs)
    return __evolve_struct(cmd, args = new_args, inputs = new_inputs)

# Starlark structs are immutable, so a changed command is a new struct carrying every original field.
def __evolve_struct(s, **kwargs):
    d = {a: getattr(s, a) for a in dir(s)}
    for k, v in kwargs.items():
        if k not in d:
            fail("unknown field on command struct: {!r}".format(k))
        d[k] = v
    return struct(**d)

redrob_siso_config = module(
    "redrob_siso_config",
    configure = __configure,
)
