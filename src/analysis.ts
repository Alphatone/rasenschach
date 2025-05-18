import * as fs from "fs";
import * as path from "path";
import { PlayerEntry } from './matchday-fetcher';

const PLAYER_META_PATH = "./data/players/players-se.json";
const COMBINED_DIR = "./data/combined";

function loadAllMatchdays(): PlayerEntry[][] {
    const files = fs.readdirSync(COMBINED_DIR).filter(f => f.endsWith(".json"));
    return files.map(file => {
        const raw = fs.readFileSync(path.join(COMBINED_DIR, file), "utf-8");
        return JSON.parse(raw) as PlayerEntry[];
    });
}

function loadPlayerMeta(): Record<string, any> {
    const raw = fs.readFileSync(PLAYER_META_PATH, "utf-8");
    const list = JSON.parse(raw) as any[];
    const map: Record<string, any> = {};
    for (const p of list) {
        map[p.ID] = p;
    }
    return map;
}

function aggregatePoints(matchdays: PlayerEntry[][], start: number, end: number): Record<string, number> {
    const totals: Record<string, number> = {};
    matchdays.slice(start, end).forEach(day =>
        day.forEach(player => {
            totals[player.playerId] = (totals[player.playerId] ?? 0) + (player.points ?? 0);
        })
    );
    return totals;
}

function mergePerformance(firstHalf: Record<string, number>, secondHalf: Record<string, number>, meta: Record<string, any>) {
    const ids = new Set([...Object.keys(firstHalf), ...Object.keys(secondHalf)]);
    const result = [];

    for (const id of ids) {
        const metaEntry = meta[id];
        if (!metaEntry) continue;
        const cost = parseInt(metaEntry.Marktwert);
        if (!cost || cost === 0) continue;

        const pointsFirst = firstHalf[id] ?? 0;
        const pointsSecond = secondHalf[id] ?? 0;

        result.push({
            id,
            name: metaEntry["Angezeigter Name"],
            club: metaEntry.Verein,
            position: metaEntry.Position,
            marketValue: cost,
            pointsFirstHalf: pointsFirst,
            pointsSecondHalf: pointsSecond,
            pointsFirstHalfPerMio: +(pointsFirst / (cost / 1_000_000)).toFixed(2),
            pointsSecondHalfPerMio: +(pointsSecond / (cost / 1_000_000)).toFixed(2),
        });
    }

    return result
        .filter(p => p.pointsFirstHalf > 0 || p.pointsSecondHalf > 0)
        .sort((a, b) => b.pointsSecondHalf - a.pointsSecondHalf)
        .slice(0, 100); // Top 20 nach Effizienz Rückrunde
}

const WINTER_KADER_PATH = "./data/squad/winter-kader.json";

function getSquadEfficiencyTable(): void {
    const winterKader: string[] = JSON.parse(fs.readFileSync(WINTER_KADER_PATH, "utf-8"));

    const firstHalf = aggregatePoints(matchdays, 0, 17);
    const secondHalf = aggregatePoints(matchdays, 17, 34);

    const rows = [];

    for (const id of winterKader) {
        const metaEntry = meta[id];
        if (!metaEntry) continue;

        const cost = parseInt(metaEntry.Marktwert);
        if (!cost || cost === 0) continue;

        const pointsFirst = firstHalf[id] ?? 0;
        const pointsSecond = secondHalf[id] ?? 0;

        rows.push({
            id,
            name: metaEntry["Angezeigter Name"],
            club: metaEntry.Verein,
            position: metaEntry.Position,
            marketValue: cost,
            pointsFirstHalf: pointsFirst,
            pointsSecondHalf: pointsSecond,
            pointsFirstHalfPerMio: +(pointsFirst / (cost / 1_000_000)).toFixed(2),
            pointsSecondHalfPerMio: +(pointsSecond / (cost / 1_000_000)).toFixed(2),
        });
    }

    console.log("\n📊 Effizienz deines Winter-Kaders:");
    console.table(rows.sort((a, b) => b.pointsSecondHalf - a.pointsSecondHalf));
}
const matchdays = loadAllMatchdays();
const meta = loadPlayerMeta();

const firstHalf = aggregatePoints(matchdays, 0, 17);
const secondHalf = aggregatePoints(matchdays, 17, 34);

const topEfficient = mergePerformance(firstHalf, secondHalf, meta);

console.log("\n💸 Effizienteste Spieler (Punkte pro Mio Marktwert – Rückrunde):");
console.table(topEfficient);
getSquadEfficiencyTable();
