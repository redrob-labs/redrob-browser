# Icons in the extension and the onboarding page

Every interface icon in `agent/apps/app` and `agent/apps/app-onboard` is a glyph from `@redrob-labs/ui`, drawn
through `agent/packages/icons` (`@browseros/icons`).

That package keeps lucide-react's component **names** and draws the system's **glyphs**, so the migration was one
import path per file and a name with no mapping is a compile error. `bun run check:ui-icons` fails on any import
from another icon set and on any round stroke cap or join in our own source. The UI capture counts
`foreignIcons` and `roundIcons` on every screen, and both are 0.

Brand marks (a provider's or an agent's logo from `@lobehub/icons`, or `agent-brand-marks.tsx`) are artwork in
their owner's geometry. They are not interface icons and are not redrawn.

## The geometry, and why lucide could not stay

The system's icon module states the spec it was drawn to:
- a 24 box on a 20 live area
- stroke 2, unscaled
- **butt** caps ("Never round")
- miter joins at limit 3
- every diagonal at 40°

lucide draws round caps and joins at free angles. The two sets side by side read as two products. So `strokeWidth`
is accepted for compatibility and ignored: the stroke is the system's.

## The mapping

The mapping is code: `MAP` in `agent/packages/icons/src/index.tsx`. The reasons are recorded here.

| lucide | glyph | reason |
|---|---|---|
| Check, X, Plus, Search, Menu, Home, Settings, Copy, Download, Upload, Send, Play, Keyboard, Info, Lock, Mic, Monitor, Moon, Sun, User, Calendar, CalendarClock, Clock, History, Cpu, Server, Folder, FolderOpen, Globe, Image, Book, Bookmark, Lightbulb, ShieldCheck, FileText | same name | Direct equivalents |
| ChevronDown/Up/Left/Right, ArrowDown/Left/Right/UpRight | chevron*, arrow* | Direct equivalents |
| ChevronsUpDown | `sort` | The up/down pair is the system's sort control |
| ExternalLink | `external` | |
| MoreHorizontal | `more` | |
| GripVertical | `dragHandle` | |
| PanelLeft | `sidebar` | |
| Pencil | `edit` | |
| Trash2 | `trash` | |
| Undo2 | `undo` | |
| RefreshCw | `refresh` | Clockwise is refresh in the system; counter-clockwise is history |
| RotateCcw | `restore` | Used for retry or reset after a failure: putting back, not looking back |
| ArrowDownToLine | `download` | |
| Paperclip | `attachment` | |
| Link2 | `link` | |
| Square, SquareStop | `stop` | Every site is a stop control for a running task |
| AlertCircle, CircleAlert | `alert` | |
| AlertTriangle, TriangleAlert | `warning` | |
| CheckCircle, CheckCircle2, CircleCheck | `circleCheck` | |
| XCircle | `circleX` | |
| OctagonX, ShieldX | `blocked` | Status group: withheld |
| CircleDashed | `pending` | "A wait with no time" |
| Activity | `pulse` | |
| Layers | `stack` | |
| Blocks | `grid` | A custom agent built from parts |
| Brain | `lightbulb` | Imported but rendered nowhere today |
| MessageCircle, MessageSquare | `message` | |
| MessageSquareHeart | `comment` | Feedback on an answer |
| KeyRound | `key` | Access granted |
| CreditCard | `card` | |
| Palette | `brush` | Appearance, under Customize |
| Plug, PlugZap | `plug` | Connected apps |
| VenetianMask | `anonymous` | |
| Wrench | `tool` | |
| Sparkles | `sparkle` | "For generated content only": every site marks AI output or an AI action |
| Loader2, LoaderCircle | `.rr-spinner` | The system's loading mark is two raked ticks passing light, not a glyph that rotates. `animate-spin` is dropped |

## Substitutions awaiting a decision

These have no equivalent among the 260 glyphs. Each is drawn with the nearest glyph whose meaning holds, never
with a hand-drawn one. Each should be confirmed, or have a glyph added upstream in `@redrob-labs/ui`.

| lucide | drawn as | where | the question |
|---|---|---|---|
| Bot | `sparkle` | Agent identity: provider list, agent picker | The system reserves `sparkle` for generated content. An agent is a producer of it, not the content itself. Is there to be an agent glyph? |
| ThumbsUp | `success` | Answer feedback in the side panel | The system has no approval-gesture glyph |
| ThumbsDown | `flag` | Answer feedback in the side panel | Same. `flag` reads as "report", which is what a thumbs-down sends |
| MousePointer2 | `target` | The side panel's "act on the page" mode | No cursor glyph. `target` is "act here" |
| Circle | `dot` | An unselected import source; the radio indicator in a menu | The system draws radios with `.rr-choice`, not an icon. Phase 3 replaces both sites with the real control |
| CornerDownLeft | `reply` | The send hint on the composer | No return-key glyph; `reply` is the same hooked arrow |
| Github | `@lobehub/icons` Github | GitHub Copilot in the provider list | A logo, not an icon. It now comes from the brand set the other providers already use |
