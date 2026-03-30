import { useEffect } from "react";
import { Tag as TagIcon } from "lucide-react";
import { SidebarItem, SidebarSection } from "../layout/SidebarItem";
import { useTagStore } from "../../stores/tagStore";
import { useUIStore } from "../../stores/uiStore";

export function TagTree() {
  const tags = useTagStore((s) => s.tags);
  const fetchTags = useTagStore((s) => s.fetchTags);
  const filterId = useUIStore((s) => s.assetTagFilterId);
  const setFilterId = useUIStore((s) => s.setAssetTagFilterId);

  useEffect(() => {
    void fetchTags();
  }, [fetchTags]);

  return (
    <SidebarSection
      title="Tags"
      action={
        filterId ? (
          <button
            type="button"
            className="text-[10px] uppercase tracking-wide px-1 py-0.5 rounded text-gray-600"
            onClick={() => setFilterId(null)}
          >
            清除筛选
          </button>
        ) : null
      }
    >
      {tags.length === 0 ? (
        <p className="px-[var(--space-3)] text-[var(--text-xs)]" style={{ color: "var(--text-tertiary)" }}>
          暂无标签；在 Inspector 中为素材添加标签后将显示于此。
        </p>
      ) : (
        tags.map((tag) => (
          <SidebarItem
            key={tag.id}
            icon={<TagIcon size={16} />}
            label={tag.name}
            badge={tag.usageCount ?? 0}
            active={filterId === tag.id}
            onClick={() => setFilterId(filterId === tag.id ? null : tag.id)}
          />
        ))
      )}
    </SidebarSection>
  );
}
