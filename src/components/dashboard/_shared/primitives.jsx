// Shared UI primitives for every Project Tool in CoE.
// Built 2026-04-24 as part of the overnight tooling sprint.
// Consumers: VFX Lab, Sector Map, Campaign Bible, DM Canvas, Ship Builder,
// Sound Forge, Skippy Voice Studio, Skippy Editor, Project Tools Hub.
//
// Design goals:
//   - Zero external deps (no react-hot-toast, no @radix-ui).
//   - Match the existing inline-hex palette used in ProjectToolsHub.jsx.
//   - Accessible by default (role, aria-label, focus trap on modals).
//   - Every primitive has a unit test in ./__tests__/primitives.test.jsx.
//
// NOTE: We intentionally keep these primitives styling-light. Tool-specific
// skinning should wrap or compose, not re-invent.

import React, { useCallback, useEffect, useRef, useState, createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Shared palette — single source so every primitive stays visually coherent.
// These mirror the ad-hoc hexes that appear across dashboard tool files.
// ---------------------------------------------------------------------------
export const PALETTE = {
    bg: '#050d14',
    panel: '#0a1520',
    panelRaised: '#0e2030',
    border: '#1e293b',
    borderStrong: '#334155',
    text: '#e2e8f0',
    textMuted: '#64748b',
    accent: '#22d3ee',
    accentFaint: '#0e2a3a',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
};

// ---------------------------------------------------------------------------
// Toast system — replaces the ubiquitous `console.warn`/`console.error`
// silent-failure pattern across tools. Provider at app root, useToast() hook
// anywhere below.
// ---------------------------------------------------------------------------

const ToastContext = createContext(null);
let _toastIdSeq = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const push = useCallback((toast) => {
        const id = ++_toastIdSeq;
        const entry = {
            id,
            kind: toast.kind || 'info', // 'info' | 'success' | 'warning' | 'error'
            title: toast.title || '',
            body: toast.body || '',
            ttlMs: toast.ttlMs == null ? (toast.kind === 'error' ? 8000 : 4000) : toast.ttlMs,
        };
        setToasts((prev) => [...prev, entry]);
        if (entry.ttlMs > 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, entry.ttlMs);
        }
        return id;
    }, []);

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const value = { push, dismiss, toasts };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastRail toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Degrade gracefully — if no provider, fall back to console.
        return {
            info: (title, body) => console.info(`[toast:info] ${title}`, body || ''),
            success: (title, body) => console.info(`[toast:success] ${title}`, body || ''),
            warning: (title, body) => console.warn(`[toast:warning] ${title}`, body || ''),
            error: (title, body) => console.error(`[toast:error] ${title}`, body || ''),
            push: (t) => console.warn('[toast:no-provider]', t),
            dismiss: () => {},
        };
    }
    return {
        info: (title, body) => ctx.push({ kind: 'info', title, body }),
        success: (title, body) => ctx.push({ kind: 'success', title, body }),
        warning: (title, body) => ctx.push({ kind: 'warning', title, body }),
        error: (title, body) => ctx.push({ kind: 'error', title, body }),
        push: ctx.push,
        dismiss: ctx.dismiss,
    };
}

function ToastRail({ toasts, onDismiss }) {
    if (!toasts.length) return null;
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="toast-rail"
            style={{
                position: 'fixed',
                right: 16,
                bottom: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                zIndex: 9999,
                maxWidth: 360,
                pointerEvents: 'none',
            }}
        >
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
            ))}
        </div>
    );
}

const TOAST_ACCENT = {
    info: PALETTE.accent,
    success: PALETTE.success,
    warning: PALETTE.warning,
    error: PALETTE.danger,
};

function ToastItem({ toast, onDismiss }) {
    return (
        <div
            role={toast.kind === 'error' ? 'alert' : 'status'}
            data-testid={`toast-${toast.kind}`}
            style={{
                pointerEvents: 'auto',
                background: PALETTE.panel,
                border: `1px solid ${PALETTE.border}`,
                borderLeft: `3px solid ${TOAST_ACCENT[toast.kind]}`,
                borderRadius: 4,
                padding: '10px 12px',
                color: PALETTE.text,
                fontSize: 12,
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title ? (
                    <div style={{ color: TOAST_ACCENT[toast.kind], fontWeight: 600, marginBottom: 2 }}>
                        {toast.title}
                    </div>
                ) : null}
                {toast.body ? (
                    <div style={{ color: PALETTE.textMuted, lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {toast.body}
                    </div>
                ) : null}
            </div>
            <button
                onClick={onDismiss}
                aria-label="Dismiss"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: PALETTE.textMuted,
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0,
                    lineHeight: 1,
                }}
            >
                ×
            </button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TabBar — replaces the 3+ inline tab-strip implementations we found across
// VFX Lab, Sound Forge, Campaign Bible, DM Canvas.
// ---------------------------------------------------------------------------

export function TabBar({ tabs, activeId, onChange, dense = false }) {
    return (
        <div
            role="tablist"
            data-testid="tab-bar"
            style={{
                display: 'flex',
                gap: 2,
                borderBottom: `1px solid ${PALETTE.border}`,
                background: PALETTE.panel,
            }}
        >
            {tabs.map((t) => {
                const isActive = t.id === activeId;
                return (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${t.id}`}
                        onClick={() => onChange(t.id)}
                        disabled={t.disabled}
                        style={{
                            padding: dense ? '5px 10px' : '8px 14px',
                            background: isActive ? PALETTE.accentFaint : 'transparent',
                            border: 'none',
                            borderBottom: isActive ? `2px solid ${PALETTE.accent}` : '2px solid transparent',
                            color: isActive ? PALETTE.accent : PALETTE.text,
                            opacity: t.disabled ? 0.4 : 1,
                            cursor: t.disabled ? 'not-allowed' : 'pointer',
                            fontSize: dense ? 11 : 12,
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        {t.icon ? <span style={{ fontSize: dense ? 12 : 14 }}>{t.icon}</span> : null}
                        <span>{t.label}</span>
                        {t.badge != null ? (
                            <span
                                style={{
                                    background: PALETTE.border,
                                    color: PALETTE.text,
                                    fontSize: 10,
                                    padding: '1px 6px',
                                    borderRadius: 10,
                                    minWidth: 16,
                                    textAlign: 'center',
                                }}
                            >
                                {t.badge}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ModalShell — unified modal overlay. Esc to close, click outside to close
// (optional), focus trap, footer slot for action buttons.
// ---------------------------------------------------------------------------

export function ModalShell({
    open,
    title,
    onClose,
    children,
    footer,
    width = 520,
    dismissOnBackdrop = true,
    dismissOnEsc = true,
}) {
    const dialogRef = useRef(null);

    useEffect(() => {
        if (!open || !dismissOnEsc) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, dismissOnEsc, onClose]);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        const focusTarget = dialogRef.current?.querySelector(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusTarget?.focus();
        return () => {
            if (previous && typeof previous.focus === 'function') previous.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            role="presentation"
            data-testid="modal-backdrop"
            onClick={dismissOnBackdrop ? onClose : undefined}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9000,
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={title || 'Dialog'}
                data-testid="modal-dialog"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width,
                    maxWidth: 'calc(100vw - 32px)',
                    maxHeight: 'calc(100vh - 32px)',
                    background: PALETTE.panel,
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 6,
                    color: PALETTE.text,
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                }}
            >
                {title ? (
                    <div
                        style={{
                            padding: '10px 14px',
                            borderBottom: `1px solid ${PALETTE.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ fontSize: 13, color: PALETTE.accent, fontWeight: 600 }}>{title}</div>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: PALETTE.textMuted,
                                cursor: 'pointer',
                                fontSize: 16,
                                padding: 0,
                                lineHeight: 1,
                            }}
                        >
                            ×
                        </button>
                    </div>
                ) : null}
                <div style={{ padding: '14px', overflow: 'auto', fontSize: 12, lineHeight: 1.5 }}>
                    {children}
                </div>
                {footer ? (
                    <div
                        style={{
                            padding: '10px 14px',
                            borderTop: `1px solid ${PALETTE.border}`,
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 8,
                        }}
                    >
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ConfirmDialog — convenience wrapper over ModalShell for yes/no prompts.
// ---------------------------------------------------------------------------

export function ConfirmDialog({
    open,
    title,
    body,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
}) {
    return (
        <ModalShell
            open={open}
            title={title}
            onClose={onCancel}
            footer={
                <>
                    <Button onClick={onCancel} variant="ghost">
                        {cancelLabel}
                    </Button>
                    <Button onClick={onConfirm} variant={danger ? 'danger' : 'primary'}>
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {typeof body === 'string' ? <div>{body}</div> : body}
        </ModalShell>
    );
}

// ---------------------------------------------------------------------------
// Button — small, opinionated button primitive for consistent footers/CTAs.
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = {
    primary: { bg: PALETTE.accentFaint, fg: PALETTE.accent, border: PALETTE.accent },
    ghost: { bg: 'transparent', fg: PALETTE.textMuted, border: PALETTE.border },
    danger: { bg: '#3a0f12', fg: PALETTE.danger, border: PALETTE.danger },
    success: { bg: '#0f2a20', fg: PALETTE.success, border: PALETTE.success },
};

export function Button({ variant = 'ghost', disabled, children, style, ...rest }) {
    const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.ghost;
    return (
        <button
            {...rest}
            disabled={disabled}
            style={{
                padding: '6px 12px',
                background: v.bg,
                color: v.fg,
                border: `1px solid ${v.border}`,
                borderRadius: 3,
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.4 : 1,
                ...style,
            }}
        >
            {children}
        </button>
    );
}

// ---------------------------------------------------------------------------
// ProgressOverlay — for long-running ops where tools currently show frozen UI
// (Ship Builder AI gen, Sound Forge gen, VFX duel recording).
// ---------------------------------------------------------------------------

export function ProgressOverlay({
    open,
    title = 'Working…',
    progress, // 0-1, or null for indeterminate
    step,
    log,
    onCancel,
}) {
    if (!open) return null;
    const pct = progress == null ? null : Math.max(0, Math.min(1, progress));
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="progress-overlay"
            style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(5,13,20,0.88)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 8500,
            }}
        >
            <div
                style={{
                    width: 380,
                    maxWidth: '90%',
                    background: PALETTE.panel,
                    border: `1px solid ${PALETTE.border}`,
                    borderRadius: 6,
                    padding: 18,
                    color: PALETTE.text,
                }}
            >
                <div style={{ color: PALETTE.accent, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    {title}
                </div>
                {step ? (
                    <div style={{ fontSize: 11, color: PALETTE.textMuted, marginBottom: 10 }}>{step}</div>
                ) : null}
                <div
                    style={{
                        height: 6,
                        background: PALETTE.border,
                        borderRadius: 3,
                        overflow: 'hidden',
                        marginBottom: log ? 10 : 12,
                    }}
                >
                    {pct == null ? (
                        <div
                            data-testid="progress-indeterminate"
                            style={{
                                width: '40%',
                                height: '100%',
                                background: PALETTE.accent,
                                animation: 'coe-progress-indeterminate 1.2s linear infinite',
                            }}
                        />
                    ) : (
                        <div
                            data-testid="progress-determinate"
                            style={{
                                width: `${pct * 100}%`,
                                height: '100%',
                                background: PALETTE.accent,
                                transition: 'width 140ms linear',
                            }}
                        />
                    )}
                </div>
                {log ? (
                    <pre
                        data-testid="progress-log"
                        style={{
                            fontSize: 10,
                            color: PALETTE.textMuted,
                            background: PALETTE.bg,
                            border: `1px solid ${PALETTE.border}`,
                            borderRadius: 3,
                            padding: 8,
                            maxHeight: 120,
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            margin: 0,
                        }}
                    >
                        {log}
                    </pre>
                ) : null}
                {onCancel ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <Button onClick={onCancel} variant="ghost">
                            Cancel
                        </Button>
                    </div>
                ) : null}
            </div>
            <style>{`
                @keyframes coe-progress-indeterminate {
                    0%   { transform: translateX(-100%); }
                    100% { transform: translateX(250%); }
                }
            `}</style>
        </div>
    );
}

// ---------------------------------------------------------------------------
// StatusPill — green/amber/red/grey at-a-glance indicator. Usable for server
// health (Sound Forge py server, GPU circuit-breaker, git dirty, etc.).
// ---------------------------------------------------------------------------

const STATUS_COLOR = {
    ok: PALETTE.success,
    warn: PALETTE.warning,
    error: PALETTE.danger,
    idle: PALETTE.textMuted,
    info: PALETTE.accent,
};

export function StatusPill({ status = 'idle', label, dense = false }) {
    const color = STATUS_COLOR[status] || STATUS_COLOR.idle;
    return (
        <span
            data-testid={`status-pill-${status}`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: dense ? 10 : 11,
                padding: dense ? '2px 6px' : '3px 8px',
                background: PALETTE.panel,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 999,
                color: PALETTE.text,
                lineHeight: 1,
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: color,
                    boxShadow: `0 0 6px ${color}`,
                }}
            />
            <span style={{ color }}>{label}</span>
        </span>
    );
}

// ---------------------------------------------------------------------------
// EmptyState — used when a tool panel has no data. Gives the user something
// to read instead of a blank frame.
// ---------------------------------------------------------------------------

export function EmptyState({ icon, title, body, action }) {
    return (
        <div
            data-testid="empty-state"
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 40,
                color: PALETTE.textMuted,
                textAlign: 'center',
            }}
        >
            {icon ? <div style={{ fontSize: 32, opacity: 0.55 }}>{icon}</div> : null}
            {title ? (
                <div style={{ fontSize: 13, color: PALETTE.text, fontWeight: 600 }}>{title}</div>
            ) : null}
            {body ? <div style={{ fontSize: 11, maxWidth: 320, lineHeight: 1.5 }}>{body}</div> : null}
            {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// InlineBanner — compact, non-dismissable info/warn/error/success strip for
// tool headers. Useful for "another editor is open" warnings, "server
// reconnecting" states, "unsaved changes" flags, etc. Lower visual weight
// than a Toast (persistent, contextual) and higher than an inline label.
// ---------------------------------------------------------------------------

const BANNER_PALETTE = {
    info:    { fg: PALETTE.accent,  bg: 'rgba(14, 42, 58, 0.9)',   border: PALETTE.accent },
    success: { fg: PALETTE.success, bg: 'rgba(16, 59, 45, 0.9)',   border: PALETTE.success },
    warning: { fg: PALETTE.warning, bg: 'rgba(64, 41, 12, 0.9)',   border: PALETTE.warning },
    error:   { fg: PALETTE.danger,  bg: 'rgba(58, 15, 18, 0.9)',   border: PALETTE.danger },
};

const BANNER_ICON = {
    info:    'ⓘ',
    success: '✓',
    warning: '⚠',
    error:   '✗',
};

export function InlineBanner({
    kind = 'info',      // 'info' | 'success' | 'warning' | 'error'
    title,              // optional short lead-in (bold-weight)
    children,           // body text / node
    icon,               // override the default kind-icon
    action,             // optional right-side node (button / link)
    onDismiss,          // if provided, renders a close ×
}) {
    const c = BANNER_PALETTE[kind] || BANNER_PALETTE.info;
    const gl = icon ?? BANNER_ICON[kind] ?? 'ⓘ';
    return (
        <div
            role={kind === 'error' ? 'alert' : 'status'}
            data-testid={`inline-banner-${kind}`}
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '6px 12px',
                background: c.bg,
                borderBottom: `1px solid ${c.border}`,
                color: c.fg,
                fontSize: 11,
                lineHeight: 1.5,
                fontFamily: 'inherit',
            }}
        >
            <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 13 }}>{gl}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                {title ? (
                    <span style={{ fontWeight: 600, marginRight: 6 }}>{title}</span>
                ) : null}
                <span style={{ color: c.fg === PALETTE.warning ? PALETTE.text : c.fg }}>
                    {children}
                </span>
            </div>
            {action ? <span style={{ flexShrink: 0 }}>{action}</span> : null}
            {onDismiss ? (
                <button
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: c.fg,
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: 0,
                        lineHeight: 1,
                        flexShrink: 0,
                    }}
                >
                    ×
                </button>
            ) : null}
        </div>
    );
}

// ---------------------------------------------------------------------------
// HelpDrawer — right-side slide-in panel for in-tool walkthrough content.
// Renders markdown via react-markdown. Esc closes. Backdrop click closes.
// Distinct from ModalShell because it deliberately leaves the tool visible
// underneath (no full-screen backdrop dimming) so users can read help while
// looking at the tool.
// ---------------------------------------------------------------------------

export function HelpDrawer({
    open,
    title = 'Help',
    onClose,
    content,            // markdown string OR React node
    width = 540,
    children,           // alternative to content prop
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <>
            {/* Subtle backdrop — clickable to close, but lower opacity than ModalShell so the tool stays visible. */}
            <div
                role="presentation"
                data-testid="help-drawer-backdrop"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                    zIndex: 8800,
                }}
            />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={title}
                data-testid="help-drawer"
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width,
                    maxWidth: 'calc(100vw - 16px)',
                    background: PALETTE.panel,
                    borderLeft: `1px solid ${PALETTE.border}`,
                    color: PALETTE.text,
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '-12px 0 32px rgba(0,0,0,0.5)',
                    zIndex: 8900,
                    fontSize: 12,
                }}
            >
                <div
                    style={{
                        padding: '10px 14px',
                        borderBottom: `1px solid ${PALETTE.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexShrink: 0,
                    }}
                >
                    <div style={{ fontSize: 13, color: PALETTE.accent, fontWeight: 600 }}>{title}</div>
                    <button
                        onClick={onClose}
                        aria-label="Close help"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: PALETTE.textMuted,
                            cursor: 'pointer',
                            fontSize: 16,
                            padding: 0,
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>
                <div
                    style={{
                        padding: '14px 16px',
                        overflow: 'auto',
                        lineHeight: 1.55,
                        flex: 1,
                        minHeight: 0,
                    }}
                >
                    {children || (typeof content === 'string' ? <HelpMarkdown source={content} /> : content || (
                        <EmptyState
                            icon="📖"
                            title="No walkthrough yet"
                            body="Help content for this tool hasn't been authored. See docs/tools/WALKTHROUGH.md."
                        />
                    ))}
                </div>
            </aside>
        </>
    );
}

// Lazy-loaded markdown renderer so the primitives module doesn't pull
// react-markdown into every consumer's bundle until something asks for it.
const _ReactMarkdownLazy = React.lazy(() => import('react-markdown'));

function HelpMarkdown({ source }) {
    return (
        <React.Suspense fallback={<div style={{ color: PALETTE.textMuted }}>Loading…</div>}>
            <_ReactMarkdownLazy
                components={{
                    h1: ({ node, ...props }) => (
                        <h1 style={{ fontSize: 16, color: PALETTE.accent, marginTop: 0, marginBottom: 10 }} {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                        <h2 style={{ fontSize: 13, color: PALETTE.accent, marginTop: 16, marginBottom: 6, borderBottom: `1px solid ${PALETTE.border}`, paddingBottom: 3 }} {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                        <h3 style={{ fontSize: 12, color: PALETTE.text, marginTop: 12, marginBottom: 4, fontWeight: 600 }} {...props} />
                    ),
                    p: ({ node, ...props }) => (
                        <p style={{ margin: '6px 0' }} {...props} />
                    ),
                    code: ({ node, inline, ...props }) =>
                        inline ? (
                            <code
                                style={{
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                    fontSize: 11,
                                    background: PALETTE.bg,
                                    border: `1px solid ${PALETTE.border}`,
                                    borderRadius: 3,
                                    padding: '0 4px',
                                    color: PALETTE.accent,
                                }}
                                {...props}
                            />
                        ) : (
                            <code {...props} />
                        ),
                    pre: ({ node, ...props }) => (
                        <pre
                            style={{
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                                fontSize: 11,
                                background: PALETTE.bg,
                                border: `1px solid ${PALETTE.border}`,
                                borderRadius: 3,
                                padding: 8,
                                overflow: 'auto',
                                color: PALETTE.text,
                            }}
                            {...props}
                        />
                    ),
                    a: ({ node, ...props }) => (
                        <a style={{ color: PALETTE.accent }} target="_blank" rel="noopener noreferrer" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                        <ul style={{ paddingLeft: 18, margin: '6px 0' }} {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol style={{ paddingLeft: 18, margin: '6px 0' }} {...props} />
                    ),
                    li: ({ node, ...props }) => (
                        <li style={{ margin: '2px 0' }} {...props} />
                    ),
                    table: ({ node, ...props }) => (
                        <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }} {...props} />
                    ),
                    th: ({ node, ...props }) => (
                        <th style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: '4px 8px', textAlign: 'left', color: PALETTE.textMuted, fontWeight: 600 }} {...props} />
                    ),
                    td: ({ node, ...props }) => (
                        <td style={{ borderBottom: `1px solid ${PALETTE.border}`, padding: '4px 8px' }} {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                        <blockquote style={{ borderLeft: `3px solid ${PALETTE.accent}`, margin: '6px 0', paddingLeft: 10, color: PALETTE.textMuted }} {...props} />
                    ),
                    img: ({ node, src, alt, ...rest }) => {
                        if (typeof src === 'string' && /\.(webm|mp4)$/i.test(src)) {
                            // Convention: a sibling poster lives at the same path
                            // with `.poster.png` instead of `.webm` / `.mp4`. If
                            // the file 404s the browser silently falls back to
                            // black until the video's first frame loads — safe.
                            const poster = src.replace(/\.(webm|mp4)$/i, '.poster.png');
                            return (
                                <video
                                    src={src}
                                    poster={poster}
                                    controls
                                    preload="metadata"
                                    aria-label={alt}
                                    style={{
                                        width: '100%',
                                        maxHeight: 280,
                                        borderRadius: 4,
                                        margin: '8px 0',
                                        background: '#000',
                                    }}
                                />
                            );
                        }
                        return <img src={src} alt={alt} {...rest} />;
                    },
                }}
            >
                {source}
            </_ReactMarkdownLazy>
        </React.Suspense>
    );
}

// ---------------------------------------------------------------------------
// PanelCard — rectangular card panel, the "what every tool section uses"
// container. Consistent padding + border.
// ---------------------------------------------------------------------------

export function PanelCard({ title, right, children, dense = false }) {
    return (
        <div
            data-testid="panel-card"
            style={{
                background: PALETTE.panel,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
            }}
        >
            {title || right ? (
                <div
                    style={{
                        padding: dense ? '6px 10px' : '8px 12px',
                        borderBottom: `1px solid ${PALETTE.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                    }}
                >
                    {title ? (
                        <div
                            style={{
                                fontSize: 10,
                                color: PALETTE.textMuted,
                                textTransform: 'uppercase',
                                letterSpacing: '0.12em',
                                fontWeight: 600,
                            }}
                        >
                            {title}
                        </div>
                    ) : (
                        <div />
                    )}
                    {right || null}
                </div>
            ) : null}
            <div style={{ padding: dense ? '8px 10px' : '12px', minHeight: 0, flex: 1 }}>{children}</div>
        </div>
    );
}
