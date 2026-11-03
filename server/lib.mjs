// Shared helpers for the Gabi OS API server.
import { PostgrestClient } from "@supabase/postgrest-js";
import { neon } from "@neondatabase/serverless";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const env = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
};

// Neon Data API (PostgREST-compatible) and Managed Better Auth endpoints.
export const DATA_API_URL = env(
  "NEON_DATA_API_URL",
  "https://ep-fragrant-field-b8hkanuk.apirest.c-14.us-east-1.aws.neon.tech/gabios/rest/v1",
);
export const AUTH_URL = env(
  "NEON_AUTH_URL",
  "https://ep-fragrant-field-b8hkanuk.neonauth.c-14.us-east-1.aws.neon.tech/gabios/auth",
);
export const PUBLIC_URL = env("PUBLIC_URL", "http://localhost:3001").replace(/\/$/, "");
export const APP_ORIGIN = env("APP_ORIGIN", "http://localhost:8080").replace(/\/$/, "");
export const OWNER_EMAIL = env("SEED_OWNER_EMAIL", "gabrielabenficamkt@hotmail.com").toLowerCase();

/** Privileged SQL access (owner role). Only for tables users must never touch. */
export const sql = neon(env("DATABASE_URL", ""));

const jwks = createRemoteJWKSet(new URL(`${AUTH_URL}/.well-known/jwks.json`));

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id, x-migration-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Data API client that acts as the signed-in user (Row-Level Security applies). */
export const userClient = (token) =>
  new PostgrestClient(DATA_API_URL, { headers: { Authorization: `Bearer ${token}` } });

/** Validates the bearer token and returns { id, email, token } or null. */
export async function getUser(req) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks);
    const id = String(payload.sub ?? "");
    if (!id) return null;
    let email = typeof payload.email === "string" ? payload.email : null;
    if (!email) {
      const rows = await sql`select email from neon_auth."user" where id::text = ${id} limit 1`;
      email = rows[0]?.email ?? null;
    }
    return { id, email, token };
  } catch (error) {
    console.error("token rejected", error instanceof Error ? error.message : error);
    return null;
  }
}
