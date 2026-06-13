import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="mkt-logo" aria-label="TrustFabric home">
      trustfabric
    </Link>
  );
}
