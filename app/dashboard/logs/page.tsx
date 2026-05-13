"use client";

import { useState, useMemo } from "react";
import { useAppData, calculateAmount } from "@/components/providers/AppDataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Trash } from "@phosphor-icons/react";

export default function LogsPage() {
  const { accounts, logs, rates, loadingLogs, addLog, deleteLog } = useAppData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [milkType, setMilkType] = useState<"Cow" | "Buffalo">("Buffalo");
  const [qty, setQty] = useState("");
  const [fat, setFat] = useState("");
  const [timePeriod, setTimePeriod] = useState<"Morning" | "Evening">("Morning");

  const selectedAccount = accounts.find((a) => a.id === accountId);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setSaving(true);

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
    setSaving(false);
    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this log entry?")) return;
    await deleteLog(id);
  };

  const resetForm = () => {
    setAccountId("");
    setDate(new Date().toISOString().split("T")[0]);
    setMilkType("Buffalo");
    setQty("");
    setFat("");
    setTimePeriod("Morning");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Milk Logs</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>Add Milk Log</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Milk Log</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={(v) => { setAccountId(v); }}>
                  <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                        <span className="ml-2 text-xs text-slate-400">({acc.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Time Period</Label>
                  <Select value={timePeriod} onValueChange={(val: any) => setTimePeriod(val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Milk Type</Label>
                  <Select value={milkType} onValueChange={(val: any) => { setMilkType(val); setFat(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Buffalo">Buffalo</SelectItem>
                      <SelectItem value="Cow">Cow</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qty">Quantity (L/Kg)</Label>
                  <Input id="qty" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
                </div>
              </div>

              {milkType === "Buffalo" && (
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
              )}

              {/* Live amount preview */}
              {previewAmount !== null ? (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 flex items-center justify-between">
                  <div className="text-sm text-green-700 dark:text-green-400">
                    <span className="font-medium">Auto-calculated Amount</span>
                    {milkType === "Buffalo" && fat && (
                      <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
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
              ) : selectedAccount && qty && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-400">
                  ⚠ Set rates in <strong>Rate Settings</strong> for auto-calculation.
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={!accountId || saving}>
                  {saving ? "Saving..." : "Save Log"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white dark:bg-slate-900">
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
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-slate-500">No logs found.</TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.date}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      log.timePeriod === "Morning"
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
    </div>
  );
}
