import { useEffect, useMemo, useRef, useState } from 'react';

export default function useVisibleRows(count, rowHeight, headerHeight = 0, resetKey) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const element = ref.current;
    setScrollTop(0);
    if (!element) return;
    element.scrollTop = 0;
    const update = () => setHeight(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [resetKey]);
  const offsets = useMemo(() => {
    const result = [0]; for (let i = 0; i < count; i++) result.push(result.at(-1) + (Array.isArray(rowHeight) ? rowHeight[i] : rowHeight)); return result;
  }, [count, rowHeight]);
  function rowAt(position) {
    let low = 0, high = count;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (offsets[mid + 1] <= position) low = mid + 1; else high = mid; }
    return low;
  }
  const top = Math.max(0, scrollTop - headerHeight);
  const first = Math.min(Math.max(0, count - 1), Math.max(0, rowAt(top) - 3));
  const end = Math.min(count, rowAt(top + height) + 4);
  return { ref, first, end, offsets, totalHeight: offsets[count], onScroll: (event) => setScrollTop(event.currentTarget.scrollTop) };
}
