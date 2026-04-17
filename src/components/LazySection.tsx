import { ReactNode, useEffect, useRef, useState } from "react";

interface LazySectionProps {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}

export function LazySection({
  children,
  minHeight = 320,
  rootMargin = "200px 0px",
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return (
    <div ref={ref}>
      {isVisible ? (
        children
      ) : (
        <div
          className="rounded-2xl animate-pulse"
          style={{
            minHeight,
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
          }}
        />
      )}
    </div>
  );
}
