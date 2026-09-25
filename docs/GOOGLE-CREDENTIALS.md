# Preparing for Google OAuth credentials

## Nothing was removed — it was never supplied

Sign-in, sync and every other Google-backed feature are gated on three values Chromium does not ship in
its public tree: an API key, an OAuth client id and a client secret. Google's own builds get them from
`google_apis/internal/`, which is not public. Without them Chromium substitutes the sentinel
`dummytoken`, and the features are inert.

This is a missing input, not a regression, and no environment variable of ours turned anything off.
Proof, from the browser's own startup log in this fork:

```
API key GOOGLE_API_KEY=dummytoken
```

And the surface returns the moment credentials exist. With three deliberately fake values exported,
`chrome://settings/people` renders the sign-in card — "Make Redrob your own … sign in to Redrob" with a
**Sign in to Redrob** button — where with no credentials the same page shows no sign-in row at all, and
`chrome://settings/syncSetup` redirects away. Both states verified on screen. The button's text is
already ours; nothing about the UI needs building. The only missing thing is the credentials.

Note what this also settles: **bookmark sync is that card.** It is not a feature this browser has yet to
write — it is Chrome Sync, behind sign-in, behind these three values.

## How to supply them

Chromium resolves each value in this order, later winning: the baked-in build default, the environment,
a `--gaia-config` file, then a command-line switch. Two of those matter here.

**For trying credentials out, before touching the build:** export them and run the existing binary. No
rebuild.

```
GOOGLE_API_KEY=… GOOGLE_DEFAULT_CLIENT_ID=… GOOGLE_DEFAULT_CLIENT_SECRET=… ./chrome
```

**For a build that ships:** a product cannot ask a user to export a variable before signing in, so a
released binary has to carry them. `scripts/redrob.py build` now appends the matching GN args for
whichever of those three variables the environment carries, into the generated `out/<flavour>/args.gn`.

They are deliberately NOT in `build/args/*.gn`: those files are committed, and a committed key is a
published key. The generated `args.gn` lives in the build directory and is not tracked. Values are never
printed — only the names of the variables found, and a warning when the set is incomplete, because
sign-in needs the id and the secret together and a key alone yields a browser that still cannot sign in.

In CI, pass them to the build step as environment variables from repository secrets. Nothing else needs
to change.

## What to weigh before shipping them

A key inside a distributed binary is extractable by anyone who has the binary. That is equally true of
the official browser, so it is not a reason to avoid this — it is a reason to read the terms the
credentials are issued under, and to know that quota and abuse are attributed to whoever owns them. That
is a decision for whoever accepts those terms, and no build-system change can mitigate it.

Also worth knowing before the first signed-in test: the features that come back are not only sync.
Safe Browsing lookups, the account password store, Google Pay autofill, translate, enhanced spell check
and image descriptions all begin working, and several of them send page content to Google. They are
honestly labelled in the UI, but this fork also has an engine that could do some of that work locally,
so which of them should be on by default is a product choice that arrives with the credentials rather
than after them.
