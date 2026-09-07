import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
export default function Dialog({
    children,
    onClose,
    label,
    className = "",
}: {
    children: ReactNode;
    onClose: () => void;
    label: string;
    className?: string;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const main = document.querySelector("main");
        main?.setAttribute("inert", "");
        const focusables = () =>
            Array.from(
                panel.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
                ) || [],
            );
        focusables()[0]?.focus();
        const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close.current();
            }
            if (e.key === "Tab") {
                const items = focusables(),
                    first = items[0],
                    last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("keydown", key);
            document.body.style.overflow = overflow;
            main?.removeAttribute("inert");
            before?.focus();
        };
    }, []);
    return createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div
                ref={panel}
                className={`modal ${className}`}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>,
        document.body,
    );
}
