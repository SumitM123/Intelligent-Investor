"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Pie } from "react-chartjs-2";
import type { Slice } from "./types";

// Register only the pieces we use (tree-shake the rest of chart.js).
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

interface PieViewProps {
  slices: Slice[];
  unit?: "usd" | "pct";
}

function formatValue(value: number, unit: "usd" | "pct"): string {
  if (unit === "pct") return `${value.toFixed(1)}%`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function PieView({ slices, unit = "usd" }: PieViewProps) {
  if (slices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-8 text-center text-sm text-[var(--muted)]">
        Nothing to chart at this level yet.
      </div>
    );
  }

  const total = slices.reduce((a, s) => a + s.value, 0);

  const data = {
    labels: slices.map((s) => s.label),
    datasets: [
      {
        data: slices.map((s) => Number(s.value.toFixed(2))),
        backgroundColor: slices.map((s) => s.color),
        borderColor: "#ffffff",
        borderWidth: 1,
      },
    ],
  };

  const options: ChartOptions<"pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_evt, elements) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        slices[idx]?.onClick();
      }
    },
    onHover: (evt, elements) => {
      const target = evt.native?.target as HTMLElement | null;
      if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
    },
    plugins: {
      legend: { display: false }, // we render our own clickable legend column
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed;
            const pct = total > 0 ? (value / total) * 100 : 0;
            if (unit === "pct") return `${ctx.label}: ${value.toFixed(1)}% weight`;
            return `${ctx.label}: ${formatValue(value, unit)} (${pct.toFixed(1)}%)`;
          },
        },
      },
      datalabels: {
        color: "#fff",
        formatter: (v: number) => {
          if (unit === "pct") return total > 0 ? `${v.toFixed(0)}%` : "";
          return total > 0 ? `${((v / total) * 100).toFixed(0)}%` : "";
        },
        // Hide labels on very thin wedges to avoid overlap.
        display: (ctx) => {
          const v = ctx.dataset.data[ctx.dataIndex] as number;
          return total > 0 && v / total >= 0.05;
        },
        font: { weight: "bold", size: 12 },
      },
    },
  };

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="w-full md:w-[340px] h-[300px] md:h-[340px] shrink-0">
        <Pie data={data} options={options} />
      </div>
      <ul className="flex-1 space-y-1 min-w-0">
        {slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.label}>
              <button
                type="button"
                onClick={s.onClick}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-black/[0.04] transition text-left"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="truncate text-sm">{s.label}</span>
                </span>
                <span className="tabular text-sm text-[var(--muted)] shrink-0">
                  {formatValue(s.value, unit)}
                  {unit === "usd" && ` · ${pct.toFixed(0)}%`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
