"use client";

import { useEffect, useRef, useState } from "react";

export default function useMasonry() {
  const masonryContainer = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<ChildNode[]>([]);

  useEffect(() => {
    if (masonryContainer.current) {
      setItems(Array.from(masonryContainer.current.children));
    }
  }, []);

  useEffect(() => {
    const elementLeft = (el: HTMLElement) => el.getBoundingClientRect().left;
    const elementTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
    const elementBottom = (el: HTMLElement) => el.getBoundingClientRect().bottom + window.scrollY;

    const handleMasonry = () => {
      if (!items.length) return;
      let gapSize = 0;
      if (masonryContainer.current) {
        gapSize = parseInt(
          window.getComputedStyle(masonryContainer.current).getPropertyValue("grid-row-gap"),
          10,
        );
      }
      items.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        let previous = el.previousSibling;
        el.style.marginTop = "0";
        while (previous) {
          if (previous.nodeType === 1 && previous instanceof HTMLElement) {
            if (elementLeft(previous) === elementLeft(el)) {
              el.style.marginTop = `${-(elementTop(el) - elementBottom(previous) - gapSize)}px`;
              break;
            }
          }
          previous = previous.previousSibling;
        }
      });
    };

    handleMasonry();
    window.addEventListener("resize", handleMasonry);
    return () => window.removeEventListener("resize", handleMasonry);
  }, [items]);

  return masonryContainer;
}
