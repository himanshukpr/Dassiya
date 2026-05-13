"use client";

import { useAuth } from "@/components/providers/AuthContext";
import { useAppData } from "@/components/providers/AppDataStore";
import Link from "next/link";
import { Users, ListBullets, Receipt, Calculator, GearSix } from "@phosphor-icons/react";

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    accounts, logs, receipts, bills,
    loadingAccounts, loadingLogs, loadingReceipts, loadingBills,
  } = useAppData();

  const today = new Date().toISOString().split("T")[0];
  const logsToday = logs.filter((l) => l.date === today).length;

  const totalPurchaseBalance = accounts
    .filter((a) => a.type === "Purchase From")
    .reduce((sum, a) => sum + a.previousBalance, 0);

  const totalSaleBalance = accounts
    .filter((a) => a.type === "Sale To")
    .reduce((sum, a) => sum + a.previousBalance, 0);

  const stats = [
    {
      label: "Total Accounts",
      value: loadingAccounts ? "..." : accounts.length,
      sub: `${accounts.filter(a => a.type === "Purchase From").length} purchase · ${accounts.filter(a => a.type === "Sale To").length} sale`,
      color: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
      icon: Users,
      iconColor: "text-blue-600 dark:text-blue-400",
      href: "/dashboard/accounts",
    },
    {
      label: "Logs Today",
      value: loadingLogs ? "..." : logsToday,
      sub: `${logs.length} total entries`,
      color: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
      icon: ListBullets,
      iconColor: "text-amber-600 dark:text-amber-400",
      href: "/dashboard/logs",
    },
    {
      label: "Receipts",
      value: loadingReceipts ? "..." : receipts.length,
      sub: "total payments recorded",
      color: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800",
      icon: Receipt,
      iconColor: "text-green-600 dark:text-green-400",
      href: "/dashboard/receipts",
    },
    {
      label: "Bills Generated",
      value: loadingBills ? "..." : bills.length,
      sub: "Dassiya calculations",
      color: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
      icon: Calculator,
      iconColor: "text-purple-600 dark:text-purple-400",
      href: "/dashboard/bills",
    },
  ];

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Welcome, <span className="font-medium text-slate-700 dark:text-slate-300">{user?.email}</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`group rounded-xl border p-5 transition-shadow hover:shadow-md ${stat.color}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-500">{stat.sub}</p>
              </div>
              <stat.icon size={24} className={`${stat.iconColor} opacity-70 group-hover:opacity-100 transition-opacity`} />
            </div>
          </Link>
        ))}
      </div>

      {/* Balance summary */}
      {!loadingAccounts && accounts.length > 0 && (
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Balance Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4">
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Purchase From (Total Outstanding)</p>
              <p className={`text-2xl font-bold mt-1 ${totalPurchaseBalance < 0 ? "text-red-600" : "text-blue-700 dark:text-blue-300"}`}>
                ₹{totalPurchaseBalance.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Amount we owe to suppliers</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Sale To (Total Outstanding)</p>
              <p className={`text-2xl font-bold mt-1 ${totalSaleBalance < 0 ? "text-red-600" : "text-green-700 dark:text-green-300"}`}>
                ₹{totalSaleBalance.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Amount customers owe us</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="rounded-xl border bg-white dark:bg-slate-900 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Add Milk Log", href: "/dashboard/logs", icon: ListBullets, color: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" },
            { label: "Add Account", href: "/dashboard/accounts", icon: Users, color: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" },
            { label: "Record Payment", href: "/dashboard/payments", icon: Receipt, color: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300" },
            { label: "Set Rates", href: "/dashboard/rates", icon: GearSix, color: "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300" },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`flex items-center gap-2 rounded-lg p-3 text-sm font-medium transition-opacity hover:opacity-80 ${link.color}`}
            >
              <link.icon size={18} />
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
