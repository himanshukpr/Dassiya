"use client";

import { useState } from "react";
import { useAppData } from "@/components/providers/AppDataStore";
import type { Account } from "@/components/providers/AppDataStore";
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
import { Pencil, Trash } from "@phosphor-icons/react";

export default function AccountsPage() {
  const { accounts, loadingAccounts, addAccount, updateAccount, deleteAccount } = useAppData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"Purchase From" | "Sale To">("Purchase From");
  const [mobile, setMobile] = useState("");
  const [previousBalance, setPreviousBalance] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const data = {
      name,
      type,
      mobile,
      previousBalance: parseFloat(previousBalance) || 0,
    };
    if (editingId) {
      await updateAccount(editingId, data);
    } else {
      await addAccount(data);
    }
    setSaving(false);
    setIsDialogOpen(false);
    resetForm();
  };

  const handleEdit = (account: Account) => {
    setEditingId(account.id);
    setName(account.name);
    setType(account.type);
    setMobile(account.mobile);
    setPreviousBalance(account.previousBalance.toString());
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    await deleteAccount(id);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setType("Purchase From");
    setMobile("");
    setPreviousBalance("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Account" : "Add New Account"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(val: any) => setType(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Purchase From">Purchase From</SelectItem>
                    <SelectItem value="Sale To">Sale To</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number</Label>
                <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="balance">Previous Balance (₹)</Label>
                <Input id="balance" type="number" step="0.01" value={previousBalance} onChange={(e) => setPreviousBalance(e.target.value)} required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Update" : "Save"}
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead className="text-right">Balance (₹)</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingAccounts ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-slate-400">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-slate-500">
                  No accounts yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      account.type === "Purchase From"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                    }`}>
                      {account.type}
                    </span>
                  </TableCell>
                  <TableCell>{account.mobile}</TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={account.previousBalance < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}>
                      ₹{account.previousBalance.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(account)}>
                      <Pencil className="h-4 w-4 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(account.id)}>
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
