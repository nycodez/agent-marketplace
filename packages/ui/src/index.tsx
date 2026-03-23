import type { PropsWithChildren, ReactNode } from "react";

export function SectionCard({
  title,
  eyebrow,
  actions,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}>) {
  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          {eyebrow ? <p className="section-card__eyebrow">{eyebrow}</p> : null}
          <h2 className="section-card__title">{title}</h2>
        </div>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </div>
      <div className="section-card__body">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value">{value}</strong>
      {hint ? <span className="stat-tile__hint">{hint}</span> : null}
    </div>
  );
}

export function MonochromeButton({
  children,
  variant = "primary",
}: PropsWithChildren<{
  variant?: "primary" | "secondary";
}>) {
  return <button className={`mono-button mono-button--${variant}`}>{children}</button>;
}

export function StatusPill({ children }: PropsWithChildren) {
  return <span className="status-pill">{children}</span>;
}
