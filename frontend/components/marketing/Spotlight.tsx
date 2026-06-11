"use client";

import React, { useEffect, useRef, useState } from "react";
import useMousePosition from "@/utils/useMousePosition";

type SpotlightProps = {
  children: React.ReactNode;
  className?: string;
};

export function Spotlight({ children, className = "" }: SpotlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mousePosition = useMousePosition();
  const mouse = useRef({ x: 0, y: 0 });
  const containerSize = useRef({ w: 0, h: 0 });
  const [boxes, setBoxes] = useState<HTMLElement[]>([]);

  useEffect(() => {
    if (containerRef.current) {
      setBoxes(Array.from(containerRef.current.children) as HTMLElement[]);
    }
  }, []);

  useEffect(() => {
    const initContainer = () => {
      if (containerRef.current) {
        containerSize.current.w = containerRef.current.offsetWidth;
        containerSize.current.h = containerRef.current.offsetHeight;
      }
    };
    initContainer();
    window.addEventListener("resize", initContainer);
    return () => window.removeEventListener("resize", initContainer);
  }, [boxes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { w, h } = containerSize.current;
    const x = mousePosition.x - rect.left;
    const y = mousePosition.y - rect.top;
    if (x < w && x > 0 && y < h && y > 0) {
      mouse.current = { x, y };
      boxes.forEach((box) => {
        const boxX = -(box.getBoundingClientRect().left - rect.left) + mouse.current.x;
        const boxY = -(box.getBoundingClientRect().top - rect.top) + mouse.current.y;
        box.style.setProperty("--mouse-x", `${boxX}px`);
        box.style.setProperty("--mouse-y", `${boxY}px`);
      });
    }
  }, [mousePosition, boxes]);

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
}
