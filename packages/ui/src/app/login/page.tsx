import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginForm from "../components/LoginForm";
import { getVersions } from "../utils/versions";

export default async function LoginPage() {
  const session = await auth();
  const { core, ui } = await getVersions();

  if (session?.user) {
    redirect("/");
  }
  return <LoginForm corePackageVersion={core} uiPackageVersion={ui} />;
}
