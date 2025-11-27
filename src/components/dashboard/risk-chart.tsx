'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface RiskChartProps {
  data: {
    low: { count: number; amount: number }
    atRisk: { count: number; amount: number }
    overdue: { count: number; amount: number }
    critical: { count: number; amount: number }
  }
}

const COLORS = {
  low: '#10b981',
  atRisk: '#f59e0b',
  overdue: '#f97316',
  critical: '#ef4444',
}

const LABELS = {
  low: 'Low Risk',
  atRisk: 'At Risk',
  overdue: 'Overdue',
  critical: 'Critical',
}

export function RiskChart({ data }: RiskChartProps) {
  const chartData = [
    { name: LABELS.low, value: data.low.amount, count: data.low.count, color: COLORS.low },
    { name: LABELS.atRisk, value: data.atRisk.amount, count: data.atRisk.count, color: COLORS.atRisk },
    { name: LABELS.overdue, value: data.overdue.amount, count: data.overdue.count, color: COLORS.overdue },
    { name: LABELS.critical, value: data.critical.amount, count: data.critical.count, color: COLORS.critical },
  ].filter(d => d.value > 0)

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No invoice data to display
      </div>
    )
  }

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload
              return (
                <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                  <p className="font-medium">{data.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.count} invoices
                  </p>
                  <p className="text-sm font-medium">
                    {formatCurrency(data.value)}
                  </p>
                </div>
              )
            }
            return null
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => (
            <span className="text-sm text-foreground">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

