import { redirect } from "next/navigation";
import { auth } from "@/auth";
import NewDashboardClient from "./components/NewDashboardClient";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  return <NewDashboardClient />;
}
