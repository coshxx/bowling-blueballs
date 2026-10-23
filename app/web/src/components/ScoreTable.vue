<script setup lang="ts">
import { computed } from 'vue';
import { frameSymbols, runningScores } from '../bowling';
import type { ResultPlayer } from '../types';
import UserAvatar from './UserAvatar.vue';

/** avatar nur bei freigegebenen Spielen, die einem Spieler zugeordnet sind */
const props = defineProps<{ players: (ResultPlayer & { avatar?: { name: string; url: string | null } })[] }>();

const rows = computed(() =>
  props.players.map((p) => {
    const scores = runningScores(p.frames);
    return {
      name: p.name,
      avatar: p.avatar,
      frames: Array.from({ length: 10 }, (_, i) => ({
        symbols: p.frames[i] ? frameSymbols(p.frames[i]) : [],
        score: scores[i],
      })),
      total: scores.at(-1) ?? 0,
    };
  }),
);
</script>

<template>
  <div class="overflow-auto">
    <table class="score">
      <thead>
        <tr>
          <th></th>
          <th v-for="n in 10" :key="n">{{ n }}</th>
          <th>Σ</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, idx) in rows" :key="idx">
          <th scope="row">
            <span v-if="row.avatar" class="with-avatar">
              <UserAvatar :name="row.avatar.name" :url="row.avatar.url" :size="24" />{{ row.name }}
            </span>
            <template v-else>{{ row.name }}</template>
          </th>
          <td v-for="(f, i) in row.frames" :key="i">
            <div class="rolls">
              <span v-for="(s, j) in f.symbols" :key="j">{{ s }}</span>
            </div>
            <div class="running">{{ f.score ?? '' }}</div>
          </td>
          <td class="total">{{ row.total }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.score {
  margin-bottom: 0;
  font-variant-numeric: tabular-nums;
}
.score th,
.score td {
  padding: 0.25rem 0.4rem;
  text-align: center;
  white-space: nowrap;
}
.score tbody th {
  text-align: left;
}
.rolls {
  display: flex;
  justify-content: center;
  gap: 0.3rem;
  min-height: 1.5em;
  font-size: 0.85em;
}
.running {
  font-weight: 600;
}
.total {
  font-weight: 700;
  font-size: 1.1em;
}
</style>
