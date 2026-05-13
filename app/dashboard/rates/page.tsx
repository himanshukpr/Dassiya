"use client";

import { useState, useEffect } from "react";
import { useAppData, Rates, DEFAULT_RATES } from "@/components/providers/AppDataStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RateField {
  key: keyof Rates;
  label: string;
  description: string;
  type: "cow" | "buffalo";
}

const RATE_FIELDS: RateField[] = [
  // Cow
  { key: "cowMorningPurchase", label: "Cow — Morning — Purchase", description: "Rate per litre (₹)", type: "cow" },
  { key: "cowMorningSale",     label: "Cow — Morning — Sale",     description: "Rate per litre (₹)", type: "cow" },
  { key: "cowEveningPurchase", label: "Cow — Evening — Purchase", description: "Rate per litre (₹)", type: "cow" },
  { key: "cowEveningSale",     label: "Cow — Evening — Sale",     description: "Rate per litre (₹)", type: "cow" },
  // Buffalo
  { key: "buffaloMorningPurchase", label: "Buffalo — Morning — Purchase", description: "Rate per fat unit (₹/fat)", type: "buffalo" },
  { key: "buffaloMorningSale",     label: "Buffalo — Morning — Sale",     description: "Rate per fat unit (₹/fat)", type: "buffalo" },
  { key: "buffaloEveningPurchase", label: "Buffalo — Evening — Purchase", description: "Rate per fat unit (₹/fat)", type: "buffalo" },
  { key: "buffaloEveningSale",     label: "Buffalo — Evening — Sale",     description: "Rate per fat unit (₹/fat)", type: "buffalo" },
];

export default function RatesPage() {
  const { rates, loadingRates, updateRates } = useAppData();
  const [form, setForm] = useState<Rates>(DEFAULT_RATES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync form with loaded rates from Firestore (or IndexedDB cache)
  useEffect(() => {
    if (!loadingRates) {
      setForm(rates);
    }
  }, [rates, loadingRates]);

  const handleChange = (key: keyof Rates, value: string) => {
    setForm((prev) => ({ ...prev, [key]: parseFloat(value) || 0 }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateRates(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const cowFields = RATE_FIELDS.filter((f) => f.type === "cow");
  const buffaloFields = RATE_FIELDS.filter((f) => f.type === "buffalo");

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rate Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Configure milk rates for all combinations of type, period, and transaction. These are used to auto-calculate amounts on every milk log entry.
        </p>
      </div>

      {/* Buffalo formula notice */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-4">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">🐃 Buffalo Amount Formula</p>
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded font-mono">
            Amount = Quantity × floor(Fat%) × Rate per Fat
          </code>
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-500 mt-1.5">
          Example: 10 L, Fat 6.7, Rate ₹10/fat → 10 × 6 × 10 = <strong>₹600</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cow Rates */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
            <h2 className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              🐄 Cow Milk Rates
              <span className="text-xs font-normal text-amber-600 dark:text-amber-500">(₹ per litre)</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-y dark:divide-slate-700">
            {cowFields.map((field) => (
              <div key={field.key} className="p-4 space-y-2">
                <Label htmlFor={field.key} className="text-sm font-medium">
                  {field.label.replace("Cow — ", "")}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                  <Input
                    id={field.key}
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={form[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    disabled={loadingRates}
                  />
                </div>
                <p className="text-xs text-slate-400">{field.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Buffalo Rates */}
        <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              🐃 Buffalo Milk Rates
              <span className="text-xs font-normal text-slate-500">(₹ per fat unit)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">e.g. Rate ₹10/fat → Fat 5 = ₹50/L effective rate, Fat 6 = ₹60/L</p>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-y dark:divide-slate-700">
            {buffaloFields.map((field) => (
              <div key={field.key} className="p-4 space-y-2">
                <Label htmlFor={field.key} className="text-sm font-medium">
                  {field.label.replace("Buffalo — ", "")}
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                  <Input
                    id={field.key}
                    type="number"
                    min="0"
                    step="0.01"
                    className="pl-7"
                    value={form[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    disabled={loadingRates}
                  />
                </div>
                <p className="text-xs text-slate-400">{field.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={saving || loadingRates} className="px-8">
            {saving ? "Saving..." : "Save Rates"}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium animate-pulse">
              ✓ Rates saved successfully
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
