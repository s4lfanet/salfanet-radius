import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

// Mirrors frontend/src/types/next-auth.d.ts — kept in sync manually since
// the two Next.js apps don't share a tsconfig. Both apps' authOptions
// (server/auth/config.ts) set the same shape in their jwt/session
// callbacks (id, username, role), and the backend verifies the same
// NextAuth JWT the frontend issues (shared NEXTAUTH_SECRET).
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    id: string;
    username: string;
    role: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    username: string;
    role: string;
  }
}
