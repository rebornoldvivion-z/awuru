import { useEffect, useRef } from "react";
import type { Candle, Geometry } from "@/awuru/types.ts";

type Props = {
  candles: Candle[];
  live: Candle | null;
  geometry: Geometry | null;
  zone?: { low: number; high: number; type?: string } | null;
  invalidator?: number | null;
  lastClosed?: number | null;
  lastClosedOpen?: number | null;
};

export function CandleChart({ candles, live, geometry, zone, invalidator, lastClosed, lastClosedOpen }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let chart: { remove: () => void } | null = null;

    void (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !host.current) return;
      const node = host.current;
      node.replaceChildren();
      const c = lc.createChart(node, {
        width: Math.max(node.clientWidth, 320),
        height: Math.max(node.clientHeight, 280),
        layout: {
          background: { color: "#121214" },
          textColor: "#8b8b93",
          fontFamily: "IBM Plex Sans, sans-serif",
        },
        grid: {
          vertLines: { color: "#26262c" },
          horzLines: { color: "#26262c" },
        },
        rightPriceScale: { borderColor: "#2a2a30", scaleMargins: { top: 0.08, bottom: 0.12 } },
        timeScale: { borderColor: "#2a2a30", timeVisible: true, secondsVisible: false },
        crosshair: { vertLine: { color: "#7d93a8" }, horzLine: { color: "#7d93a8" } },
        autoSize: true,
      });
      chart = c;
      const series = c.addSeries(lc.CandlestickSeries, {
        upColor: "#7d9a84",
        downColor: "#b07070",
        borderUpColor: "#7d9a84",
        borderDownColor: "#b07070",
        wickUpColor: "#7d9a84",
        wickDownColor: "#b07070",
      });
      const data = candles
        .filter((bar) => Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
        .map((bar) => ({
          time: Math.floor(bar.openTime / 1000) as never,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));
      if (data.length) series.setData(data);
      const mk = (price: number, color: string, title: string) =>
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: lc.LineStyle.SparseDotted,
          title,
          axisLabelVisible: true,
        });
      if (lastClosed != null) mk(lastClosed, "#6a6a72", "CLOSED");
      if (zone) {
        mk(zone.low, "#7d93a8", "ZONE LO");
        mk(zone.high, "#7d93a8", "ZONE HI");
      }
      if (invalidator != null) mk(invalidator, "#c45c5c", "INV");
      if (geometry) {
        mk(geometry.entry, "#c8ccd4", "ENTRY");
        mk(geometry.stop, "#b07070", "SL");
        mk(geometry.tp1, "#7d9a84", "TP1");
        if (geometry.tp2 != null) mk(geometry.tp2, "#7d9a84", "TP2");
        if (geometry.tp3 != null) mk(geometry.tp3, "#7d9a84", "TP3");
      }
      if (data.length) {
        const last = data[data.length - 1]!;
        lc.createSeriesMarkers(series, [
          {
            time: last.time,
            position: "belowBar",
            color: "#c8ccd4",
            shape: "circle",
            text: "LAST CLOSED",
          },
        ]);
      }
      if (live && data.length) {
        const t = Math.floor(live.openTime / 1000);
        const lastT = data[data.length - 1]!.time as unknown as number;
        if (t > lastT) {
          series.update({
            time: t as never,
            open: live.open,
            high: live.high,
            low: live.low,
            close: live.close,
          });
        }
      }
      c.timeScale().fitContent();
    })();

    return () => {
      disposed = true;
      chart?.remove();
    };
  }, [candles, live, geometry, zone, invalidator, lastClosed]);

  const closedLabel = lastClosedOpen
    ? `15m closed ${new Date(lastClosedOpen).toISOString().slice(11, 16)} UTC · forming wick display-only`
    : `${candles.length} closed 15m · forming wick display-only`;

  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-lg bg-surface md:h-[400px]">
      <div ref={host} className="h-full w-full" />
      <p className="pointer-events-none absolute bottom-2 left-3 z-10 font-mono text-[10px] uppercase tracking-wider text-subtle">{closedLabel}</p>
    </div>
  );
}
