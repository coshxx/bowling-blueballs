<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatDate, formatNumber } from '../format';
import UserAvatar from './UserAvatar.vue';

export interface Series {
  id: number;
  name: string;
  avatarUrl: string | null;
  /** Kategorialer Farbslot 1–8, fest pro Spieler (nie nach Rang) */
  slot: number;
  points: { date: string; value: number }[];
}

const props = defineProps<{ series: Series[]; dates: string[] }>();

// Das Diagramm rechnet in echten Pixeln statt in einer herunterskalierten Fläche, damit die Schrift am Handy lesbar bleibt
const plotEl = ref<HTMLDivElement | null>(null);
const width = ref(720);
const W = computed(() => Math.min(720, Math.max(280, width.value)));
const narrow = computed(() => W.value < 480);
const H = computed(() => (narrow.value ? 240 : 300));
// Schmal: keine Namen am Linienende, die Legende darüber reicht
const PAD = computed(() => ({ top: 16, right: narrow.value ? 14 : 96, bottom: 32, left: narrow.value ? 34 : 44 }));
const plotW = computed(() => W.value - PAD.value.left - PAD.value.right);
const plotH = computed(() => H.value - PAD.value.top - PAD.value.bottom);

let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!plotEl.value) return;
  width.value = plotEl.value.clientWidth || 720;
  observer = new ResizeObserver(() => {
    width.value = plotEl.value?.clientWidth || 720;
  });
  observer.observe(plotEl.value);
});
onBeforeUnmount(() => observer?.disconnect());

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

const xDomain = computed(() => {
  const ts = props.dates.map(dayMs);
  return [Math.min(...ts), Math.max(...ts)] as const;
});

function x(date: string): number {
  const [min, max] = xDomain.value;
  return PAD.value.left + (max === min ? plotW.value / 2 : ((dayMs(date) - min) / (max - min)) * plotW.value);
}

/** y-Achse auf 20er-Schritte gerundet, innerhalb 0–300 */
const yDomain = computed(() => {
  const values = props.series.flatMap((s) => s.points.map((p) => p.value));
  const lo = Math.max(0, Math.floor((Math.min(...values) - 10) / 20) * 20);
  const hi = Math.min(300, Math.ceil((Math.max(...values) + 10) / 20) * 20);
  return [lo, hi === lo ? lo + 20 : hi] as const;
});

function y(value: number): number {
  const [lo, hi] = yDomain.value;
  return PAD.value.top + plotH.value - ((value - lo) / (hi - lo)) * plotH.value;
}

const yTicks = computed(() => {
  const [lo, hi] = yDomain.value;
  const step = hi - lo > 120 ? 40 : 20;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return ticks;
});

/** Abstand zwischen Datumsbeschriftungen ("28.04.2025" ist ~65 breit), damit nah beieinanderliegende Abende nicht überlappen */
const X_TICK_GAP = 85;

/** Erstes und letztes Datum immer, dazwischen nur, was genug Abstand zu beiden Nachbarn hat */
const xTicks = computed(() => {
  const dates = props.dates;
  if (dates.length <= 1) return dates;
  const last = dates[dates.length - 1];
  const ticks = [dates[0]];
  for (const d of dates.slice(1, -1)) {
    if (x(d) - x(ticks[ticks.length - 1]) >= X_TICK_GAP && x(last) - x(d) >= X_TICK_GAP) ticks.push(d);
  }
  if (x(last) - x(ticks[ticks.length - 1]) >= X_TICK_GAP) ticks.push(last);
  else ticks[ticks.length - 1] = last;
  return ticks;
});

function path(s: Series): string {
  return s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
}

/** Direkte Beschriftung am Linienende nur bei <= 4 Serien, vertikal entzerrt */
const endLabels = computed(() => {
  if (props.series.length > 4 || narrow.value) return [];
  const labels = props.series
    .filter((s) => s.points.length)
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return { id: s.id, name: s.name, x: x(last.date) + 10, y: y(last.value) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  }
  return labels;
});

// ---- Hover: Fadenkreuz rastet am nächsten Spielabend ein, Tooltip zeigt alle Spieler ----
const svgEl = ref<SVGSVGElement | null>(null);
const hoverDate = ref<string | null>(null);

function onPointerMove(e: PointerEvent) {
  const svg = svgEl.value;
  if (!svg || !props.dates.length) return;
  const rect = svg.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * W.value;
  hoverDate.value = props.dates.reduce((best, d) => (Math.abs(x(d) - px) < Math.abs(x(best) - px) ? d : best));
}

const tooltip = computed(() => {
  const date = hoverDate.value;
  if (!date) return null;
  const rows = props.series
    .map((s) => ({ s, p: s.points.find((p) => p.date === date) }))
    .filter((r) => r.p)
    .map((r) => ({ id: r.s.id, name: r.s.name, slot: r.s.slot, value: r.p!.value }))
    .sort((a, b) => b.value - a.value);
  const leftPct = (x(date) / W.value) * 100;
  return { date, rows, leftPct, alignRight: leftPct > 60 };
});
</script>

<template>
  <div class="viz-root">
    <ul class="legend" aria-label="Legende">
      <li v-for="s in series" :key="s.id">
        <svg width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" :class="`stroke-${s.slot}`" /></svg>
        <UserAvatar :name="s.name" :url="s.avatarUrl" :size="20" />
        {{ s.name }}
      </li>
    </ul>
    <div ref="plotEl" class="plot">
      <svg
        ref="svgEl"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        aria-label="Verlauf des Schnitts pro Spieler und Spielabend"
        @pointermove="onPointerMove"
        @pointerleave="hoverDate = null"
      >
        <g class="grid">
          <line v-for="t in yTicks" :key="t" :x1="PAD.left" :x2="W - PAD.right" :y1="y(t)" :y2="y(t)" />
        </g>
        <g class="axis-labels">
          <text v-for="t in yTicks" :key="t" :x="PAD.left - 8" :y="y(t)" text-anchor="end" dominant-baseline="middle">
            {{ t }}
          </text>
          <text v-for="d in xTicks" :key="d" :x="x(d)" :y="H - 8" text-anchor="middle">{{ formatDate(d) }}</text>
        </g>

        <line
          v-if="hoverDate"
          class="crosshair"
          :x1="x(hoverDate)"
          :x2="x(hoverDate)"
          :y1="PAD.top"
          :y2="PAD.top + plotH"
        />

        <g v-for="s in series" :key="s.id">
          <path :d="path(s)" class="line" :class="`stroke-${s.slot}`" />
          <circle
            v-for="p in s.points"
            :key="p.date"
            :cx="x(p.date)"
            :cy="y(p.value)"
            :r="hoverDate === p.date ? 5.5 : 4"
            class="dot"
            :class="`fill-${s.slot}`"
          />
        </g>

        <text v-for="l in endLabels" :key="l.id" :x="l.x" :y="l.y" class="end-label" dominant-baseline="middle">
          {{ l.name }}
        </text>
      </svg>

      <div
        v-if="tooltip && tooltip.rows.length"
        class="tooltip"
        :style="tooltip.alignRight ? { right: `${100 - tooltip.leftPct}%` } : { left: `${tooltip.leftPct}%` }"
      >
        <div class="tt-date">{{ formatDate(tooltip.date) }}</div>
        <div v-for="r in tooltip.rows" :key="r.id" class="tt-row">
          <svg width="14" height="8" aria-hidden="true"><line x1="1" y1="4" x2="13" y2="4" :class="`stroke-${r.slot}`" /></svg>
          <strong>{{ formatNumber(r.value) }}</strong>
          <span class="tt-name">{{ r.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Referenzpalette (dataviz), validiert gegen Picos Kartenfläche hell #fff / dunkel #181c25 */
.viz-root {
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-5: #e87ba4;
  --series-6: #008300;
  --series-7: #6250d6;
  --series-8: #e34948;
  --chart-surface: var(--pico-card-background-color);
  --chart-grid: var(--pico-muted-border-color);
  --chart-text: var(--pico-color);
  --chart-muted: var(--pico-muted-color);
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme='light'])) .viz-root {
    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --series-4: #c98500;
    --series-5: #d55181;
    --series-6: #008300;
    --series-7: #9085e9;
    --series-8: #e66767;
  }
}
:root[data-theme='dark'] .viz-root {
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  --series-4: #c98500;
  --series-5: #d55181;
  --series-6: #008300;
  --series-7: #9085e9;
  --series-8: #e66767;
}

.stroke-1 { stroke: var(--series-1); }
.stroke-2 { stroke: var(--series-2); }
.stroke-3 { stroke: var(--series-3); }
.stroke-4 { stroke: var(--series-4); }
.stroke-5 { stroke: var(--series-5); }
.stroke-6 { stroke: var(--series-6); }
.stroke-7 { stroke: var(--series-7); }
.stroke-8 { stroke: var(--series-8); }
.fill-1 { fill: var(--series-1); }
.fill-2 { fill: var(--series-2); }
.fill-3 { fill: var(--series-3); }
.fill-4 { fill: var(--series-4); }
.fill-5 { fill: var(--series-5); }
.fill-6 { fill: var(--series-6); }
.fill-7 { fill: var(--series-7); }
.fill-8 { fill: var(--series-8); }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  padding: 0;
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  color: var(--chart-text);
}
.legend li {
  list-style: none;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
}
.legend line,
.tt-row line {
  stroke-width: 2;
  stroke-linecap: round;
}
.plot {
  position: relative;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.grid line {
  stroke: var(--chart-grid);
  stroke-width: 1;
}
.axis-labels text {
  fill: var(--chart-muted);
  font-size: 12px;
}
.line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.dot {
  stroke: var(--chart-surface);
  stroke-width: 2;
}
.end-label {
  fill: var(--chart-text);
  font-size: 12px;
}
.crosshair {
  stroke: var(--chart-muted);
  stroke-width: 1;
}
.tooltip {
  position: absolute;
  top: 0;
  margin: 0 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--pico-background-color);
  border: 1px solid var(--chart-grid);
  border-radius: var(--pico-border-radius);
  box-shadow: var(--pico-card-box-shadow);
  font-size: 0.875rem;
  pointer-events: none;
  white-space: nowrap;
}
.tt-date {
  color: var(--chart-muted);
  margin-bottom: 0.25rem;
}
.tt-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.tt-name {
  color: var(--chart-muted);
}
</style>
