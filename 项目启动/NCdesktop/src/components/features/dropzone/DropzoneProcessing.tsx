import { useDropzoneStore } from "../../../stores/dropzoneStore";

export function DropzoneProcessing() {
  const progress = useDropzoneStore((s) => s.processingProgress);
  const message = useDropzoneStore((s) => s.processingMessage);
  const label = message.trim() || "处理中…";

  return (
    <div
      className="glass-panel flex flex-col items-center justify-center cursor-wait relative overflow-hidden"
      style={{
        width: 68,
        height: 68,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-primary)",
        background: "var(--surface-primary)",
      }}
    >
      <div
        className="rounded-full border-[2.5px] border-t-transparent animate-spin z-10"
        style={{
          width: 26,
          height: 26,
          borderColor: "var(--text-secondary)",
          borderTopColor: "transparent",
        }}
      />
      <span
        className="text-[8px] font-medium text-center max-w-[62px] line-clamp-2 absolute bottom-1.5 z-10 leading-tight px-0.5"
        style={{ color: "var(--brand-navy)" }}
        title={label}
      >
        {label}
        {message.trim() ? ` ${Math.round(progress * 100)}%` : ""}
      </span>
    </div>
  );
}
