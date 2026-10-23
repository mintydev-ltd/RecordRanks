import "server-only";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { defaultPreparePayload } from "pino-logflare";

// This is just here so that Next JS doesn't tree shake out the Pino Logflare package during the build step.
// Specifying it in serverExternalPackages isn't enough.
defaultPreparePayload.name;

if (!process.env.LOGFLARE_API_BASE_URL) console.error("LOGFLARE_API_BASE_URL environment variable not set!");
if (!process.env.LOGFLARE_PUBLIC_ACCESS_TOKEN)
  console.error("LOGFLARE_PUBLIC_ACCESS_TOKEN environment variable not set!");

const transport = pino.transport({
  target: "pino-logflare",
  options: {
    apiBaseUrl: process.env.LOGFLARE_API_BASE_URL,
    apiKey: process.env.LOGFLARE_PUBLIC_ACCESS_TOKEN,
    // sourceToken: "your-source-token",
    // either sourceToken or sourceName can be provided. sourceToken takes precedence.
    sourceName: "deno-relay-logs", // RR doesn't use Supabase Edge Functions; it just relies on the same logs source

    // handle errors on the client side
    // onError: { module: "my_utils", method: "handleErrors" },
    // transform events before sending
    onPreparePayload: {
      module: fileURLToPath(import.meta.url.replace(/\/logger.ts$/, "/logger-utils.js")),
      method: "handlePayload",
    },
  },
});

export const logger = pino(transport);

export const LogCodes = {
  RR0001: "page visit",
  // Events
  RR0002: "create event",
  RR0003: "update event",
  // RR0004: "affiliate link click",
  RR0050: "create event category",
  RR0051: "update event category",
  // Contests
  RR0005: "create contest",
  RR0006: "approve contest",
  RR0007: "finish contest",
  RR0008: "un-finish contest",
  RR0009: "publish contest",
  RR0010: "update contest",
  RR0011: "delete contest",
  RR0012: "open round",
  // Results
  RR0013: "create contest result",
  RR0014: "update contest result",
  RR0015: "delete contest result",
  RR0016: "create video-based result",
  RR0017: "update video-based result",
  RR0018: "delete video-based result",
  // Persons
  RR0019: "create person",
  RR0020: "update person",
  RR0021: "delete person",
  RR0022: "approve person",
  RR0023: "approve persons",
  RR0060: "merge person profiles",
  RR0061: "bulk create persons",
  // Records
  RR0024: "set result record",
  RR0025: "set future result record",
  RR0026: "cancel future result record",
  RR0027: "create record config",
  RR0028: "update record config",
  RR0041: "generate record configs",
  // Collective Cubing
  RR0029: "start new solution",
  // Users
  RR0030: "send verification email",
  RR0031: "send reset password email",
  RR0032: "send password changed email",
  RR0033: "update user",
  RR0034: "delete user",
  RR0035: "send user deletion verification email",
  RR0036: "send user deleted email",
  RR0037: "create user request",
  RR0038: "delete user request",
  RR0039: "send organization invitation",
  // Organizations
  RR0042: "update member",
  RR0043: "remove member",
  // Access Tokens
  // RR0040: "create access token",

  // Error codes
  RR5000: "unknown error",
  RR5001: "send email error",
  RR5002: "RR action error",
  RR5003: "unknown action error",
} as const;

export type LogCode = keyof typeof LogCodes;
