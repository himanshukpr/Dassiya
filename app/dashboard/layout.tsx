"use client";

import { useAuth } from "@/components/providers/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  ListBullets, 
  Receipt, 
  Calculator, 
  SignOut, 
  List,
  X
} from "@phosphor-icons/react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Calculator },
  { name: "Accounts", href: "/dashboard/accounts", icon: Users },
  { name: "Milk Logs", href: "/dashboard/logs", icon: ListBullets },
  { name: "Receipts", href: "/dashboard/receipts", icon: Receipt },
  { name: "Bills (Dassiya)", href: "/dashboard/bills", icon: Calculator },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white dark:bg-slate-800 shadow-lg transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700">
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">Dassiya</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
            <X size={24} />
          </button>
        </div>
        <nav className="mt-6 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={20} weight={isActive ? "fill" : "regular"} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="mb-4 px-4 text-sm text-slate-500 truncate">
            {user.email}
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2"
            onClick={() => signOut(auth)}
          >
            <SignOut size={20} />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between bg-white dark:bg-slate-800 px-6 shadow-sm lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-500">
            <List size={24} />
          </button>
          <span className="text-lg font-semibold">Dassiya</span>
          <div className="w-6" /> {/* Spacer */}
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
