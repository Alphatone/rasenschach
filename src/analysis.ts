import * as fs from "fs";
import * as path from "path";
import { PlayerEntry } from './matchday-fetcher';

const gradesToPoints = {
    "100": 10,
    "150": 8,
    "200": 6,
    "250": 4,
    "300": 2,
    "350": 0,
    "400": -2,
    "450": -4,
    "500": -6,
    "550": -8,
    "600": -10
}

function loadAllMatchdays(): PlayerEntry[][] {
    const dir = "./data/combined";
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    return files.map(file => {
        const raw = fs.readFileSync(path.join(dir, file), "utf-8");
        return JSON.parse(raw) as PlayerEntry[];
    });
}

function getTopPlayersFirstHalf(matchdays: PlayerEntry[][], topN = 100) {
    return getTopPlayersOfMatchdays(matchdays, topN, 0, 17)
}

function getTopPlayersSecondHalf(matchdays: PlayerEntry[][], topN = 100) {
    return getTopPlayersOfMatchdays(matchdays, topN, 18, 34)
}

function getTopPlayersOfMatchdays(matchdays: PlayerEntry[][], topN = 100, start: number, end: number) {
    const playerTotals: Record<string, { name: string; points: number }> = {};

    matchdays.slice(start, end).forEach(day =>
        day.forEach((player: PlayerEntry) => {
            if(!playerTotals[player.playerId]) {
                playerTotals[player.playerId] = {name: player.name, points: 0};
            }
            playerTotals[player.playerId].points += player.points ?? 0;
        })
    );

    return Object.entries(playerTotals)
        .sort(([, a], [, b]) => b.points - a.points)
        .slice(0, topN);
}

const matchdays = loadAllMatchdays();

console.log("Top Hinrunde Spieler:", getTopPlayersFirstHalf(matchdays));