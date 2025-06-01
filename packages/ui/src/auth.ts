import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

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
        console.log(
          "Validating credentials",
          `Username: ${validUsername ? "provided" : "not provided"}`,
          `Password: ${validPassword ? "provided" : "not provided"}`
        );
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
  cookies: {
    sessionToken: {
      name: "dct-session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
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
});
