import { Check } from "lucide-react";

export function DropzoneComplete() {
  return (
    <div
      className="glass-panel flex items-center justify-center relative overflow-hidden"
      style={{
        width: 68,
        height: 68,
        borderRadius: "var(--radius-2xl)",
        background: "var(--surface-primary)",
        boxShadow: "var(--shadow-sm)",
        border: "2px solid var(--color-success)",
        animation: "modal-in var(--duration-fast) var(--ease-out-expo)",
      }}
    >
      <Check size={32} strokeWidth={3} style={{ color: "var(--color-success)" }} className="animate-pulse" />
    </div>
  );
}
