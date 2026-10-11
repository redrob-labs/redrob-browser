/**
 * The extension's and the onboarding page's icons: the Redrob design system's glyphs, under the names
 * the code already uses.
 *
 * The apps were written against lucide-react, whose icons are drawn on a different geometry -- round caps
 * and joins, free angles. The system's are a 24 box on a 20 live area, stroke 2, BUTT caps, miter joins,
 * every diagonal at 40 degrees (45-icons.md, quoted in @redrob-labs/ui's icon module). Mixing the two in
 * one row is the same drift as a transcribed colour: consistent with itself, wrong against every other
 * Redrob surface.
 *
 * So this module keeps lucide's NAMES and draws the system's GLYPHS. Swapping the import path moves every
 * call site at once with no other edit, and a name with no mapping here is a compile error rather than a
 * silently missing icon. Each mapping is justified in docs/ICONS.md; the ones that are a substitution
 * rather than an equivalent are marked there for a decision.
 *
 * Colour comes from currentColor and the token, never from the icon. Stroke width is NOT a prop: the
 * system's stroke is fixed at 2, so a caller's `strokeWidth` is accepted for compatibility and ignored.
 */

import { type IconName, icons } from '@redrob-labs/ui'
import {
  type CSSProperties,
  forwardRef,
  type ReactElement,
  type SVGProps,
} from 'react'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  /** Width and height in px. Without it the icon is 24, as lucide's were; a size-* class overrides it. */
  size?: number | string
  /** Ignored: the design system's stroke is 2, unscaled. Kept so existing call sites compile. */
  strokeWidth?: number | string
  /** Ignored, as strokeWidth. */
  absoluteStrokeWidth?: boolean
}

export type Icon = ReturnType<typeof glyph>
/** lucide's name for the component type, so `icon?: LucideIcon` props keep compiling. */
export type LucideIcon = Icon
export type LucideProps = IconProps

function glyph(name: IconName, displayName: string) {
  const Draw = icons[name]
  const Component = forwardRef<SVGSVGElement, IconProps>(function RedrobIcon(
    { size = 24, strokeWidth: _s, absoluteStrokeWidth: _a, className, ...rest },
    ref,
  ): ReactElement {
    return Draw({
      ...rest,
      ref,
      width: size,
      height: size,
      className: className ? `rr-icon ${className}` : 'rr-icon',
      'data-icon': name,
    } as SVGProps<SVGSVGElement>)
  })
  Component.displayName = displayName
  return Component
}

/**
 * The system's loading mark is not a glyph that spins: it is `.rr-spinner`, two raked ticks that pass
 * light between them (Streaming). lucide's Loader2 was always drawn with `animate-spin`, so that class is
 * dropped here -- rotating the system's spinner would be a second animation on top of its own.
 */
const Spinner = forwardRef<HTMLSpanElement, IconProps>(function RedrobSpinner(
  { size, className, style, 'aria-label': ariaLabel },
  ref,
) {
  const kept = (className ?? '')
    .split(/\s+/)
    .filter((c) => c && c !== 'animate-spin')
  // The spinner is sized by font-size. Read it from a size prop or the h-*/size-* class lucide was given.
  const fromClass = kept
    .map((c) => c.match(/^(?:size|h)-(\d+(?:\.5)?)$/)?.[1])
    .find(Boolean)
  const px =
    typeof size === 'number' ? size : fromClass ? Number(fromClass) * 4 : 16
  const shared = {
    ref,
    className: [
      'rr-spinner',
      ...kept.filter((c) => !/^(size|h|w)-/.test(c)),
    ].join(' '),
    style: { fontSize: `${px}px`, ...(style as CSSProperties) },
  }
  // Named, it is a live status a screen reader announces; unnamed, it is decoration beside text that
  // already says what is loading.
  return ariaLabel ? (
    <span {...shared} role="status" aria-label={ariaLabel} />
  ) : (
    <span {...shared} aria-hidden />
  )
})

// lucide name -> system glyph. Grouped as docs/ICONS.md groups them; that file gives the reason for each.
const MAP = {
  // Interface
  Check: 'check',
  X: 'close',
  Plus: 'plus',
  ChevronDown: 'chevronDown',
  ChevronUp: 'chevronUp',
  ChevronLeft: 'chevronLeft',
  ChevronRight: 'chevronRight',
  ChevronsUpDown: 'sort',
  ArrowDown: 'arrowDown',
  ArrowLeft: 'arrowLeft',
  ArrowRight: 'arrowRight',
  ArrowUpRight: 'arrowUpRight',
  ExternalLink: 'external',
  Search: 'search',
  Menu: 'menu',
  MoreHorizontal: 'more',
  GripVertical: 'dragHandle',
  PanelLeft: 'sidebar',
  Home: 'home',
  Settings: 'settings',
  Copy: 'copy',
  Pencil: 'edit',
  Trash2: 'trash',
  Undo2: 'undo',
  RotateCcw: 'restore',
  RefreshCw: 'refresh',
  Download: 'download',
  ArrowDownToLine: 'download',
  Upload: 'upload',
  Send: 'send',
  Paperclip: 'attachment',
  Link2: 'link',
  Play: 'play',
  Square: 'stop',
  SquareStop: 'stop',
  Keyboard: 'keyboard',
  CornerDownLeft: 'reply',
  // Status and feedback
  Info: 'info',
  AlertCircle: 'alert',
  CircleAlert: 'alert',
  AlertTriangle: 'warning',
  TriangleAlert: 'warning',
  CheckCircle: 'circleCheck',
  CheckCircle2: 'circleCheck',
  CircleCheck: 'circleCheck',
  XCircle: 'circleX',
  OctagonX: 'blocked',
  ShieldX: 'blocked',
  ShieldCheck: 'shieldCheck',
  CircleDashed: 'pending',
  Circle: 'dot',
  Dot: 'dot',
  Activity: 'pulse',
  ThumbsUp: 'success',
  ThumbsDown: 'flag',
  // Objects
  Book: 'book',
  Briefcase: 'briefcase',
  Bookmark: 'bookmark',
  Calendar: 'calendar',
  CalendarClock: 'calendarClock',
  Clock: 'clock',
  History: 'history',
  Cpu: 'cpu',
  Server: 'server',
  CreditCard: 'card',
  FileText: 'fileText',
  Folder: 'folder',
  FolderOpen: 'folderOpen',
  Globe: 'globe',
  Globe2: 'globe',
  Image: 'image',
  KeyRound: 'key',
  Lock: 'lock',
  Layers: 'stack',
  Blocks: 'grid',
  Lightbulb: 'lightbulb',
  Brain: 'lightbulb',
  MessageCircle: 'message',
  MessageSquare: 'message',
  MessageSquareHeart: 'comment',
  Mic: 'mic',
  Monitor: 'monitor',
  Moon: 'moon',
  Sun: 'sun',
  Palette: 'brush',
  Plug: 'plug',
  PlugZap: 'plug',
  User: 'user',
  VenetianMask: 'anonymous',
  Wrench: 'tool',
  MousePointer2: 'target',
  // Machine output and agents
  Sparkles: 'sparkle',
  Bot: 'sparkle',
} as const satisfies Record<string, IconName>

type Name = keyof typeof MAP
const table = Object.fromEntries(
  (Object.keys(MAP) as Name[]).flatMap((n) => {
    const C = glyph(MAP[n], n)
    return [
      [n, C],
      [`${n}Icon`, C],
    ]
  }),
) as Record<Name | `${Name}Icon`, Icon>

export const {
  Check,
  CheckIcon,
  X,
  XIcon,
  Plus,
  PlusIcon,
  ChevronDown,
  ChevronDownIcon,
  ChevronUp,
  ChevronUpIcon,
  ChevronLeft,
  ChevronLeftIcon,
  ChevronRight,
  ChevronRightIcon,
  ChevronsUpDown,
  ChevronsUpDownIcon,
  ArrowDown,
  ArrowDownIcon,
  ArrowLeft,
  ArrowLeftIcon,
  ArrowRight,
  ArrowRightIcon,
  ArrowUpRight,
  ArrowUpRightIcon,
  ExternalLink,
  ExternalLinkIcon,
  Search,
  SearchIcon,
  Menu,
  MenuIcon,
  MoreHorizontal,
  MoreHorizontalIcon,
  GripVertical,
  GripVerticalIcon,
  PanelLeft,
  PanelLeftIcon,
  Home,
  HomeIcon,
  Settings,
  SettingsIcon,
  Copy,
  CopyIcon,
  Pencil,
  PencilIcon,
  Trash2,
  Trash2Icon,
  Undo2,
  Undo2Icon,
  RotateCcw,
  RotateCcwIcon,
  RefreshCw,
  RefreshCwIcon,
  Download,
  DownloadIcon,
  ArrowDownToLine,
  ArrowDownToLineIcon,
  Upload,
  UploadIcon,
  Send,
  SendIcon,
  Paperclip,
  PaperclipIcon,
  Link2,
  Link2Icon,
  Play,
  PlayIcon,
  Square,
  SquareIcon,
  SquareStop,
  SquareStopIcon,
  Keyboard,
  KeyboardIcon,
  CornerDownLeft,
  CornerDownLeftIcon,
  Info,
  InfoIcon,
  AlertCircle,
  AlertCircleIcon,
  CircleAlert,
  CircleAlertIcon,
  AlertTriangle,
  AlertTriangleIcon,
  TriangleAlert,
  TriangleAlertIcon,
  CheckCircle,
  CheckCircleIcon,
  CheckCircle2,
  CheckCircle2Icon,
  CircleCheck,
  CircleCheckIcon,
  XCircle,
  XCircleIcon,
  OctagonX,
  OctagonXIcon,
  ShieldX,
  ShieldXIcon,
  ShieldCheck,
  ShieldCheckIcon,
  CircleDashed,
  CircleDashedIcon,
  Circle,
  CircleIcon,
  Dot,
  DotIcon,
  Activity,
  ActivityIcon,
  ThumbsUp,
  ThumbsUpIcon,
  ThumbsDown,
  ThumbsDownIcon,
  Book,
  BookIcon,
  Bookmark,
  BookmarkIcon,
  Briefcase,
  BriefcaseIcon,
  Calendar,
  CalendarIcon,
  CalendarClock,
  CalendarClockIcon,
  Clock,
  ClockIcon,
  History,
  HistoryIcon,
  Cpu,
  CpuIcon,
  Server,
  ServerIcon,
  CreditCard,
  CreditCardIcon,
  FileText,
  FileTextIcon,
  Folder,
  FolderIcon,
  FolderOpen,
  FolderOpenIcon,
  Globe,
  GlobeIcon,
  Globe2,
  Globe2Icon,
  Image,
  ImageIcon,
  KeyRound,
  KeyRoundIcon,
  Lock,
  LockIcon,
  Layers,
  LayersIcon,
  Blocks,
  BlocksIcon,
  Lightbulb,
  LightbulbIcon,
  Brain,
  BrainIcon,
  MessageCircle,
  MessageCircleIcon,
  MessageSquare,
  MessageSquareIcon,
  MessageSquareHeart,
  MessageSquareHeartIcon,
  Mic,
  MicIcon,
  Monitor,
  MonitorIcon,
  Moon,
  MoonIcon,
  Sun,
  SunIcon,
  Palette,
  PaletteIcon,
  Plug,
  PlugIcon,
  PlugZap,
  PlugZapIcon,
  User,
  UserIcon,
  VenetianMask,
  VenetianMaskIcon,
  Wrench,
  WrenchIcon,
  MousePointer2,
  MousePointer2Icon,
  Sparkles,
  SparklesIcon,
  Bot,
  BotIcon,
} = table

export const Loader2 = Spinner
export const Loader2Icon = Spinner
export const LoaderCircle = Spinner
export const LoaderCircleIcon = Spinner

/** For a test or a doc: every name this module answers and the glyph it draws. */
export const ICON_MAP: Readonly<Record<string, IconName | 'spinner'>> = {
  ...MAP,
  Loader2: 'spinner',
  LoaderCircle: 'spinner',
}
