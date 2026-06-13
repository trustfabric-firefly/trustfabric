import Image from "next/image";
import Illustration from "@/public/marketing/page-illustration.svg";

export function PageIllustration() {
  return (
    <div className="mkt-bg-glow" aria-hidden="true">
      <Image src={Illustration} width={846} height={594} alt="" priority />
    </div>
  );
}
