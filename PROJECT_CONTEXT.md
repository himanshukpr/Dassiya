# Dassiya — Project Context

> **Full project context document** — all decisions, data structures, and feature details from the build conversation. Keep this file updated whenever new features are added.

---

## 1. What Is Dassiya?

**Dassiya** is a multi-tenant web application for dairy businesses to manage:
- Their **accounts** (people they buy milk from / sell milk to)
- Daily **milk log** entries
- **Payment receipts** (to clear balances)
- **10-day bills** called "Dassiya" (calculations for the periods 1–10, 11–20, 21–end of month)

The name "Dassiya" (दस्सिया) refers to the traditional 10-day milk calculation cycle used by Indian dairy businesses.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 + Shadcn UI |
| Icons | Phosphor Icons (`@phosphor-icons/react`) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Email/Password) |
| Caching | Firestore IndexedDB offline persistence + `onSnapshot` |
| State | Global `AppDataStore` context with optimistic updates |

---

## 3. Firebase Configuration

**Project ID:** `dassiya-c5960`

Config is stored in `.env.local` (never commit to git):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=dassiya-c5960.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dassiya-c5960
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=dassiya-c5960.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

**Firestore Security Rules** (must be set in Firebase Console → Firestore → Rules):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /dairies/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 4. Multi-Tenancy Model

Each dairy signs up with email/password → gets a unique Firebase `uid`.

**All data is stored under `dairies/{uid}/...`**  
This guarantees complete data isolation — dairy A can never see dairy B's data.

```
Firestore
└── dairies/
    └── {uid}/                   ← one per dairy
        ├── accounts/            ← their customer/supplier accounts
        ├── logs/                ← daily milk entries
        ├── receipts/            ← payment records
        ├── bills/               ← generated Dassiya bills
        └── settings/
            └── rates            ← milk rate configuration document
```

---

## 5. Data Models

### Account
```typescript
interface Account {
  id: string;
  name: string;
  type: "Purchase From" | "Sale To";
  mobile: string;
  previousBalance: number;   // auto-updated by receipts and bills
}
```

### MilkLog
```typescript
interface MilkLog {
  id: string;
  accountId: string;
  accountName: string;
  accountType: "Purchase From" | "Sale To";
  date: string;              // "YYYY-MM-DD"
  milkType: "Cow" | "Buffalo";
  qty: number;               // litres or kg
  fat: number;               // 0 for Cow; e.g. 6.7 for Buffalo
  timePeriod: "Morning" | "Evening";
  amount: number;            // AUTO-CALCULATED at save time from rate settings
}
```

### Receipt
```typescript
interface Receipt {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  type: "Payment Given" | "Payment Received";
  balanceAction: "Add" | "Subtract";
}
```
> When a receipt is saved, `account.previousBalance` is immediately updated.  
> When a receipt is deleted, the balance is **reverted automatically**.

### Bill (Dassiya)
```typescript
interface Bill {
  id: string;
  accountId: string;
  accountName: string;
  periodLabel: string;                  // e.g. "May 2026 (1-10)"
  startDate: string;                    // "YYYY-MM-DD"
  endDate: string;                      // "YYYY-MM-DD"
  totalCowQty: number;
  totalBuffaloQty: number;
  totalMilkAmount: number;              // sum of all log amounts in the period
  previousBalanceAtGeneration: number;  // snapshot of balance before bill
  newBalance: number;                   // previousBalance + totalMilkAmount
  createdAt: Timestamp;
}
```
> When a bill is saved, `account.previousBalance` is updated to `newBalance`.  
> When a bill is deleted, the balance is **reverted automatically**.

### Rates
```typescript
interface Rates {
  // Cow milk — rate per litre (₹/L)
  cowMorningPurchase: number;
  cowMorningSale: number;
  cowEveningPurchase: number;
  cowEveningSale: number;
  // Buffalo milk — rate per fat unit (₹/fat)
  buffaloMorningPurchase: number;
  buffaloMorningSale: number;
  buffaloEveningPurchase: number;
  buffaloEveningSale: number;
}
```

---

## 6. Amount Calculation Logic

### Cow Milk
```
Amount = Quantity (L) × Rate per litre
```

### Buffalo Milk
```
Amount = Quantity (L) × floor(Fat%) × Rate per fat unit

Example: 10L, Fat 6.7, Rate ₹10/fat
→ 10 × floor(6.7) × 10 = 10 × 6 × 10 = ₹600
```

The rate used depends on:
- **Milk type**: Cow / Buffalo
- **Time period**: Morning / Evening  
- **Account type**: Purchase From → uses "Purchase" rate; Sale To → uses "Sale" rate

This calculation runs **live in the log form** as the user types (instant preview before saving).

---

## 7. Caching & Speed Architecture

### Layer 1 — Firestore IndexedDB Offline Persistence
Enabled in `lib/firebase.ts` using `initializeFirestore` with `persistentLocalCache`.  
- On every page load, data is served **from disk (IndexedDB) instantly**
- Firestore syncs any server changes in the background

### Layer 2 — Global `AppDataStore` (`onSnapshot` listeners)
`components/providers/AppDataStore.tsx` subscribes to all 5 collections once on login:
- `accounts` — ordered by name
- `logs` — ordered by date desc
- `receipts` — ordered by date desc
- `bills` — ordered by createdAt desc
- `settings/rates` — single document

All pages consume data from this shared context. **Navigating between pages never triggers a network fetch.**

### Layer 3 — Optimistic Updates
Every write (add / update / delete) applies the change to local React state **immediately**, then fires the Firestore write in the background. From the user's perspective every operation is instant.

If Firestore rejects the write, `onSnapshot` automatically reconciles UI back to the correct server state.

---

## 8. Application Pages

| Page | Route | Description |
|---|---|---|
| Login/Signup | `/` | Email/password auth for dairy users |
| Dashboard | `/dashboard` | Live stats: account counts, logs today, balance summary |
| Accounts | `/dashboard/accounts` | CRUD for all accounts; balance shown live |
| Milk Logs | `/dashboard/logs` | Daily milk entries with live auto-calculated amount; add-log popup uses a searchable account picker, sticky time period, and a right-side recent-logs confirmation panel; the table also supports date and period filters |
| Receipts | `/dashboard/receipts` | Payment records; balance auto-updated on save/delete |
| Bills | `/dashboard/bills` | Generate Dassiya for ALL accounts at once |
| Rate Settings | `/dashboard/rates` | Configure all 8 milk rate combinations |

---

## 9. Dassiya Bill Generation Flow

1. Open **Bills** page → click **"Generate Bills"**
2. Select **Month**, **Year**, **Period** (1-10 / 11-20 / 21-end)
3. Dialog instantly shows a table of **all accounts** with:
   - Log count, Cow qty, Buffalo qty, calculated amount
   - Status: `🟢 Ready` / `🟠 Already Done` / `⬜ No Logs`
4. Click **"Generate N Bills"**
   - All eligible accounts get a bill created simultaneously (`addBillsBatch`)
   - All account balances updated in parallel Firestore writes
   - UI updates optimistically before server responds

5. Use the single **PDF Export** button on the Bills page
  - Clicking it opens a popup with **Month**, **Year**, **Period**, and **Export Type** controls
  - Export type options are **All Bills**, **Purchase From**, and **Sale To**
  - The selected PDF includes **account-wise statement tables** for the period, with DATE and MORNING/EVENING columns like the printed sample
  - The selected PDF is generated through a hidden browser print iframe so the user can save it as PDF without popup blockers
  - If a bill already exists for the selected account + period, the Generate action now recreates it after reevaluating the current logs and received receipts for that period

**Duplicate Prevention:** A bill cannot be generated for the same account + period twice. The "Already Done" check runs from local cache (zero network). The Preview button is disabled and a red warning shown if duplicate detected.

---

## 10. File Structure

```
Dassiya/
├── app/
│   ├── page.tsx                        ← Login/Signup
│   ├── layout.tsx                      ← Root layout (AuthProvider)
│   └── dashboard/
│       ├── layout.tsx                  ← Dashboard shell (sidebar, AppDataProvider)
│       ├── page.tsx                    ← Dashboard home (stats)
│       ├── accounts/page.tsx           ← Accounts CRUD
│       ├── logs/page.tsx               ← Milk logs with auto-amount
│       ├── receipts/page.tsx           ← Payment receipts
│       ├── bills/page.tsx              ← Dassiya bill generation
│       └── rates/page.tsx              ← Rate settings
├── components/
│   ├── providers/
│   │   ├── AuthContext.tsx             ← Firebase auth context
│   │   └── AppDataStore.tsx            ← Global cache + all CRUD functions
│   └── ui/                             ← Shadcn components
└── lib/
    └── firebase.ts                     ← Firebase init with IndexedDB persistence
```

---

## 11. Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# → http://localhost:3000

# Type check
npm run typecheck

# Production build
npm run build
```

---

## 12. Known Requirements & Notes

- **Firestore Composite Index needed** for log queries that filter by `accountId` + `date` range (used in Bills preview). Firebase provides a direct link in the console error to create it with one click.
- **`.env.local` must not be committed** — contains Firebase API keys.
- The `previousBalance` field on accounts is the **single source of truth** for balances. It is updated by receipts and bills only — never edited directly through the accounts form after initial setup (unless correcting an entry via edit).
- The `amount` field on each `MilkLog` is calculated and **stored at save time** using the rates that were active at that moment. Changing rates later does NOT retroactively change old log amounts.
- The Add Milk Log popup now stays open after saving, keeps the selected time period until manually changed, shows the last 5 logs on the right for confirmation, and surfaces a success/error toast after save.
- The Milk Logs page table now includes date and period filters, plus a clear action to reset the list.
- Bills generation can now recreate an existing period bill, and bill previews/tables show the received amount for the selected period.
- Bills page now shows the milk amount direction by account type: Purchase From is displayed as Taken and Sale To as Given, across the preview table, generated tables, and PDF output.
- Bills page now supports browser-based PDF export through a single popup-driven control, and the exported PDF now shows account-wise statements with DATE, MORNING, and EVENING columns for the selected period.
