# rewrite/

Our entire delta against Chromium, as RULES. One file per Chromium file, mirroring the upstream tree:

```
rewrite/chrome/browser/ui/views/frame/browser_view.cc.yaml
rewrite/chrome/common/chrome_paths_linux.cc.yaml
```

`scripts/plaster.py generate` turns each rule into a patch at the same upstream path inside
`vendor/browseros/chromium_patches/`, which is the stack the build applies. The patches are
**generated, never hand-edited** — editing one is lost at the next regenerate, and `check_repo.py`
refuses a patch that does not match its rule.

A rule records WHAT WE MEANT, not what the file looked like. That is the difference that shows up at
an uprev: a hand patch whose context moved conflicts, and resolving it means re-deciding the change
with a merge tool, while a rule whose anchor moved still matches because it names the anchor rather
than the three lines above it. Every substitution declares a `count`, so a rule that was meant to
change one call and now matches twice, or none, **stops the build** instead of quietly changing the
wrong amount of code.

## Rules that keep a rebase finishable

- **A file we add is not a patch.** New code belongs in this repository as a file and is copied into
  the checkout by the build, so the stack stays a list of things we changed about Chromium rather
  than a mixture of that and things we wrote.
- **Prefer a flag, a pref or a resource over a code change.** A rule that flips a default is one line
  and survives upstream refactors; a rule anchored inside a function body does not.
- **Nothing in the stack without a reason recorded in the rule.** The last fork inherited patches
  nobody could explain, which is how a fork ends up unable to move to the next release.
- **Watch the file list, not the line count.** 4,000 lines across ten files is cheap; 400 lines
  across ninety files is what makes every release a project.
- **Never anchor a numbered id on "the current last value".** Permission ids, event ids and function
  ids are IPC and metrics identities. Appending at the next free value reads the right number only
  for the base the rule was written against: at the 155 uprev upstream had spent those numbers, the
  anchor line was still unique so `count` passed, and the enum ended up declaring two members with
  one id — which decodes as the wrong call rather than failing to build. Allocate in a reserved high
  band instead (permissions 1000+, events 2000+, functions 5000+, grit ids 13000+), far above
  anything upstream reaches, so the ids neither collide now nor move later.

## Where the patches go

`vendor/browseros/chromium_patches/<upstream path>`, claimed by a feature group in that directory's
`.features.yaml`. Ours are the `redrob-*` groups. `python -m bos_build dev doctor` checks every
patch is claimed by exactly one group and every claim resolves to a patch.
