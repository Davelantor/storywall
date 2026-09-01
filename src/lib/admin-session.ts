import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "nordeep_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // one working day at the venue

function secret(): string | null {
  const value = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!value || value.startsWith("change-me")) return null;
  return value;
}

export function adminPassword(): string | null {
  const value = process.env.ADMIN_PASSWORD?.trim();
  if (!value || value.startsWith("change-me")) return null;
  return value;
}

/** True when both ADMIN_PASSWORD and ADMIN_SESSION_SECRET are set to real values. */
export function adminAuthConfigured(): boolean {
  return Boolean(adminPassword() && secret());
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function issueSessionToken(): string | null {
  const key = secret();
  if (!key) return null;
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt, key)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  const key = secret();
  if (!key || !token) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!safeEqual(signature, sign(expiresAt, key))) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

/** Constant-time password comparison for the login form. */
export function passwordMatches(candidate: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};
