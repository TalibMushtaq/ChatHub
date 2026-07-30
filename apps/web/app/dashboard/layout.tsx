import DashboardSidebar from "./components/DashboardSidebar";
import { redirect } from "next/navigation";
import axios from "axios";
import { serverApi } from "../lib/serverApi";

export const dynamic = "force-dynamic";

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

  return (
    <div className="flex h-screen overflow-hidden bg-[--color-bg] text-[--color-text]">
      <DashboardSidebar />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* No more DashboardTopbar here — child pages render their own */}
        <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
