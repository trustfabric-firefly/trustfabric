import { isFirebaseConfigured } from "@/lib/firebase";
import type { User } from "firebase/auth";

export async function establishAuthSession(user: User): Promise<void> {
    if (!isFirebaseConfigured) return;
    const token = await user.getIdToken();
    const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
    });
    if (!response.ok) {
        throw new Error("Failed to establish auth session");
    }
}

export async function clearAuthSession(): Promise<void> {
    if (!isFirebaseConfigured) return;
    await fetch("/api/auth/session", { method: "DELETE" });
}
