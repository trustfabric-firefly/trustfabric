"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    type User,
} from "firebase/auth";
import { auth, isFirebaseEnabled } from "@/lib/firebase";

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    isDevMode: boolean;           // true when running without Firebase config
    signIn: (email: string, password: string) => Promise<void>;
    logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Dev-mode stub user ───────────────────────────────────────────────────────
const DEV_USER = {
    email: "dev@local",
    uid: "dev-user",
    displayName: "Local Dev",
} as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // ── Firebase disabled (no API key in .env.local) ──────────────────────
        if (!isFirebaseEnabled || !auth) {
            // Auto-sign in as a dev stub so the app renders without blocking
            setUser(DEV_USER);
            setLoading(false);
            return;
        }

        // ── Firebase enabled ──────────────────────────────────────────────────
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signIn = async (email: string, password: string) => {
        if (!isFirebaseEnabled || !auth) {
            // Dev mode: accept any credentials
            setUser(DEV_USER);
            return;
        }
        await signInWithEmailAndPassword(auth, email, password);
    };

    const logOut = async () => {
        if (typeof window !== "undefined") {
            window.localStorage.removeItem("trustfabric_api_token");
        }
        if (!isFirebaseEnabled || !auth) {
            setUser(null);
            return;
        }
        await signOut(auth);
    };

    return (
        <AuthContext.Provider
            value={{ user, loading, isDevMode: !isFirebaseEnabled, signIn, logOut }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
