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
    signInWithCustomToken,
    signInWithEmailAndPassword,
    signOut,
    type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    isDevMode: boolean;           // true when running without Firebase config
    signIn: (email: string, password: string) => Promise<void>;
    signInWithSsoToken: (customToken: string) => Promise<void>;
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
        // ── No Firebase web config: dev stub user ───────────────────────────────
        if (!isFirebaseConfigured) {
            setUser(process.env.NODE_ENV === "production" ? null : DEV_USER);
            setLoading(false);
            return;
        }

        // ── Firebase: wait for client SDK (auth is undefined during SSR) ────────
        if (typeof window === "undefined" || !auth) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signIn = async (email: string, password: string) => {
        if (!isFirebaseConfigured || !auth) {
            setUser(DEV_USER);
            return;
        }
        await signInWithEmailAndPassword(auth, email, password);
    };

    const signInWithSsoToken = async (customToken: string) => {
        if (!isFirebaseConfigured || !auth) {
            throw new Error("Firebase is required for SSO sign-in");
        }
        await signInWithCustomToken(auth, customToken);
    };

    const logOut = async () => {
        if (typeof window !== "undefined") {
            window.localStorage.removeItem("trustfabric_organization_id");
        }
        if (!isFirebaseConfigured || !auth) {
            setUser(null);
            return;
        }
        await signOut(auth);
    };

    return (
        <AuthContext.Provider
            value={{ user, loading, isDevMode: !isFirebaseConfigured, signIn, signInWithSsoToken, logOut }}
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
