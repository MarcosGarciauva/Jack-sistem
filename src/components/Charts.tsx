import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface ChartProps {
  data: { name: string; ingresos: number }[];
  type?: "area" | "bar";
}

export function RevenueChart({ data, type = "area" }: ChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        {type === "area" ? (
          <AreaChart data={data} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="income" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#0a0a0b" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#0a0a0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e7ea" />
            <XAxis dataKey="name" stroke="#9a9aa4" fontSize={12} />
            <YAxis stroke="#9a9aa4" fontSize={12} />
            <Tooltip formatter={(value) => [`$${value}`, "Ingresos"]} />
            <Area type="monotone" dataKey="ingresos" stroke="#0a0a0b" fill="url(#income)" strokeWidth={2.5} />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e7ea" />
            <XAxis dataKey="name" stroke="#9a9aa4" fontSize={12} />
            <YAxis stroke="#9a9aa4" fontSize={12} />
            <Tooltip formatter={(value) => [`$${value}`, "Ingresos"]} />
            <Bar dataKey="ingresos" fill="#2a2a2e" radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
