import { useEffect, useRef, useState } from 'react';

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
  const first = Math.min(Math.max(0, count - 1), Math.max(0, Math.floor(Math.max(0, scrollTop - headerHeight) / rowHeight) - 3));
  const end = Math.min(count, first + Math.ceil(height / rowHeight) + 7);
  return { ref, first, end, onScroll: (event) => setScrollTop(event.currentTarget.scrollTop) };
}
