# The ownership boundary

Four owners, and a surface belongs to exactly one. This is the rule the delivery loop is built on; the queue in
`DELIVERY-LOOP.md` assigns every item an owner against it.

| owner | keeps | changing it costs |
|---|---|---|
| **native** (this fork) | window and tab layout, the address bar, first paint, OS integration, the installer, and the private capability surface itself | a full build, hours |
| **extension** | every pixel that is a document — settings, onboarding, the side panel, the new tab, dialogs | seconds |
| **engine** | all agent capability, and every setting that persists | minutes |
| **helper** | OS input, screen reading, on-device models — a separate signed process | its own release |

## The one crossing point

A surface in the extension reaches native capability **only** through a private extension API, gated to
component extensions (`"location": "component"`), never through an ad-hoc message channel or a new WebUI host.
One ad-hoc channel and the boundary is meaningless.

## What this gate enforces

Moving the UI out of C++ (phases 2–4 of the delivery loop) only pays off if the UI does not quietly grow back
inside the fork. So once the UI migration has begun — marked by the sentinel file
`sources/.ui-migration-began` — this gate FAILS the build if a **new** WebUI resource file appears under
`sources/chrome/browser/resources/` in one of the moved surfaces.

Before the sentinel exists the gate is dormant: today those directories still hold the WebUI we have not moved
yet, and failing on them would block every other item. The sentinel is committed by the FIRST phase-3 item
(O-2), which is the point after which a new WebUI file is a regression rather than the status quo.

The gate lists, in the sentinel file, the surfaces already migrated. A new `.ts`/`.css`/`.html` file under a
migrated surface's resource directory fails. Editing an existing file does not — a migration lands its final
deletions in its own phase (S-7, O-8, A-7), and until then the old files legitimately still exist.

This is a floor, not the whole rule. The reviewer still has to see that a moved surface is actually rendered by
the extension and not merely duplicated. The gate catches the cheap mistake — a new native UI file — which is
the one that slips through review because it compiles and looks normal.
