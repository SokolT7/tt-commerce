"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";

/* ==========================================================================
   Icons — one consistent 1.6px stroke, 24px grid, currentColor.
   Emoji were replaced because they render differently on every platform and
   read as a placeholder rather than a designed mark.
   ========================================================================== */

type IconProps = { size?: number; className?: string; strokeWidth?: number };

const svg = (path: ReactNode, filled = false) =>
  function Icon({ size = 20, className, strokeWidth = 1.6 }: IconProps) {
    return (
      <svg
        width={size} height={size} viewBox="0 0 24 24" className={className}
        fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"
      >{path}</svg>
    );
  };

export const IconBag = svg(<><path d="M6.5 8h11l.9 11.2a2 2 0 0 1-2 2.2H7.6a2 2 0 0 1-2-2.2L6.5 8Z" /><path d="M9.2 8V6.4a2.8 2.8 0 0 1 5.6 0V8" /></>);
export const IconOrders = svg(<><path d="M4.2 8.4 12 4l7.8 4.4v7.2L12 20l-7.8-4.4V8.4Z" /><path d="M4.4 8.5 12 12.8l7.6-4.3" /><path d="M12 12.8V20" /></>);
export const IconPin = svg(<><path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z" /><circle cx="12" cy="10.6" r="2.4" /></>);
export const IconSeat = svg(<><path d="M7 5h2.6a2 2 0 0 1 2 1.8l.7 6.7" /><path d="M6.4 13.5h11.2a2 2 0 0 1 2 2.2l-.3 2.8a2 2 0 0 1-2 1.8H8.9a2 2 0 0 1-2-1.7l-.5-5.1Z" /></>);
export const IconClock = svg(<><circle cx="12" cy="12" r="8.2" /><path d="M12 7.4V12l3 1.8" /></>);
export const IconCheck = svg(<path d="M5 12.8 9.6 17.2 19 7.4" strokeWidth={2} />);
export const IconArrowLeft = svg(<><path d="M19 12H5.6" /><path d="M11 5.6 4.6 12l6.4 6.4" /></>);
export const IconArrowRight = svg(<><path d="M5 12h13.4" /><path d="M13 5.6 19.4 12 13 18.4" /></>);
export const IconPlus = svg(<><path d="M12 5.6v12.8" /><path d="M5.6 12h12.8" /></>);
export const IconMinus = svg(<path d="M5.6 12h12.8" />);
export const IconClose = svg(<><path d="M6.4 6.4l11.2 11.2" /><path d="M17.6 6.4 6.4 17.6" /></>);
export const IconPlane = svg(<path d="M10.2 20.4 12 15l6.6 2 1.2-1.8-5.4-3.6 1.6-4.4a1.6 1.6 0 0 0-2.6-1.7L9.9 9.1 4.6 7.4 3.4 9.2l4.5 3.2-1.4 4 1.5.5 2.2-3.9" />);
export const IconStore = svg(<><path d="M4.6 9.6 6 4.8h12l1.4 4.8" /><path d="M4.6 9.6a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 4.4 0 2.6 2.6 0 0 0 5.2 0" /><path d="M6 11.8v6.4a1.4 1.4 0 0 0 1.4 1.4h9.2a1.4 1.4 0 0 0 1.4-1.4v-6.4" /></>);
export const IconLock = svg(<><rect x="5" y="10.4" width="14" height="9.4" rx="2.2" /><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" /></>);
export const IconAlert = svg(<><circle cx="12" cy="12" r="8.4" /><path d="M12 7.8v4.8" /><path d="M12 16.1h.01" strokeWidth={2.2} /></>);
export const IconSparkle = svg(<path d="M12 4.4 13.6 9.4 18.6 11 13.6 12.6 12 17.6 10.4 12.6 5.4 11l5-1.6L12 4.4Z" />);
export const IconRobot = svg(<><rect x="4.6" y="8" width="14.8" height="11.4" rx="3" /><path d="M12 8V5.2" /><circle cx="12" cy="4.2" r="1.2" fill="currentColor" stroke="none" /><path d="M9.4 13.2h.01M14.6 13.2h.01" strokeWidth={2.4} /></>);

/* ==========================================================================
   Buttons
   ========================================================================== */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  full?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary", size = "md", full, loading, icon, children, className = "", disabled, ...rest
}: ButtonProps) {
  const sizes = {
    sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-[10px]",
    md: "h-11 px-5 text-[15px] gap-2 rounded-[12px]",
    lg: "h-[54px] px-6 text-[16px] gap-2 rounded-[14px]",
  }[size];

  const variants = {
    primary: "text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hi)] shadow-[var(--shadow-accent)]",
    secondary: "bg-white text-[var(--color-ink)] border border-[var(--color-line)] hover:border-[var(--color-line-strong)] shadow-[var(--shadow-xs)]",
    ghost: "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]",
    danger: "text-white bg-[var(--color-alert)] hover:brightness-110",
  }[variant];

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`pressable inline-flex items-center justify-center font-semibold
        disabled:opacity-40 disabled:pointer-events-none
        ${sizes} ${variants} ${full ? "w-full" : ""} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ==========================================================================
   Surfaces
   ========================================================================== */

export function Card({
  children, className = "", onClick, interactive, style,
}: {
  children: ReactNode; className?: string; onClick?: () => void;
  interactive?: boolean; style?: React.CSSProperties;
}) {
  const base = "bg-white rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]";
  if (onClick || interactive) {
    return (
      <button onClick={onClick} style={style}
        className={`pressable block w-full text-left ${base} hover:shadow-[var(--shadow-md)] ${className}`}>
        {children}
      </button>
    );
  }
  return <div style={style} className={`${base} ${className}`}>{children}</div>;
}

/** Merchant identity as a tinted monogram rather than a coloured rail on the
 *  card edge — the rail is the most common generated-UI tell there is. */
export function Monogram({ name, colour, size = 44 }: { name: string; colour: string; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center font-semibold"
      style={{
        width: size, height: size, borderRadius: size * 0.32,
        background: `color-mix(in srgb, ${colour} 13%, white)`,
        color: colour, fontSize: size * 0.36, letterSpacing: "-0.02em",
      }}
    >{initials}</span>
  );
}

export function Pill({
  children, tone = "neutral", className = "",
}: { children: ReactNode; tone?: "neutral" | "accent" | "signal" | "alert"; className?: string }) {
  const tones = {
    neutral: "bg-[var(--color-surface-2)] text-[var(--color-ink-2)]",
    accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]",
    signal: "bg-[var(--color-signal-soft)] text-[var(--color-signal)]",
    alert: "bg-[var(--color-alert-soft)] text-[var(--color-alert)]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${tones} ${className}`}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "accent", title, children, icon,
}: { tone?: "accent" | "signal" | "alert"; title: string; children?: ReactNode; icon?: ReactNode }) {
  const tones = {
    accent: { bg: "var(--color-accent-soft)", fg: "var(--color-accent-ink)" },
    signal: { bg: "var(--color-signal-soft)", fg: "var(--color-signal)" },
    alert: { bg: "var(--color-alert-soft)", fg: "var(--color-alert)" },
  }[tone];
  return (
    <div className="rise flex gap-3 rounded-[var(--radius-lg)] p-4" style={{ background: tones.bg }}>
      {icon && <span className="mt-0.5 shrink-0" style={{ color: tones.fg }}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-[14px] font-semibold" style={{ color: tones.fg }}>{title}</p>
        {children && <div className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)] prose-balance">{children}</div>}
      </div>
    </div>
  );
}

/* Bottom sheet — enters from the edge it will leave by, so a downward swipe
   to dismiss feels like the obvious gesture even before it is supported. */
export function Sheet({
  children, onClose, title, footer,
}: { children: ReactNode; onClose: () => void; title?: string; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button aria-label="Close" onClick={onClose}
        className="fade-in absolute inset-0 bg-[rgba(16,20,19,0.42)] backdrop-blur-[2px]" />
      <div className="sheet-up relative mx-auto flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[var(--radius-2xl)] bg-white shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <span className="mx-auto h-1 w-9 rounded-full bg-[var(--color-surface-3)]" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pb-3">
            <h2 className="headline text-[20px] font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Close"
              className="pressable grid h-9 w-9 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-2)]">
              <IconClose size={17} />
            </button>
          </div>
        )}
        <div className="no-bar flex-1 overflow-y-auto px-5 pb-2">{children}</div>
        {footer && <div className="border-t border-[var(--color-line)] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ==========================================================================
   Loading — skeletons shaped like the content, not a spinner
   ========================================================================== */

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 rounded-[var(--radius-lg)] bg-white p-4 shadow-[var(--shadow-sm)]">
          <div className="skeleton h-11 w-11 shrink-0 rounded-[14px]" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5" style={{ width: `${58 + ((i * 13) % 30)}%` }} />
            <div className="skeleton h-3" style={{ width: `${34 + ((i * 17) % 26)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Staggered mount. A list that appears all at once reads as a page load;
 *  one that cascades reads as the app responding. Capped so long lists do
 *  not leave the last row waiting. */
export function Stagger({ children, step = 45, max = 8 }: { children: ReactNode[]; step?: number; max?: number }) {
  return (
    <>
      {children.map((child, i) => (
        <div key={i} className="rise" style={{ animationDelay: `${Math.min(i, max) * step}ms` }}>
          {child}
        </div>
      ))}
    </>
  );
}

export function EmptyState({
  icon, title, body, action,
}: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rise flex flex-col items-center px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-[var(--color-surface-2)] text-[var(--color-muted)]">
        {icon}
      </div>
      <h2 className="headline mt-5 text-[19px] font-semibold">{title}</h2>
      <p className="prose-balance mt-1.5 max-w-[30ch] text-[14.5px] leading-relaxed text-[var(--color-ink-2)]">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
