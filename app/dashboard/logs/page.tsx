"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData, calculateAmount } from "@/components/providers/AppDataStore";
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
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle, MagnifyingGlass, Trash, WarningCircle } from "@phosphor-icons/react";

type ToastState = {
  message: string;
  variant: "success" | "error";
};

export default function LogsPage() {
  const { accounts, logs, rates, loadingLogs, addLog, deleteLog } = useAppData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Form state
  const [accountId, setAccountId] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [milkType, setMilkType] = useState<"Cow" | "Buffalo">("Buffalo");
  const [qty, setQty] = useState("");
  const [fat, setFat] = useState("");
  const [timePeriod, setTimePeriod] = useState<"Morning" | "Evening">("Morning");

  // Table filters
  const [filterDate, setFilterDate] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<"All" | "Morning" | "Evening">("All");

  const selectedAccount = accounts.find((a) => a.id === accountId);

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

  const recentLogs = useMemo(() => logs.slice(0, 5), [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesDate = !filterDate || log.date === filterDate;
      const matchesPeriod = filterPeriod === "All" || log.timePeriod === filterPeriod;
      return matchesDate && matchesPeriod;
    });
  }, [logs, filterDate, filterPeriod]);

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
      rates
    );
  }, [selectedAccount, milkType, timePeriod, qty, fat, rates]);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setSaving(true);

    try {
      const amount = calculateAmount(
        milkType,
        timePeriod,
        selectedAccount.type,
        parseFloat(qty) || 0,
        parseFloat(fat) || 0,
        rates
      );

      await addLog({
        accountId,
        accountName: selectedAccount.name,
        accountType: selectedAccount.type,
        date,
        milkType,
        qty: parseFloat(qty),
        fat: milkType === "Buffalo" ? parseFloat(fat) : 0,
        timePeriod,
        amount,
      });

      setToast({
        message: `Milk log added for ${selectedAccount.name}.`,
        variant: "success",
      });
      resetForm({ preserveTimePeriod: true });
    } catch (error) {
      console.error("addLog failed:", error);
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

  const resetForm = ({ preserveTimePeriod = false }: { preserveTimePeriod?: boolean } = {}) => {
    setAccountId("");
    setAccountSearch("");
    setDate(new Date().toISOString().split("T")[0]);
    setMilkType("Buffalo");
    setQty("");
    setFat("");
    if (!preserveTimePeriod) {
      setTimePeriod("Morning");
    }
  };

  const clearFilters = () => {
    setFilterDate("");
    setFilterPeriod("All");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Milk Logs</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Milk Log</Button>
          </DialogTrigger>
          <DialogContent
            className="max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto p-3 sm:max-w-6xl sm:p-4"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Add Milk Log</DialogTitle>
              <DialogDescription className="sr-only">
                Add a new milk log by selecting the time period, account, date, milk type, quantity, and fat if needed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] lg:gap-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Time Period</Label>
                  <Select value={timePeriod} onValueChange={(val: "Morning" | "Evening") => setTimePeriod(val)}>
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

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Milk Type</Label>
                    <Select value={milkType} onValueChange={(val: "Buffalo" | "Cow") => { setMilkType(val); setFat(""); }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Buffalo">Buffalo</SelectItem>
                        <SelectItem value="Cow">Cow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="qty">Quantity (L/Kg)</Label>
                    <Input id="qty" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
                  </div>
                  {milkType === "Buffalo" ? (
                    <div className="space-y-2">
                      <Label htmlFor="fat">
                        Fat %
                        <span className="ml-2 text-xs text-slate-400 font-normal">
                          (effective: floor({fat || "0"}) = {Math.floor(parseFloat(fat) || 0)})
                        </span>
                      </Label>
                      <Input
                        id="fat"
                        type="number"
                        step="0.1"
                        value={fat}
                        onChange={(e) => setFat(e.target.value)}
                        required
                      />
                    </div>
                  ) : (
                    <div className="space-y-2" />
                  )}
                </div>

                {previewAmount !== null ? (
                  <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                    <div className="text-sm text-green-700 dark:text-green-400">
                      <span className="font-medium">Auto-calculated Amount</span>
                      {milkType === "Buffalo" && fat && (
                        <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                          {qty} L × {Math.floor(parseFloat(fat))} fat × ₹{
                            (() => {
                              if (!selectedAccount) return 0;
                              const dir = selectedAccount.type === "Purchase From" ? "Purchase" : "Sale";
                              const key = `buffalo${timePeriod}${dir}` as keyof typeof rates;
                              return rates[key];
                            })()
                          }/fat
                        </p>
                      )}
                    </div>
                    <span className="text-xl font-bold text-green-700 dark:text-green-300">₹{previewAmount.toFixed(2)}</span>
                  </div>
                ) : selectedAccount && qty ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                    ⚠ Set rates in <strong>Rate Settings</strong> for auto-calculation.
                  </div>
                ) : null}

                <DialogFooter className="px-0 pb-0">
                  <Button type="submit" className="w-full sm:w-auto" disabled={!accountId || saving}>
                    {saving ? "Saving..." : "Save Log"}
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
              Narrow the log list by date and time period.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[180px_180px_auto]">
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
              <TableHead>Date</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Fat %</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead className="w-[70px] text-right">Del</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingLogs ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-slate-400">Loading logs...</TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-slate-500">
                  No logs found for the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id}>
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
                      <span>{log.fat} <span className="text-xs text-slate-400">(×{Math.floor(log.fat)})</span></span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-green-700 dark:text-green-400">
                    ₹{(log.amount ?? 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)}>
                      <Trash className="h-4 w-4 text-red-500" />
                    </Button>
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
