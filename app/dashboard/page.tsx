"use client";

import { useAuth } from "@/components/providers/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        Welcome to Dassiya
      </h1>
      <p className="text-slate-600 dark:text-slate-400 text-lg">
        Manage your dairy accounts, milk logs, receipts, and 10-day billings easily.
      </p>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mt-8">
        {/* Quick stats could go here */}
        <div className="rounded-xl border bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-500 text-sm uppercase tracking-wider">Total Accounts</h3>
          <p className="text-3xl font-bold mt-2">-</p>
        </div>
        <div className="rounded-xl border bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-500 text-sm uppercase tracking-wider">Logs Today</h3>
          <p className="text-3xl font-bold mt-2">-</p>
        </div>
      </div>
    </div>
  );
}
