'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'

interface AgingBreakdown {
  days1to7: { count: number; amount: number }
  days8to14: { count: number; amount: number }
  days15to30: { count: number; amount: number }
  days31to60: { count: number; amount: number }
  days60plus: { count: number; amount: number }
}

interface OverdueChartProps {
  data: AgingBreakdown
}

const COLORS = [
  '#f59e0b', // 1-7 days - amber
  '#f97316', // 8-14 days - orange
  '#ef4444', // 15-30 days - red
  '#dc2626', // 31-60 days - dark red
  '#991b1b', // 60+ days - deep red
]

const LABELS = [
  '1-7 days',
  '8-14 days',
  '15-30 days',
  '31-60 days',
  '60+ days',
]

export function OverdueChart({ data }: OverdueChartProps) {
  const chartData = [
    { name: LABELS[0], value: data.days1to7.amount, count: data.days1to7.count, color: COLORS[0] },
    { name: LABELS[1], value: data.days8to14.amount, count: data.days8to14.count, color: COLORS[1] },
    { name: LABELS[2], value: data.days15to30.amount, count: data.days15to30.count, color: COLORS[2] },
    { name: LABELS[3], value: data.days31to60.amount, count: data.days31to60.count, color: COLORS[3] },
    { name: LABELS[4], value: data.days60plus.amount, count: data.days60plus.count, color: COLORS[4] },
  ]

  const hasData = chartData.some(d => d.value > 0)

  if (!hasData) {
    return (
      <div className="h-[280px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-muted-foreground font-medium">No overdue invoices!</p>
          <p className="text-sm text-muted-foreground">All invoices are current</p>
        </div>
      </div>
    )
  }

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value}`
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
        <XAxis 
          dataKey="name" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          dy={10}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          tickFormatter={formatYAxis}
          width={60}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const item = payload[0].payload
              return (
                <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                  <p className="font-semibold text-sm">{item.name} overdue</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.count} invoice{item.count !== 1 ? 's' : ''}
                  </p>
                  <p className="text-base font-bold mt-1" style={{ color: item.color }}>
                    {formatCurrency(item.value)}
                  </p>
                </div>
              )
            }
            return null
          }}
        />
        <Bar 
          dataKey="value" 
          radius={[6, 6, 0, 0]}
          maxBarSize={60}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

