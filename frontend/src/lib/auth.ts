import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import type { JWT } from '@auth/core/jwt';

// Extend the session type to include access token
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }
}

// Extend JWT type
interface ExtendedJWT extends JWT {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
}

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const extToken = token as ExtendedJWT;

      // Initial sign in
      if (account) {
        return {
          ...extToken,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        } as ExtendedJWT;
      }

      // Return previous token if the access token has not expired yet
      if (extToken.expiresAt && Date.now() < extToken.expiresAt * 1000) {
        return extToken;
      }

      // Access token has expired, try to refresh it
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: extToken.refreshToken!,
          }),
        });

        const tokens = await response.json();

        if (!response.ok) throw tokens;

        return {
          ...extToken,
          accessToken: tokens.access_token,
          expiresAt: Math.floor(Date.now() / 1000 + tokens.expires_in),
          // Fall back to old refresh token if a new one wasn't provided
          refreshToken: tokens.refresh_token ?? extToken.refreshToken,
        } as ExtendedJWT;
      } catch (error) {
        console.error('Error refreshing access token', error);
        return { ...extToken, error: 'RefreshAccessTokenError' } as ExtendedJWT;
      }
    },
    async session({ session, token }) {
      const extToken = token as ExtendedJWT;
      session.accessToken = extToken.accessToken;
      session.refreshToken = extToken.refreshToken;
      session.error = extToken.error;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
