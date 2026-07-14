import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const FIREBASE_JWKS_URL =
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
    if (!jwks) {
        jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
    }
    return jwks;
}

export async function verifyFirebaseIdToken(token: string): Promise<JWTPayload> {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
        throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured");
    }

    const { payload } = await jwtVerify(token, getJwks(), {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
    });
    return payload;
}
