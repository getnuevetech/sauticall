import Link from "next/link";
import { donutArcs, money } from "@/lib/dashboard-math";
import type { ChartCard, Kpi, Point, Slice } from "@/lib/dashboard";

export function KpiRow({ items }: { items: Kpi[] }) {
  if (!items.length) return null;
  return (
    <div className="dash-kpis">
      {items.map((item) => {
        const body = (
          <>
            <small>{item.label}</small>
            <b>{item.value}</b>
            <span>{item.hint}</span>
          </>
        );
        return item.href ? <Link key={item.label} href={item.href} className="dash-kpi">{body}</Link> : <div key={item.label} className="dash-kpi">{body}</div>;
      })}
    </div>
  );
}

function Shell({ card, children }: { card: ChartCard; children: React.ReactNode }) {
  return (
    <article className={`dash-card${card.wide ? " dash-wide" : ""}`}>
      <h3>{card.href ? <Link href={card.href}>{card.title}</Link> : card.title}</h3>
      {children}
    </article>
  );
}

function hasValues(card: ChartCard) {
  const slices = card.slices?.some((slice) => slice.value > 0);
  const points = card.points?.some((point) => point.value > 0);
  return Boolean(slices || points);
}

export function ChartGrid({ cards }: { cards: ChartCard[] }) {
  return (
    <div className="dash-grid">
      {cards.map((card) => (
        <Shell key={card.title} card={card}>
          {hasValues(card) ? <Chart card={card} /> : <p className="dash-empty">{card.empty}</p>}
          {card.lines?.length ? <ul className="dash-lines">{card.lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
        </Shell>
      ))}
    </div>
  );
}

function Chart({ card }: { card: ChartCard }) {
  if (card.kind === "donut") return <Donut slices={card.slices || []} />;
  if (card.kind === "bars") return <Bars points={card.points || []} cents={card.unit === "cents"} />;
  if (card.kind === "area") return <Area points={card.points || []} />;
  return <Columns points={card.points || []} cents={card.unit === "cents"} />;
}

function Donut({ slices }: { slices: Slice[] }) {
  const geometry = donutArcs(slices.map((slice) => slice.value));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="dash-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}>
        <circle cx="70" cy="70" r={geometry.radius} fill="none" stroke="#eef1f6" strokeWidth="16" />
        {slices.length === 1 ? <circle cx="70" cy="70" r={geometry.radius} fill="none" stroke={slices[0].color} strokeWidth="16" /> : null}
        {slices.length > 1 ? slices.map((slice, index) => {
          const arc = geometry.arcs[index];
          if (!arc?.length) return null;
          return (
            <circle
              key={slice.label}
              cx="70"
              cy="70"
              r={geometry.radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="16"
              strokeDasharray={`${arc.length} ${arc.gap}`}
              strokeDashoffset={arc.offset}
              transform="rotate(-90 70 70)"
            />
          );
        }) : null}
        <text x="70" y="74" textAnchor="middle" className="dash-donut-total">{total}</text>
      </svg>
      <ul>
        {slices.map((slice) => (
          <li key={slice.label}><i style={{ background: slice.color }} />{slice.label}<b>{slice.value}</b></li>
        ))}
      </ul>
    </div>
  );
}

const PLOT_W = 640;
const PLOT_H = 168;

function axisMarks(points: Point[], xOf: (index: number) => number) {
  return points
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => points.length <= 8 || index % 6 === 0 || index === points.length - 1)
    .map(({ point, index }) => {
      const x = xOf(index);
      const anchor = x < 40 ? "start" : x > PLOT_W - 40 ? "end" : "middle";
      const tx = anchor === "start" ? 2 : anchor === "end" ? PLOT_W - 2 : x;
      return <text key={`${point.label}-${index}`} x={tx} y={PLOT_H + 18} textAnchor={anchor} className="dash-axis">{point.label}</text>;
    });
}

function Columns({ points, cents }: { points: Point[]; cents: boolean }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const slot = PLOT_W / points.length;
  const bar = Math.max(3, slot * 0.62);
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H + 28}`} className="dash-plot" role="img" aria-label={points.map((point) => `${point.label} ${cents ? money(point.value) : point.value}`).join(", ")}>
      <text x="2" y="12" className="dash-axis">{cents ? money(max) : max}</text>
      {points.map((point, index) => {
        const h = Math.max(point.value ? 4 : 0, (point.value / max) * (PLOT_H - 22));
        const x = index * slot + (slot - bar) / 2;
        return <rect key={`${point.label}-${index}`} x={x} y={PLOT_H - h} width={bar} height={h} rx="3" fill={point.value ? "#354bc8" : "#e6ebf3"}><title>{point.label}: {cents ? money(point.value) : point.value}</title></rect>;
      })}
      {axisMarks(points, (index) => index * slot + slot / 2)}
    </svg>
  );
}

function Area({ points }: { points: Point[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = points.length > 1 ? (PLOT_W - 24) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = 12 + index * step;
    const y = PLOT_H - (point.value / max) * (PLOT_H - 24) - 4;
    return { x, y, point };
  });
  const line = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");
  const fill = `12,${PLOT_H} ${line} ${coords.at(-1)?.x ?? PLOT_W - 12},${PLOT_H}`;
  return (
    <svg viewBox={`0 0 ${PLOT_W} ${PLOT_H + 28}`} className="dash-plot" role="img" aria-label={points.map((point) => `${point.label} ${point.value}`).join(", ")}>
      <text x="2" y="12" className="dash-axis">{max}</text>
      <polygon points={fill} fill="#354bc822" />
      <polyline points={line} fill="none" stroke="#354bc8" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((coord) => <circle key={`${coord.point.label}-${coord.x}`} cx={coord.x} cy={coord.y} r="3.2" fill="#354bc8"><title>{coord.point.label}: {coord.point.value}</title></circle>)}
      {axisMarks(points, (index) => 12 + index * step)}
    </svg>
  );
}

function Bars({ points, cents }: { points: Point[]; cents: boolean }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="dash-bars" role="img" aria-label={points.map((point) => `${point.label} ${cents ? money(point.value) : point.value}`).join(", ")}>
      {points.map((point) => (
        <div key={point.label}>
          <span>{point.label}</span>
          <b>{cents ? money(point.value) : point.value}</b>
          <i><em style={{ width: `${Math.max(point.value ? 4 : 0, (point.value / max) * 100)}%` }} /></i>
        </div>
      ))}
    </div>
  );
}
