"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export function Modal({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
}: ModalProps) {
    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (open) window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="modal" role="dialog" aria-modal="true">
                <div className="modal__header">
                    <div>
                        <h2 className="modal__title">{title}</h2>
                        {subtitle && <p className="modal__subtitle">{subtitle}</p>}
                    </div>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="modal__body">{children}</div>

                {footer && <div className="modal__footer">{footer}</div>}
            </div>
        </div>
    );
}
