import React from "react";
import { formatSmallPrice } from "~/utils/db";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Bar,
  Cell,
  Line,
} from "recharts";

export interface PnlChartDataPoint {
  time: string;
  date: string;
  cumulativePnl: number;
  tradePnl: number;
  tokenSymbol: string;
  tokenName: string;
  index: number;
}

export default function RealizedPnlChart({ data }: { data: PnlChartDataPoint[] }) {
  const cumulativeValues = data.map((d) => d.cumulativePnl);
  const tradeValues = data.filter((d) => d.index !== 0).map((d) => d.tradePnl);

  const cumMin = Math.min(...cumulativeValues, 0);
  const cumMax = Math.max(...cumulativeValues, 0);
  const cumPad = Math.max(Math.abs(cumMin), Math.abs(cumMax)) * 0.15 || 0.01;
  const lineDomain: [number, number] = [cumMin - cumPad, cumMax + cumPad];

  const tradeMin = Math.min(...tradeValues, 0);
  const tradeMax = Math.max(...tradeValues, 0);
  const tradePad = Math.max(Math.abs(tradeMin), Math.abs(tradeMax)) * 0.15 || 0.01;
  const barDomain: [number, number] = [tradeMin - tradePad, tradeMax + tradePad];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload as PnlChartDataPoint;
      if (d.index === 0) return null;
      return (
        <div className="bg-black/90 backdrop-blur-xl border border-white/[0.06] rounded-lg p-3 shadow-lg z-50 pointer-events-none">
          <p className="text-[#6B7280] text-xs mb-2 font-medium">{d.date}</p>
          <div className="space-y-1">
            <p className="text-white text-xs font-medium">{d.tokenSymbol || d.tokenName}</p>
            <p className="text-xs" style={{ color: d.tradePnl >= 0 ? "#70E0B0" : "#FF4D7F" }}>
              This trade: {d.tradePnl >= 0 ? "+" : "-"}${formatSmallPrice(Math.abs(d.tradePnl))}
            </p>
            <p className="text-sm font-medium" style={{ color: d.cumulativePnl >= 0 ? "#70E0B0" : "#FF4D7F" }}>
              Total: {d.cumulativePnl >= 0 ? "+" : "-"}${formatSmallPrice(Math.abs(d.cumulativePnl))}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full min-h-[160px] sm:min-h-[192px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" opacity={0.5} />
          <XAxis
            dataKey="time"
            stroke="#6B7280"
            fontSize={8}
            tick={{ fill: "#6B7280" }}
            interval={Math.max(0, Math.floor(data.length / 5))}
            tickLine={{ stroke: "rgba(255,255,255,0.06)" }}
          />
          <YAxis
            yAxisId="line"
            stroke="#6B7280"
            fontSize={8}
            tick={{ fill: "#6B7280" }}
            tickLine={{ stroke: "rgba(255,255,255,0.06)" }}
            domain={lineDomain}
            allowDataOverflow={false}
            width={40}
            tickFormatter={(value) => {
              if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
              if (Math.abs(value) >= 0.1) return `$${value.toFixed(3)}`;
              return `$${value.toFixed(4)}`;
            }}
          />
          <YAxis yAxisId="bar" orientation="right" domain={barDomain} allowDataOverflow={false} hide={true} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.2)", strokeWidth: 1, strokeDasharray: "5 5" }}
            position={{ y: -10 }}
          />
          <ReferenceLine yAxisId="bar" y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
          <ReferenceLine yAxisId="line" y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 4" />
          <Bar yAxisId="bar" dataKey="tradePnl" animationDuration={300} radius={[2, 2, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={entry.index === 0 ? "transparent" : entry.tradePnl >= 0 ? "#70E0B0" : "#FF4D7F"}
                fillOpacity={entry.index === 0 ? 0 : 0.85}
              />
            ))}
          </Bar>
          <Line
            yAxisId="line"
            type="monotone"
            dataKey="cumulativePnl"
            stroke="#A0AEC0"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#A0AEC0", stroke: "rgba(0,0,0,0.8)", strokeWidth: 2 }}
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
