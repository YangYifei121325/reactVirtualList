import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface VirtualListProps<T> {
  data: T[];
  estimatedItemHeight: number;
  height: number | string;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  style?: CSSProperties;
  className?: string;
}

interface ItemMeta {
  height: number;
  offset: number;
}

function VirtualList<T>({
  data,
  estimatedItemHeight,
  height,
  overscan = 3,
  renderItem,
  style,
  className,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const roRef = useRef<ResizeObserver | null>(null);
  const scrollTopRef = useRef(0);

  const [scrollTop, setScrollTop] = useState(0);
  // version 用于在测量写回 metasRef 后强制重渲染 & 重算 range
  const [version, setVersion] = useState(0);
  const forceUpdate = useCallback(() => setVersion((v) => v + 1), []);

  const metasRef = useRef<ItemMeta[]>([]);

  const recalcOffsets = useCallback(() => {
    const metas = metasRef.current;
    let acc = 0;
    for (let i = 0; i < metas.length; i++) {
      metas[i].offset = acc;
      acc += metas[i].height;
    }
  }, []);

  const getTotalHeight = useCallback(() => {
    const metas = metasRef.current;
    if (metas.length === 0) return 0;
    const last = metas[metas.length - 1];
    return last.offset + last.height;
  }, []);

  // data 长度或预估高度变化 → 重置 meta 并强制重算 range
  useEffect(() => {
    const prev = metasRef.current;
    const next: ItemMeta[] = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      next[i] = prev[i] ?? { height: estimatedItemHeight, offset: 0 };
    }
    metasRef.current = next;
    recalcOffsets();
    forceUpdate();
  }, [data.length, estimatedItemHeight, recalcOffsets, forceUpdate]);

  const findStartIndex = useCallback((target: number): number => {
    const metas = metasRef.current;
    let low = 0;
    let high = metas.length - 1;
    let ans = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (metas[mid].offset <= target) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  }, []);

  const viewportHeight =
    typeof height === "number"
      ? height
      : typeof style?.height === "number"
      ? (style.height as number)
      : 500;

  // range: start/end/totalHeight
  // 加入 version 依赖：每次 forceUpdate (测量回写) 都重新计算
  const range = useMemo(() => {
    const metas = metasRef.current;
    if (metas.length === 0) {
      return { start: 0, end: -1, totalHeight: 0 };
    }
    const totalH = getTotalHeight();
    let start = Math.max(0, findStartIndex(scrollTop) - overscan);
    const viewportEnd = scrollTop + viewportHeight;
    let end = findStartIndex(viewportEnd) + 1;
    end = Math.min(metas.length - 1, end + overscan);
    return { start, end, totalHeight: totalH };
  }, [scrollTop, viewportHeight, overscan, version, findStartIndex, getTotalHeight]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    scrollTopRef.current = st;
    setScrollTop(st);
  }, []);

  const applyMeasuredHeight = useCallback(
    (index: number, measured: number) => {
      const metas = metasRef.current;
      if (index < 0 || index >= metas.length) return;
      const meta = metas[index];
      if (Math.abs(meta.height - measured) < 0.5) return;
      const diff = measured - meta.height;
      meta.height = measured;
      recalcOffsets();
      const container = containerRef.current;
      if (container && meta.offset + meta.height <= scrollTopRef.current + diff) {
        container.scrollTop = scrollTopRef.current + diff;
        scrollTopRef.current = container.scrollTop;
        setScrollTop(container.scrollTop);
      }
      forceUpdate();
    },
    [recalcOffsets, forceUpdate],
  );

  // ResizeObserver：初次挂载 + 每次 forceUpdate 后重新 observe
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const RO = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLDivElement;
        const idxStr = el.dataset["idx"];
        if (idxStr == null) continue;
        const idx = Number(idxStr);
        if (Number.isNaN(idx)) continue;
        const h =
          entry.borderBoxSize?.[0]?.blockSize ??
          el.getBoundingClientRect().height;
        applyMeasuredHeight(idx, h);
      }
    });
    roRef.current = RO;
    return () => {
      RO.disconnect();
      roRef.current = null;
    };
  }, [applyMeasuredHeight]);

  // 每次渲染完成后，把新挂载的 item DOM 加入 observe（卸载时 cleanup 里 unobserve）
  useLayoutEffect(() => {
    const RO = roRef.current;
    if (!RO) return;
    for (const [, el] of itemRefs.current.entries()) if (el) RO.observe(el);
    return () => {
      for (const [, el] of itemRefs.current.entries()) if (el) RO.unobserve(el);
    };
  });

  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  const setItemRef = useCallback((index: number, el: HTMLDivElement | null) => {
    const map = itemRefs.current;
    if (el) {
      map.set(index, el);
    } else {
      const existing = map.get(index);
      if (existing) roRef.current?.unobserve(existing);
      map.delete(index);
    }
  }, []);

  // 只渲染 [start, end] 范围的条目，按 meta.offset 绝对定位
  const toRender: ReactNode[] = [];
  if (range.end >= range.start) {
    for (let i = range.start; i <= range.end; i++) {
      const item = data[i];
      const meta = metasRef.current[i];
      const top = meta ? meta.offset : 0;
      toRender.push(
        <div
          key={i}
          data-idx={i}
          ref={(el) => setItemRef(i, el)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${top}px)`,
            willChange: "transform",
          }}
        >
          {renderItem(item, i)}
        </div>,
      );
    }
  }

  const wrapperStyle: CSSProperties = {
    position: "relative",
    height: typeof height === "number" ? `${height}px` : height,
    overflowY: "auto",
    overflowX: "hidden",
    ...style,
  };

  return (
    <div
      ref={setContainerRef}
      onScroll={onScroll}
      className={className}
      style={wrapperStyle}
    >
      {/* Phantom：只有一个相对定位盒子，高度 = 所有条目高度之和，撑起滚动条 */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: range.totalHeight,
        }}
      >
        {toRender}
      </div>
    </div>
  );
}

export default VirtualList;
