import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency, formatCurrencyShort } from "../lib/format";

interface ChartPoint {
  name: string;
  ingresos: number;
  // Comparativa opcional: mismo punto del periodo anterior (línea punteada gris).
  anterior?: number;
}

interface ChartProps {
  data: ChartPoint[];
  type?: "area" | "bar";
  currency?: string;
}

export function RevenueChart({ data, type = "area", currency = "MXN" }: ChartProps) {
  const hasPrev = data.some((d) => d.anterior != null);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="income" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#0a0a0b" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#0a0a0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e7ea" />
          <XAxis dataKey="name" stroke="#9a9aa4" fontSize={12} />
          <YAxis
            stroke="#9a9aa4"
            fontSize={12}
            tickFormatter={(value) => formatCurrencyShort(Number(value), currency)}
          />
          <Tooltip
            formatter={(value, name) => [
              formatCurrency(Number(value), currency),
              name === "anterior" ? "Periodo anterior" : "Ingresos"
            ]}
          />
          {type === "area" ? (
            <Area type="monotone" dataKey="ingresos" stroke="#0a0a0b" fill="url(#income)" strokeWidth={2.5} />
          ) : (
            <Bar dataKey="ingresos" fill="#2a2a2e" radius={[6, 6, 0, 0]} />
          )}
          {hasPrev && (
            <Line
              type="monotone"
              dataKey="anterior"
              stroke="#9a9aa4"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
