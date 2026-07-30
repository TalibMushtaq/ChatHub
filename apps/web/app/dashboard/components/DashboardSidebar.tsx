"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../../../components/icons/Logo";

export default function DashboardSidebar() {
  const pathname = usePathname();

  // Helper to determine if a nav item is active
  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  const navItems = [
    { href: "/dashboard", icon: "🏠", label: "Home" },
    { href: "/dashboard/dm", icon: "💬", label: "Direct Messages" },
    { href: "#", icon: "🔭", label: "Explore" },
  ];

  return (
    <aside className="w-18 bg-surface border-r border-border flex flex-col items-center py-4 gap-1">
      <Logo className="w-12 h-12 transition-transform group-hover:scale-105" />

      <div className="w-8 h-px bg-border my-1" />

      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
            isActive(item.href)
              ? "bg-primary/15 text-primary"
              : "text-muted hover:bg-surface-2 hover:text-text"
          }`}
        >
          {item.icon}
        </Link>
      ))}
    </aside>
  );
}
