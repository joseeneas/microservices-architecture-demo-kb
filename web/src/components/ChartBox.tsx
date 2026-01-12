import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ChartBoxProps {
  height?: number; // px, default 256 (~h-64)
  minWidth?: number; // px, default 300
  className?: string;
  children: (dims: { width: number; height: number }) => ReactNode;
}

export function ChartBox({ height = 256, minWidth = 300, className = '', children }: ChartBoxProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({ width: 0, height });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setDims({ width: Math.max(0, rect.width), height });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [height]);

  return (
    <div ref={ref} className={className} style={{ width: '100%', height }}>
      {dims.width >= minWidth ? children(dims) : (
        <div className="w-full h-full flex items-center justify-center text-muted text-sm">Adjusting…</div>
      )}
    </div>
  );
}
