import Image from "next/image";
import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="mkt-logo" aria-label="TrustFabric home">
      <Image
        src="/logo.svg"
        alt=""
        width={28}
        height={28}
        className="mkt-logo__mark"
        priority
      />
      <span className="mkt-logo__text">TrustFabric</span>
    </Link>
  );
}
