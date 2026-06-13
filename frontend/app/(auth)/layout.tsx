import { DM_Sans } from "next/font/google";
import "../auth.css";

const roobert = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-roobert",
  display: "swap",
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`auth-page ${roobert.variable}`}
      style={{ fontFamily: "var(--font-roobert)" }}
    >
      {children}
    </div>
  );
}
