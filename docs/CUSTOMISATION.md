# Changing Chromium

한국어판: [CUSTOMISATION.ko.md](CUSTOMISATION.ko.md)

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
scripts/plaster.py check           # rules still match, patches not hand-edited (needs a checkout)
scripts/plaster.py parsers         # both YAML parsers read every rule identically (the CI gate)
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

Rewriters: `regex`, `rename`, `insert_after`, and the three structural ones `make_virtual`, `add_friend`,
`drop_final`.

`rename` carries the branding substitution: mask each protected phrase, substitute, restore. Its
protected-phrase lists live in `presets/` and are shared by every strings file, because that list is the
part that must not be copied — a per-file copy drifts silently, and one file keeps substituting a phrase
the others learned to leave alone. Not lookarounds: those need one alternative per phrase and still get
overlapping phrases wrong, because whichever alternative matches first consumes the text the longer one
needed.

`insert_after` is for the additive majority. A `regex` can express "add our block after this line", but
only by quoting the surrounding upstream lines into the rule as both pattern and replacement — so the rule
restates code it does not change, and becomes sensitive to indentation it never meant to assert.
`insert_after` takes a one-line anchor, measures that line's own indentation and reapplies it.

**`count` is the point.** A hand patch that applies has told you it applied — nothing more. A rule declares
how many places it expects to change, so a rule meant for one call that now matches two, or none, stops the
build instead of quietly changing the wrong amount of code. It has already earned this twice: the first
anchor written for `chrome/utility/BUILD.gn` matched two branches, and the count said so instead of putting
our importer in both; and five sign-in strings shipped in v0.1.4 reading "Sign in to Redrob?" because the
rewrite that should have named Google was added after the patch was stored and never regenerated — a
declared count of 5 cannot drift that way.

Two habits that make a rule survive an uprev:

- **Anchor on what carries the intent, wildcard the rest.** Name the target, the function, the statement
  being changed, and let `[\s\S]*?` absorb a list body that upstream will add to. Pinning the current
  contents of a `deps` list makes the rule fail for a reason unrelated to its purpose.
- **Use `pattern` when every token in the literal is text being replaced.** `return Foo(bar);` qualifies.
  `if (Foo() && ready) {` does not — `&& ready` and the brace can change upstream without affecting the
  rewrite, so that one needs `re_pattern`.

And one trap that is not about regex at all. A YAML block scalar strips the common leading indent, so a
multi-line `pattern` must carry the file's REAL indentation on its continuation lines, and a pattern whose
first line is indented deeper than a later one cannot be written as a block at all — use a double-quoted
scalar with explicit `\n`. This is checked: `plaster.py parsers` reads every rule with both YAML parsers
and fails if they disagree, because the generated patch must not depend on which host ran the generator.

## 4. Hand-written patches

**There are none in this repository right now**, and that is a fact about today rather than a rule. This
rung is still the right answer for a change with no describable anchor, and for a small stable edit where a
fifteen-line rule describing a five-line diff is a net loss — Brave keeps 1,186 hand patches at a median of
2 lines for that reason. If you write one, keep it minimal and say why in the patch.

`redrob.py export` rewrites hand patches from the checkout. It deliberately SKIPS every file a rule owns,
so the two mechanisms cannot disagree about who produced a patch — which with 88 of 88 generated means
`export` currently has nothing to do, and a patch appearing in its output is the signal that a new
hand-written delta exists.

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
- every chromium_src override wraps the file it overrides rather than replacing it;
- every `rename` rule names a preset that exists — a deleted preset silently unprotects every phrase in it
  across all 16 rules that share it;
- the two YAML parsers read every rule identically, so a generated patch cannot depend on which host ran
  the generator;
- the package's apt URL and the workflow's publish path are the same place. If those two drift NOTHING
  fails: the release publishes a real signed repository, the package installs a real source, and every
  machine polls a 404 forever with no error to find.

The last two are there because of defects that existed and were invisible. The parser one was invisible to
`check` itself, which used whichever parser was installed and compared the result against a patch made by
that same parser — a checker sharing the component it checks cannot see that component's faults.

## Where this repository stands

Measured on this tree, not carried forward from a summary:

| | Files | Changed lines |
|---|---|---|
| Generated from rewrite rules (`plaster`) | 88 | 3,736 |
| Hand-written | 0 | 0 |
| **Total patches** | **88** | **3,736** |

**Every patch in this repository is generated.** 165 substitutions across 88 rule files and 2 shared
presets, and each one declares how many places it changes. There used to be a second generator as well --
`derive`, which produced the branding substitution -- and it is gone, so there is one mechanism with one
gate rather than two that nobody reconciled.

Each conversion was verified by comparing the FILE its rule produces against the file the hand patch it
replaced produced. Not the patch text: git chooses hunk boundaries and context for itself, so a rule that
reproduces a file exactly can still emit a patch that differs in framing. `scripts/verify_all_rules.py`
re-checks all 88 at once, which is the gate that matters — the tooling changed four times during the
conversion and each change silently altered the output of every rule already written.

Being at zero is not the same as every conversion having been worth it. The last thirty-odd patches were
one to thirteen lines, mostly registrations, and for those a rule buys uniformity and a count that is
unlikely ever to fire; Brave keeps 1,186 hand patches at a median of 2 lines for exactly that reason. What
the conversion genuinely bought is concentrated in the large ones, and it is worth knowing where: three
patterns turned out to match MORE THAN ONE site in their file, and one of them — two identical blocks
building a `TabSearchBubbleHost`, one per branch — would have moved the wrong button with nothing going
red. `count` found all three.

One measured finding worth keeping, because it is not what Brave's own numbers suggest. Brave has 2,945
chromium_src overrides against 1,199 patches, because they REPLACE a great deal of upstream behaviour. Our
patches mostly ADD to upstream functions, and an override cannot do that — so at this size the rung that
pays most is 3, not 2. `vertical_tab_style_views` is the shape where both apply: 57 hand-written lines
became a 22-line generated patch plus 40 lines of our own drawing code in a file we own.

A second finding, and the one that cost the most time: the price of a rule is not the regex, it is
describing WHITESPACE. A YAML block scalar strips the common leading indent, so a pattern whose first line is
indented deeper than a later one cannot be written at all, and a multi-line literal has to carry the
file's real indentation on its continuation lines. That cost two silent non-matches. `insert_after` exists
because of it: it takes a one-line anchor, measures that line's own indentation and reapplies it, which is
what the additive majority of our edits actually need.
