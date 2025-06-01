import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginForm from "../components/LoginForm";

// This file must be a server component for server-side auth check
export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }
  return <LoginForm />;
}
