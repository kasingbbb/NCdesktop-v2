
interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function SidebarItem({ icon, label, active = false, badge, onClick, className = "" }: SidebarItemProps) {
  return (
    <button
      className={`sidebar-item w-full text-left flex items-center mb-1 ${active ? "active" : ""} ${className}`}
      type="button"
      onClick={onClick}
    >
      <span className="sidebar-item-icon mr-2 shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-[var(--text-xs)] ml-2 text-gray-500 tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  titleColor?: string;
}

export function SidebarSection({ title, children, action, titleColor }: SidebarSectionProps) {
  return (
    <div className="mb-[var(--space-2)]">
      <div className="flex items-center justify-between px-[var(--space-3)] mb-[var(--space-1)]">
        <p
          className="text-[var(--text-xs)] uppercase tracking-[0.08em]"
          style={{ color: titleColor ?? "var(--text-tertiary)" }}
        >
          {title}
        </p>
        {action && <div>{action}</div>}
      </div>
      {children}
    </div>
  );
}
