# Changing Chromium

This is the order to reach for things in when the product needs behaviour Chromium does not have. It is
Brave's order, arrived at the same way and for the same reason, and the reason is not tidiness.

Chromium ships a new major version roughly every four weeks, security fixes included. A fork keeps those
by NOT holding a copy of the code they land in. Every mechanism below is a way of adding behaviour while
leaving upstream's own text alone, and they are ordered by how much upstream text they touch: none, one
line, a few lines, whatever it takes. Each rung down is a standing cost paid at every uprev, forever.

| | Mechanism | Upstream text touched | Use it when |
|---|---|---|---|
| 1 | Our own files | none | Always the first question. Most features need no upstream change at all |
| 2 | `redrob/chromium_src` override | none | Our code has to live in an upstream translation unit, or replace a whole function |
| 3 | A rewrite rule in `rewrite/` | a few lines, generated | Upstream's own code has to change, and the change can be described |
| 4 | A hand-written patch | whatever it takes | Nothing above can express it. Say why in the patch |

## 1. Our own files

`sources/` (compiled into the checkout) and the GN lists in `redrob/build/sources.gni`. Nothing upstream
changes, nothing conflicts, and adding a file does not touch a patch — the file name goes in the `.gni`
list and the upstream target already says `sources += redrob_...`.

That last part is the whole reason the `.gni` exists. A patch that names our files INLINE has to be
re-exported every time we add one, so the number of upstream patches a feature touches grows with the
number of files it adds, and every one of those edits is a fresh chance for the next uprev to conflict.

## 2. chromium_src overrides

A file at `redrob/chromium_src/<upstream path>` is compiled **instead of** the upstream file at that path,
and pulls the original in itself. Two mechanisms make that work, both installed by one-line patches:

- **`-iquote redrob/chromium_src`** (`redrob/build/BUILD.gn`, reached from `build/config/BUILDCONFIG.gn`)
  moves the search path for QUOTED includes only. So an upstream `#include "a/b.h"` finds our override,
  while our override's `#include <a/b.h>` finds the original. That asymmetry is what stops the recursion.
- **A siso handler** (`sources/build/config/siso/redrob_siso_config.star`) rewrites the source argument of
  a compile command when an override exists, because nothing `#include`s a `.cc` — the build names it on
  the command line. Done at the executor, so it costs nothing; a wrapper program in front of every compile
  would pay a process start on each of ~60,000 translation units.

An override WRAPS, it never copies. `check_repo.py` enforces that: an override that does not include the
file it overrides is reported as a failure, because a copy drifts silently — upstream fixes the original,
our copy keeps the old body, and there is no conflict to tell anyone.

Order inside the file is load-bearing:

```cpp
// ABOVE the include: anything the ORIGINAL's code needs to see (a constant, a #define).
constexpr int kOurThing = 4;

#include <chrome/browser/ui/views/tabs/vertical_tab_style_views.cc>

// BELOW the include: anything that needs the class declaration, which arrives with the original.
void VerticalTabStyleViews::PaintTabShadow(gfx::Canvas* canvas) const { ... }
```

What an override cannot do:

- **Introduce a member.** The class declaration comes from the header, so a new method or field needs the
  header changed — a rewrite rule, rung 3.
- **Touch anything with internal linkage.** A `static` function or one in an anonymous namespace in an
  upstream `.cc` is not visible outside its translation unit.
- **Depend on our own targets.** The override compiles as part of the UPSTREAM target, so including one of
  our headers there makes upstream depend on us, and that dependency has to be patched in and re-patched
  forever. Forward-declare a free function in the override, implement it in a file of ours, and let one of
  our own targets own the include.

## 3. Rewrite rules

`rewrite/<upstream path>.yaml` describes a change; `scripts/plaster.py` produces
`patches/<path with dashes>.patch` from it. The patch is OUTPUT — editing one by hand works exactly once
and is then discarded by the next regeneration, which `check_repo.py` refuses.

```bash
scripts/plaster.py generate        # regenerate every patch from its rules
scripts/plaster.py check           # rules still match, patches not hand-edited (the CI gate)
scripts/plaster.py list            # what is rule-generated, and what each rule does
```

```yaml
substitutions:
  - description: |
      Why this change exists. Required -- a rule with no reason is a patch with extra steps.
    regex:
      pattern: 'return Foo(bar);'          # a literal, escaped for you
      replace: 'return RedrobFoo(bar);'
      count: 1                             # default 1. 0 = every occurrence, and at least one
  - description: 'Flexible whitespace or surrounding structure.'
    regex:
      re_pattern: '(source_set\("mixers"\) \{\n  sources = \[[\s\S]*?\n  \])'
      re_flags: [DOTALL]
      replace: '\1\n\n  sources += redrob_chrome_browser_ui_color_sources'
  - description: 'Let our subclass override this.'
    make_virtual: { class_name: DownloadDisplayController, method_name: UpdateToolbarButtonState }
```

Rewriters: `regex`, and the three structural ones `make_virtual`, `add_friend`, `drop_final`.

**`count` is the point.** A hand patch that applies has told you it applied — nothing more. A rule declares
how many places it expects to change, so a rule meant for one call that now matches two, or none, stops the
build instead of quietly changing the wrong amount of code. It has already earned this once: the first
anchor written for `chrome/utility/BUILD.gn` matched two branches, and the count said so instead of putting
our importer in both.

Two habits that make a rule survive an uprev:

- **Anchor on what carries the intent, wildcard the rest.** Name the target, the function, the statement
  being changed, and let `[\s\S]*?` absorb a list body that upstream will add to. Pinning the current
  contents of a `deps` list makes the rule fail for a reason unrelated to its purpose.
- **Use `pattern` when every token in the literal is text being replaced.** `return Foo(bar);` qualifies.
  `if (Foo() && ready) {` does not — `&& ready` and the brace can change upstream without affecting the
  rewrite, so that one needs `re_pattern`.

## 4. Hand-written patches

Still right for some things: a change with no describable anchor, a packaging script, an upstream bug we
are fixing rather than customising. Keep it minimal and say why in the patch. `redrob.py export` rewrites
these from the checkout; it is not how a rule-generated patch is produced.

## Never

- **A `#define` to edit upstream code.** `#define Foo virtual Foo` rewrites EVERY `Foo` in the translation
  unit, including ones dragged in by later includes — an invisible rename in files nobody looked at. Use
  `make_virtual`. The tell is needing to reorder includes so a macro does not mangle something, or
  `#undef`-ing immediately after one.
- **`#define final`.** Redefining a keyword is undefined behaviour and spreads to everything the
  translation unit includes afterwards. `drop_final` edits the one declaration.
- **Copying a whole upstream file or function.** This is the mistake the mechanism in rung 2 exists to
  avoid. Wrap the part that changes and call the original for the rest.
- **Disabling an upstream test from an override.** It hides a real regression behind a build that is green.

## The gates

`scripts/check_repo.py` runs all of these, and each one was verified by putting the defect back and
watching it fail:

- every rewrite rule still matches, with the count it declared;
- no rule-generated patch has been hand-edited;
- every chromium_src override wraps the file it overrides rather than replacing it.

## Where this repository stands

Measured on this tree, not carried forward from a summary:

| | Files | Changed lines |
|---|---|---|
| Generated from branding rules (`derive`) | 18 | 2,688 |
| Generated from rewrite rules (`plaster`) | 14 | 86 |
| Hand-written: installer and packaging | 7 | 313 |
| Hand-written: everything else | 49 | 696 |
| **Total patches** | **88** | **3,783** |

So 73% of the delta is generated rather than written, and the 2,688 in the first row is branding
substitution that was already machine-produced before any of this. The honest reading of the second row is
that it is a start: the 49 remaining hand patches are where the next uprev will cost time, and they are the
queue.

One measured finding worth keeping, because it is not what Brave's own numbers suggest. Brave has 2,945
chromium_src overrides against 1,199 patches, because they REPLACE a great deal of upstream behaviour. Our
patches mostly ADD to upstream functions, and an override cannot do that — so at this size the rung that
pays most is 3, not 2. `vertical_tab_style_views` is the shape where both apply: 57 hand-written lines
became a 22-line generated patch plus 40 lines of our own drawing code in a file we own.
