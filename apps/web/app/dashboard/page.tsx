// app/dashboard/page.tsx

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import axios from "axios";
import StatCard from "./components/StatCard";
import ActivityChart from "./components/ActivityChart";
import ServersCard from "./components/ServersCard";
import ActivityCard from "./components/ActivityCard";
import ActionsCard from "./components/ActionCard";
import MembersCard from "./components/MembersCard";
import DashboardTopbar from "./components/DashboardTopbar";
import { serverApi } from "../lib/serverApi";

export default async function DashboardPage() {
  let user;
  try {
    const api = await serverApi();
    const { data } = await api.get("/auth/me");
    if (!data.ok) {
      redirect("/auth");
    }
    user = data.user;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      redirect("/auth");
    }
    throw err;
  }
  return (
    <>
      <DashboardTopbar user={user} />
      <div className="overflow-y-auto h-full p-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 mb-2">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Good evening, {user.displayName ?? user.username} 👋
            </h2>
          </div>

          {/* Stat Cards */}
          <StatCard
            label="Total Members"
            value="48,291"
            delta="12.4%"
            trend="up"
            icon="👥"
          />

          <StatCard
            label="Messages Today"
            value="9,847"
            delta="5.2%"
            trend="up"
            icon="💬"
          />

          <StatCard
            label="Online Now"
            value="3,104"
            delta="2.1%"
            trend="down"
            icon="🟢"
          />
          <ActivityChart />
          <ServersCard />
          <ActivityCard />
          <ActionsCard />
          <MembersCard />
        </div>
      </div>
    </>
  );
}
