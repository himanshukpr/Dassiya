"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy, deleteDoc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash } from "@phosphor-icons/react";

interface Account {
  id: string;
  name: string;
  previousBalance: number;
}

interface Receipt {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  type: "Payment Given" | "Payment Received";
  balanceAction: "Add" | "Subtract";
}

export default function ReceiptsPage() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form state
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"Payment Given" | "Payment Received">("Payment Given");
  const [balanceAction, setBalanceAction] = useState<"Add" | "Subtract">("Subtract");

  const selectedAccount = accounts.find(a => a.id === accountId);

  const fetchData = async () => {
    if (!user) return;
    try {
      const accountsSnapshot = await getDocs(collection(db, "dairies", user.uid, "accounts"));
      const accountsData = accountsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name,
        previousBalance: doc.data().previousBalance || 0 
      }));
      setAccounts(accountsData);

      const q = query(collection(db, "dairies", user.uid, "receipts"), orderBy("createdAt", "desc"));
      const receiptsSnapshot = await getDocs(q);
      const receiptsData = receiptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receipt));
      setReceipts(receiptsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAccount) return;

    const receiptAmount = parseFloat(amount);
    if (isNaN(receiptAmount) || receiptAmount <= 0) return;

    // Calculate new balance
    const newBalance = balanceAction === "Add" 
      ? selectedAccount.previousBalance + receiptAmount 
      : selectedAccount.previousBalance - receiptAmount;

    try {
      // 1. Add receipt log
      await addDoc(collection(db, "dairies", user.uid, "receipts"), {
        accountId,
        accountName: selectedAccount.name,
        date,
        amount: receiptAmount,
        type,
        balanceAction,
        createdAt: serverTimestamp(),
      });

      // 2. Update account balance
      await updateDoc(doc(db, "dairies", user.uid, "accounts", accountId), {
        previousBalance: newBalance,
        updatedAt: serverTimestamp(),
      });

      setIsDialogOpen(false);
      resetForm();
      fetchData(); // Refresh data to get updated balance and receipts
    } catch (error) {
      console.error("Error processing receipt:", error);
    }
  };

  const handleDelete = async (receipt: Receipt) => {
    if (!user || !confirm("Are you sure you want to delete this receipt? This will revert the account balance.")) return;
    
    try {
      // Revert the balance
      const accountRef = doc(db, "dairies", user.uid, "accounts", receipt.accountId);
      const accountSnap = await getDoc(accountRef);
      
      if (accountSnap.exists()) {
        const currentBalance = accountSnap.data().previousBalance || 0;
        // Revert action (opposite of what was done)
        const revertedBalance = receipt.balanceAction === "Add" 
          ? currentBalance - receipt.amount 
          : currentBalance + receipt.amount;

        await updateDoc(accountRef, {
          previousBalance: revertedBalance,
          updatedAt: serverTimestamp(),
        });
      }

      // Delete receipt
      await deleteDoc(doc(db, "dairies", user.uid, "receipts", receipt.id));
      fetchData();
    } catch (error) {
      console.error("Error deleting receipt:", error);
    }
  };

  const resetForm = () => {
    setAccountId("");
    setDate(new Date().toISOString().split('T')[0]);
    setAmount("");
    setType("Payment Given");
    setBalanceAction("Subtract");
  };

  const calculateNewBalancePreview = () => {
    if (!selectedAccount || !amount) return null;
    const val = parseFloat(amount) || 0;
    return balanceAction === "Add" ? selectedAccount.previousBalance + val : selectedAccount.previousBalance - val;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>Add Receipt</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Payment Receipt</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} (Bal: {acc.previousBalance.toFixed(2)})
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
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <Input id="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Transaction Type</Label>
                  <Select value={type} onValueChange={(val: any) => setType(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Payment Given">Payment Given</SelectItem>
                      <SelectItem value="Payment Received">Payment Received</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="balanceAction">Balance Action</Label>
                  <Select value={balanceAction} onValueChange={(val: any) => setBalanceAction(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Subtract">Subtract from Balance</SelectItem>
                      <SelectItem value="Add">Add to Balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedAccount && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md text-sm">
                  <p>Current Balance: <span className="font-semibold">{selectedAccount.previousBalance.toFixed(2)}</span></p>
                  <p className="mt-1 text-blue-600 dark:text-blue-400">
                    New Balance will be: <span className="font-bold">{calculateNewBalancePreview()?.toFixed(2)}</span>
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button type="submit" disabled={!accountId || !amount}>Save Receipt</Button>
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
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Amount (₹)</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">Loading receipts...</TableCell>
              </TableRow>
            ) : receipts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-slate-500">No receipts found.</TableCell>
              </TableRow>
            ) : (
              receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell>{receipt.date}</TableCell>
                  <TableCell className="font-medium">{receipt.accountName}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      receipt.type === 'Payment Received' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                    }`}>
                      {receipt.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs uppercase">{receipt.balanceAction}</TableCell>
                  <TableCell className="text-right font-medium">{receipt.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(receipt)}>
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
