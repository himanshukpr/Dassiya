"use client";

import { useState } from "react";
import { useAppData } from "@/components/providers/AppDataStore";
import type { Account, Receipt } from "@/components/providers/AppDataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash, CaretUpDown, Check, ArrowDown, Pencil } from "@phosphor-icons/react";

// ─── Searchable Account Combobox ──────────────────────────────────────────────
function AccountCombobox({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="font-medium">{selected.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${selected.type === "Purchase From"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                }`}>
                {selected.type}
              </span>
            </span>
          ) : (
            <span className="text-slate-400">Search account...</span>
          )}
          <CaretUpDown size={16} className="ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map((acc) => (
                <CommandItem
                  key={acc.id}
                  value={acc.name}
                  onSelect={() => { onChange(acc.id); setOpen(false); }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Check size={14} className={value === acc.id ? "opacity-100" : "opacity-0"} />
                    <span>{acc.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded-full ${acc.type === "Purchase From"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      }`}>
                      {acc.type}
                    </span>
                    <span className={`font-medium ${acc.previousBalance < 0 ? "text-red-500" : "text-slate-500"}`}>
                      ₹{acc.previousBalance.toFixed(2)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReceiptsPage() {
  const { accounts, receipts, loadingReceipts, addReceipt, updateReceipt, deleteReceipt } = useAppData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);

  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");

  const selectedAccount = accounts.find((a) => a.id === accountId);

  // Payment type is fully determined by account type
  const paymentType: "Payment Given" | "Payment Received" | null = selectedAccount
    ? selectedAccount.type === "Purchase From"
      ? "Payment Given"     // We give payment to our supplier
      : "Payment Received"  // We receive payment from our customer
    : null;

  // Receipt always SUBTRACTS from the balance (clears dues)
  const newBalance =
    selectedAccount && amount
      ? editingReceipt
        ? selectedAccount.previousBalance + editingReceipt.amount - (parseFloat(amount) || 0)
        : selectedAccount.previousBalance - (parseFloat(amount) || 0)
      : null;

  const handleEdit = (receipt: Receipt) => {
    setEditingReceipt(receipt);
    setAccountId(receipt.accountId);
    setDate(receipt.date);
    setAmount(String(receipt.amount));
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount || newBalance === null || !paymentType) return;
    setSaving(true);

    const data = {
      accountId,
      accountName: selectedAccount.name,
      date,
      amount: parseFloat(amount),
      type: paymentType,
      balanceAction: "Subtract" as const,
    };

    if (editingReceipt) {
      await updateReceipt(editingReceipt.id, data, newBalance);
    } else {
      await addReceipt(data, newBalance);
    }

    setSaving(false);
    setIsDialogOpen(false);
    setEditingReceipt(null);
    resetForm();
  };

  const handleDelete = async (receipt: Receipt) => {
    if (!confirm("Delete this receipt? The account balance will be reverted.")) return;
    await deleteReceipt(receipt);
  };

  const resetForm = () => {
    setAccountId("");
    setDate(new Date().toISOString().split("T")[0]);
    setAmount("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>

        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { resetForm(); setEditingReceipt(null); } }}>
          <DialogTrigger asChild>
            <Button>Add Payment</Button>
          </DialogTrigger>

          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingReceipt ? "Edit Payment" : "Add Payment"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Searchable account selector */}
              <div className="space-y-2">
                <Label>Account</Label>
                {editingReceipt ? (
                  <div className="flex h-10 w-full items-center rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 text-sm text-slate-600 dark:text-slate-400">
                    {editingReceipt.accountName}
                  </div>
                ) : (
                  <AccountCombobox
                    accounts={accounts}
                    value={accountId}
                    onChange={(id) => { setAccountId(id); setAmount(""); }}
                  />
                )}
              </div>

              {/* Auto-detected payment type info */}
              {selectedAccount && paymentType && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border text-sm">
                  <span className="text-slate-500">Payment Type:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${paymentType === "Payment Given"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    }`}>
                    {paymentType}
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {selectedAccount.type === "Purchase From"
                      ? "Auto: supplier account"
                      : "Auto: customer account"}
                  </span>
                </div>
              )}

              {/* Date + Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="pl-7"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      disabled={!accountId}
                    />
                  </div>
                </div>
              </div>

              {/* Balance impact preview */}
              {selectedAccount && amount && parseFloat(amount) > 0 && (
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                    <ArrowDown size={16} />
                    <span>Balance will be reduced by ₹{parseFloat(amount).toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-green-200 dark:border-green-800">
                    <div className="flex justify-between text-slate-500">
                      <span>Current Balance</span>
                      <span className="font-medium">₹{selectedAccount.previousBalance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-red-500">
                      <span>Payment (−)</span>
                      <span>₹{parseFloat(amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t border-green-200 dark:border-green-800 pt-1.5">
                      <span>New Balance</span>
                      <span className={newBalance !== null && newBalance < 0 ? "text-red-500" : "text-green-700 dark:text-green-300"}>
                        ₹{newBalance?.toFixed(2) ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={!accountId || !amount || saving}>
                  {saving ? "Saving..." : editingReceipt ? "Update Payment" : "Save Receipt"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Receipts table */}
      <div className="rounded-md border bg-white dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Payment Type</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingReceipts ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-slate-400">Loading receipts...</TableCell>
              </TableRow>
            ) : receipts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-slate-500">No receipts yet.</TableCell>
              </TableRow>
            ) : (
              receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>{receipt.date}</TableCell>
                  <TableCell className="font-medium">{receipt.accountName}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${receipt.type === "Payment Received"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      }`}>
                      {receipt.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {receipt.type === "Payment Received" ?
                      <span className="font-medium text-green-500">
                        +₹{receipt.amount.toFixed(2)}
                      </span>
                      :
                      <span className="font-medium text-red-500">
                        −₹{receipt.amount.toFixed(2)}
                      </span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(receipt)}>
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(receipt)}>
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
    </div>
  );
}
