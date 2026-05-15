import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "fs";

// ─── Rate types (mirrored from AppDataStore) ──────────────────────────────────

interface Rates {
  cowMorningPurchase: number;
  cowMorningSale: number;
  cowEveningPurchase: number;
  cowEveningSale: number;
  buffaloMorningPurchase: number;
  buffaloMorningSale: number;
  buffaloEveningPurchase: number;
  buffaloEveningSale: number;
  sapretaMorningPurchase: number;
  sapretaMorningSale: number;
  sapretaEveningPurchase: number;
  sapretaEveningSale: number;
}

interface Account {
  id: string;
  name: string;
  type: "Purchase From" | "Sale To";
  mobile: string;
  previousBalance: number;
  rateOverrides?: Partial<Rates> | null;
}

interface MilkLog {
  id: string;
  accountId: string;
  accountName: string;
  accountType: "Purchase From" | "Sale To";
  date: string;
  milkType: "Cow" | "Buffalo" | "Sapreta";
  qty: number;
  fat: number;
  timePeriod: "Morning" | "Evening";
  amount: number;
}

// ─── Calculation functions (mirrored from AppDataStore) ────────────────────────

function calculateAmount(
  milkType: "Cow" | "Buffalo" | "Sapreta",
  timePeriod: "Morning" | "Evening",
  accountType: "Purchase From" | "Sale To",
  qty: number,
  fat: number,
  rates: Rates
): number {
  const direction = accountType === "Purchase From" ? "Purchase" : "Sale";
  const period = timePeriod;

  if (milkType === "Cow") {
    const key = `cow${period}${direction}` as keyof Rates;
    return qty * rates[key];
  } else if (milkType === "Buffalo") {
    const key = `buffalo${period}${direction}` as keyof Rates;
    return qty * fat * rates[key];
  } else {
    const key = `sapreta${period}${direction}` as keyof Rates;
    return qty * rates[key];
  }
}

function resolveAccountRates(globalRates: Rates, accountRates?: Partial<Rates> | null): Rates {
  const overrides = accountRates ?? {};
  const resolved: Partial<Rates> = {};

  (Object.keys(globalRates) as Array<keyof Rates>).forEach((key) => {
    const v = overrides[key];
    resolved[key] = typeof v === "number" && v > 0 ? v : globalRates[key];
  });

  return resolved as Rates;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: npx tsx scripts/fix-log-amounts.ts <path-to-service-account-key.json> [userId]");
    console.error("");
    console.error("  <path-to-service-account-key.json>  — required, Firebase service account key");
    console.error("  [userId]                            — optional, process only one dairy (by UID)");
    process.exit(1);
  }

  const serviceAccountPath = args[0];
  const specificUserId = args[1] || null;

  // Initialize Firebase Admin
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));

  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }

  const db = getFirestore();
  const auth = getAuth();

  // Collect user IDs
  let userIds: string[] = [];

  if (specificUserId) {
    userIds = [specificUserId];
    console.log(`Will process only dairy: ${specificUserId}`);
  } else {
    console.log("Listing all Firebase Auth users...");
    let nextPageToken: string | undefined;
    do {
      const result = await auth.listUsers(1000, nextPageToken);
      userIds.push(...result.users.map((u) => u.uid));
      nextPageToken = result.pageToken;
      console.log(`  Found ${result.users.length} users (total: ${userIds.length})`);
    } while (nextPageToken);
    console.log(`Total dairies to process: ${userIds.length}`);
  }

  let totalFixed = 0;
  let totalLogs = 0;
  let totalDairies = 0;

  for (const uid of userIds) {
    console.log(`\n── Dairy: ${uid} ──`);
    totalDairies++;

    // Read global rates
    const ratesSnap = await db.collection("dairies").doc(uid).collection("settings").doc("rates").get();
    if (!ratesSnap.exists) {
      console.log("  No rates document found → skipping");
      continue;
    }
    const globalRates = ratesSnap.data() as Rates;

    // Read accounts (for per-account rate overrides)
    const accountsSnap = await db.collection("dairies").doc(uid).collection("accounts").get();
    const accountsByKey = new Map<string, Account>();
    accountsSnap.forEach((doc) => {
      const data = doc.data() as Account;
      accountsByKey.set(doc.id, { ...data, id: doc.id });
    });
    console.log(`  Accounts: ${accountsByKey.size}`);

    // Read all logs
    const logsSnap = await db.collection("dairies").doc(uid).collection("logs").get();
    console.log(`  Logs: ${logsSnap.size}`);

    const batch = db.batch();
    let batchOps = 0;
    let dairyFixed = 0;

    for (const logDoc of logsSnap.docs) {
      totalLogs++;
      const log = logDoc.data() as MilkLog;

      const account = accountsByKey.get(log.accountId);
      if (!account) {
        continue;
      }

      const effectiveRates = resolveAccountRates(globalRates, account.rateOverrides);
      const correctAmount = calculateAmount(
        log.milkType,
        log.timePeriod,
        log.accountType,
        log.qty,
        log.fat || 0,
        effectiveRates
      );

      const diff = Math.abs(log.amount - correctAmount);
      if (diff > 0.01) {
        batch.update(logDoc.ref, { amount: correctAmount });
        batchOps++;
        dairyFixed++;
        console.log(`  Fix: ${logDoc.id.slice(0, 8)}… ${log.milkType} ${log.timePeriod} ${log.accountType} qty=${log.qty} fat=${log.fat} → ${correctAmount} (was ${log.amount})`);
      }

      // Commit in batches of 500 (Firestore limit)
      if (batchOps >= 500) {
        await batch.commit();
        batchOps = 0;
      }
    }

    // Commit remaining
    if (batchOps > 0) {
      await batch.commit();
    }

    totalFixed += dairyFixed;
    console.log(`  → ${dairyFixed} log(s) fixed in this dairy`);
  }

  console.log(`\n═══════════════════════════════════`);
  console.log(`Total dairies processed: ${totalDairies}`);
  console.log(`Total logs evaluated:   ${totalLogs}`);
  console.log(`Total logs fixed:       ${totalFixed}`);
  console.log(`═══════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
