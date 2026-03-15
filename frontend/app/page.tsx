// Root route — redirect based on auth state
import { redirect } from "next/navigation";

export default function RootPage() {
  // Server-side: send unauthenticated users to login.
  redirect("/dashboard");
}
