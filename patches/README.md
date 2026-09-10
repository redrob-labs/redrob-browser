# patches/

Our entire delta against `CHROMIUM_VERSION`. One patch per Chromium file, named after the file it
touches with `/` replaced by `-`, so `ls` here is an inventory of what this fork changes:

```
chrome-browser-ui-views-frame-browser_view.cc.patch
chrome-app-theme-chrome_unscaled_resources.grd.patch
```

Generated, never hand-edited. Change `chromium/src` as a normal tree and run
`./scripts/redrob.py export`; the directory is rewritten from the checkout's own diff.

## Rules that keep a rebase finishable

- **A file we add is not a patch.** New code belongs in this repository as a file and is copied or
  symlinked into the checkout by the build, so `patches/` stays a list of things we changed about
  Chromium rather than a mixture of that and things we wrote.
- **Prefer a flag, a pref or a resource over a code change.** A patch that flips a default is one line
  and survives upstream refactors; a patch inside a function body does not.
- **Nothing in `patches/` without a reason recorded in the commit.** The last fork inherited patches
  nobody could explain, which is how a fork ends up unable to move to the next release.
- **Watch the file list, not the line count.** 4,000 lines across ten files is cheap; 400 lines across
  ninety files is what makes every release a project.
