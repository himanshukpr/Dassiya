"use client";

import { useState, useMemo } from "react";
import { useAppData } from "@/components/providers/AppDataStore";
import type { Bill, Receipt } from "@/components/providers/AppDataStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FilePdf } from "@phosphor-icons/react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface LedgerRow {
  periodLabel: string;
  startDate: string;
  endDate: string;
  previousBalance: number;
  currentAmount: number;
  totalBalance: number;
  receipts: Receipt[];
  closingBalance: number;
}

function buildLedger(
  bills: Bill[],
  receipts: Receipt[],
  accountId: string
): LedgerRow[] {
  const accountBills = [...bills]
    .filter((b) => b.accountId === accountId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return accountBills.map((bill) => {
    const periodReceipts = receipts
      .filter(
        (r) =>
          r.accountId === accountId &&
          r.date >= bill.startDate &&
          r.date <= bill.endDate
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalReceived = periodReceipts
      .filter((r) => r.type === "Payment Received")
      .reduce((sum, r) => sum + r.amount, 0);

    const totalGiven = periodReceipts
      .filter((r) => r.type === "Payment Given")
      .reduce((sum, r) => sum + r.amount, 0);

    return {
      periodLabel: bill.periodLabel,
      startDate: bill.startDate,
      endDate: bill.endDate,
      previousBalance: bill.previousBalanceAtGeneration,
      currentAmount: bill.totalMilkAmount,
      totalBalance: bill.previousBalanceAtGeneration + bill.totalMilkAmount,
      receipts: periodReceipts,
      closingBalance: bill.newBalance,
    };
  });
}

export default function LedgerPage() {
  const { accounts, bills, receipts, loadingBills, loadingAccounts } = useAppData();

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [filterYear, setFilterYear] = useState<number | "all">("all");

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    bills.forEach((bill) => {
      const y = parseInt(bill.startDate.substring(0, 4), 10);
      if (!isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [bills]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const ledgerRows = useMemo(() => {
    if (!selectedAccountId) return [];
    const rows = buildLedger(bills, receipts, selectedAccountId);
    if (filterYear === "all") return rows;
    return rows.filter((r) => r.startDate.startsWith(String(filterYear)));
  }, [bills, receipts, selectedAccountId, filterYear]);

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const handleExportPdf = () => {
    if (!selectedAccount || ledgerRows.length === 0) return;

    const rowsHtml = ledgerRows
      .map((row) => {
        const multiReceipt = row.receipts.length > 1;
        const firstReceipt = row.receipts[0];
        const restReceipts = row.receipts.slice(1);

        const firstRow = `
          <tr>
            <td rowspan="${row.receipts.length || 1}" style="vertical-align:middle; font-weight:700; white-space:nowrap;">
              ${escapeHtml(row.periodLabel)}
            </td>
            <td rowspan="${row.receipts.length || 1}" class="text-right" style="vertical-align:middle;">
              &#x20b9;${row.previousBalance.toFixed(0)}
            </td>
            <td rowspan="${row.receipts.length || 1}" class="text-right" style="vertical-align:middle;">
              &#x20b9;${row.currentAmount.toFixed(0)}
            </td>
            <td rowspan="${row.receipts.length || 1}" class="text-right" style="vertical-align:middle; font-weight:700;">
              &#x20b9;${row.totalBalance.toFixed(0)}
            </td>
            <td class="text-right">${firstReceipt ? `&#x20b9;${firstReceipt.amount.toFixed(0)}` : ""}</td>
            <td style="text-align:center; white-space:nowrap;">${firstReceipt ? firstReceipt.date : ""}</td>
            <td rowspan="${row.receipts.length || 1}" class="text-right" style="vertical-align:middle; font-weight:700; color:#1d4ed8;">
              &#x20b9;${row.closingBalance.toFixed(0)}
            </td>
          </tr>
        `;

        const extraRows = restReceipts.map(
          (r) => `
          <tr>
            <td class="text-right">&#x20b9;${r.amount.toFixed(0)}</td>
            <td style="text-align:center; white-space:nowrap;">${r.date}</td>
          </tr>
        `
        ).join("");

        return firstRow + extraRows;
      })
      .join("");

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
    iframe.onload = () => {
      const printDoc = iframe.contentWindow?.document;
      const printWin = iframe.contentWindow;
      if (!printDoc || !printWin) { iframe.remove(); return; }

      printDoc.open();
      printDoc.write(`
        <html>
          <head>
            <title>Ledger — ${escapeHtml(selectedAccount.name)}</title>
            <style>
              @page { size: A4 landscape; margin: 12mm; }
              body { font-family: Arial, sans-serif; font-size: 12px; color: #111827; margin: 0; }
              h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
              .subtitle { font-size: 11px; color: #6b7280; margin: 0 0 12px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 11px; }
              th { background: #f3f4f6; text-align: center; font-weight: 700; }
              .text-right { text-align: right; }
              tfoot td { background: #f9fafb; font-weight: 700; }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(selectedAccount.name)}</h1>
            <p class="subtitle">Account Ledger${filterYear !== "all" ? ` — ${filterYear}` : ""} · ${selectedAccount.type}</p>
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Prev. Bal (&#x20b9;)</th>
                  <th>Current (&#x20b9;)</th>
                  <th>T. Bal (&#x20b9;)</th>
                  <th>Receipt (&#x20b9;)</th>
                  <th>Dated</th>
                  <th>C. Bal (&#x20b9;)</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="7" style="text-align:center;padding:16px;color:#9ca3af;">No records found.</td></tr>`}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printDoc.close();
      setTimeout(() => { printWin.focus(); printWin.print(); iframe.remove(); }, 200);
    };
    document.body.appendChild(iframe);
    iframe.src = "about:blank";
  };

  const loading = loadingBills || loadingAccounts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Per-account billing history with balances and payments
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={!selectedAccountId || ledgerRows.length === 0}
        >
          <FilePdf className="h-4 w-4 mr-1.5" />
          Export PDF
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-white dark:bg-slate-900 p-4">
        <div className="space-y-2">
          <Label>Account</Label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an account…" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  <span className="ml-2 text-xs text-slate-400">({a.type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Year</Label>
          <Select
            value={String(filterYear)}
            onValueChange={(v) => setFilterYear(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Ledger Table */}
      {!selectedAccountId ? (
        <div className="rounded-lg border bg-white dark:bg-slate-900 p-12 text-center text-slate-400">
          Select an account above to view its ledger.
        </div>
      ) : loading ? (
        <div className="rounded-lg border bg-white dark:bg-slate-900 p-12 text-center text-slate-400">
          Loading…
        </div>
      ) : ledgerRows.length === 0 ? (
        <div className="rounded-lg border bg-white dark:bg-slate-900 p-12 text-center text-slate-400">
          No bills found for <strong>{selectedAccount?.name}</strong>
          {filterYear !== "all" ? ` in ${filterYear}` : ""}.
        </div>
      ) : (
        <div className="rounded-lg border bg-white dark:bg-slate-900 overflow-hidden">
          {/* Account header */}
          <div className="border-b px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {selectedAccount?.name}
              </span>
              <span className="ml-2 text-xs text-slate-400">{selectedAccount?.type}</span>
            </div>
            <div className="text-xs text-slate-400">
              {ledgerRows.length} period{ledgerRows.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 text-left font-semibold border-b border-slate-200 dark:border-slate-700">
                    Period
                  </th>
                  <th className="px-4 py-3 text-right font-semibold border-b border-slate-200 dark:border-slate-700">
                    Prev. Bal (₹)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold border-b border-slate-200 dark:border-slate-700">
                    Current (₹)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold border-b border-slate-200 dark:border-slate-700">
                    T. Bal (₹)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold border-b border-slate-200 dark:border-slate-700">
                    Receipt (₹)
                  </th>
                  <th className="px-4 py-3 text-center font-semibold border-b border-slate-200 dark:border-slate-700">
                    Dated
                  </th>
                  <th className="px-4 py-3 text-right font-semibold border-b border-slate-200 dark:border-slate-700">
                    C. Bal (₹)
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row, rowIdx) => {
                  const hasReceipts = row.receipts.length > 0;
                  const rowSpan = hasReceipts ? row.receipts.length : 1;
                  const isEven = rowIdx % 2 === 0;
                  const rowBg = isEven
                    ? "bg-white dark:bg-slate-900"
                    : "bg-slate-50/60 dark:bg-slate-800/40";

                  return row.receipts.length > 0 ? (
                    row.receipts.map((receipt, rIdx) => (
                      <tr
                        key={`${row.startDate}-${rIdx}`}
                        className={`${rowBg} border-b border-slate-100 dark:border-slate-800`}
                      >
                        {rIdx === 0 && (
                          <>
                            <td
                              className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap"
                              rowSpan={rowSpan}
                            >
                              {row.periodLabel}
                            </td>
                            <td
                              className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums"
                              rowSpan={rowSpan}
                            >
                              {row.previousBalance.toLocaleString("en-IN")}
                            </td>
                            <td
                              className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums"
                              rowSpan={rowSpan}
                            >
                              {row.currentAmount.toLocaleString("en-IN")}
                            </td>
                            <td
                              className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums"
                              rowSpan={rowSpan}
                            >
                              {row.totalBalance.toLocaleString("en-IN")}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                          {receipt.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2 text-center text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {receipt.date}
                        </td>
                        {rIdx === 0 && (
                          <td
                            className="px-4 py-3 text-right font-bold text-blue-700 dark:text-blue-400 tabular-nums"
                            rowSpan={rowSpan}
                          >
                            {row.closingBalance.toLocaleString("en-IN")}
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr
                      key={row.startDate}
                      className={`${rowBg} border-b border-slate-100 dark:border-slate-800`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {row.periodLabel}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                        {row.previousBalance.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {row.currentAmount.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {row.totalBalance.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 dark:text-slate-600 tabular-nums">
                        —
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300 dark:text-slate-600">
                        —
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                        {row.closingBalance.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Summary footer */}
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-800 text-sm">
                  <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200">
                    Totals
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                    —
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    ₹{ledgerRows
                      .reduce((s, r) => s + r.currentAmount, 0)
                      .toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">—</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    ₹{ledgerRows
                      .reduce(
                        (s, r) =>
                          s +
                          r.receipts
                            .filter((rx) => rx.type === "Payment Received")
                            .reduce((rs, rx) => rs + rx.amount, 0),
                        0
                      )
                      .toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">—</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                    ₹{ledgerRows.length > 0
                      ? ledgerRows[ledgerRows.length - 1].closingBalance.toLocaleString("en-IN")
                      : "0"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
