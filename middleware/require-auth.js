import { createRemoteJWKSet, jwtVerify } from "jose";

export const AUTH_COOKIE_NAME = "studio_access_token";
const DEFAULT_AUTH_ISSUER =
  "https://b14-a08-studio-space-by-shahariar.vercel.app";

let remoteJwks;

function getAuthIssuer() {
  return (
    process.env.JWT_ISSUER ||
    process.env.BETTER_AUTH_URL ||
    process.env.FRONTEND_ORIGINS?.split(",")[0]?.trim() ||
    DEFAULT_AUTH_ISSUER
  );
}

function getJwks() {
  const issuer = getAuthIssuer();
  const jwksUrl =
    process.env.JWKS_URL ||
    (issuer ? new URL("/api/auth/jwks", issuer).toString() : undefined);
  if (!jwksUrl) {
    const error = new Error("JWT verification is not configured.");
    error.status = 503;
    throw error;
  }

  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  return remoteJwks;
}

function getJwtVerificationOptions() {
  const issuer = getAuthIssuer();
  const audience = process.env.JWT_AUDIENCE || issuer;

  if (!issuer || !audience) {
    const error = new Error("JWT verification is not configured.");
    error.status = 503;
    throw error;
  }

  return {
    issuer,
    audience,
    algorithms: ["EdDSA"],
    requiredClaims: ["sub", "email"],
  };
}

function isJwtVerificationError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code.startsWith("ERR_JWT") ||
      error.code.startsWith("ERR_JWS") ||
      error.code.startsWith("ERR_JWKS"))
  );
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(
      token,
      getJwks(),
      getJwtVerificationOptions(),
    );

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      !payload.email.includes("@")
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = {
      id: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: typeof payload.name === "string" ? payload.name : "",
      image: typeof payload.image === "string" ? payload.image : undefined,
      role: typeof payload.role === "string" ? payload.role : "user",
    };

    return next();
  } catch (error) {
    if (isJwtVerificationError(error)) {
      console.warn("Studio service rejected an authentication token:", {
        code: error.code,
        claim: error.claim,
        reason: error.message,
      });
      return res.status(401).json({ error: "Unauthorized" });
    }

    return next(error);
  }
}
