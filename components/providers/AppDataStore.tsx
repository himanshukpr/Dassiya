"use client";

/**
 * AppDataStore — Central cache and optimistic update layer.
 *
 * Strategy:
 * 1. On mount, subscribe to all Firestore collections with `onSnapshot`.
 *    The first emission is served from IndexedDB (instant), subsequent ones
 *    reflect live server changes.
 * 2. All write helpers apply an OPTIMISTIC UPDATE to local state first,
 *    then fire the Firestore write in the background. From the user's
 *    perspective every operation is instant.
 * 3. If Firestore rejects the write, the `onSnapshot` listener will
 *    automatically reconcile the UI back to the correct server state.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  name: string;
  type: "Purchase From" | "Sale To";
  mobile: string;
  previousBalance: number;
}

export interface MilkLog {
  id: string;
  accountId: string;
  accountName: string;
  accountType: "Purchase From" | "Sale To";
  date: string;
  milkType: "Cow" | "Buffalo" | "Sapreta";
  qty: number;
  fat: number;        // 0 for Cow
  timePeriod: "Morning" | "Evening";
  amount: number;     // auto-calculated at save time
}

export interface Receipt {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  type: "Payment Given" | "Payment Received";
  balanceAction: "Add" | "Subtract";
}

export interface Bill {
  id: string;
  accountId: string;
  accountName: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalCowQty: number;
  totalBuffaloQty: number;
  totalSapretaQty: number;
  totalMilkAmount: number;
  receivedAmount: number;
  givenAmount: number;
  previousBalanceAtGeneration: number;
  newBalance: number;
  createdAt: any;
}

/**
 * Rates stored per dairy in dairies/{uid}/settings/rates
 *
 * For Cow milk  → rate is ₹ per litre (fixed, no fat)
 * For Buffalo   → rate is ₹ per fat unit
 *   amount = qty × floor(fat) × ratePerFat
 *   e.g. fat=6.7, ratePerFat=10 → rate = 60 → amount = qty × 60
 *
 * Each value differs by time period (Morning / Evening) and
 * transaction direction (purchase / sale).
 */
export interface Rates {
  // Cow — rate per litre
  cowMorningPurchase: number;
  cowMorningSale: number;
  cowEveningPurchase: number;
  cowEveningSale: number;
  // Buffalo — rate per fat unit (₹/fat)
  buffaloMorningPurchase: number;
  buffaloMorningSale: number;
  buffaloEveningPurchase: number;
  buffaloEveningSale: number;
  // Sapreta — rate per litre
  sapretaMorningPurchase: number;
  sapretaMorningSale: number;
  sapretaEveningPurchase: number;
  sapretaEveningSale: number;
}

export const DEFAULT_RATES: Rates = {
  cowMorningPurchase: 0,
  cowMorningSale: 0,
  cowEveningPurchase: 0,
  cowEveningSale: 0,
  buffaloMorningPurchase: 10,
  buffaloMorningSale: 10,
  buffaloEveningPurchase: 10,
  buffaloEveningSale: 10,
  sapretaMorningPurchase: 0,
  sapretaMorningSale: 0,
  sapretaEveningPurchase: 0,
  sapretaEveningSale: 0,
};

// ─── Amount calculator ────────────────────────────────────────────────────────

/**
 * Given the rates config and a log entry, compute the rupee amount.
 *
 * Cow   : amount = qty × rate
 * Buffalo: amount = qty × floor(fat) × ratePerFat
 */
export function calculateAmount(
  milkType: "Cow" | "Buffalo" | "Sapreta",
  timePeriod: "Morning" | "Evening",
  accountType: "Purchase From" | "Sale To",
  qty: number,
  fat: number,
  rates: Rates
): number {
  const direction = accountType === "Purchase From" ? "Purchase" : "Sale";
  const period = timePeriod; // "Morning" | "Evening"

  if (milkType === "Cow") {
    const key = `cow${period}${direction}` as keyof Rates;
    return qty * rates[key];
  } else if (milkType === "Buffalo") {
    const key = `buffalo${period}${direction}` as keyof Rates;
    const ratePerFat = rates[key];
    const effectiveFat = Math.floor(fat);   // 6.7 → 6, 5 → 5
    return qty * effectiveFat * ratePerFat;
  } else {
    const key = `sapreta${period}${direction}` as keyof Rates;
    return qty * rates[key];
  }
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface AppDataCtx {
  accounts: Account[];
  logs: MilkLog[];
  receipts: Receipt[];
  bills: Bill[];
  rates: Rates;
  loadingAccounts: boolean;
  loadingLogs: boolean;
  loadingReceipts: boolean;
  loadingBills: boolean;
  loadingRates: boolean;

  // Rates
  updateRates: (r: Rates) => Promise<void>;

  // Accounts
  addAccount: (data: Omit<Account, "id">) => Promise<void>;
  updateAccount: (id: string, data: Partial<Omit<Account, "id">>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;

  // Logs
  addLog: (data: Omit<MilkLog, "id">) => Promise<void>;
  deleteLog: (id: string) => Promise<void>;

  // Receipts
  addReceipt: (data: Omit<Receipt, "id">, balanceChange: number) => Promise<void>;
  deleteReceipt: (receipt: Receipt) => Promise<void>;

  // Bills
  addBill: (data: Omit<Bill, "id" | "createdAt">, accountNewBalance: number) => Promise<void>;
  addBillsBatch: (items: Array<{ billData: Omit<Bill, "id" | "createdAt">; accountNewBalance: number }>) => Promise<void>;
  deleteBill: (bill: Bill) => Promise<void>;

  // Bills log fetch (uses local log cache — no network needed)
  getLogsForPeriod: (accountId: string, startDate: string, endDate: string) => MilkLog[];
}

const AppDataContext = createContext<AppDataCtx | null>(null);

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genTempId() {
  return `__temp_${Math.random().toString(36).slice(2)}`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AppDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logs, setLogs] = useState<MilkLog[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [loadingBills, setLoadingBills] = useState(true);
  const [loadingRates, setLoadingRates] = useState(true);

  const unsubRefs = useRef<(() => void)[]>([]);

  // ── Subscribe to all collections on login ────────────────────────────────
  useEffect(() => {
    unsubRefs.current.forEach((unsub) => unsub());
    unsubRefs.current = [];

    if (!user) {
      setAccounts([]);
      setLogs([]);
      setReceipts([]);
      setBills([]);
      setRates(DEFAULT_RATES);
      setLoadingAccounts(true);
      setLoadingLogs(true);
      setLoadingReceipts(true);
      setLoadingBills(true);
      setLoadingRates(true);
      return;
    }

    const uid = user.uid;

    // Accounts
    const unsubAccounts = onSnapshot(
      query(collection(db, "dairies", uid, "accounts"), orderBy("name")),
      (snap) => {
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account)));
        setLoadingAccounts(false);
      },
      (err) => { console.error("accounts listener:", err); setLoadingAccounts(false); }
    );

    // Logs
    const unsubLogs = onSnapshot(
      query(collection(db, "dairies", uid, "logs"), orderBy("date", "desc")),
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MilkLog)));
        setLoadingLogs(false);
      },
      (err) => { console.error("logs listener:", err); setLoadingLogs(false); }
    );

    // Receipts
    const unsubReceipts = onSnapshot(
      query(collection(db, "dairies", uid, "receipts"), orderBy("date", "desc")),
      (snap) => {
        setReceipts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Receipt)));
        setLoadingReceipts(false);
      },
      (err) => { console.error("receipts listener:", err); setLoadingReceipts(false); }
    );

    // Bills
    const unsubBills = onSnapshot(
      query(collection(db, "dairies", uid, "bills"), orderBy("createdAt", "desc")),
      (snap) => {
        setBills(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Bill)));
        setLoadingBills(false);
      },
      (err) => { console.error("bills listener:", err); setLoadingBills(false); }
    );

    // Rates — single document in settings sub-collection
    const unsubRates = onSnapshot(
      doc(db, "dairies", uid, "settings", "rates"),
      (snap) => {
        if (snap.exists()) {
          setRates({ ...DEFAULT_RATES, ...(snap.data() as Rates) });
        } else {
          setRates(DEFAULT_RATES);
        }
        setLoadingRates(false);
      },
      (err) => { console.error("rates listener:", err); setLoadingRates(false); }
    );

    unsubRefs.current = [unsubAccounts, unsubLogs, unsubReceipts, unsubBills, unsubRates];

    return () => {
      unsubRefs.current.forEach((unsub) => unsub());
    };
  }, [user]);

  // ── Rates ─────────────────────────────────────────────────────────────────

  const updateRates = useCallback(async (newRates: Rates) => {
    if (!user) return;
    // Optimistic
    setRates(newRates);
    await setDoc(doc(db, "dairies", user.uid, "settings", "rates"), newRates);
  }, [user]);

  // ── Account mutations ─────────────────────────────────────────────────────

  const addAccount = useCallback(async (data: Omit<Account, "id">) => {
    if (!user) return;
    const tempId = genTempId();
    setAccounts((prev) => [...prev, { id: tempId, ...data }].sort((a, b) => a.name.localeCompare(b.name)));
    await addDoc(collection(db, "dairies", user.uid, "accounts"), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const updateAccount = useCallback(async (id: string, data: Partial<Omit<Account, "id">>) => {
    if (!user) return;
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
    await updateDoc(doc(db, "dairies", user.uid, "accounts", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const deleteAccount = useCallback(async (id: string) => {
    if (!user) return;
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    await deleteDoc(doc(db, "dairies", user.uid, "accounts", id));
  }, [user]);

  // ── Log mutations ─────────────────────────────────────────────────────────

  const addLog = useCallback(async (data: Omit<MilkLog, "id">) => {
    if (!user) return;
    const tempId = genTempId();
    setLogs((prev) => [{ id: tempId, ...data }, ...prev]);
    await addDoc(collection(db, "dairies", user.uid, "logs"), {
      ...data,
      createdAt: serverTimestamp(),
    });
  }, [user]);

  const deleteLog = useCallback(async (id: string) => {
    if (!user) return;
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await deleteDoc(doc(db, "dairies", user.uid, "logs", id));
  }, [user]);

  // ── Receipt mutations ─────────────────────────────────────────────────────

  const addReceipt = useCallback(async (
    data: Omit<Receipt, "id">,
    balanceChange: number
  ) => {
    if (!user) return;
    const tempId = genTempId();
    setReceipts((prev) => [{ id: tempId, ...data }, ...prev]);
    setAccounts((prev) =>
      prev.map((a) => (a.id === data.accountId ? { ...a, previousBalance: balanceChange } : a))
    );
    await Promise.all([
      addDoc(collection(db, "dairies", user.uid, "receipts"), {
        ...data,
        createdAt: serverTimestamp(),
      }),
      updateDoc(doc(db, "dairies", user.uid, "accounts", data.accountId), {
        previousBalance: balanceChange,
        updatedAt: serverTimestamp(),
      }),
    ]);
  }, [user]);

  const deleteReceipt = useCallback(async (receipt: Receipt) => {
    if (!user) return;
    const account = accounts.find((a) => a.id === receipt.accountId);
    const revertedBalance = account
      ? receipt.balanceAction === "Add"
        ? account.previousBalance - receipt.amount
        : account.previousBalance + receipt.amount
      : null;

    setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    if (revertedBalance !== null) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === receipt.accountId ? { ...a, previousBalance: revertedBalance } : a
        )
      );
    }
    await Promise.all([
      deleteDoc(doc(db, "dairies", user.uid, "receipts", receipt.id)),
      revertedBalance !== null
        ? updateDoc(doc(db, "dairies", user.uid, "accounts", receipt.accountId), {
          previousBalance: revertedBalance,
          updatedAt: serverTimestamp(),
        })
        : Promise.resolve(),
    ]);
  }, [user, accounts]);

  // ── Bill mutations ────────────────────────────────────────────────────────

  const addBill = useCallback(async (
    data: Omit<Bill, "id" | "createdAt">,
    accountNewBalance: number
  ) => {
    if (!user) return;
    const tempId = genTempId();
    const tempBill: Bill = { ...data, id: tempId, createdAt: new Date() };
    setBills((prev) => [tempBill, ...prev]);
    setAccounts((prev) =>
      prev.map((a) => (a.id === data.accountId ? { ...a, previousBalance: accountNewBalance } : a))
    );
    await Promise.all([
      addDoc(collection(db, "dairies", user.uid, "bills"), {
        ...data,
        createdAt: serverTimestamp(),
      }),
      updateDoc(doc(db, "dairies", user.uid, "accounts", data.accountId), {
        previousBalance: accountNewBalance,
        updatedAt: serverTimestamp(),
      }),
    ]);
  }, [user]);

  // ── Batch bill creation (all accounts at once) ────────────────────────────
  const addBillsBatch = useCallback(async (
    items: Array<{ billData: Omit<Bill, "id" | "createdAt">; accountNewBalance: number }>
  ) => {
    if (!user || items.length === 0) return;

    // Optimistic: add all temp bills and update all account balances at once
    const tempBills: Bill[] = items.map(({ billData }) => ({
      ...billData,
      id: genTempId(),
      createdAt: new Date(),
    }));

    setBills((prev) => [...tempBills, ...prev]);
    setAccounts((prev) =>
      prev.map((a) => {
        const match = items.find((item) => item.billData.accountId === a.id);
        return match ? { ...a, previousBalance: match.accountNewBalance } : a;
      })
    );

    // Fire all Firestore writes in parallel
    await Promise.all(
      items.flatMap(({ billData, accountNewBalance }) => [
        addDoc(collection(db, "dairies", user.uid, "bills"), {
          ...billData,
          createdAt: serverTimestamp(),
        }),
        updateDoc(doc(db, "dairies", user.uid, "accounts", billData.accountId), {
          previousBalance: accountNewBalance,
          updatedAt: serverTimestamp(),
        }),
      ])
    );
  }, [user]);

  const deleteBill = useCallback(async (bill: Bill) => {
    if (!user) return;
    const account = accounts.find((a) => a.id === bill.accountId);
    const revertedBalance = account
      ? account.previousBalance - bill.totalMilkAmount
      : null;

    setBills((prev) => prev.filter((b) => b.id !== bill.id));
    if (revertedBalance !== null) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === bill.accountId ? { ...a, previousBalance: revertedBalance } : a
        )
      );
    }
    await Promise.all([
      deleteDoc(doc(db, "dairies", user.uid, "bills", bill.id)),
      revertedBalance !== null
        ? updateDoc(doc(db, "dairies", user.uid, "accounts", bill.accountId), {
          previousBalance: revertedBalance,
          updatedAt: serverTimestamp(),
        })
        : Promise.resolve(),
    ]);
  }, [user, accounts]);

  // ── Period log fetch from local cache ────────────────────────────────────

  const getLogsForPeriod = useCallback(
    (accountId: string, startDate: string, endDate: string): MilkLog[] => {
      return logs.filter(
        (l) =>
          l.accountId === accountId &&
          l.date >= startDate &&
          l.date <= endDate
      );
    },
    [logs]
  );

  return (
    <AppDataContext.Provider
      value={{
        accounts,
        logs,
        receipts,
        bills,
        rates,
        loadingAccounts,
        loadingLogs,
        loadingReceipts,
        loadingBills,
        loadingRates,
        updateRates,
        addAccount,
        updateAccount,
        deleteAccount,
        addLog,
        deleteLog,
        addReceipt,
        deleteReceipt,
        addBill,
        addBillsBatch,
        deleteBill,
        getLogsForPeriod,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
};
