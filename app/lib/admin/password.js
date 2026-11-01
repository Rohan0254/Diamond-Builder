// Password hashing for super admin panel staff accounts (pure).
//
// There is no auth dependency in this project, so hashes are produced with
// Node's built-in `scrypt` — a memory-hard KDF — and stored as a single
// self-describing string:
//
//   scrypt$<N>$<r>$<p>$<salt base64>$<derived key base64>
//
// Keeping the parameters in the string means the cost can be raised later
// without invalidating existing hashes: `verifyPassword` always uses the
// parameters that were stored with the hash. Nothing in this file is async
// except hashing itself, and it never throws for a malformed stored hash.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const SCRYPT_PREFIX = "scrypt";

/**
 * Work factors. N is the CPU/memory cost (must be a power of two), r the block
 * size and p the parallelization factor. These are the Node defaults for
 * interactive logins and take well under a second on a small server.
 */
export const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
});

/**
 * scrypt needs `maxmem` to cover 128 * N * r bytes; the Node default (32 MB) is
 * just under 128 * 16384 * 8. Ask for twice the requirement so a future N bump
 * does not silently start throwing.
 */
function maxmemFor({ N, r }) {
  return 256 * N * r;
}

/**
 * Produces the storable hash for a password.
 *
 * @param {string} password
 * @param {{params?:Partial<typeof SCRYPT_PARAMS>, salt?:Buffer}} [options]
 * @returns {Promise<string>}
 */
export async function hashPassword(password, { params = {}, salt } = {}) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("A password is required to create a hash.");
  }
  const { N, r, p, keylen, saltBytes } = { ...SCRYPT_PARAMS, ...params };
  const saltBuffer = salt ?? randomBytes(saltBytes);
  const derived = await scryptAsync(password, saltBuffer, keylen, {
    N,
    r,
    p,
    maxmem: maxmemFor({ N, r }),
  });
  return [
    SCRYPT_PREFIX,
    N,
    r,
    p,
    saltBuffer.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verifies a password against a stored hash in constant time.
 *
 * Returns false — never throws — for a missing password, an unknown hash format
 * or a hash produced with unusable parameters, so callers can treat every
 * failure as "invalid credentials".
 *
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) {
    return false;
  }
  if (N > 2 ** 20 || r > 32 || p > 16) return false; // refuse absurd parameters

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: maxmemFor({ N, r }),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
