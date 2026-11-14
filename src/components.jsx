import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  X,
  ChevronRight,
  Search,
  Check,
  Inbox,
  LoaderCircle,
  GraduationCap,
  ShieldCheck,
  School,
  BriefcaseBusiness,
  UserRound,
  LayoutDashboard,
  UsersRound,
  Mail,
  ScanFace,
  Printer,
  Palette,
  BookOpen,
  Layers3,
  Settings2,
  Image,
  Upload,
  Bell,
  HelpCircle,
  LogOut,
  Plus,
  Download,
  CheckCheck,
  Clock3,
  CircleAlert,
  Copy,
  MoreHorizontal,
  ExternalLink,
  Camera,
  FileText,
  ChevronDown,
  SlidersHorizontal,
  ArrowUpRight,
  Trash2,
  Pencil,
  Eye,
  Menu,
  ArrowLeft,
  RefreshCw,
  CircleCheck,
  Send,
  CalendarDays,
  Sparkles,
  CirclePlay,
  CheckCircle2,
  Package,
  Truck,
  BadgeCheck,
  ListFilter,
  ArrowUp,
  MoveRight,
  Shield,
  ClipboardCheck,
  FolderOpen,
  FileUp,
  FileDown,
  LockKeyhole,
  Building2,
  CreditCard,
  CircleDot,
  ChevronLeft,
  RotateCcw,
} from "lucide-react";
import { initials, cardPDF, parentName } from "./lib.js";
import { PARENT_PREFIXES } from "./data.js";
const icons = {
  arrow: ArrowRight,
  x: X,
  chevron: ChevronRight,
  search: Search,
  check: Check,
  inbox: Inbox,
  loader: LoaderCircle,
  graduation: GraduationCap,
  shield: ShieldCheck,
  school: School,
  briefcase: BriefcaseBusiness,
  user: UserRound,
  dashboard: LayoutDashboard,
  students: UsersRound,
  email: Mail,
  face: ScanFace,
  print: Printer,
  design: Palette,
  guide: BookOpen,
  layers: Layers3,
  settings: Settings2,
  image: Image,
  upload: Upload,
  bell: Bell,
  help: HelpCircle,
  logout: LogOut,
  plus: Plus,
  download: Download,
  checks: CheckCheck,
  clock: Clock3,
  alert: CircleAlert,
  copy: Copy,
  more: MoreHorizontal,
  external: ExternalLink,
  camera: Camera,
  file: FileText,
  down: ChevronDown,
  filter: SlidersHorizontal,
  upRight: ArrowUpRight,
  trash: Trash2,
  edit: Pencil,
  eye: Eye,
  menu: Menu,
  back: ArrowLeft,
  refresh: RefreshCw,
  success: CircleCheck,
  send: Send,
  calendar: CalendarDays,
  sparkles: Sparkles,
  play: CirclePlay,
  checkCircle: CheckCircle2,
  package: Package,
  truck: Truck,
  badge: BadgeCheck,
  list: ListFilter,
  up: ArrowUp,
  move: MoveRight,
  shieldPlain: Shield,
  review: ClipboardCheck,
  folder: FolderOpen,
  fileUp: FileUp,
  fileDown: FileDown,
  lock: LockKeyhole,
  building: Building2,
  card: CreditCard,
  dot: CircleDot,
  left: ChevronLeft,
  reset: RotateCcw,
};
export function Icon({ name, size = 18, ...props }) {
  const C = icons[name] || CircleDot;
  return <C size={size} strokeWidth={1.7} {...props} />;
}
export function Button({
  children,
  icon,
  onClick,
  variant = "primary",
  className = "",
  ...rest
}) {
  return (
    <button
      type="button"
      className={`btn ${variant} ${className}`}
      onClick={onClick}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
    </button>
  );
}
export function IconButton({ icon, label, ...rest }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
export function Badge({ children, tone }) {
  const tones = {
    Approved: "green",
    Delivered: "green",
    Active: "green",
    "In review": "amber",
    Reviewed: "green",
    "Ready for review": "amber",
    "In progress": "blue",
    Printed: "purple",
    Invited: "blue",
    Draft: "gray",
    "Changes requested": "red",
    Inactive: "gray",
    Premium: "coral",
    Regular: "gray",
    Queued: "blue",
    Email: "blue",
  };
  return (
    <span className={`badge ${tone || tones[children] || "gray"}`}>
      <i />
      {children}
    </span>
  );
}
export function Avatar({ name, size = 36, color = "", photo }) {
  return (
    <span
      className={`avatar ${color}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  );
}
export function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
export function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Field({
  label,
  error,
  hint,
  children,
  required,
  className = "",
}) {
  return (
    <label className={`field ${className}`}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {error ? (
        <small className="error">{error}</small>
      ) : (
        hint && <small>{hint}</small>
      )}
    </label>
  );
}
export function ParentPrefixSelect({ type, value = "", onChange }) {
  const options = PARENT_PREFIXES[type];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No prefix</option>
      {value && !options.includes(value) && <option>{value}</option>}
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

export function ExtraField({ field, value = "", error, onChange }) {
  return (
    <Field label={field.name} required={field.required} error={error}>
      {field.type === "select" ? (
        <select
          value={value}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose an option</option>
          {value && !field.options.includes(value) && (
            <option value={value}>{value} (previous)</option>
          )}
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="search-box">
      <Icon name="search" size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <IconButton
          icon="x"
          label="Clear search"
          onClick={() => onChange("")}
        />
      )}
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  text = "Your records will appear here.",
  action,
}) {
  return (
    <div className="empty">
      <span>
        <Icon name="inbox" size={30} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export const FeedbackContext = createContext(null);

export function Feedback({ inline = false }) {
  const feedback = useContext(FeedbackContext);
  if (!feedback) return null;
  const { message, tone, dismiss } = feedback;
  return (
    <div
      role="status"
      className={`${inline ? "modal-feedback" : "toast"} ${tone}`}
    >
      <Icon name={tone === "error" ? "alert" : "checkCircle"} size={20} />
      <span>{message}</span>
      <IconButton icon="x" label="Dismiss message" onClick={dismiss} />
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  placement,
}) {
  const dialogRef = useRef(null);
  const backdropPress = useRef(false);
  const titleId = useId();
  const subtitleId = useId();
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const viewport = window.visualViewport;
    const resize = () => {
      dialog.style.setProperty(
        "--dialog-viewport-top",
        `${viewport.offsetTop}px`,
      );
      if (viewport.scale > 1) {
        dialog.style.setProperty(
          "--dialog-viewport-left",
          `${viewport.offsetLeft}px`,
        );
        dialog.style.setProperty(
          "--dialog-viewport-width",
          `${viewport.width}px`,
        );
      } else {
        dialog.style.removeProperty("--dialog-viewport-left");
        dialog.style.removeProperty("--dialog-viewport-width");
      }
      dialog.style.setProperty(
        "--dialog-viewport-height",
        `${viewport.height}px`,
      );
    };
    if (viewport) {
      resize();
      viewport.addEventListener("resize", resize);
      viewport.addEventListener("scroll", resize);
    }
    dialog.showModal();
    dialog.querySelector("[data-initial-focus]")?.focus();
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={`modal-overlay${placement === "top" ? " modal-overlay--top" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      onPointerDown={(e) => {
        backdropPress.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropPress.current) onClose?.();
      }}
    >
      <div className={`modal${wide ? " wide" : ""}`}>
        <div className="modal-bar">
          <div className="modal-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle && <p id={subtitleId}>{subtitle}</p>}
            </div>
            <IconButton
              icon="x"
              label="Close dialog"
              onClick={onClose}
              disabled={!onClose}
            />
          </div>
          <Feedback inline />
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Callout({ icon = "help", children, tone = "blue" }) {
  return (
    <div className={`callout ${tone}`}>
      <Icon name={icon} size={19} />
      <div>{children}</div>
    </div>
  );
}
export function CardPreview({
  student,
  school,
  small = false,
  design = "Classic",
  back = false,
}) {
  return (
    <div
      className={`id-card ${small ? "small" : ""} ${design === "Campus" ? "campus" : ""}`}
    >
      <div className="id-card-head">
        <span className="school-mark">
          <Icon name="graduation" size={small ? 18 : 26} />
        </span>
        <div>
          <strong>{school?.name || "Greenwood Public School"}</strong>
          <span>LEARN. GROW. BELONG.</span>
        </div>
      </div>
      {back ? (
        <div className="id-card-back">
          <strong>In case of emergency</strong>
          <p>{parentName(student, "father") || "Parent / guardian"}</p>
          <p>{student?.phone || "Contact number"}</p>
          <div className="rule" />
          <small>{student?.address || school?.address}</small>
          <p className="id-disclaimer">
            This is a sample card for design review.
          </p>
        </div>
      ) : (
        <>
          <div className="id-card-main">
            <img
              src={student?.photo || undefined}
              alt={student?.photo ? "Sample student portrait" : ""}
              className={!student?.photo ? "no-photo" : ""}
            />
            <span className="id-type">STUDENT IDENTITY</span>
            <strong>{student?.name || "Aarav Sharma"}</strong>
            <span>
              Class {student?.classNo || "6"}
              {student?.section ? ` · ${student.section}` : ""} <i />{" "}
              {student?.session || "2026–27"}
            </span>
          </div>
          <div className="id-card-data">
            {(!student || student.admission) && (
              <div>
                <span>ADMISSION NO.</span>
                <strong>{student?.admission || "2026001"}</strong>
              </div>
            )}
            {(!student || student.blood) && (
              <div>
                <span>BLOOD GROUP</span>
                <strong>{student?.blood || "O+"}</strong>
              </div>
            )}
          </div>
          <div className="barcode" />
          <div className="id-card-footer">
            {student?.id || "ST-0001"} <span>PREVIEW</span>
          </div>
        </>
      )}
    </div>
  );
}
export function Steps({ items, current }) {
  return (
    <div className="steps">
      {items.map((x, i) => (
        <React.Fragment key={x}>
          <div
            className={i === current ? "current" : i < current ? "done" : ""}
          >
            <span>{i < current ? <Icon name="check" size={14} /> : i + 1}</span>
            <b>{x}</b>
          </div>
          {i < items.length - 1 && <i />}
        </React.Fragment>
      ))}
    </div>
  );
}

export function PDFProofButton({ students, school, design, disabled = false }) {
  const [busy, setBusy] = useState(false),
    [url, setURL] = useState(""),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <span className="proof-button-group">
      {url ? (
        <>
          <a
            className="btn primary"
            href={url}
            download="id-studio-card-proof.pdf"
          >
            <Icon name="download" size={15} />
            Save PDF
          </a>
          <a
            className="btn secondary"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="eye" size={15} />
            Preview PDF
          </a>
        </>
      ) : (
        <Button
          disabled={disabled || busy}
          icon={busy ? "loader" : "card"}
          variant="secondary"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const blob = await cardPDF(students, school, design);
              setURL(URL.createObjectURL(blob));
            } catch (e) {
              setError("The proof could not be generated. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparing proof…" : "Generate card proofs"}
        </Button>
      )}
      {error && <small className="error">{error}</small>}
    </span>
  );
}
