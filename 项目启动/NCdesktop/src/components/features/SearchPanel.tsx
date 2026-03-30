import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Command } from "lucide-react";
import { useSearchStore } from "../../stores";
import {
  SearchResultItem,
  type SearchResultData,
} from "./SearchResultItem";
import { logger } from "../../utils/logger";

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (result: SearchResultData) => void;
}

export function SearchPanel({
  isOpen,
  onClose,
  onNavigate,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<SearchResultData[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { performSearch } = useSearchStore();

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      logger.debug("SearchPanel", "Performing search", { query });
      try {
        const raw = await performSearch(query);
        const mapped: SearchResultData[] = raw.map((r) => ({
          id: r.id,
          type: r.type as SearchResultData["type"],
          title: r.title,
          snippet: r.snippet,
          projectName: r.projectId ?? null,
          score: r.score,
        }));
        setResults(mapped);
        setActiveIndex(0);
      } catch (e) {
        logger.error("SearchPanel", "Search failed", { query, error: e });
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[activeIndex]) {
        logger.info("SearchPanel", "Result selected (Enter)", { id: results[activeIndex].id, title: results[activeIndex].title });
        onNavigate?.(results[activeIndex]);
        onClose();
      }
    },
    [results, activeIndex, onClose, onNavigate]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* 半透明遮罩 */}
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
        onClick={onClose}
      />

      {/* 搜索面板 */}
      <div
        className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-[560px] rounded-md overflow-hidden"
        style={{
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border-primary)",
        }}
      >
        {/* 搜索输入 */}
        <div
          className="flex items-center gap-[var(--space-3)] px-[var(--space-4)] h-[52px] border-b"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <Search size={18} style={{ color: "var(--text-tertiary)" }} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-[var(--text-base)]"
            style={{ color: "var(--text-primary)" }}
            placeholder="搜索项目、素材、转录、标签..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isSearching && <Loader2 size={16} className="animate-spin text-gray-500" />}
          {query && (
            <button
              className="p-1 rounded-[var(--radius-sm)] transition-colors"
              onClick={() => setQuery("")}
            >
              <X size={14} style={{ color: "var(--text-tertiary)" }} />
            </button>
          )}
        </div>

        {/* 结果列表 */}
        <div className="max-h-[400px] overflow-y-auto">
          {results.length > 0 ? (
            results.map((result, index) => (
              <SearchResultItem
                key={result.id}
                result={result}
                isActive={index === activeIndex}
                onSelect={(r) => {
                  logger.info("SearchPanel", "Result selected (Click)", { id: r.id, title: r.title });
                  onNavigate?.(r);
                  onClose();
                }}
              />
            ))
          ) : query.trim() && !isSearching ? (
            <div className="flex flex-col items-center py-[var(--space-8)]">
              <Search size={32} style={{ color: "var(--text-tertiary)", opacity: 0.3 }} />
              <p className="text-[var(--text-sm)] mt-[var(--space-2)]" style={{ color: "var(--text-tertiary)" }}>
                未找到匹配结果
              </p>
            </div>
          ) : !query.trim() ? (
            <div className="flex flex-col items-center py-[var(--space-8)]">
              <div className="flex items-center gap-[var(--space-1)] text-[var(--text-xs)]" style={{ color: "var(--text-tertiary)" }}>
                <Command size={12} />
                <span>K 打开搜索</span>
                <span className="mx-2">·</span>
                <span>↑↓ 导航</span>
                <span className="mx-2">·</span>
                <span>Enter 选择</span>
                <span className="mx-2">·</span>
                <span>Esc 关闭</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
