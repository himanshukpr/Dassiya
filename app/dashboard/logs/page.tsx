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
import { CheckCircle, MagnifyingGlass, Pencil, Plus, Trash, WarningCircle, X } from "@phosphor-icons/react";

type ToastState = {
  message: string;
  variant: "success" | "error";
};

type MilkType = MilkLog["milkType"];
type TimePeriod = MilkLog["timePeriod"];

type LogDraft = {
  rowId: string;
  milkType: MilkType;
  qty: string;
  fat: string;
  timePeriod: TimePeriod;
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
    milkType: "Buffalo",
    qty: "",
    fat: "",
    timePeriod,
    ...overrides,
  });
  const [logRows, setLogRows] = useState<LogDraft[]>(() => [createLogRow()]);
  // Table filters
  const [filterDate, setFilterDate] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<"All" | "Morning" | "Evening">("All");
  const [logSearch, setLogSearch] = useState("");

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const effectiveRates = useMemo(
    () => resolveAccountRates(rates, selectedAccount?.rateOverrides),
    [rates, selectedAccount]
  );

  const getFixedFatForPeriod = (period: TimePeriod) => {
    if (!selectedAccount) return null;
    const value = (period === "Morning" ? selectedAccount.fixedFatMorning : selectedAccount.fixedFatEvening) as unknown;
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const updateLogRow = (rowId: string, patch: Partial<LogDraft>, autoFillFixedFat = false) => {
    setLogRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const next = { ...row, ...patch };
        if (autoFillFixedFat && next.milkType === "Buffalo") {
          const fixedFat = getFixedFatForPeriod(next.timePeriod);
          if (fixedFat != null) next.fat = String(fixedFat);
        }
        return next;
      })
    );
  };

  useEffect(() => {
    if (!selectedAccount) return;
    setLogRows((prev) =>
      prev.map((row) => {
        if (row.milkType !== "Buffalo" || row.fat !== "") return row;
        const fixedFat = getFixedFatForPeriod(row.timePeriod);
        return fixedFat != null ? { ...row, fat: String(fixedFat) } : row;
      })
    );
  }, [selectedAccount?.id, selectedAccount?.fixedFatMorning, selectedAccount?.fixedFatEvening]);

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

  const recentLogs = useMemo(() => [...logs].sort(sortByCreatedAt).slice(0, 5), [logs]);

  const getRowAmount = (row: LogDraft) => {
    if (!selectedAccount || !row.qty || parseFloat(row.qty) <= 0) return null;
    if (row.milkType === "Buffalo" && (!row.fat || parseFloat(row.fat) <= 0)) return null;
    return calculateAmount(
      row.milkType,
      row.timePeriod,
      selectedAccount.type,
      parseFloat(row.qty) || 0,
      parseFloat(row.fat) || 0,
      effectiveRates
    );
  };

  const addLogRow = () => {
    const basePeriod = logRows[logRows.length - 1]?.timePeriod ?? timePeriod;
    const row = createLogRow({ timePeriod: basePeriod });
    const fixedFat = row.milkType === "Buffalo" ? getFixedFatForPeriod(basePeriod) : null;
    setLogRows((prev) => [...prev, fixedFat != null ? { ...row, fat: String(fixedFat) } : row]);
  };

  const removeLogRow = (rowId: string) => {
    setLogRows((prev) => prev.length > 1 ? prev.filter((row) => row.rowId !== rowId) : prev);
  };

  const buildLogData = (row: LogDraft) => {
    if (!selectedAccount) return null;
    const qty = parseFloat(row.qty);
    const fat = row.milkType === "Buffalo" ? parseFloat(row.fat) : 0;
    return {
      accountId,
      accountName: selectedAccount.name,
      accountType: selectedAccount.type,
      date,
      milkType: row.milkType,
      qty,
      fat,
      timePeriod: row.timePeriod,
      amount: calculateAmount(row.milkType, row.timePeriod, selectedAccount.type, qty, fat, effectiveRates),
    };
  };

  const validateLogRows = () => {
    if (!selectedAccount) return "Select an account first.";
    if (!date) return "Select a date.";
    if (logRows.length === 0) return "Add at least one log row.";

    for (let index = 0; index < logRows.length; index += 1) {
      const row = logRows[index];
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
        const matchesDate = !filterDate || log.date === filterDate;
        const matchesPeriod = filterPeriod === "All" || log.timePeriod === filterPeriod;
        const matchesSearch = !query || log.accountName.toLowerCase().includes(query);
        return matchesDate && matchesPeriod && matchesSearch;
      })
      .sort(sortByCreatedAt);
  }, [logs, filterDate, filterPeriod, logSearch]);

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

  const handleEdit = (log: MilkLog) => {
    setEditingLog(log);
    setAccountId(log.accountId);
    setAccountSearch(log.accountName);
    setDate(log.date);
    setMilkType(log.milkType);
    setQty(String(log.qty));
    setFat(log.milkType === "Buffalo" ? String(log.fat) : "");
    setTimePeriod(log.timePeriod);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setSaving(true);

    try {
      if (editingLog) {
        const row: LogDraft = { rowId: "editing", milkType, qty, fat, timePeriod };
        const data = buildLogData(row);
        if (!data) return;

        await updateLog(editingLog.id, data);
        setToast({
          message: `Milk log updated for ${selectedAccount.name}.`,
          variant: "success",
        });
      } else {
        const validationError = validateLogRows();
        if (validationError) {
          setToast({
            message: validationError,
            variant: "error",
          });
          return;
        }

        const dataRows = logRows.map(buildLogData).filter((row): row is NonNullable<typeof row> => Boolean(row));
        await Promise.all(dataRows.map(addLog));
        setToast({
          message: `${dataRows.length} milk log${dataRows.length === 1 ? "" : "s"} added for ${selectedAccount.name}.`,
          variant: "success",
        });
      }

      setEditingLog(null);
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
  };

  const clearFilters = () => {
    setFilterDate("");
    setFilterPeriod("All");
    setLogSearch("");
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
              <DialogTitle>{editingLog ? "Edit Milk Log" : "Add Milk Log"}</DialogTitle>
              <DialogDescription className="sr-only">
                {editingLog ? "Edit the milk log entry." : "Add a new milk log by selecting the time period, account, date, milk type, quantity, and fat if needed."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] lg:gap-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {editingLog ? (
                  <div className="space-y-4">
                    {accountPicker}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Time Period</Label>
                        <Select
                          value={timePeriod}
                          onValueChange={(val: TimePeriod) => {
                            setTimePeriod(val);
                            if (milkType === "Buffalo" && selectedAccount) {
                              const fixedFat =
                                val === "Morning"
                                  ? selectedAccount.fixedFatMorning
                                  : selectedAccount.fixedFatEvening;
                              if (fixedFat != null) {
                                setFat(String(fixedFat));
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Morning">Morning</SelectItem>
                            <SelectItem value="Evening">Evening</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-date">Date</Label>
                        <Input id="edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Milk Type</Label>
                        <Select
                          value={milkType}
                          onValueChange={(val: MilkType) => {
                            setMilkType(val);
                            if (val === "Buffalo" && selectedAccount) {
                              const fixedFat =
                                timePeriod === "Morning"
                                  ? selectedAccount.fixedFatMorning
                                  : selectedAccount.fixedFatEvening;
                              setFat(fixedFat != null ? String(fixedFat) : "");
                            } else {
                              setFat("");
                            }
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
                        <Label htmlFor="edit-qty">Quantity (L/Kg)</Label>
                        <Input id="edit-qty" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
                      </div>
                    </div>

                    {milkType === "Buffalo" ? (
                      <div className="space-y-2">
                        <Label htmlFor="edit-fat" className="flex items-center gap-2">
                          Fat %
                          {(() => {
                            const fixedFat =
                              timePeriod === "Morning"
                                ? selectedAccount?.fixedFatMorning
                                : selectedAccount?.fixedFatEvening;
                            return fixedFat != null ? (
                              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                Fixed ({timePeriod}): {fixedFat}
                              </span>
                            ) : null;
                          })()}
                        </Label>
                        <Input
                          id="edit-fat"
                          type="text"
                          inputMode="decimal"
                          value={fat}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, "");
                            if (!raw.includes(".") && raw.length >= 2) {
                              setFat(raw.slice(0, -1) + "." + raw.slice(-1));
                            } else {
                              setFat(raw);
                            }
                          }}
                          required
                        />
                        {(() => {
                          const fixedFat =
                            timePeriod === "Morning"
                              ? selectedAccount?.fixedFatMorning
                              : selectedAccount?.fixedFatEvening;
                          return fixedFat != null && fat === String(fixedFat) ? (
                            <p className="text-[11px] text-purple-600 dark:text-purple-400">
                              Auto-filled from account fixed fat for {timePeriod}. You can override it for this entry.
                            </p>
                          ) : null;
                        })()}
                      </div>
                    ) : null}

                    {previewAmount !== null ? (
                      <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                        <div className="text-sm text-green-700 dark:text-green-400">
                          <span className="font-medium">Auto-calculated Amount</span>
                          {milkType === "Buffalo" && fat && (
                            <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                              {qty} L × {parseFloat(fat).toFixed(2)} fat × ₹{
                                (() => {
                                  if (!selectedAccount) return 0;
                                  const dir = selectedAccount.type === "Purchase From" ? "Purchase" : "Sale";
                                  const key = `buffalo${timePeriod}${dir}` as keyof typeof effectiveRates;
                                  return effectiveRates[key];
                                })()
                              }/fat
                            </p>
                          )}
                        </div>
                        <span className="text-xl font-bold text-green-700 dark:text-green-300">₹{previewAmount.toFixed(2)}</span>
                      </div>
                    ) : selectedAccount && qty ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        Set rates in <strong>Rate Settings</strong> for auto-calculation.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {accountPicker}
                      <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Milk Log Rows</h3>
                        <p className="text-xs text-muted-foreground">Add multiple periods and items for the same account.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addLogRow} disabled={!accountId}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add Row
                      </Button>
                    </div>

                    <div className="grid gap-3 md:hidden">
                      {logRows.map((row, index) => {
                        const rowAmount = getRowAmount(row);
                        const fixedFat = getFixedFatForPeriod(row.timePeriod);
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
                                  onValueChange={(val: MilkType) => updateLogRow(row.rowId, {
                                    milkType: val,
                                    fat: val === "Buffalo" ? (fixedFat != null ? String(fixedFat) : "") : "",
                                  })}
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
                            <TableHead>Period</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead className="w-[120px]">Qty</TableHead>
                            <TableHead className="w-[120px]">Fat %</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-[56px] text-right"> </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logRows.map((row, index) => {
                            const rowAmount = getRowAmount(row);
                            const fixedFat = getFixedFatForPeriod(row.timePeriod);
                            return (
                              <TableRow key={row.rowId}>
                                <TableCell className="text-slate-400 text-sm">{index + 1}</TableCell>
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
                                    onValueChange={(val: MilkType) => updateLogRow(row.rowId, {
                                      milkType: val,
                                      fat: val === "Buffalo" ? (fixedFat != null ? String(fixedFat) : "") : "",
                                    })}
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
                            <TableCell colSpan={5} className="text-right font-semibold">Total Amount</TableCell>
                            <TableCell className="text-right font-bold text-green-700 dark:text-green-400">
                              ₹{(logRows.reduce((sum, row) => sum + (getRowAmount(row) ?? 0), 0)).toFixed(2)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>

                    {selectedAccount && logRows.some((row) => row.qty && getRowAmount(row) === null) ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        Complete quantity and fat for every row to calculate amounts.
                      </div>
                    ) : null}
                  </div>
                )}

                <DialogFooter className="px-0 pb-0">
                  <Button type="submit" className="w-full sm:w-auto" disabled={!accountId || saving}>
                    {saving ? "Saving..." : editingLog ? "Update Log" : "Save Logs"}
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
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Filters</h2>
            <p className="text-xs text-muted-foreground">
              Narrow the log list by date, period, or account name.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[200px_180px_180px_auto]">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Account name..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-date" className="text-xs text-muted-foreground">
                Date
              </Label>
              <Input
                id="filter-date"
                type="date"
                value={filterDate}
                onChange={(event) => setFilterDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={filterPeriod} onValueChange={(value: "All" | "Morning" | "Evening") => setFilterPeriod(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All periods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Evening">Evening</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="button" variant="outline" className="sm:self-end" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Fat %</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingLogs ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center h-24 text-slate-400">Loading logs...</TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center h-24 text-slate-500">
                  No logs found for the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log, idx) => (
                <TableRow key={log.id}>
                  <TableCell className="text-slate-400 text-sm">{idx + 1}</TableCell>
                  <TableCell>{log.date}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${log.timePeriod === "Morning"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
                      }`}>
                      {log.timePeriod}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{log.accountName}</TableCell>
                  <TableCell>{log.milkType}</TableCell>
                  <TableCell className="text-right">{log.qty}</TableCell>
                  <TableCell className="text-right">
                    {log.milkType === "Buffalo" ? (
                      <span>{(log.fat ?? 0).toFixed(2)}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-green-700 dark:text-green-400">
                    ₹{(log.amount ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(log)}>
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)}>
                        <Trash className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
