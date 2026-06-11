"use client";

import { useEffect } from "react";
import AOS from "aos";
import "aos/dist/aos.css";

export function MarketingAOS({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    AOS.init({
      once: true,
      disable: "phone",
      duration: 700,
      easing: "ease-out-cubic",
      offset: 40,
    });

    const refresh = () => AOS.refresh();
    window.addEventListener("load", refresh);
    return () => window.removeEventListener("load", refresh);
  }, []);

  return <>{children}</>;
}
