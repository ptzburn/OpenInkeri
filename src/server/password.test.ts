import { describe, expect, it } from 'vite-plus/test';

import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the password it hashed, and nothing else', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[\w+/=]+\$[\w+/=]+$/);
    expect(await verifyPassword({ hash, password: 'correct horse battery' })).toBe(true);
    expect(await verifyPassword({ hash, password: 'correct horse batterY' })).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('treats equivalent Unicode spellings as the same password', async () => {
    const hash = await hashPassword('café');
    expect(await verifyPassword({ hash, password: 'café' })).toBe(true);
  });

  it('rejects malformed hashes and iteration counts above the cap', async () => {
    const hash = await hashPassword('pw');
    const [, , salt, digest] = hash.split('$');
    for (const bad of [
      '',
      'scrypt$1$a$b',
      `pbkdf2-sha256$0$${salt}$${digest}`,
      `pbkdf2-sha256$100001$${salt}$${digest}`,
    ]) {
      expect(await verifyPassword({ hash: bad, password: 'pw' })).toBe(false);
    }
  });
});
