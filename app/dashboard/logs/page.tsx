"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Trash } from "@phosphor-icons/react";

interface Account {
  id: string;
  name: string;
}

interface MilkLog {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  milkType: "Cow" | "Buffalo";
  qty: number;
  fat: number;
  timePeriod: "Morning" | "Evening";
}

export default function LogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<MilkLog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form state
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [milkType, setMilkType] = useState<"Cow" | "Buffalo">("Buffalo");
  const [qty, setQty] = useState("");
  const [fat, setFat] = useState("");
  const [timePeriod, setTimePeriod] = useState<"Morning" | "Evening">("Morning");

  const fetchData = async () => {
    if (!user) return;
    try {
      // Fetch accounts for dropdown
      const accountsSnapshot = await getDocs(collection(db, "dairies", user.uid, "accounts"));
      const accountsData = accountsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setAccounts(accountsData);

      // Fetch logs
      const q = query(collection(db, "dairies", user.uid, "logs"), orderBy("date", "desc"));
      const logsSnapshot = await getDocs(q);
      const logsData = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MilkLog));
      setLogs(logsData);
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
    if (!user || !accountId) return;

    const account = accounts.find(a => a.id === accountId);

    const logData = {
      accountId,
      accountName: account?.name || "Unknown",
      date,
      milkType,
      qty: parseFloat(qty),
      fat: milkType === "Buffalo" ? parseFloat(fat) : 0,
      timePeriod,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "dairies", user.uid, "logs"), logData);
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving log:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm("Are you sure you want to delete this log?")) return;
    try {
      await deleteDoc(doc(db, "dairies", user.uid, "logs", id));
      fetchData();
    } catch (error) {
      console.error("Error deleting log:", error);
    }
  };

  const resetForm = () => {
    setAccountId("");
    setDate(new Date().toISOString().split('T')[0]);
    setMilkType("Buffalo");
    setQty("");
    setFat("");
    setTimePeriod("Morning");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Milk Logs</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>Add Milk Log</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Milk Log</DialogTitle>
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
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
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
                  <Label htmlFor="timePeriod">Time Period</Label>
                  <Select value={timePeriod} onValueChange={(val: any) => setTimePeriod(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="milkType">Milk Type</Label>
                  <Select value={milkType} onValueChange={(val: any) => setMilkType(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
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
                  <Label htmlFor="fat">Fat %</Label>
                  <Input id="fat" type="number" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} required />
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={!accountId}>Save</Button>
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
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24">Loading logs...</TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-24 text-slate-500">No logs found.</TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.date}</TableCell>
                  <TableCell>{log.timePeriod}</TableCell>
                  <TableCell className="font-medium">{log.accountName}</TableCell>
                  <TableCell>{log.milkType}</TableCell>
                  <TableCell className="text-right">{log.qty}</TableCell>
                  <TableCell className="text-right">{log.milkType === 'Buffalo' ? log.fat : '-'}</TableCell>
                  <TableCell className="text-right space-x-2">
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
