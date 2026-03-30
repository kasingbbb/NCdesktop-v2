import { Clock, HardDrive, Info } from "lucide-react";
import type { Asset } from "../../types";

interface InspectorDetailsProps {
  asset: Asset;
}

export function InspectorDetails({ asset }: InspectorDetailsProps) {
  return (
    <div className="mb-[var(--space-4)]">
      <h3 className="text-[var(--text-sm)] uppercase tracking-[0.08em] mb-[var(--space-2)]" style={{ color: "var(--text-tertiary)" }}>
        Details
      </h3>
      
      <div className="rounded-[var(--radius-md)] p-[var(--space-3)]" style={{ background: "var(--surface-secondary)" }}>
        <h4 className="text-[var(--text-base)] font-medium mb-[var(--space-2)] truncate" style={{ color: "var(--text-primary)" }}>
          {asset.name || "Untitled Asset"}
        </h4>
        
        <div className="space-y-2 text-[var(--text-xs)]">
          <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
            <span className="flex items-center gap-2"><Clock size={12} /> Captured</span>
            <span>{new Date(asset.capturedAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
            <span className="flex items-center gap-2"><HardDrive size={12} /> Source</span>
            <span>{asset.filePath?.split('/').pop() || "Unknown"}</span>
          </div>
          <div className="flex items-center justify-between" style={{ color: "var(--text-secondary)" }}>
            <span className="flex items-center gap-2"><Info size={12} /> Type</span>
            <span className="uppercase">{asset.type}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
