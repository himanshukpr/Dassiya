"use client";

import { useMemo, useState } from "react";
import { useAppData, DEFAULT_RATES, type Account, type Rates } from "@/components/providers/AppDataStore";
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
import { MagnifyingGlass, Pencil, Trash } from "@phosphor-icons/react";

type RateMode = "global" | "custom";

interface RateField {
  key: keyof Rates;
  label: string;
  description: string;
}

const PURCHASE_RATE_FIELDS: RateField[] = [
  { key: "cowMorningPurchase", label: "Cow - Morning", description: "Rate per litre" },
  { key: "cowEveningPurchase", label: "Cow - Evening", description: "Rate per litre" },
  { key: "buffaloMorningPurchase", label: "Buffalo - Morning", description: "Rate per fat unit" },
  { key: "buffaloEveningPurchase", label: "Buffalo - Evening", description: "Rate per fat unit" },
  { key: "sapretaMorningPurchase", label: "Sapreta - Morning", description: "Rate per litre" },
  { key: "sapretaEveningPurchase", label: "Sapreta - Evening", description: "Rate per litre" },
];

const SALE_RATE_FIELDS: RateField[] = [
  { key: "cowMorningSale", label: "Cow - Morning", description: "Rate per litre" },
  { key: "cowEveningSale", label: "Cow - Evening", description: "Rate per litre" },
  { key: "buffaloMorningSale", label: "Buffalo - Morning", description: "Rate per fat unit" },
  { key: "buffaloEveningSale", label: "Buffalo - Evening", description: "Rate per fat unit" },
  { key: "sapretaMorningSale", label: "Sapreta - Morning", description: "Rate per litre" },
  { key: "sapretaEveningSale", label: "Sapreta - Evening", description: "Rate per litre" },
];

const createDefaultRateForm = (overrides?: Partial<Rates> | null) => ({
  ...DEFAULT_RATES,
  ...(overrides ?? {}),
});

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
  const [rateMode, setRateMode] = useState<RateMode>("global");
  const [rateForm, setRateForm] = useState<Rates>(DEFAULT_RATES);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((a) =>
      [a.name, a.type, a.mobile].join(" ").toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const data = {
      name,
      type,
      mobile,
      previousBalance: parseFloat(previousBalance) || 0,
      rateOverrides: rateMode === "custom" ? rateForm : null,
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
    setRateMode(account.rateOverrides ? "custom" : "global");
    setRateForm(createDefaultRateForm(account.rateOverrides));
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
    setRateMode("global");
    setRateForm(DEFAULT_RATES);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>Add Account</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-full max-w-full overflow-y-auto p-4 sm:max-w-lg sm:p-6">
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

              <div className="space-y-2">
                <Label>Rates for this account</Label>
                <Select value={rateMode} onValueChange={(val: RateMode) => setRateMode(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Use global rates</SelectItem>
                    <SelectItem value="custom">Use custom rates for this account</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {rateMode === "custom" && (
                <div className="space-y-3 rounded-lg border bg-slate-50 p-3 dark:bg-slate-900/50 sm:p-4">
                  <div>
                    <p className="text-xs font-medium sm:text-sm">Custom Rate Overrides</p>
                    <p className="text-[11px] text-slate-500 sm:text-xs">
                      {type === "Purchase From"
                        ? "Set purchase rates for this supplier"
                        : "Set sale rates for this customer"}
                    </p>
                  </div>
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {(type === "Purchase From" ? PURCHASE_RATE_FIELDS : SALE_RATE_FIELDS).map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={field.key} className="text-xs font-medium">
                          {field.label}
                        </Label>
                        <Input
                          id={field.key}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className="text-sm"
                          value={rateForm[field.key] ?? ""}
                          onChange={(e) => setRateForm((prev) => ({ ...prev, [field.key]: parseFloat(e.target.value) || 0 }))}
                        />
                        <p className="text-[10px] text-slate-500">{field.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving ? "Saving..." : editingId ? "Update" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white dark:bg-slate-900">
        <div className="border-b p-4">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, type, or mobile..."
              className="pl-9"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
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
                <TableCell colSpan={6} className="text-center h-24 text-slate-400">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : filteredAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-slate-500">
                  {searchQuery ? "No matching accounts found." : "No accounts yet. Add one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredAccounts.map((account, idx) => (
                <TableRow key={account.id}>
                  <TableCell className="text-slate-400 text-sm">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${account.type === "Purchase From"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                      : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                      }`}>
                      {account.type}
                    </span>
                    {account.rateOverrides && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                        Custom rates
                      </span>
                    )}
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
