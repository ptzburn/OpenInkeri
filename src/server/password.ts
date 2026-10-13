// Password hashing for the Workers Free plan. better-auth's default scrypt
// runs as pure JavaScript on workerd (its native path needs the Node
// runtime) and costs ~100 ms of CPU, while Free allows 10 ms per request.
// PBKDF2-SHA256 runs natively through Web Crypto instead; 100,000
// iterations is the most workerd accepts.
//
// Stored format: pbkdf2-sha256$<iterations>$<salt base64>$<hash base64>.
// The iteration count is stored so it can be raised later (e.g. on the Paid
// plan) without invalidating existing hashes.

const ALGORITHM = 'pbkdf2-sha256';
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison, so timing doesn't reveal how many bytes matched. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  const [algorithm, iterations, salt, expected] = data.hash.split('$');
  if (algorithm !== ALGORITHM || !iterations || !salt || !expected) return false;
  const count = Number(iterations);
  if (!Number.isInteger(count) || count < 1 || count > ITERATIONS) return false;
  const actual = await derive(data.password, fromBase64(salt), count);
  return equal(actual, fromBase64(expected));
}
