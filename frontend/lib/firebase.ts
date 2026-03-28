import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when web env vars are set (SSR-safe; use for routing and dev vs prod auth). */
export const isFirebaseConfigured =
    typeof firebaseConfig.apiKey === "string" && firebaseConfig.apiKey.length > 0;

const hasClientConfig = typeof window !== "undefined" && isFirebaseConfigured;

let firebaseApp: FirebaseApp | undefined;
let auth: Auth | undefined;

if (hasClientConfig) {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
}

export { auth };
export default firebaseApp;

/** True when the Firebase client is initialized in the browser (not available during SSR). */
export const isFirebaseEnabled = hasClientConfig;
