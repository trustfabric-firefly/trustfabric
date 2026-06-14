import type { ReactNode } from "react";

type PageEmptyIllustrationProps = {
    src: string;
    title: string;
    label: string;
    compact?: boolean;
    children?: ReactNode;
};

export function PageEmptyIllustration({ src, title, label, compact = false, children }: PageEmptyIllustrationProps) {
    return (
        <div className={`page-empty${compact ? " page-empty--compact" : ""}`}>
            {!compact && (
                <img
                    src={src}
                    alt=""
                    className="page-empty__illustration"
                    width={420}
                    height={380}
                />
            )}
            <h2 className="page-empty__title">{title}</h2>
            <p className="page-empty__label">{label}</p>
            {children}
        </div>
    );
}
