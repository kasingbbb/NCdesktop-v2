import { useDropzoneStore } from "../../../stores/dropzoneStore";
import { Sparkles } from "lucide-react";

interface DropzoneIdleProps {
  isAttract?: boolean;
}

export function DropzoneIdle({ isAttract = false }: DropzoneIdleProps) {
  const toggleExpand = useDropzoneStore((s) => s.toggleExpand);

  return (
    <button
      onClick={toggleExpand}
      className="glass-panel glass-interactive flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group"
      style={{
        width: "clamp(64px, 18vw, 88px)",
        height: "clamp(64px, 18vw, 88px)",
        borderRadius: 28,
        boxShadow: isAttract ? "var(--shadow-sm)" : "var(--shadow-sm)",
        border: isAttract
          ? "2px solid var(--border-active)"
          : "1px solid var(--border-primary)",
        background: isAttract
          ? "linear-gradient(135deg, var(--surface-tertiary) 0%, var(--surface-primary) 100%)"
          : "var(--surface-primary)",
        transition: "all var(--duration-normal) var(--ease-spring)",
      }}
    >
      {/* 吸引状态动效脉冲 */}
      {isAttract && (
        <div 
          className="absolute inset-0 rounded-[28px]"
          style={{
            border: "2px solid #9ca3af",
            animation: "magic-pulse 1.5s infinite var(--ease-out-expo)"
          }}
        />
      )}

      <div className="flex flex-col items-center justify-center gap-[2px] z-10 transition-transform duration-300 group-hover:scale-105">
        <Sparkles 
          size={isAttract ? 28 : 22} 
          className="transition-all duration-300"
          style={{
            color: isAttract ? "var(--text-primary)" : "var(--brand-navy)",
          }}
          strokeWidth={2}
        />
        {!isAttract && (
          <span
            className="text-[9px] font-bold tracking-widest uppercase"
            style={{ color: "var(--text-secondary)", opacity: 0.8 }}
          >
            Drop
          </span>
        )}
      </div>
    </button>
  );
}
