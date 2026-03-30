import { Download } from "lucide-react";

export function DropzoneAttract() {
  return (
    <div 
      className="glass-panel flex flex-col items-center justify-center relative overflow-hidden" 
      style={{ 
        width: 68,
        height: 68,
        background: "linear-gradient(135deg, var(--surface-tertiary) 0%, var(--surface-primary) 100%)",
        border: "2px dashed var(--border-active)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
        animation: "magic-pulse 1.5s infinite ease-in-out"
      }}
    >
      <Download size={26} strokeWidth={2.5} className="animate-bounce z-10 text-gray-700" />
    </div>
  );
}
