"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, deleteDoc, where, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash, Eye } from "@phosphor-icons/react";

interface Account {
  id: string;
  name: string;
  previousBalance: number;
  type: string;
}

interface MilkLog {
  id: string;
  date: string;
  milkType: "Cow" | "Buffalo";
  qty: number;
  fat: number;
}

interface Bill {
  id: string;
  accountId: string;
  accountName: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalCowQty: number;
  totalBuffaloQty: number;
  cowRate: number;
  buffaloRate: number;
  totalMilkAmount: number;
  previousBalanceAtGeneration: number;
  newBalance: number;
  createdAt: any;
}

export default function BillsPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form state
  const [accountId, setAccountId] = useState("");
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [period, setPeriod] = useState("1-10");
  
  const [cowRate, setCowRate] = useState("");
  const [buffaloRate, setBuffaloRate] = useState("");
  
  const [previewData, setPreviewData] = useState<{
    logs: MilkLog[], 
    totalCow: number, 
    totalBuffalo: number,
    totalFatAmount?: number // If calculating by fat later, kept simple for now
  } | null>(null);

  const selectedAccount = accounts.find(a => a.id === accountId);

  const fetchData = async () => {
    if (!user) return;
    try {
      const accountsSnapshot = await getDocs(collection(db, "dairies", user.uid, "accounts"));
      const accountsData = accountsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name,
        previousBalance: doc.data().previousBalance || 0,
        type: doc.data().type
      }));
      setAccounts(accountsData);

      const q = query(collection(db, "dairies", user.uid, "bills"), orderBy("createdAt", "desc"));
      const billsSnapshot = await getDocs(q);
      const billsData = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill));
      setBills(billsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const getDatesForPeriod = () => {
    const y = parseInt(year);
    const m = parseInt(month) - 1; // 0-indexed
    let startD = 1, endD = 10;
    
    if (period === "11-20") {
      startD = 11; endD = 20;
    } else if (period === "21-end") {
      startD = 21;
      // Get last day of month
      endD = new Date(y, m + 1, 0).getDate();
    }
    
    const startStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(startD).padStart(2, '0')}`;
    const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(endD).padStart(2, '0')}`;
    return { startStr, endStr };
  };

  const handleGeneratePreview = async () => {
    if (!user || !accountId) return;
    const { startStr, endStr } = getDatesForPeriod();
    
    try {
      const q = query(
        collection(db, "dairies", user.uid, "logs"),
        where("accountId", "==", accountId),
        where("date", ">=", startStr),
        where("date", "<=", endStr)
      );
      
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => doc.data() as MilkLog);
      
      let totalCow = 0;
      let totalBuffalo = 0;
      
      logs.forEach(log => {
        if (log.milkType === "Cow") totalCow += log.qty;
        if (log.milkType === "Buffalo") totalBuffalo += log.qty;
      });
      
      setPreviewData({ logs, totalCow, totalBuffalo });
    } catch (error) {
      console.error("Error fetching logs for preview:", error);
    }
  };

  const calculateTotalAmount = () => {
    if (!previewData) return 0;
    const cRate = parseFloat(cowRate) || 0;
    const bRate = parseFloat(buffaloRate) || 0;
    return (previewData.totalCow * cRate) + (previewData.totalBuffalo * bRate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAccount || !previewData) return;

    const totalAmount = calculateTotalAmount();
    const { startStr, endStr } = getDatesForPeriod();
    
    // Generating a bill ADDS the milk amount to the account's balance.
    // For Purchase From: We owe them more for the milk we bought.
    // For Sale To: They owe us more for the milk we sold.
    // In both logic flows, `previousBalance` is an absolute tracking amount, so we just add it.
    const newBalance = selectedAccount.previousBalance + totalAmount;

    try {
      const billData = {
        accountId,
        accountName: selectedAccount.name,
        periodLabel: `${month}/${year} (${period})`,
        startDate: startStr,
        endDate: endStr,
        totalCowQty: previewData.totalCow,
        totalBuffaloQty: previewData.totalBuffalo,
        cowRate: parseFloat(cowRate) || 0,
        buffaloRate: parseFloat(buffaloRate) || 0,
        totalMilkAmount: totalAmount,
        previousBalanceAtGeneration: selectedAccount.previousBalance,
        newBalance,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "dairies", user.uid, "bills"), billData);
      
      await updateDoc(doc(db, "dairies", user.uid, "accounts", accountId), {
        previousBalance: newBalance,
        updatedAt: serverTimestamp(),
      });

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving bill:", error);
    }
  };

  const handleDelete = async (bill: Bill) => {
    if (!user || !confirm("Are you sure you want to delete this bill? This will revert the balance added by this bill.")) return;
    
    try {
      const accountRef = doc(db, "dairies", user.uid, "accounts", bill.accountId);
      const accountSnap = await getDoc(accountRef);
      
      if (accountSnap.exists()) {
        const currentBalance = accountSnap.data().previousBalance || 0;
        // Revert: subtract the milk amount that was added
        const revertedBalance = currentBalance - bill.totalMilkAmount;
        
        await updateDoc(accountRef, {
          previousBalance: revertedBalance,
          updatedAt: serverTimestamp(),
        });
      }

      await deleteDoc(doc(db, "dairies", user.uid, "bills", bill.id));
      fetchData();
    } catch (error) {
      console.error("Error deleting bill:", error);
    }
  };

  const resetForm = () => {
    setAccountId("");
    setPreviewData(null);
    setCowRate("");
    setBuffaloRate("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Bills (Dassiya)</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>Generate New Bill</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Generate 10-Day Dassiya</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select value={accountId} onValueChange={(val) => { setAccountId(val); setPreviewData(null); }}>
                    <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select value={year} onValueChange={(val) => { setYear(val); setPreviewData(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                      <SelectItem value="2027">2027</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={month} onValueChange={(val) => { setMonth(val); setPreviewData(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <SelectItem key={m} value={m.toString()}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select value={period} onValueChange={(val) => { setPeriod(val); setPreviewData(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1 to 10</SelectItem>
                      <SelectItem value="11-20">11 to 20</SelectItem>
                      <SelectItem value="21-end">21 to End of Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleGeneratePreview} disabled={!accountId} className="w-full" variant="outline">
                Fetch Logs & Preview
              </Button>

              {previewData && (
                <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div>
                      <p className="text-sm text-slate-500">Total Cow Milk</p>
                      <p className="text-xl font-bold">{previewData.totalCow.toFixed(2)} L/Kg</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Total Buffalo Milk</p>
                      <p className="text-xl font-bold">{previewData.totalBuffalo.toFixed(2)} L/Kg</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Cow Milk Rate (₹)</Label>
                      <Input type="number" step="0.01" value={cowRate} onChange={e => setCowRate(e.target.value)} disabled={previewData.totalCow === 0} required={previewData.totalCow > 0} />
                    </div>
                    <div className="space-y-2">
                      <Label>Buffalo Milk Rate (₹)</Label>
                      <Input type="number" step="0.01" value={buffaloRate} onChange={e => setBuffaloRate(e.target.value)} disabled={previewData.totalBuffalo === 0} required={previewData.totalBuffalo > 0} />
                    </div>
                  </div>

                  {selectedAccount && (
                    <div className="space-y-2 p-4 border rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span>Current Account Balance:</span>
                        <span className="font-medium">{selectedAccount.previousBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400">
                        <span>Total Milk Amount (+):</span>
                        <span className="font-medium">{calculateTotalAmount().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-2 mt-2">
                        <span>New Balance Will Be:</span>
                        <span>{(selectedAccount.previousBalance + calculateTotalAmount()).toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button type="submit">Save Dassiya Bill</Button>
                  </DialogFooter>
                </form>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white dark:bg-slate-900">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Cow Qty</TableHead>
              <TableHead className="text-right">Buf Qty</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead className="text-right">New Balance (₹)</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center h-24">Loading bills...</TableCell></TableRow>
            ) : bills.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center h-24 text-slate-500">No bills generated yet.</TableCell></TableRow>
            ) : (
              bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell>
                    <div className="font-medium">{bill.periodLabel}</div>
                    <div className="text-xs text-slate-500">{bill.startDate} to {bill.endDate}</div>
                  </TableCell>
                  <TableCell className="font-medium">{bill.accountName}</TableCell>
                  <TableCell className="text-right">{bill.totalCowQty.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{bill.totalBuffaloQty.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-medium text-blue-600 dark:text-blue-400">+{bill.totalMilkAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">{bill.newBalance.toFixed(2)}</TableCell>
                  <TableCell className="text-right space-x-2">
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
  );
}
