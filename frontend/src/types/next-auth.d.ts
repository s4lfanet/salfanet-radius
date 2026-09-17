import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

// Mirrored at backend/src/types/next-auth.d.ts — the backend also runs
// NextAuth (verifying the same JWT this app issues) but is a separate
// tsconfig/package, so it needs its own copy. Keep both in sync.
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
