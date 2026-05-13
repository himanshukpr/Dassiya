"use client";

import { useState, useMemo } from "react";
import { useAppData } from "@/components/providers/AppDataStore";
import type { Bill, MilkLog } from "@/components/providers/AppDataStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash, CheckCircle, Warning, FilePdf } from "@phosphor-icons/react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function BillsPage() {
  const {
    accounts, bills, logs,
    loadingBills, addBillsBatch, deleteBill, getLogsForPeriod,
  } = useAppData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState("1-10");
  const [exportScope, setExportScope] = useState<"all" | "purchase" | "sale">("all");
  const [previewed, setPreviewed] = useState(false);

  // ── Compute date range for the selected period ──────────────────────────
  const { startStr, endStr, label } = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    const ranges: Record<string, [number, number]> = {
      "1-10": [1, 10],
      "11-20": [11, 20],
      "21-end": [21, lastDay],
    };
    const [startD, endD] = ranges[period];
    const pad = (n: number) => String(n).padStart(2, "0");
    const mm = pad(month);
    return {
      startStr: `${year}-${mm}-${pad(startD)}`,
      endStr: `${year}-${mm}-${pad(endD)}`,
      label: `${MONTHS[month - 1]} ${year} (${period === "21-end" ? `21-${lastDay}` : period})`,
    };
  }, [month, year, period]);

  // ── Build per-account preview from local log cache ──────────────────────
  // This runs instantly on every render — no Firestore query needed
  const accountPreviews = useMemo(() => {
    return accounts.map((account) => {
      const logsInPeriod = getLogsForPeriod(account.id, startStr, endStr);

      let totalCow = 0, totalBuffalo = 0, totalAmount = 0;
      logsInPeriod.forEach((l) => {
        if (l.milkType === "Cow") totalCow += l.qty;
        else totalBuffalo += l.qty;
        totalAmount += l.amount ?? 0;
      });

      // Check if a bill already exists for this account + period
      const existingBill = bills.find(
        (b) => b.accountId === account.id && b.startDate === startStr && b.endDate === endStr
      );

      return {
        account,
        logsCount: logsInPeriod.length,
        totalCow,
        totalBuffalo,
        totalAmount,
        newBalance: account.previousBalance + totalAmount,
        existingBill: existingBill ?? null,
        // Will be generated only if: has logs AND no existing bill
        willGenerate: logsInPeriod.length > 0 && !existingBill,
      };
    });
  }, [accounts, bills, startStr, endStr, getLogsForPeriod]);

  const toGenerate = accountPreviews.filter((p) => p.willGenerate);
  const alreadyDone = accountPreviews.filter((p) => !!p.existingBill);
  const noLogs = accountPreviews.filter((p) => !p.existingBill && p.logsCount === 0);
  const accountTypeById = useMemo(() => new Map(accounts.map((account) => [account.id, account.type] as const)), [accounts]);
  const saleBills = bills.filter((bill) => accountTypeById.get(bill.accountId) === "Sale To");
  const purchaseBills = bills.filter((bill) => accountTypeById.get(bill.accountId) === "Purchase From");
  const selectedPeriodBills = bills.filter((bill) => bill.startDate === startStr && bill.endDate === endStr);
  const selectedPeriodSaleBills = selectedPeriodBills.filter((bill) => accountTypeById.get(bill.accountId) === "Sale To");
  const selectedPeriodPurchaseBills = selectedPeriodBills.filter((bill) => accountTypeById.get(bill.accountId) === "Purchase From");
  const hasSelectedPeriodBills = selectedPeriodBills.length > 0;
  const selectedPeriodLogs = useMemo(() => {
    return logs.filter((log) => log.date >= startStr && log.date <= endStr);
  }, [logs, startStr, endStr]);
  const selectedPeriodSaleLogs = selectedPeriodLogs.filter((log) => log.accountType === "Sale To");
  const selectedPeriodPurchaseLogs = selectedPeriodLogs.filter((log) => log.accountType === "Purchase From");

  const getExportAccounts = () => {
    if (exportScope === "purchase") {
      return accounts.filter((account) => account.type === "Purchase From");
    }

    if (exportScope === "sale") {
      return accounts.filter((account) => account.type === "Sale To");
    }

    return accounts;
  };

  const getBillType = (bill: Bill) => accountTypeById.get(bill.accountId) ?? "Unknown";

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const printHtml = (title: string, bodyHtml: string) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";

    const removeFrame = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 1000);
    };

    iframe.onload = () => {
      const printDoc = iframe.contentWindow?.document;
      const printWin = iframe.contentWindow;
      if (!printDoc || !printWin) {
        removeFrame();
        return;
      }

      const cleanupAndPrint = () => {
        printWin.focus();
        printWin.print();
        removeFrame();
      };

      printDoc.open();
      printDoc.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
            .page { padding: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
            .title { font-size: 22px; font-weight: 700; margin: 0; }
            .subtitle { font-size: 12px; color: #6b7280; margin: 6px 0 0; }
            .chip { display: inline-block; padding: 4px 10px; border-radius: 9999px; background: #e5e7eb; font-size: 12px; margin: 4px 6px 0 0; }
            .section { margin-top: 18px; }
            .section-title { font-size: 16px; font-weight: 700; margin: 0 0 8px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; vertical-align: top; }
            th { background: #f3f4f6; text-align: left; }
            .text-right { text-align: right; }
            .muted { color: #6b7280; }
            .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
            .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
            .card-label { font-size: 11px; color: #6b7280; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
            .card-value { font-size: 16px; font-weight: 700; margin: 0; }
            .break { page-break-after: always; }
            .bill-card { border: 1px solid #d1d5db; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
            .bill-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
          </style>
        </head>
        <body>
          ${bodyHtml}
        </body>
      </html>
      `);
      printDoc.close();
      window.setTimeout(cleanupAndPrint, 150);
    };

    document.body.appendChild(iframe);
    iframe.src = "about:blank";
  };

  const renderBillTableRows = (items: Bill[]) => {
    if (items.length === 0) {
      return `
        <tr>
          <td colspan="7" class="muted" style="text-align:center; padding: 16px;">No bills in this section.</td>
        </tr>
      `;
    }

    return items.map((bill) => `
      <tr>
        <td>
          <div style="font-weight:700;">${bill.periodLabel}</div>
          <div class="muted">${bill.startDate} → ${bill.endDate}</div>
        </td>
        <td>
          <div style="font-weight:700;">${bill.accountName}</div>
          <div class="muted">${getBillType(bill)}</div>
        </td>
        <td class="text-right">${bill.totalCowQty.toFixed(1)}</td>
        <td class="text-right">${bill.totalBuffaloQty.toFixed(1)}</td>
        <td class="text-right">₹${bill.totalMilkAmount.toFixed(2)}</td>
        <td class="text-right">₹${bill.previousBalanceAtGeneration.toFixed(2)}</td>
        <td class="text-right">₹${bill.newBalance.toFixed(2)}</td>
      </tr>
    `).join("");
  };

  const renderLogTableRows = (items: MilkLog[]) => {
    if (items.length === 0) {
      return `
        <tr>
          <td colspan="8" class="muted" style="text-align:center; padding: 16px;">No logs in this section.</td>
        </tr>
      `;
    }

    return items.map((log) => `
      <tr>
        <td>${log.date}</td>
        <td>
          <div style="font-weight:700;">${escapeHtml(log.accountName)}</div>
          <div class="muted">${escapeHtml(log.accountType)}</div>
        </td>
        <td>${escapeHtml(log.milkType)}</td>
        <td class="text-right">${log.qty.toFixed(2)}</td>
        <td class="text-right">${log.milkType === "Buffalo" ? log.fat.toFixed(1) : "—"}</td>
        <td>${escapeHtml(log.timePeriod)}</td>
        <td class="text-right">₹${(log.amount ?? 0).toFixed(2)}</td>
      </tr>
    `).join("");
  };

  const buildAccountStatement = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return null;

    type StatementRow = {
      MorningCowQty: number;
      MorningCowAmt: number;
      MorningBuffaloQty: number;
      MorningBuffaloFat: number;
      MorningBuffaloAmt: number;
      EveningCowQty: number;
      EveningCowAmt: number;
      EveningBuffaloQty: number;
      EveningBuffaloFat: number;
      EveningBuffaloAmt: number;
    };

    const accountLogs = selectedPeriodLogs
      .filter((log) => log.accountId === accountId)
      .sort((left, right) => left.date.localeCompare(right.date));

    const dateMap = new Map<string, StatementRow>();
    accountLogs.forEach((log) => {
      const row: StatementRow = dateMap.get(log.date) ?? {
        MorningCowQty: 0,
        MorningCowAmt: 0,
        MorningBuffaloQty: 0,
        MorningBuffaloFat: 0,
        MorningBuffaloAmt: 0,
        EveningCowQty: 0,
        EveningCowAmt: 0,
        EveningBuffaloQty: 0,
        EveningBuffaloFat: 0,
        EveningBuffaloAmt: 0,
      };

      const qty = log.qty ?? 0;
      const fat = log.fat ?? 0;
      const amount = log.amount ?? 0;

      if (log.timePeriod === "Morning") {
        if (log.milkType === "Cow") {
          row.MorningCowQty += qty;
          row.MorningCowAmt += amount;
        } else {
          row.MorningBuffaloQty += qty;
          row.MorningBuffaloFat = fat || row.MorningBuffaloFat;
          row.MorningBuffaloAmt += amount;
        }
      } else {
        if (log.milkType === "Cow") {
          row.EveningCowQty += qty;
          row.EveningCowAmt += amount;
        } else {
          row.EveningBuffaloQty += qty;
          row.EveningBuffaloFat = fat || row.EveningBuffaloFat;
          row.EveningBuffaloAmt += amount;
        }
      }

      dateMap.set(log.date, row);
    });

    const dates = Array.from(dateMap.keys()).sort();

    let morningCowTotal = 0;
    let morningBuffaloTotal = 0;
    let eveningCowTotal = 0;
    let eveningBuffaloTotal = 0;

    const rows = dates.map((date) => {
      const row: StatementRow = dateMap.get(date) ?? {
        MorningCowQty: 0,
        MorningCowAmt: 0,
        MorningBuffaloQty: 0,
        MorningBuffaloFat: 0,
        MorningBuffaloAmt: 0,
        EveningCowQty: 0,
        EveningCowAmt: 0,
        EveningBuffaloQty: 0,
        EveningBuffaloFat: 0,
        EveningBuffaloAmt: 0,
      };
      const morningCowAmt = row.MorningCowAmt ?? 0;
      const morningBuffaloAmt = row.MorningBuffaloAmt ?? 0;
      const eveningCowAmt = row.EveningCowAmt ?? 0;
      const eveningBuffaloAmt = row.EveningBuffaloAmt ?? 0;

      const morningCowQty = row.MorningCowQty ?? 0;
      const morningBuffaloQty = row.MorningBuffaloQty ?? 0;
      const morningBuffaloFat = row.MorningBuffaloFat ?? 0;
      const eveningCowQty = row.EveningCowQty ?? 0;
      const eveningBuffaloQty = row.EveningBuffaloQty ?? 0;
      const eveningBuffaloFat = row.EveningBuffaloFat ?? 0;

      morningCowTotal += morningCowAmt;
      morningBuffaloTotal += morningBuffaloAmt;
      eveningCowTotal += eveningCowAmt;
      eveningBuffaloTotal += eveningBuffaloAmt;

      return `
        <tr>
          <td class="text-right"><strong>${new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</strong></td>
          <td class="text-right">${morningCowQty ? morningCowQty.toFixed(1) : ""}</td>
          <td class="text-right">${morningCowAmt ? morningCowAmt.toFixed(0) : ""}</td>
          <td class="text-right">${morningBuffaloQty ? morningBuffaloQty.toFixed(1) : ""}</td>
          <td class="text-right">${morningBuffaloFat ? morningBuffaloFat.toFixed(1) : ""}</td>
          <td class="text-right">${morningBuffaloAmt ? morningBuffaloAmt.toFixed(0) : ""}</td>
          <td class="text-right">${eveningCowQty ? eveningCowQty.toFixed(1) : ""}</td>
          <td class="text-right">${eveningCowAmt ? eveningCowAmt.toFixed(0) : ""}</td>
          <td class="text-right">${eveningBuffaloQty ? eveningBuffaloQty.toFixed(1) : ""}</td>
          <td class="text-right">${eveningBuffaloFat ? eveningBuffaloFat.toFixed(1) : ""}</td>
          <td class="text-right">${eveningBuffaloAmt ? eveningBuffaloAmt.toFixed(0) : ""}</td>
        </tr>
      `;
    }).join("");

    const morningTotal = morningCowTotal + morningBuffaloTotal;
    const eveningTotal = eveningCowTotal + eveningBuffaloTotal;
    const grandTotal = morningCowTotal + morningBuffaloTotal + eveningCowTotal + eveningBuffaloTotal;

    return `
      <div class="section">
        <table>
          <thead>
            <tr>
              <th colspan="11" style="text-align:center; font-size:14px;">${escapeHtml(account.name)}</th>
            </tr>
            <tr>
              <th rowspan="2">DATE</th>
              <th colspan="5" style="text-align:center;">MORNING</th>
              <th colspan="5" style="text-align:center;">EVENING</th>
            </tr>
            <tr>
              <th class="text-right">COW QTY</th>
              <th class="text-right">COW AMT</th>
              <th class="text-right">BUF QTY</th>
              <th class="text-right">BUF FAT</th>
              <th class="text-right">BUF AMT</th>
              <th class="text-right">COW QTY</th>
              <th class="text-right">COW AMT</th>
              <th class="text-right">BUF QTY</th>
              <th class="text-right">BUF FAT</th>
              <th class="text-right">BUF AMT</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `
              <tr>
                <td colspan="11" class="muted" style="text-align:center; padding: 16px;">No logs for this account in the selected period.</td>
              </tr>
            `}
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="text-right"><strong>TOTAL:</strong> ${morningTotal.toFixed(0)}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td class="text-right"><strong>TOTAL:</strong> ${eveningTotal.toFixed(0)}</td>
            </tr>
            <tr>
              <td colspan="10" class="text-right"><strong>GRAND TOTAL:</strong></td>
              <td class="text-right"><strong>${grandTotal.toFixed(0)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  };

  const handleExportSelectedPeriodPdf = () => {
    const accountSections = getExportAccounts()
      .map((account) => buildAccountStatement(account.id))
      .filter(Boolean)
      .join('<div class="break"></div>');

    const body = `
      <div class="page">
        <div class="header">
          <div>
            <h1 class="title">Dassiya Bills</h1>
            <p class="subtitle">Selected period: ${escapeHtml(startStr)} to ${escapeHtml(endStr)}</p>
          </div>
          <div>
            <span class="chip">Sale To: ${selectedPeriodSaleBills.length}</span>
            <span class="chip">Purchase From: ${selectedPeriodPurchaseBills.length}</span>
            <span class="chip">Total: ${selectedPeriodBills.length}</span>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">Account Statements</h2>
          ${accountSections || `<div class="muted" style="text-align:center; padding: 16px;">No accounts found for the selected export type.</div>`}
        </div>
      </div>
    `;

    printHtml(`Dassiya Bills ${startStr} to ${endStr}`, body);
  };

  const handleExportSelectedPeriodPurchasePdf = () => {
    const accountSections = getExportAccounts()
      .map((account) => buildAccountStatement(account.id))
      .filter(Boolean)
      .join('<div class="break"></div>');

    const body = `
      <div class="page">
        <div class="header">
          <div>
            <h1 class="title">Dassiya Bills</h1>
            <p class="subtitle">Purchase From - selected period: ${escapeHtml(startStr)} to ${escapeHtml(endStr)}</p>
          </div>
          <div>
            <span class="chip">Purchase From: ${selectedPeriodPurchaseBills.length}</span>
          </div>
        </div>
        <div class="section">
          <h2 class="section-title">Account Statements</h2>
          ${accountSections || `<div class="muted" style="text-align:center; padding: 16px;">No accounts found for the selected export type.</div>`}
        </div>
      </div>
    `;

    printHtml(`Purchase From Bills ${startStr} to ${endStr}`, body);
  };

  const handleExportSelectedPeriodSalePdf = () => {
    const accountSections = getExportAccounts()
      .map((account) => buildAccountStatement(account.id))
      .filter(Boolean)
      .join('<div class="break"></div>');

    const body = `
      <div class="page">
        <div class="header">
          <div>
            <h1 class="title">Dassiya Bills</h1>
            <p class="subtitle">Sale To - selected period: ${escapeHtml(startStr)} to ${escapeHtml(endStr)}</p>
          </div>
          <div>
            <span class="chip">Sale To: ${selectedPeriodSaleBills.length}</span>
          </div>
        </div>
        <div class="section">
          <h2 class="section-title">Account Statements</h2>
          ${accountSections || `<div class="muted" style="text-align:center; padding: 16px;">No accounts found for the selected export type.</div>`}
        </div>
      </div>
    `;

    printHtml(`Sale To Bills ${startStr} to ${endStr}`, body);
  };

  const handleExportPdf = () => {
    if (exportScope === "purchase") {
      handleExportSelectedPeriodPurchasePdf();
      return;
    }

    if (exportScope === "sale") {
      handleExportSelectedPeriodSalePdf();
      return;
    }

    handleExportSelectedPeriodPdf();
  };

  const handleExportSingleBillPdf = (bill: Bill) => {
    const body = `
      <div class="page">
        <div class="bill-card">
          <div class="header">
            <div>
              <h1 class="title">Dassiya Bill</h1>
              <p class="subtitle">${escapeHtml(bill.periodLabel)}</p>
            </div>
            <div>
              <span class="chip">${getBillType(bill)}</span>
            </div>
          </div>

          <div class="summary">
            <div class="card">
              <p class="card-label">Account</p>
              <p class="card-value">${escapeHtml(bill.accountName)}</p>
            </div>
            <div class="card">
              <p class="card-label">Period</p>
              <p class="card-value">${bill.startDate} → ${bill.endDate}</p>
            </div>
            <div class="card">
              <p class="card-label">Milk Amount</p>
              <p class="card-value">₹${bill.totalMilkAmount.toFixed(2)}</p>
            </div>
            <div class="card">
              <p class="card-label">New Balance</p>
              <p class="card-value">₹${bill.newBalance.toFixed(2)}</p>
            </div>
          </div>

          <div class="bill-grid">
            <div class="card"><p class="card-label">Cow Qty</p><p class="card-value">${bill.totalCowQty.toFixed(1)}</p></div>
            <div class="card"><p class="card-label">Buffalo Qty</p><p class="card-value">${bill.totalBuffaloQty.toFixed(1)}</p></div>
            <div class="card"><p class="card-label">Previous Balance</p><p class="card-value">₹${bill.previousBalanceAtGeneration.toFixed(2)}</p></div>
          </div>
        </div>
      </div>
    `;

    printHtml(`Dassiya Bill ${bill.accountName}`, body);
  };

  const handleGenerate = async () => {
    if (toGenerate.length === 0) return;
    setSaving(true);

    const items = toGenerate.map(({ account, totalCow, totalBuffalo, totalAmount, newBalance }) => ({
      billData: {
        accountId: account.id,
        accountName: account.name,
        periodLabel: label,
        startDate: startStr,
        endDate: endStr,
        totalCowQty: totalCow,
        totalBuffaloQty: totalBuffalo,
        totalMilkAmount: totalAmount,
        previousBalanceAtGeneration: account.previousBalance,
        newBalance,
      },
      accountNewBalance: newBalance,
    }));

    await addBillsBatch(items);
    setSaving(false);
    setIsDialogOpen(false);
    setPreviewed(false);
  };

  const handleDelete = async (bill: Bill) => {
    if (!confirm("Delete this bill? The balance it added will be reverted.")) return;
    await deleteBill(bill);
  };

  const resetForm = () => {
    setPreviewed(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Bills (Dassiya)</h1>

        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>Generate Bills</Button>
          </DialogTrigger>

          <DialogContent className="w-[min(96vw,72rem)] max-w-none sm:max-w-none max-h-[90vh] overflow-x-hidden overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Generate 10-Day Dassiya — All Accounts</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Period selectors */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select value={period} onValueChange={(v) => setPeriod(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1 to 10</SelectItem>
                      <SelectItem value="11-20">11 to 20</SelectItem>
                      <SelectItem value="21-end">21 to End of Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                  {startStr} → {endStr}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
                  {toGenerate.length} will be generated
                </span>
                {alreadyDone.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 font-medium">
                    {alreadyDone.length} already done
                  </span>
                )}
                {noLogs.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                    {noLogs.length} no logs
                  </span>
                )}
              </div>

              {/* Per-account preview table */}
              <div className="w-full max-w-full rounded-lg border overflow-x-auto overflow-y-hidden">
                <table className="min-w-4xl w-full table-fixed text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="w-[28%] text-left px-3 py-2 text-xs font-semibold text-slate-500">Account</th>
                      <th className="w-[9%] text-right px-3 py-2 text-xs font-semibold text-slate-500">Logs</th>
                      <th className="w-[11%] text-right px-3 py-2 text-xs font-semibold text-slate-500">Cow (L)</th>
                      <th className="w-[11%] text-right px-3 py-2 text-xs font-semibold text-slate-500">Buf (L)</th>
                      <th className="w-[15%] text-right px-3 py-2 text-xs font-semibold text-slate-500">Amount (₹)</th>
                      <th className="w-[15%] text-right px-3 py-2 text-xs font-semibold text-slate-500">New Bal (₹)</th>
                      <th className="w-[11%] text-center px-3 py-2 text-xs font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-slate-700">
                    {accountPreviews.map(({ account, logsCount, totalCow, totalBuffalo, totalAmount, newBalance, existingBill, willGenerate }) => (
                      <tr
                        key={account.id}
                        className={`${willGenerate
                          ? "bg-white dark:bg-slate-900"
                          : existingBill
                            ? "bg-orange-50/50 dark:bg-orange-950/10"
                            : "bg-slate-50/70 dark:bg-slate-800/30 opacity-60"
                          }`}
                      >
                        <td className="px-3 py-2 align-top min-w-0">
                          <p className="truncate font-medium">{account.name}</p>
                          <p className="truncate text-xs text-slate-400">{account.type}</p>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{logsCount}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{totalCow.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{totalBuffalo.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700 dark:text-green-400">
                          {totalAmount > 0 ? `₹${totalAmount.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {totalAmount > 0 ? `₹${newBalance.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {existingBill ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                              <Warning size={12} /> Already Done
                            </span>
                          ) : logsCount === 0 ? (
                            <span className="text-xs text-slate-400">No Logs</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                              <CheckCircle size={12} /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {toGenerate.length === 0 && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border p-4 text-center text-sm text-slate-500">
                  {alreadyDone.length === accounts.length
                    ? "✅ All accounts already have a Dassiya bill for this period."
                    : "No accounts have milk logs in this period to generate bills for."}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={saving || toGenerate.length === 0}
                  className="min-w-45"
                >
                  {saving
                    ? `Generating ${toGenerate.length} bills...`
                    : `Generate ${toGenerate.length} Bill${toGenerate.length !== 1 ? "s" : ""}`}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Generated bills table */}
      <div className="rounded-md border bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">PDF Export</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose a period and export mode, then save the PDF from the popup.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setIsExportDialogOpen(true)}>
              <FilePdf className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{startStr} → {endStr}</span>
          <span>All bills: {selectedPeriodBills.length}</span>
          <span>Purchase From: {selectedPeriodPurchaseBills.length}</span>
          <span>Sale To: {selectedPeriodSaleBills.length}</span>
          {!hasSelectedPeriodBills && <span>No bills found for the selected period.</span>}
        </div>
      </div>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export PDF</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={period} onValueChange={(v) => setPeriod(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1 to 10</SelectItem>
                    <SelectItem value="11-20">11 to 20</SelectItem>
                    <SelectItem value="21-end">21 to End of Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Export Type</Label>
              <Select value={exportScope} onValueChange={(v: "all" | "purchase" | "sale") => setExportScope(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bills</SelectItem>
                  <SelectItem value="purchase">Purchase From</SelectItem>
                  <SelectItem value="sale">Sale To</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400">
              <div>{startStr} → {endStr}</div>
              <div>All bills: {selectedPeriodBills.length}</div>
              <div>Purchase From: {selectedPeriodPurchaseBills.length}</div>
              <div>Sale To: {selectedPeriodSaleBills.length}</div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportPdf}>
              Save PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border bg-white dark:bg-slate-900">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Purchase From</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Cow (L)</TableHead>
                  <TableHead className="text-right">Buffalo (L)</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead className="text-right">Prev Bal (₹)</TableHead>
                  <TableHead className="text-right">New Bal (₹)</TableHead>
                  <TableHead className="w-17.5 text-right">Del</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBills ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24 text-slate-400">Loading bills...</TableCell>
                  </TableRow>
                ) : purchaseBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24 text-slate-500">
                      No purchase from bills yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseBills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{bill.periodLabel}</p>
                        <p className="text-xs text-slate-400">{bill.startDate} → {bill.endDate}</p>
                      </TableCell>
                      <TableCell className="font-medium">{bill.accountName}</TableCell>
                      <TableCell className="text-right">{bill.totalCowQty.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{bill.totalBuffaloQty.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium text-green-700 dark:text-green-400">
                        +₹{bill.totalMilkAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">
                        ₹{bill.previousBalanceAtGeneration.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold">₹{bill.newBalance.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(bill)}>
                          <Trash className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-md border bg-white dark:bg-slate-900">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sale To</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Cow (L)</TableHead>
                  <TableHead className="text-right">Buffalo (L)</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead className="text-right">Prev Bal (₹)</TableHead>
                  <TableHead className="text-right">New Bal (₹)</TableHead>
                  <TableHead className="w-17.5 text-right">Del</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBills ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24 text-slate-400">Loading bills...</TableCell>
                  </TableRow>
                ) : saleBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center h-24 text-slate-500">
                      No sale to bills yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  saleBills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{bill.periodLabel}</p>
                        <p className="text-xs text-slate-400">{bill.startDate} → {bill.endDate}</p>
                      </TableCell>
                      <TableCell className="font-medium">{bill.accountName}</TableCell>
                      <TableCell className="text-right">{bill.totalCowQty.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{bill.totalBuffaloQty.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium text-green-700 dark:text-green-400">
                        +₹{bill.totalMilkAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">
                        ₹{bill.previousBalanceAtGeneration.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-bold">₹{bill.newBalance.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(bill)}>
                          <Trash className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
