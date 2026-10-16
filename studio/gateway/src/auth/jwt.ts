import { SignJWT, jwtVerify } from 'jose';
import { UserContext, UserRole } from '../types.js';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'redisx-studio-super-secure-production-secret-key-32chars!'
);

const STATIC_USERS: Record<string, { pass: string; role: UserRole }> = {
  admin: { pass: process.env.ADMIN_PASS || 'admin123', role: 'admin' },
  operator: { pass: process.env.OPERATOR_PASS || 'operator123', role: 'operator' },
  viewer: { pass: process.env.VIEWER_PASS || 'viewer123', role: 'viewer' },
};

export async function authenticateUser(username: string, pass: string): Promise<UserContext | null> {
  const user = STATIC_USERS[username];
  if (!user || user.pass !== pass) {
    return null;
  }
  return { username, role: user.role };
}

export async function createToken(user: UserContext, expiresIn = '24h'): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<UserContext | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload.username || !payload.role) return null;
    return {
      username: payload.username as string,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function refreshToken(currentToken: string): Promise<{ token: string; user: UserContext } | null> {
  const user = await verifyToken(currentToken);
  if (!user) return null;
  const newToken = await createToken(user);
  return { token: newToken, user };
}
