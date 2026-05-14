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
    type: "cow" | "buffalo" | "sapreta";
}

const RATE_FIELDS: RateField[] = [
    // Cow
    { key: "cowMorningPurchase", label: "Cow - Morning - Purchase", description: "Rate per litre (Rs)", type: "cow" },
    { key: "cowMorningSale", label: "Cow - Morning - Sale", description: "Rate per litre (Rs)", type: "cow" },
    { key: "cowEveningPurchase", label: "Cow - Evening - Purchase", description: "Rate per litre (Rs)", type: "cow" },
    { key: "cowEveningSale", label: "Cow - Evening - Sale", description: "Rate per litre (Rs)", type: "cow" },
    // Buffalo
    { key: "buffaloMorningPurchase", label: "Buffalo - Morning - Purchase", description: "Rate per fat unit (Rs/fat)", type: "buffalo" },
    { key: "buffaloMorningSale", label: "Buffalo - Morning - Sale", description: "Rate per fat unit (Rs/fat)", type: "buffalo" },
    { key: "buffaloEveningPurchase", label: "Buffalo - Evening - Purchase", description: "Rate per fat unit (Rs/fat)", type: "buffalo" },
    { key: "buffaloEveningSale", label: "Buffalo - Evening - Sale", description: "Rate per fat unit (Rs/fat)", type: "buffalo" },
    // Sapreta
    { key: "sapretaMorningPurchase", label: "Sapreta - Morning - Purchase", description: "Rate per litre (Rs)", type: "sapreta" },
    { key: "sapretaMorningSale", label: "Sapreta - Morning - Sale", description: "Rate per litre (Rs)", type: "sapreta" },
    { key: "sapretaEveningPurchase", label: "Sapreta - Evening - Purchase", description: "Rate per litre (Rs)", type: "sapreta" },
    { key: "sapretaEveningSale", label: "Sapreta - Evening - Sale", description: "Rate per litre (Rs)", type: "sapreta" },
];

export default function RatesPage() {
    const { rates, loadingRates, updateRates } = useAppData();
    const [form, setForm] = useState<Rates>(DEFAULT_RATES);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

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
    const sapretaFields = RATE_FIELDS.filter((f) => f.type === "sapreta");

    return (
        <div className="space-y-8 max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Rate Settings</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
                    Configure milk rates for all combinations of type, period, and transaction. These are used to auto-calculate amounts on every milk log entry.
                </p>
            </div>

            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-4">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Buffalo Amount Formula</p>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                    <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded font-mono">
                        Amount = Quantity x floor(Fat%) x Rate per Fat
                    </code>
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-1.5">
                    Example: 10 L, Fat 6.7, Rate Rs10/fat -&gt; 10 x 6 x 10 = <strong>Rs600</strong>
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <RateSection
                    title="Cow Milk Rates"
                    subtitle="(Rs per litre)"
                    labelPrefix="Cow - "
                    fields={cowFields}
                    form={form}
                    loadingRates={loadingRates}
                    onChange={handleChange}
                    headingClass="text-amber-800 dark:text-amber-300"
                    barClass="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                    subtitleClass="text-amber-600 dark:text-amber-500"
                />

                <RateSection
                    title="Buffalo Milk Rates"
                    subtitle="(Rs per fat unit)"
                    labelPrefix="Buffalo - "
                    fields={buffaloFields}
                    form={form}
                    loadingRates={loadingRates}
                    onChange={handleChange}
                    headingClass="text-slate-700 dark:text-slate-200"
                    barClass="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    subtitleClass="text-slate-500"
                    helperText="e.g. Rate Rs10/fat -> Fat 5 = Rs50/L effective rate, Fat 6 = Rs60/L"
                />

                <RateSection
                    title="Sapreta Milk Rates"
                    subtitle="(Rs per litre)"
                    labelPrefix="Sapreta - "
                    fields={sapretaFields}
                    form={form}
                    loadingRates={loadingRates}
                    onChange={handleChange}
                    headingClass="text-green-800 dark:text-green-300"
                    barClass="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                    subtitleClass="text-green-600 dark:text-green-500"
                />

                <div className="flex items-center gap-4">
                    <Button type="submit" disabled={saving || loadingRates} className="px-8">
                        {saving ? "Saving..." : "Save Rates"}
                    </Button>
                    {saved && (
                        <span className="text-sm text-green-600 dark:text-green-400 font-medium animate-pulse">
                            Rates saved successfully
                        </span>
                    )}
                </div>
            </form>
        </div>
    );
}

function RateSection({
    title,
    subtitle,
    labelPrefix,
    fields,
    form,
    loadingRates,
    onChange,
    headingClass,
    barClass,
    subtitleClass,
    helperText,
}: {
    title: string;
    subtitle: string;
    labelPrefix: string;
    fields: RateField[];
    form: Rates;
    loadingRates: boolean;
    onChange: (key: keyof Rates, value: string) => void;
    headingClass: string;
    barClass: string;
    subtitleClass: string;
    helperText?: string;
}) {
    return (
        <div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden">
            <div className={`px-5 py-3 border-b ${barClass}`}>
                <h2 className={`font-semibold flex items-center gap-2 ${headingClass}`}>
                    {title}
                    <span className={`text-xs font-normal ${subtitleClass}`}>{subtitle}</span>
                </h2>
                {helperText ? <p className="text-xs text-slate-500 mt-0.5">{helperText}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-0 divide-x divide-y dark:divide-slate-700">
                {fields.map((field) => (
                    <div key={field.key} className="p-4 space-y-2">
                        <Label htmlFor={field.key} className="text-sm font-medium">
                            {field.label.replace(labelPrefix, "")}
                        </Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">Rs</span>
                            <Input
                                id={field.key}
                                type="number"
                                min="0"
                                step="0.01"
                                className="pl-10"
                                value={form[field.key] || ""}
                                onChange={(e) => onChange(field.key, e.target.value)}
                                disabled={loadingRates}
                            />
                        </div>
                        <p className="text-xs text-slate-400">{field.description}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
