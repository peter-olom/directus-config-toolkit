import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { CookieOption } from "@auth/core/types";

const cookieOptions: CookieOption["options"] = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "Username" },
        password: {
          label: "Password",
          type: "password",
          placeholder: "Password",
        },
      },
      async authorize(credentials) {
        const validUsername = process.env.DCT_UI_USERNAME;
        const validPassword = process.env.DCT_UI_PASSWORD;
        if (!validUsername || !validPassword) return null;
        if (
          credentials?.username === validUsername &&
          credentials?.password === validPassword
        ) {
          return { id: "admin", name: validUsername };
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) session.user.id = String(token.id);
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: "dct-session",
      options: cookieOptions,
    },
    callbackUrl: {
      name: "dct-callback-url",
      options: cookieOptions,
    },
    csrfToken: {
      name: "dct-csrf",
      options: cookieOptions,
    },
  },
});
