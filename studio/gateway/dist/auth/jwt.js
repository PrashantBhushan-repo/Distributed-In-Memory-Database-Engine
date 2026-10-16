import { SignJWT, jwtVerify } from 'jose';
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'redisx-studio-super-secure-production-secret-key-32chars!');
const STATIC_USERS = {
    admin: { pass: process.env.ADMIN_PASS || 'admin123', role: 'admin' },
    operator: { pass: process.env.OPERATOR_PASS || 'operator123', role: 'operator' },
    viewer: { pass: process.env.VIEWER_PASS || 'viewer123', role: 'viewer' },
};
export async function authenticateUser(username, pass) {
    const user = STATIC_USERS[username];
    if (!user || user.pass !== pass) {
        return null;
    }
    return { username, role: user.role };
}
export async function createToken(user, expiresIn = '24h') {
    return new SignJWT({ username: user.username, role: user.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(JWT_SECRET);
}
export async function verifyToken(token) {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (!payload.username || !payload.role)
            return null;
        return {
            username: payload.username,
            role: payload.role,
        };
    }
    catch {
        return null;
    }
}
export async function refreshToken(currentToken) {
    const user = await verifyToken(currentToken);
    if (!user)
        return null;
    const newToken = await createToken(user);
    return { token: newToken, user };
}
