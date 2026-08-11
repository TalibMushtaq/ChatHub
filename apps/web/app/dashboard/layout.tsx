import { redirect } from "next/navigation";
import axios from "axios";
import { serverApi } from "../lib/serverApi";

export const dynamic = "force-dynamic";

// Auth-guarded wrapper for the messenger shell. The shell owns its own
// rail/sidebar and columns, so children render full-screen here.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ok = false;
  try {
    const api = await serverApi();
    const { data } = await api.get("/auth/me");
    ok = data.ok === true;
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response?.status !== 401) {
      console.error("Dashboard auth check failed", err);
    }
  }

  if (!ok) {
    redirect("/auth");
  }

  return <>{children}</>;
}
