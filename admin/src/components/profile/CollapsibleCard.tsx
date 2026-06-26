import { useState, type ReactNode } from 'react';

export function CollapsibleCard({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="profile-card">
      <button
        type="button"
        className="profile-card-header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <h3>{title}</h3>
        <span className="profile-card-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="profile-card-body">{children}</div>}
    </section>
  );
}
