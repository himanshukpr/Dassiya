"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData, calculateAmount, resolveAccountRates } from "@/components/providers/AppDataStore";
import type { MilkLog } from "@/components/providers/AppDataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, List, Calendar, MagnifyingGlass, Pencil, Plus, Trash, WarningCircle, X } from "@phosphor-icons/react";

type ToastState = {
  message: string;
  variant: "success" | "error";
};

type MilkType = MilkLog["milkType"];
type TimePeriod = MilkLog["timePeriod"];

type LogDraft = {
  rowId: string;
  accountId: string;
  milkType: MilkType;
  qty: string;
  fat: string;
  timePeriod: TimePeriod;
  date: string;
};

function normalizeDecimalInput(value: string) {
  const raw = value.replace(/[^0-9.]/g, "");
  if (!raw.includes(".") && raw.length >= 2) {
    return raw.slice(0, -1) + "." + raw.slice(-1);
  }
  return raw;
}

function createRowId() {
  return `__row_${Math.random().toString(36).slice(2)}`;
}

export default function LogsPage() {
  const { accounts, logs, rates, loadingLogs, addLog, updateLog, deleteLog } = useAppData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editingLog, setEditingLog] = useState<MilkLog | null>(null);
  const [editingDateLogs, setEditingDateLogs] = useState<MilkLog[] | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const getCached = (key: string, fallback: string) => {
    if (typeof window === "undefined") return fallback;
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.value && parsed.timestamp) {
        const hoursElapsed = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
        if (hoursElapsed >= 24) {
          sessionStorage.removeItem(key);
          return fallback;
        }
        return parsed.value;
      }
    } catch {
      sessionStorage.removeItem(key);
    }
    return fallback;
  };
  const setCached = (key: string, value: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
  };

  // Form state
  const [accountId, setAccountId] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [date, setDate] = useState(() => getCached("logs_date", today));
  const [milkType, setMilkType] = useState<"Cow" | "Buffalo" | "Sapreta">("Buffalo");
  const [qty, setQty] = useState("");
  const [fat, setFat] = useState("");
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(() => getCached("logs_timePeriod", "Morning") as TimePeriod);
  const createLogRow = (overrides: Partial<LogDraft> = {}): LogDraft => ({
    rowId: createRowId(),
    accountId: "",
    milkType: "Buffalo",
    qty: "",
    fat: "",
    timePeriod,
    date,
    ...overrides,
  });

  const getCachedLogRows = (): LogDraft[] | null => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem("logs_draftRows");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.value && parsed.timestamp) {
        const hoursElapsed = (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
        if (hoursElapsed >= 24) {
          sessionStorage.removeItem("logs_draftRows");
          return null;
        }
        return parsed.value;
      }
    } catch {
      sessionStorage.removeItem("logs_draftRows");
    }
    return null;
  };

  const [logRows, setLogRows] = useState<LogDraft[]>(() => getCachedLogRows() ?? [createLogRow()]);

  // Account type filter for add mode
  const [addAccountType, setAddAccountType] = useState<"Purchase From" | "Sale To">(() => {
    if (typeof window === "undefined") return "Purchase From";
    const raw = sessionStorage.getItem("logs_addAccountType");
    if (!raw) return "Purchase From";
    try {
      const parsed = JSON.parse(raw);
      if (parsed.value === "Purchase From" || parsed.value === "Sale To") return parsed.value;
    } catch { /* ignore */ }
    return "Purchase From";
  });
  // Table filters
  const [filterDate, setFilterDate] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<"All" | "Morning" | "Evening">("All");
  const [filterAccountType, setFilterAccountType] = useState<"Purchase From" | "Sale To">("Purchase From");
  const [logSearch, setLogSearch] = useState("");
  // Hierarchical view state
  const [selectedAccountName, setSelectedAccountName] = useState<string | null>(null);
  const [selectedPeriodLabel, setSelectedPeriodLabel] = useState<string | null>(null);
  // Records display mode: "hierarchy" (by account) or "datewise" (by date)
  const [logView, setLogView] = useState<"hierarchy" | "datewise">("hierarchy");

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const effectiveRates = useMemo(
    () => resolveAccountRates(rates, selectedAccount?.rateOverrides),
    [rates, selectedAccount]
  );

  // Accounts filtered by add type for the add mode
  const addModeAccounts = useMemo(
    () => accounts.filter((a) => a.type === addAccountType),
    [accounts, addAccountType]
  );

  const editingLogAccounts = useMemo(
    () => accounts.filter((a) => a.type === (editingLog?.accountType || addAccountType)),
    [accounts, editingLog, addAccountType]
  );

  // Persist draft rows and addAccountType to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("logs_draftRows", JSON.stringify({ value: logRows, timestamp: Date.now() }));
    }
  }, [logRows]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCached("logs_addAccountType", addAccountType);
    }
  }, [addAccountType]);

  const getFixedFatForPeriod = (period: TimePeriod, account?: { fixedFatMorning?: number | null; fixedFatEvening?: number | null } | null) => {
    const acct = account ?? selectedAccount;
    if (!acct) return null;
    const value = (period === "Morning" ? acct.fixedFatMorning : acct.fixedFatEvening) as unknown;
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getRowAccount = (row: LogDraft) => accounts.find((a) => a.id === row.accountId);

  const updateLogRow = (rowId: string, patch: Partial<LogDraft>, autoFillFixedFat = false) => {
    setLogRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = { ...row, ...patch };
        if (autoFillFixedFat && next.milkType === "Buffalo") {
          const acct = accounts.find((a) => a.id === next.accountId);
          const fixedFat = getFixedFatForPeriod(next.timePeriod, acct);
          if (fixedFat != null) next.fat = String(fixedFat);
        }
        return next;
      })
    );
  };

  useEffect(() => {
    setLogRows((prev) =>
      prev.map((row) => {
        if (row.milkType !== "Buffalo" || row.fat !== "" || !row.accountId) return row;
        const acct = accounts.find((a) => a.id === row.accountId);
        const fixedFat = getFixedFatForPeriod(row.timePeriod, acct);
        return fixedFat != null ? { ...row, fat: String(fixedFat) } : row;
      })
    );
  }, [accounts, logRows.map((r) => r.accountId).join(",")]);

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return accounts;

    return accounts.filter((account) => {
      return [account.name, account.type, account.mobile]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [accounts, accountSearch]);

  const sortByCreatedAt = (a: typeof logs[0], b: typeof logs[0]) => {
    const aTime = a.createdAt?.toMillis?.();
    const bTime = b.createdAt?.toMillis?.();
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return bTime - aTime;
  };

  const recentLogs = useMemo(() => {
    const typeFilter = editingLog ? filterAccountType : addAccountType;
    const filtered = logs.filter((l) => l.accountType === typeFilter);
    return [...filtered].sort(sortByCreatedAt).slice(0, 5);
  }, [logs, filterAccountType, addAccountType, editingLog]);

  const getRowAmount = (row: LogDraft) => {
    const rowAccount = getRowAccount(row);
    if (!rowAccount || !row.qty || parseFloat(row.qty) <= 0) return null;
    if (row.milkType === "Buffalo" && (!row.fat || parseFloat(row.fat) <= 0)) return null;
    const rowRates = resolveAccountRates(rates, rowAccount.rateOverrides);
    return calculateAmount(
      row.milkType,
      row.timePeriod,
      rowAccount.type,
      parseFloat(row.qty) || 0,
      parseFloat(row.fat) || 0,
      rowRates
    );
  };

  const addLogRow = () => {
    const basePeriod = logRows[logRows.length - 1]?.timePeriod ?? timePeriod;
    const row = createLogRow({ timePeriod: basePeriod });
    setLogRows((prev) => [...prev, row]);
  };

  const removeLogRow = (rowId: string) => {
    setLogRows((prev) => prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev);
  };

  const buildLogData = (row: LogDraft) => {
    const rowAccount = getRowAccount(row);
    if (!rowAccount) return null;
    const qty = parseFloat(row.qty);
    const fat = row.milkType === "Buffalo" ? parseFloat(row.fat) : 0;
    const rowRates = resolveAccountRates(rates, rowAccount.rateOverrides);
    return {
      accountId: row.accountId,
      accountName: rowAccount.name,
      accountType: rowAccount.type,
      date: row.date,
      milkType: row.milkType,
      qty,
      fat,
      timePeriod: row.timePeriod,
      amount: calculateAmount(row.milkType, row.timePeriod, rowAccount.type, qty, fat, rowRates),
    };
  };

  const validateLogRows = () => {
    if (!date) return "Select a date.";
    if (logRows.length === 0) return "Add at least one log row.";

    for (let index = 0; index < logRows.length; index += 1) {
      const row = logRows[index];
      if (!row.date) return `Row ${index + 1}: select a date.`;
      if (!row.accountId) {
        return `Row ${index + 1}: select an account.`;
      }
      const qty = parseFloat(row.qty);
      if (!row.qty || Number.isNaN(qty) || qty <= 0) {
        return `Row ${index + 1}: enter a valid quantity.`;
      }
      if (row.milkType === "Buffalo") {
        const fat = parseFloat(row.fat);
        if (!row.fat || Number.isNaN(fat) || fat <= 0) {
          return `Row ${index + 1}: enter a valid fat value.`;
        }
      }
    }

    return "";
  };

  const filteredLogs = useMemo(() => {
    const query = logSearch.trim().toLowerCase();
    return logs
      .filter((log) => {
        const matchesAccountType = log.accountType === filterAccountType;
        const matchesSearch = !query || log.accountName.toLowerCase().includes(query);
        return matchesAccountType && matchesSearch;
      })
      .sort(sortByCreatedAt);
  }, [logs, filterAccountType, logSearch]);

  // Logs for the "By Date" view, with optional single-date filter applied
  const dateViewLogs = useMemo(() => {
    if (logView !== "datewise" || !filterDate) return filteredLogs;
    return filteredLogs.filter((log) => log.date === filterDate);
  }, [filteredLogs, logView, filterDate]);

  // Helper to get period label from date
  const getPeriodLabel = (dateStr: string): string => {
    const day = parseInt(dateStr.split("-")[2], 10);
    const month = new Date(dateStr + "T00:00:00").toLocaleString("en-US", { month: "long" });
    const year = dateStr.split("-")[0];
    if (day <= 10) return `${month} ${year} (1-10)`;
    if (day <= 20) return `${month} ${year} (11-20)`;
    return `${month} ${year} (21-end)`;
  };

  // Group logs by account name
  const accountGroups = useMemo(() => {
    const groups = new Map<string, typeof filteredLogs>();
    filteredLogs.forEach((log) => {
      const existing = groups.get(log.accountName) ?? [];
      existing.push(log);
      groups.set(log.accountName, existing);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredLogs]);

  // Get logs for selected account, grouped by period
  const periodGroups = useMemo(() => {
    if (!selectedAccountName) return [];
    const accountLogs = filteredLogs.filter((log) => log.accountName === selectedAccountName);
    const groups = new Map<string, typeof accountLogs>();
    accountLogs.forEach((log) => {
      const label = getPeriodLabel(log.date);
      const existing = groups.get(label) ?? [];
      existing.push(log);
      groups.set(label, existing);
    });
    return Array.from(groups.entries()).sort((a, b) => b[1][0].date.localeCompare(a[1][0].date));
  }, [filteredLogs, selectedAccountName]);

  // Live amount preview — recalculates whenever any field changes
  const previewAmount = useMemo(() => {
    if (!selectedAccount || !qty || parseFloat(qty) <= 0) return null;
    if (milkType === "Buffalo" && (!fat || parseFloat(fat) <= 0)) return null;
    return calculateAmount(
      milkType,
      timePeriod,
      selectedAccount.type,
      parseFloat(qty) || 0,
      parseFloat(fat) || 0,
      effectiveRates
    );
  }, [selectedAccount, milkType, timePeriod, qty, fat, effectiveRates]);

  useEffect(() => { setCached("logs_date", date); }, [date]);

  useEffect(() => { setCached("logs_timePeriod", timePeriod); }, [timePeriod]);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleEdit = (dateLogs: MilkLog[]) => {
    if (dateLogs.length === 0) return;
    const firstLog = dateLogs[0];
    setEditingDateLogs(dateLogs);
    setEditingLog(firstLog);
    setDate(firstLog.date);
    setAddAccountType(firstLog.accountType);

    // Populate logRows with all logs for this date, preserving each log's date
    const rows: LogDraft[] = dateLogs.map((log) => ({
      rowId: createRowId(),
      accountId: log.accountId,
      milkType: log.milkType,
      qty: String(log.qty),
      fat: log.milkType === "Buffalo" ? String(log.fat) : "",
      timePeriod: log.timePeriod,
      date: log.date,
    }));
    setLogRows(rows);

    // Also set single-edit fields for backward compat
    setAccountId(firstLog.accountId);
    setAccountSearch(firstLog.accountName);
    setMilkType(firstLog.milkType);
    setQty(String(firstLog.qty));
    setFat(firstLog.milkType === "Buffalo" ? String(firstLog.fat) : "");
    setTimePeriod(firstLog.timePeriod);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingDateLogs && editingDateLogs.length > 0) {
        // Batch update: update all logs for this date
        const validationError = validateLogRows();
        if (validationError) {
          setToast({ message: validationError, variant: "error" });
          return;
        }

        const dataRows = logRows.map(buildLogData).filter((row): row is NonNullable<typeof row> => Boolean(row));

        // Update existing logs and add new ones
        const existingCount = editingDateLogs.length;
        const promises: Promise<void>[] = [];

        for (let i = 0; i < dataRows.length; i++) {
          if (i < existingCount) {
            // Update existing log
            promises.push(updateLog(editingDateLogs[i].id, dataRows[i]));
          } else {
            // Add new log
            promises.push(addLog(dataRows[i]));
          }
        }

        // Delete logs that were removed (if fewer rows now)
        for (let i = dataRows.length; i < existingCount; i++) {
          promises.push(deleteLog(editingDateLogs[i].id));
        }

        await Promise.all(promises);
        setToast({
          message: `${dataRows.length} milk log${dataRows.length === 1 ? "" : "s"} updated successfully.`,
          variant: "success",
        });
      } else {
        // Add new logs
        const validationError = validateLogRows();
        if (validationError) {
          setToast({ message: validationError, variant: "error" });
          return;
        }

        const dataRows = logRows.map(buildLogData).filter((row): row is NonNullable<typeof row> => Boolean(row));
        await Promise.all(dataRows.map(addLog));
        setToast({
          message: `${dataRows.length} milk log${dataRows.length === 1 ? "" : "s"} added successfully.`,
          variant: "success",
        });
        // Clear draft cache after successful submission
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("logs_draftRows");
        }
      }

      setEditingLog(null);
      setEditingDateLogs(null);
      resetForm({ preserveCache: true });
    } catch (error) {
      console.error("save log failed:", error);
      setToast({
        message: "Could not save the milk log. Please try again.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this log entry?")) return;
    await deleteLog(id);
  };

  const resetForm = ({ preserveCache = false }: { preserveCache?: boolean } = {}) => {
    setAccountId("");
    setAccountSearch("");
    if (!preserveCache) {
      setDate(today);
      setCached("logs_date", today);
      setTimePeriod("Morning");
      setCached("logs_timePeriod", "Morning");
      setLogRows([createLogRow({ timePeriod: "Morning" })]);
    } else {
      setLogRows([createLogRow()]);
    }
    setMilkType("Buffalo");
    setQty("");
    setFat("");
    setAddAccountType("Purchase From");
  };

  const accountPicker = (
    <div className="space-y-2">
      <Label>Account</Label>
      <div className="rounded-xl border border-border bg-background/80 p-2 shadow-sm sm:p-3">
        <div className="relative">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Search by account name, type, or mobile"
            className="pl-9"
          />
        </div>

        <div className="mt-3 max-h-40 overflow-auto rounded-lg border bg-background sm:max-h-48">
          {filteredAccounts.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No matching accounts found.
            </div>
          ) : (
            filteredAccounts.map((account) => {
              const active = account.id === accountId;
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setAccountId(account.id);
                    setAccountSearch(account.name);
                    if (milkType === "Buffalo") {
                      const fixedFat =
                        timePeriod === "Morning"
                          ? account.fixedFatMorning
                          : account.fixedFatEvening;
                      if (fixedFat != null) {
                        setFat(String(fixedFat));
                      }
                    }
                    setLogRows((prev) =>
                      prev.map((row) => {
                        if (row.milkType !== "Buffalo") return row;
                        const fixedFat =
                          row.timePeriod === "Morning"
                            ? account.fixedFatMorning
                            : account.fixedFatEvening;
                        return fixedFat != null ? { ...row, fat: String(fixedFat) } : row;
                      })
                    );
                  }}
                  className={`flex w-full items-center justify-between gap-4 border-b px-3 py-2 text-left text-sm last:border-b-0 transition-colors hover:bg-muted/60 ${active ? "bg-muted" : "bg-transparent"
                    }`}
                >
                  <div>
                    <div className="font-medium">{account.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {account.type} {account.mobile ? `• ${account.mobile}` : ""}
                    </div>
                  </div>
                  {active && <span className="text-xs font-medium text-primary">Selected</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Milk Logs</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingLog(null); }}>
          <DialogTrigger asChild>
            <Button>Add Milk Log</Button>
          </DialogTrigger>
          <DialogContent
            className="max-h-[calc(100dvh-4rem)] w-[calc(100vw-1rem)] overflow-y-auto p-3 sm:max-w-6xl sm:p-4"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editingDateLogs ? `Edit ${editingDateLogs.length} Log${editingDateLogs.length > 1 ? "s" : ""}` : "Add Milk Log"}</DialogTitle>
              <DialogDescription className="sr-only">
                {editingDateLogs ? "Edit the milk log entries for this date." : "Add a new milk log by selecting the time period, account, date, milk type, quantity, and fat if needed."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] lg:gap-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {editingDateLogs ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-date">Date</Label>
                      <Input id="edit-date" type="date" value={date} onChange={(e) => {
                        const newDate = e.target.value;
                        setDate(newDate);
                        setLogRows((prev) => prev.map((row) => ({ ...row, date: newDate })));
                      }} required />
                    </div>

                    <div className="flex border-b">
                      <button
                        type="button"
                        onClick={() => {
                          setAddAccountType("Purchase From");
                          setLogRows((prev) => prev.map((row) => ({ ...row, accountId: "" })));
                        }}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                          addAccountType === "Purchase From"
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Purchase From
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddAccountType("Sale To");
                          setLogRows((prev) => prev.map((row) => ({ ...row, accountId: "" })));
                        }}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                          addAccountType === "Sale To"
                            ? "border-green-500 text-green-600 dark:text-green-400"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Sale To
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Milk Log Rows</h3>
                        <p className="text-xs text-muted-foreground">Edit existing entries or add new ones.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addLogRow}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add Row
                      </Button>
                    </div>

                    <div className="grid gap-3 md:hidden">
                      {logRows.map((row, index) => {
                        const rowAmount = getRowAmount(row);
                        const rowAccount = getRowAccount(row);
                        const fixedFat = getFixedFatForPeriod(row.timePeriod, rowAccount);
                        const isExisting = editingDateLogs.some((l) => l.id === (editingDateLogs[index]?.id));
                        return (
                          <div key={row.rowId} className="rounded-xl border border-border bg-background/60 p-3 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Row {index + 1}{isExisting ? " (existing)" : " (new)"}</p>
                                <h4 className="text-sm font-semibold">Milk Log</h4>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLogRow(row.rowId)}
                                disabled={logRows.length === 1}
                                aria-label={`Remove row ${index + 1}`}
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label>Account</Label>
                                <Select
                                  value={row.accountId}
                                  onValueChange={(val) => {
                                    updateLogRow(row.rowId, { accountId: val }, true);
                                  }}
                                >
                                  <SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger>
                                  <SelectContent>
                                    {addModeAccounts.length === 0 ? (
                                      <div className="p-2 text-sm text-muted-foreground">No accounts found.</div>
                                    ) : (
                                      addModeAccounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label>Period</Label>
                                  <Select
                                    value={row.timePeriod}
                                    onValueChange={(val: TimePeriod) => updateLogRow(row.rowId, { timePeriod: val }, true)}
                                  >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Morning">Morning</SelectItem>
                                      <SelectItem value="Evening">Evening</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Item</Label>
                                  <Select
                                    value={row.milkType}
                                    onValueChange={(val: MilkType) => {
                                      const acct = getRowAccount(row);
                                      const fixedFatVal = getFixedFatForPeriod(row.timePeriod, acct);
                                      updateLogRow(row.rowId, {
                                        milkType: val,
                                        fat: val === "Buffalo" ? (fixedFatVal != null ? String(fixedFatVal) : "") : "",
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Buffalo">Buffalo</SelectItem>
                                      <SelectItem value="Cow">Cow</SelectItem>
                                      <SelectItem value="Sapreta">Sapreta</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Qty</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={row.qty}
                                    onChange={(e) => updateLogRow(row.rowId, { qty: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </div>
                                {row.milkType === "Buffalo" ? (
                                  <div className="space-y-2">
                                    <Label>Fat %</Label>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={row.fat}
                                      onChange={(e) => updateLogRow(row.rowId, { fat: normalizeDecimalInput(e.target.value) })}
                                      placeholder={fixedFat != null ? String(fixedFat) : "0.0"}
                                    />
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Label>Fat %</Label>
                                    <div className="rounded-lg border border-border bg-muted/30 p-2 text-sm text-muted-foreground">
                                      Not needed
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                              <span className="text-sm text-muted-foreground">Row Amount</span>
                              <span className="text-lg font-bold text-green-700 dark:text-green-400">
                                {rowAmount !== null ? `₹${rowAmount.toFixed(2)}` : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100/50 dark:bg-slate-800/50 text-slate-500">
                            <th className="px-2 py-2 text-left font-medium w-[30px]">#</th>
                            <th className="px-2 py-2 text-left font-medium">Account</th>
                            <th className="px-2 py-2 text-left font-medium">Period</th>
                            <th className="px-2 py-2 text-left font-medium">Type</th>
                            <th className="px-2 py-2 text-right font-medium">Qty</th>
                            <th className="px-2 py-2 text-right font-medium">Fat</th>
                            <th className="px-2 py-2 text-right font-medium">Amount</th>
                            <th className="px-2 py-2 text-center font-medium w-[50px]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {logRows.map((row, index) => {
                            const rowAccount = getRowAccount(row);
                            const rowAmount = getRowAmount(row);
                            return (
                              <tr key={row.rowId} className="hover:bg-white dark:hover:bg-slate-900/50">
                                <td className="px-2 py-2 text-slate-400">{index + 1}</td>
                                <td className="px-2 py-2">
                                  <Select
                                    value={row.accountId}
                                    onValueChange={(val) => updateLogRow(row.rowId, { accountId: val }, true)}
                                  >
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                      {addModeAccounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-2 py-2">
                                  <Select
                                    value={row.timePeriod}
                                    onValueChange={(val: TimePeriod) => updateLogRow(row.rowId, { timePeriod: val }, true)}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Morning">Morning</SelectItem>
                                      <SelectItem value="Evening">Evening</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-2 py-2">
                                  <Select
                                    value={row.milkType}
                                    onValueChange={(val: MilkType) => {
                                      const acct = getRowAccount(row);
                                      const fixedFatVal = getFixedFatForPeriod(row.timePeriod, acct);
                                      updateLogRow(row.rowId, {
                                        milkType: val,
                                        fat: val === "Buffalo" ? (fixedFatVal != null ? String(fixedFatVal) : "") : "",
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Buffalo">Buffalo</SelectItem>
                                      <SelectItem value="Cow">Cow</SelectItem>
                                      <SelectItem value="Sapreta">Sapreta</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-2 py-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 text-xs text-right"
                                    value={row.qty}
                                    onChange={(e) => updateLogRow(row.rowId, { qty: e.target.value })}
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  {row.milkType === "Buffalo" ? (
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      className="h-8 text-xs text-right"
                                      value={row.fat}
                                      onChange={(e) => updateLogRow(row.rowId, { fat: normalizeDecimalInput(e.target.value) })}
                                      placeholder="0.0"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right font-medium text-green-700 dark:text-green-400">
                                  {rowAmount !== null ? `₹${rowAmount.toFixed(0)}` : "—"}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => removeLogRow(row.rowId)}
                                    disabled={logRows.length === 1}
                                  >
                                    <X className="h-3 w-3 text-red-500" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {logRows.some((row) => row.qty && getRowAmount(row) === null) ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        Complete account, quantity, and fat for every row to calculate amounts.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input id="date" type="date" value={date} onChange={(e) => {
                        const newDate = e.target.value;
                        setDate(newDate);
                        setLogRows((prev) => prev.map((row) => ({ ...row, date: newDate })));
                      }} required />
                    </div>

                    <div className="flex border-b">
                      <button
                        type="button"
                        onClick={() => {
                          setAddAccountType("Purchase From");
                          setLogRows((prev) => prev.map((row) => ({ ...row, accountId: "" })));
                        }}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                          addAccountType === "Purchase From"
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Purchase From
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddAccountType("Sale To");
                          setLogRows((prev) => prev.map((row) => ({ ...row, accountId: "" })));
                        }}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                          addAccountType === "Sale To"
                            ? "border-green-500 text-green-600 dark:text-green-400"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Sale To
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Milk Log Rows</h3>
                        <p className="text-xs text-muted-foreground">Add multiple entries with different accounts and periods.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addLogRow}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add Row
                      </Button>
                    </div>

                    <div className="grid gap-3 md:hidden">
                      {logRows.map((row, index) => {
                        const rowAmount = getRowAmount(row);
                        const rowAccount = getRowAccount(row);
                        const fixedFat = getFixedFatForPeriod(row.timePeriod, rowAccount);
                        return (
                          <div key={row.rowId} className="rounded-xl border border-border bg-background/60 p-3 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Row {index + 1}</p>
                                <h4 className="text-sm font-semibold">Milk Log</h4>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLogRow(row.rowId)}
                                disabled={logRows.length === 1}
                                aria-label={`Remove row ${index + 1}`}
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label>Account</Label>
                                <Select
                                  value={row.accountId}
                                  onValueChange={(val) => {
                                    const acct = addModeAccounts.find((a) => a.id === val);
                                    updateLogRow(row.rowId, { accountId: val }, true);
                                  }}
                                >
                                  <SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger>
                                  <SelectContent>
                                    {addModeAccounts.length === 0 ? (
                                      <div className="p-2 text-sm text-muted-foreground">No accounts found.</div>
                                    ) : (
                                      addModeAccounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label>Period</Label>
                                  <Select
                                    value={row.timePeriod}
                                    onValueChange={(val: TimePeriod) => updateLogRow(row.rowId, { timePeriod: val }, true)}
                                  >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Morning">Morning</SelectItem>
                                      <SelectItem value="Evening">Evening</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Item</Label>
                                  <Select
                                    value={row.milkType}
                                    onValueChange={(val: MilkType) => {
                                      const acct = getRowAccount(row);
                                      const fixedFatVal = getFixedFatForPeriod(row.timePeriod, acct);
                                      updateLogRow(row.rowId, {
                                        milkType: val,
                                        fat: val === "Buffalo" ? (fixedFatVal != null ? String(fixedFatVal) : "") : "",
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Buffalo">Buffalo</SelectItem>
                                      <SelectItem value="Cow">Cow</SelectItem>
                                      <SelectItem value="Sapreta">Sapreta</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Qty</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={row.qty}
                                    onChange={(e) => updateLogRow(row.rowId, { qty: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </div>
                                {row.milkType === "Buffalo" ? (
                                  <div className="space-y-2">
                                    <Label>Fat %</Label>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={row.fat}
                                      onChange={(e) => updateLogRow(row.rowId, { fat: normalizeDecimalInput(e.target.value) })}
                                      placeholder={fixedFat != null ? String(fixedFat) : "0.0"}
                                    />
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Label>Fat %</Label>
                                    <div className="rounded-lg border border-border bg-muted/30 p-2 text-sm text-muted-foreground">
                                      Not needed
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                              <span className="text-sm text-muted-foreground">Row Amount</span>
                              <span className="text-lg font-bold text-green-700 dark:text-green-400">
                                {rowAmount !== null ? `₹${rowAmount.toFixed(2)}` : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3 md:hidden">
                      <span className="text-sm font-semibold">Total Amount</span>
                      <span className="text-lg font-bold text-green-700 dark:text-green-400">
                        ₹{(logRows.reduce((sum, row) => sum + (getRowAmount(row) ?? 0), 0)).toFixed(2)}
                      </span>
                    </div>

                    <div className="hidden rounded-xl border border-border bg-background/60 p-2 md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead className="w-[100px]">Qty</TableHead>
                            <TableHead className="w-[100px]">Fat %</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-[56px] text-right"> </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logRows.map((row, index) => {
                            const rowAmount = getRowAmount(row);
                            const rowAccount = getRowAccount(row);
                            const fixedFat = getFixedFatForPeriod(row.timePeriod, rowAccount);
                            return (
                              <TableRow key={row.rowId}>
                                <TableCell className="text-slate-400 text-sm">{index + 1}</TableCell>
                                <TableCell>
                                  <Select
                                    value={row.accountId}
                                    onValueChange={(val) => updateLogRow(row.rowId, { accountId: val }, true)}
                                  >
                                    <SelectTrigger className="w-full min-w-[140px]"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                      {addModeAccounts.length === 0 ? (
                                        <div className="p-2 text-sm text-muted-foreground">No accounts found.</div>
                                      ) : (
                                        addModeAccounts.map((a) => (
                                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={row.timePeriod}
                                    onValueChange={(val: TimePeriod) => updateLogRow(row.rowId, { timePeriod: val }, true)}
                                  >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Morning">Morning</SelectItem>
                                      <SelectItem value="Evening">Evening</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select
                                    value={row.milkType}
                                    onValueChange={(val: MilkType) => {
                                      const acct = getRowAccount(row);
                                      const fixedFatVal = getFixedFatForPeriod(row.timePeriod, acct);
                                      updateLogRow(row.rowId, {
                                        milkType: val,
                                        fat: val === "Buffalo" ? (fixedFatVal != null ? String(fixedFatVal) : "") : "",
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Buffalo">Buffalo</SelectItem>
                                      <SelectItem value="Cow">Cow</SelectItem>
                                      <SelectItem value="Sapreta">Sapreta</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={row.qty}
                                    onChange={(e) => updateLogRow(row.rowId, { qty: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </TableCell>
                                <TableCell>
                                  {row.milkType === "Buffalo" ? (
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={row.fat}
                                      onChange={(e) => updateLogRow(row.rowId, { fat: normalizeDecimalInput(e.target.value) })}
                                      placeholder={fixedFat != null ? String(fixedFat) : "0.0"}
                                    />
                                  ) : (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-right font-semibold text-green-700 dark:text-green-400">
                                  {rowAmount !== null ? `₹${rowAmount.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeLogRow(row.rowId)}
                                    disabled={logRows.length === 1}
                                    aria-label={`Remove row ${index + 1}`}
                                  >
                                    <X className="h-4 w-4 text-red-500" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={6} className="text-right font-semibold">Total Amount</TableCell>
                            <TableCell className="text-right font-bold text-green-700 dark:text-green-400">
                              ₹{(logRows.reduce((sum, row) => sum + (getRowAmount(row) ?? 0), 0)).toFixed(2)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>

                    {logRows.some((row) => row.qty && getRowAmount(row) === null) ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        Complete account, quantity, and fat for every row to calculate amounts.
                      </div>
                    ) : null}
                  </div>
                )}

                <DialogFooter className="px-0 pb-0">
                  <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                    {saving ? "Saving..." : editingDateLogs ? "Update Logs" : "Save Logs"}
                  </Button>
                </DialogFooter>
              </form>

              <aside className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 lg:sticky lg:top-0 lg:self-start">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Last 5 Logs</h3>
                    <p className="text-xs text-muted-foreground">Quick confirmation while you add entries.</p>
                  </div>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                    {recentLogs.length}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {recentLogs.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-background/80 p-4 text-sm text-muted-foreground">
                      No logs recorded yet.
                    </div>
                  ) : (
                    recentLogs.map((log) => (
                      <div key={log.id} className="rounded-lg border bg-background p-3 text-sm shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{log.accountName}</div>
                            <div className="text-xs text-muted-foreground">
                              {log.date} • {log.timePeriod} • {log.milkType}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-700 dark:text-green-400">
                              ₹{(log.amount ?? 0).toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Qty {log.qty}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </aside>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white dark:bg-slate-900">
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => { setFilterAccountType("Purchase From"); setSelectedAccountName(null); setSelectedPeriodLabel(null); }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              filterAccountType === "Purchase From"
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Purchase From
          </button>
          <button
            type="button"
            onClick={() => { setFilterAccountType("Sale To"); setSelectedAccountName(null); setSelectedPeriodLabel(null); }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              filterAccountType === "Sale To"
                ? "border-green-500 text-green-600 dark:text-green-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Sale To
          </button>
        </div>

        <div className="border-b p-4">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={logSearch}
              onChange={(e) => { setLogSearch(e.target.value); setSelectedAccountName(null); setSelectedPeriodLabel(null); }}
              placeholder="Search account name..."
              className="pl-9"
            />
          </div>
          <div className="mt-3 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800/50">
            <button
              type="button"
              onClick={() => setLogView("hierarchy")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                logView === "hierarchy"
                  ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              By Account
            </button>
            <button
              type="button"
              onClick={() => setLogView("datewise")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                logView === "datewise"
                  ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              By Date
            </button>
          </div>
        </div>

        {loadingLogs ? (
          <div className="p-12 text-center text-slate-400">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No logs found for {filterAccountType} accounts.
          </div>
        ) : logView === "hierarchy" ? (
          <div className="divide-y">
            {accountGroups.map(([accountName, accountLogs]) => {
              const isExpanded = selectedAccountName === accountName;
              const totalAmount = accountLogs.reduce((sum, l) => sum + (l.amount ?? 0), 0);
              return (
                <div key={accountName}>
                  <button
                    type="button"
                    onClick={() => { setSelectedAccountName(isExpanded ? null : accountName); setSelectedPeriodLabel(null); }}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{accountName}</span>
                        <span className="ml-2 text-xs text-slate-400">({accountLogs.length} logs)</span>
                      </div>
                    </div>
                    <span className="font-semibold text-green-700 dark:text-green-400">₹{totalAmount.toFixed(2)}</span>
                  </button>

                  {isExpanded && (
                    <div className="bg-slate-50/50 dark:bg-slate-800/30">
                      {periodGroups.map(([periodLabel, periodLogs]) => {
                        const isPeriodExpanded = selectedPeriodLabel === periodLabel;
                        const periodTotal = periodLogs.reduce((sum, l) => sum + (l.amount ?? 0), 0);
                        return (
                          <div key={periodLabel}>
                            <button
                              type="button"
                              onClick={() => setSelectedPeriodLabel(isPeriodExpanded ? null : periodLabel)}
                              className="flex w-full items-center justify-between pl-10 pr-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors border-t border-slate-100 dark:border-slate-800"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`text-slate-400 text-xs transition-transform ${isPeriodExpanded ? "rotate-90" : ""}`}>▶</span>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{periodLabel}</span>
                                <span className="text-xs text-slate-400">({periodLogs.length})</span>
                              </div>
                              <span className="text-sm font-medium text-green-700 dark:text-green-400">₹{periodTotal.toFixed(2)}</span>
                            </button>

                            {isPeriodExpanded && (() => {
                              // Sort logs by date then time period
                              const sortedLogs = [...periodLogs].sort((a, b) => {
                                const dateCmp = a.date.localeCompare(b.date);
                                if (dateCmp !== 0) return dateCmp;
                                return a.timePeriod === "Morning" ? -1 : 1;
                              });

                              // Calculate totals
                              let totalMorningCowQty = 0, totalMorningCowAmt = 0;
                              let totalMorningBufQty = 0, totalMorningBufAmt = 0;
                              let totalMorningSapQty = 0, totalMorningSapAmt = 0;
                              let totalEveningCowQty = 0, totalEveningCowAmt = 0;
                              let totalEveningBufQty = 0, totalEveningBufAmt = 0;
                              let totalEveningSapQty = 0, totalEveningSapAmt = 0;

                              periodLogs.forEach((log) => {
                                const qty = log.qty ?? 0;
                                const amt = log.amount ?? 0;
                                if (log.timePeriod === "Morning") {
                                  if (log.milkType === "Cow") { totalMorningCowQty += qty; totalMorningCowAmt += amt; }
                                  else if (log.milkType === "Buffalo") { totalMorningBufQty += qty; totalMorningBufAmt += amt; }
                                  else if (log.milkType === "Sapreta") { totalMorningSapQty += qty; totalMorningSapAmt += amt; }
                                } else {
                                  if (log.milkType === "Cow") { totalEveningCowQty += qty; totalEveningCowAmt += amt; }
                                  else if (log.milkType === "Buffalo") { totalEveningBufQty += qty; totalEveningBufAmt += amt; }
                                  else if (log.milkType === "Sapreta") { totalEveningSapQty += qty; totalEveningSapAmt += amt; }
                                }
                              });

                              return (
                                <div className="border-t border-slate-100 dark:border-slate-800">
                                  {/* Mobile */}
                                  <div className="md:hidden">
                                    {/* Morning section */}
                                    {(() => {
                                      const morningLogs = sortedLogs.filter((l) => l.timePeriod === "Morning");
                                      if (morningLogs.length === 0) return null;

                                      const dateMap = new Map<string, typeof morningLogs>();
                                      morningLogs.forEach((log) => {
                                        const existing = dateMap.get(log.date) ?? [];
                                        existing.push(log);
                                        dateMap.set(log.date, existing);
                                      });
                                      const dates = Array.from(dateMap.keys()).sort();

                                      return (
                                      <>
                                        <div className="px-4 py-2 pl-16 bg-yellow-50 dark:bg-yellow-900/20 text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                                          <span>MORNING</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                                                <th className="px-3 py-2 pl-16 text-left font-medium">DATE</th>
                                                <th className="px-2 py-2 text-left font-normal">TYPE</th>
                                                <th className="px-2 py-2 text-right font-normal">QTY</th>
                                                <th className="px-2 py-2 text-right font-normal">FAT</th>
                                                <th className="px-2 py-2 text-right font-normal">AMT</th>
                                                <th className="px-2 py-2 text-center font-normal w-[50px]"></th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                              {dates.map((date) => {
                                                const dayMorningLogs = dateMap.get(date) ?? [];
                                                const total = dayMorningLogs.reduce((s, l) => s + (l.amount ?? 0), 0);

                                                return dayMorningLogs.map((log, logIdx) => (
                                                  <tr key={log.id} className="hover:bg-white dark:hover:bg-slate-900/50">
                                                    {logIdx === 0 ? (
                                                      <td className="px-3 py-2 pl-16 font-medium text-slate-700 dark:text-slate-200 align-top whitespace-nowrap" rowSpan={dayMorningLogs.length}>
                                                        {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                                        <span className="ml-1 text-[10px] text-slate-400">({dayMorningLogs.length})</span>
                                                      </td>
                                                    ) : null}
                                                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{log.milkType}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums">{log.qty.toFixed(1)}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums">{log.milkType === "Buffalo" ? (log.fat ?? 0).toFixed(1) : "—"}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums font-medium text-green-700 dark:text-green-400">
                                                      {logIdx === dayMorningLogs.length - 1 ? `₹${total.toFixed(0)}` : ""}
                                                    </td>
                                                    <td className="px-2 py-2 text-center">
                                                      <div className="flex items-center justify-center gap-1">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit([log])}>
                                                          <Pencil className="h-3 w-3 text-slate-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(log.id)}>
                                                          <Trash className="h-3 w-3 text-red-500" />
                                                        </Button>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ));
                                              })}
                                            </tbody>
                                            <tfoot>
                                              <tr className="bg-slate-100/80 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-200">
                                                <td className="px-3 py-2 pl-16" colSpan={3}>Total</td>
                                                <td className="px-2 py-2 text-right tabular-nums">—</td>
                                                <td className="px-2 py-2 text-right tabular-nums text-green-700 dark:text-green-400">₹{totalMorningCowAmt + totalMorningBufAmt + totalMorningSapAmt}</td>
                                                <td></td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </>
                                      )})()}
                                    {/* Evening section */}
                                    {(() => {
                                      const eveningLogs = sortedLogs.filter((l) => l.timePeriod === "Evening");
                                      if (eveningLogs.length === 0) return null;

                                      const dateMap = new Map<string, typeof eveningLogs>();
                                      eveningLogs.forEach((log) => {
                                        const existing = dateMap.get(log.date) ?? [];
                                        existing.push(log);
                                        dateMap.set(log.date, existing);
                                      });
                                      const dates = Array.from(dateMap.keys()).sort();

                                      return (
                                      <>
                                        <div className="px-4 py-2 pl-16 bg-indigo-50 dark:bg-indigo-900/20 text-xs font-semibold text-indigo-700 dark:text-indigo-400 border-t border-slate-100 dark:border-slate-800">
                                          <span>EVENING</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                                                <th className="px-3 py-2 pl-16 text-left font-medium">DATE</th>
                                                <th className="px-2 py-2 text-left font-normal">TYPE</th>
                                                <th className="px-2 py-2 text-right font-normal">QTY</th>
                                                <th className="px-2 py-2 text-right font-normal">FAT</th>
                                                <th className="px-2 py-2 text-right font-normal">AMT</th>
                                                <th className="px-2 py-2 text-center font-normal w-[50px]"></th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                              {dates.map((date) => {
                                                const dayEveningLogs = dateMap.get(date) ?? [];
                                                const total = dayEveningLogs.reduce((s, l) => s + (l.amount ?? 0), 0);

                                                return dayEveningLogs.map((log, logIdx) => (
                                                  <tr key={log.id} className="hover:bg-white dark:hover:bg-slate-900/50">
                                                    {logIdx === 0 ? (
                                                      <td className="px-3 py-2 pl-16 font-medium text-slate-700 dark:text-slate-200 align-top whitespace-nowrap" rowSpan={dayEveningLogs.length}>
                                                        {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                                        <span className="ml-1 text-[10px] text-slate-400">({dayEveningLogs.length})</span>
                                                      </td>
                                                    ) : null}
                                                    <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{log.milkType}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums">{log.qty.toFixed(1)}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums">{log.milkType === "Buffalo" ? (log.fat ?? 0).toFixed(1) : "—"}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums font-medium text-green-700 dark:text-green-400">
                                                      {logIdx === dayEveningLogs.length - 1 ? `₹${total.toFixed(0)}` : ""}
                                                    </td>
                                                    <td className="px-2 py-2 text-center">
                                                      <div className="flex items-center justify-center gap-1">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit([log])}>
                                                          <Pencil className="h-3 w-3 text-slate-500" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(log.id)}>
                                                          <Trash className="h-3 w-3 text-red-500" />
                                                        </Button>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                ));
                                              })}
                                            </tbody>
                                            <tfoot>
                                              <tr className="bg-slate-100/80 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-200">
                                                <td className="px-3 py-2 pl-16" colSpan={3}>Total</td>
                                                <td className="px-2 py-2 text-right tabular-nums">—</td>
                                                <td className="px-2 py-2 text-right tabular-nums text-green-700 dark:text-green-400">₹{totalEveningCowAmt + totalEveningBufAmt + totalEveningSapAmt}</td>
                                                <td></td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </>
                                      )})()}
                                  </div>

                                  {/* Desktop: PDF-style table - one merged row per date */}
                                  <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-slate-100/50 dark:bg-slate-800/50">
                                          <th className="px-3 py-2 pl-16 text-left font-medium text-slate-500">DATE</th>
                                          <th colSpan={5} className="px-3 py-1 text-center font-medium text-yellow-700 dark:text-yellow-400 border-l border-slate-200 dark:border-slate-700">MORNING</th>
                                          <th className="px-2 py-1 text-center font-normal border-l border-slate-200 dark:border-slate-700 w-[60px]"></th>
                                          <th colSpan={5} className="px-3 py-1 text-center font-medium text-indigo-700 dark:text-indigo-400 border-l border-slate-200 dark:border-slate-700">EVENING</th>
                                          <th className="px-2 py-1 text-center font-normal border-l border-slate-200 dark:border-slate-700 w-[60px]"></th>
                                        </tr>
                                        <tr className="bg-slate-100/50 dark:bg-slate-800/50 text-slate-500">
                                          <th className="px-2 py-1 text-left font-normal"></th>
                                          <th className="px-2 py-1 text-right font-normal border-l border-slate-200 dark:border-slate-700">COW</th>
                                          <th className="px-2 py-1 text-right font-normal">SAP</th>
                                          <th className="px-2 py-1 text-right font-normal">BUF</th>
                                          <th className="px-2 py-1 text-right font-normal">FAT</th>
                                          <th className="px-2 py-1 text-right font-normal">AMT</th>
                                          <th className="px-2 py-1 text-center font-normal border-l border-slate-200 dark:border-slate-700"></th>
                                          <th className="px-2 py-1 text-right font-normal border-l border-slate-200 dark:border-slate-700">COW</th>
                                          <th className="px-2 py-1 text-right font-normal">SAP</th>
                                          <th className="px-2 py-1 text-right font-normal">BUF</th>
                                          <th className="px-2 py-1 text-right font-normal">FAT</th>
                                          <th className="px-2 py-1 text-right font-normal">AMT</th>
                                          <th className="px-2 py-1 text-center font-normal border-l border-slate-200 dark:border-slate-700"></th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {(() => {
                                          const dateMap = new Map<string, typeof sortedLogs>();
                                          sortedLogs.forEach((log) => {
                                            const existing = dateMap.get(log.date) ?? [];
                                            existing.push(log);
                                            dateMap.set(log.date, existing);
                                          });
                                          const dates = Array.from(dateMap.keys()).sort();

                                          return dates.map((date) => {
                                            const dayLogs = dateMap.get(date) ?? [];
                                            const morningLogs = dayLogs.filter((l) => l.timePeriod === "Morning");
                                            const eveningLogs = dayLogs.filter((l) => l.timePeriod === "Evening");
                                            const dateTotal = dayLogs.reduce((s, l) => s + (l.amount ?? 0), 0);

                                            const renderLines = (values: (string | null)[]) => {
                                              if (values.every((v) => v === null)) return null;
                                              return values.map((v, i) => (
                                                <span key={i} className="block leading-relaxed">{v ?? ""}</span>
                                              ));
                                            };

                                            // Build per-log aligned values for morning
                                            const mCowVals = morningLogs.map((l) => l.milkType === "Cow" ? l.qty.toFixed(1) : null);
                                            const mSapVals = morningLogs.map((l) => l.milkType === "Sapreta" ? l.qty.toFixed(1) : null);
                                            const mBufVals = morningLogs.map((l) => l.milkType === "Buffalo" ? l.qty.toFixed(1) : null);
                                            const mFatVals = morningLogs.map((l) => l.milkType === "Buffalo" ? (l.fat ?? 0).toFixed(1) : null);
                                            const mTotal = morningLogs.reduce((s, l) => s + (l.amount ?? 0), 0);
                                            const mAmtVals = morningLogs.map((_, i) => i === morningLogs.length - 1 ? `₹${mTotal.toFixed(0)}` : null);

                                            // Build per-log aligned values for evening
                                            const eCowVals = eveningLogs.map((l) => l.milkType === "Cow" ? l.qty.toFixed(1) : null);
                                            const eSapVals = eveningLogs.map((l) => l.milkType === "Sapreta" ? l.qty.toFixed(1) : null);
                                            const eBufVals = eveningLogs.map((l) => l.milkType === "Buffalo" ? l.qty.toFixed(1) : null);
                                            const eFatVals = eveningLogs.map((l) => l.milkType === "Buffalo" ? (l.fat ?? 0).toFixed(1) : null);
                                            const eTotal = eveningLogs.reduce((s, l) => s + (l.amount ?? 0), 0);
                                            const eAmtVals = eveningLogs.map((_, i) => i === eveningLogs.length - 1 ? `₹${eTotal.toFixed(0)}` : null);

                                            return (
                                              <tr key={date} className="hover:bg-white dark:hover:bg-slate-900/50">
                                                <td className="px-3 py-2 pl-16 font-medium text-slate-700 dark:text-slate-200 align-top whitespace-nowrap">
                                                  {new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                                  <span className="ml-2 text-[10px] text-slate-400">({dayLogs.length})</span>
                                                  <div className="text-[10px] font-normal text-green-700 dark:text-green-400 mt-0.5">₹{dateTotal.toFixed(0)}</div>
                                                </td>
                                                {/* Morning columns */}
                                                <td className="px-2 py-2 text-right tabular-nums border-l border-slate-100 dark:border-slate-800 align-top">{renderLines(mCowVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums align-top">{renderLines(mSapVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums align-top">{renderLines(mBufVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums align-top">{renderLines(mFatVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums font-medium align-top">{renderLines(mAmtVals)}</td>
                                                {/* Morning Edit */}
                                                <td className="px-2 py-2 text-center border-l border-slate-100 dark:border-slate-800 align-top">
                                                  {morningLogs.length > 0 ? (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(morningLogs)}>
                                                      <Pencil className="h-3 w-3 text-slate-500" />
                                                    </Button>
                                                  ) : null}
                                                </td>
                                                {/* Evening columns */}
                                                <td className="px-2 py-2 text-right tabular-nums border-l border-slate-100 dark:border-slate-800 align-top">{renderLines(eCowVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums align-top">{renderLines(eSapVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums align-top">{renderLines(eBufVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums align-top">{renderLines(eFatVals)}</td>
                                                <td className="px-2 py-2 text-right tabular-nums font-medium align-top">{renderLines(eAmtVals)}</td>
                                                {/* Evening Edit */}
                                                <td className="px-2 py-2 text-center border-l border-slate-100 dark:border-slate-800 align-top">
                                                  {eveningLogs.length > 0 ? (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(eveningLogs)}>
                                                      <Pencil className="h-3 w-3 text-slate-500" />
                                                    </Button>
                                                  ) : null}
                                                </td>
                                              </tr>
                                            );
                                          });
                                        })()}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-slate-100/80 dark:bg-slate-800/60 font-semibold text-slate-700 dark:text-slate-200">
                                          <td className="px-3 py-2 pl-16">Total</td>
                                          <td className="px-2 py-2 text-right tabular-nums border-l border-slate-200 dark:border-slate-700">{totalMorningCowQty.toFixed(1)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{totalMorningSapQty.toFixed(1)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{totalMorningBufQty.toFixed(1)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">—</td>
                                          <td className="px-2 py-2 text-right tabular-nums text-green-700 dark:text-green-400">₹{totalMorningCowAmt + totalMorningBufAmt + totalMorningSapAmt}</td>
                                          <td className="border-l border-slate-200 dark:border-slate-700"></td>
                                          <td className="px-2 py-2 text-right tabular-nums border-l border-slate-200 dark:border-slate-700">{totalEveningCowQty.toFixed(1)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{totalEveningSapQty.toFixed(1)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">{totalEveningBufQty.toFixed(1)}</td>
                                          <td className="px-2 py-2 text-right tabular-nums">—</td>
                                          <td className="px-2 py-2 text-right tabular-nums text-green-700 dark:text-green-400">₹{totalEveningCowAmt + totalEveningBufAmt + totalEveningSapAmt}</td>
                                          <td className="border-l border-slate-200 dark:border-slate-700"></td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2 border-b p-4">
              <Label htmlFor="date-filter" className="text-xs font-medium text-muted-foreground">Filter by date:</Label>
              <Input
                id="date-filter"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-auto"
              />
              {filterDate && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setFilterDate("")}>
                  Clear
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {dateViewLogs.length} record{dateViewLogs.length === 1 ? "" : "s"}
              </span>
            </div>

            {dateViewLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No logs found{filterDate ? ` for ${new Date(filterDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}.
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100/50 dark:bg-slate-800/50 text-slate-500">
                    <th className="px-3 py-2 text-left font-medium">DATE</th>
                    <th className="px-3 py-2 text-left font-medium">ACCOUNT</th>
                    <th className="px-2 py-2 text-left font-medium">PERIOD</th>
                    <th className="px-2 py-2 text-left font-medium">TYPE</th>
                  <th className="px-2 py-2 text-right font-medium">QTY</th>
                  <th className="px-2 py-2 text-right font-medium">FAT</th>
                  <th className="px-2 py-2 text-right font-medium">AMT</th>
                  <th className="px-2 py-2 text-center font-medium w-[70px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...dateViewLogs]
                  .sort((a, b) => {
                    const da = new Date(a.date + "T00:00:00").getTime();
                    const db = new Date(b.date + "T00:00:00").getTime();
                    if (db !== da) return db - da; // newest date first
                    return a.timePeriod === "Morning" ? -1 : 1;
                  })
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-white dark:hover:bg-slate-900/50">
                      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {new Date(log.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{log.accountName}</td>
                      <td className="px-2 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.timePeriod === "Morning" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"}`}>
                          {log.timePeriod}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{log.milkType}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{log.qty.toFixed(1)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{log.milkType === "Buffalo" ? (log.fat ?? 0).toFixed(1) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-green-700 dark:text-green-400">₹{(log.amount ?? 0).toFixed(0)}</td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit([log])}>
                            <Pencil className="h-3 w-3 text-slate-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(log.id)}>
                            <Trash className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed right-4 top-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-background p-4 shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-full p-1 ${toast.variant === "success" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
              {toast.variant === "success" ? <CheckCircle className="h-5 w-5" /> : <WarningCircle className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {toast.variant === "success" ? "Log saved" : "Save failed"}
              </p>
              <p className="text-sm text-muted-foreground">{toast.message}</p>
            </div>
            <button type="button" onClick={() => setToast(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
