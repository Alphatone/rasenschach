import * as fs from "fs";
import * as path from "path";

type Position = "FORWARD" | "MIDFIELDER" | "DEFENDER" | "GOALKEEPER";

interface PlayerMeta {
    ID: string;
    "Angezeigter Name": string;
    Verein: string;
    Marktwert: string;
    Position: Position;
}

const PLAYER_DATA_PATH = "./data/players/players-se.json";
const COMBINED_DIR = "./data/combined";
const CURRENT_SQUAD_PATH = "./data/squad/winter-kader.json";
const MAX_TRANSFERS = 4;
const MAX_BUDGET = 42000000;
const FIRST_HALF_END = 16;
const SECOND_HALF_START = 16;

function loadPlayers(): Record<string, PlayerMeta> {
    const data: PlayerMeta[] = JSON.parse(fs.readFileSync(PLAYER_DATA_PATH, "utf-8"));
    return Object.fromEntries(data.map(p => [p.ID, p]));
}

function loadMatchdayPoints(start: number, end: number): Record<string, number> {
    const files = fs.readdirSync(COMBINED_DIR).filter(f => f.endsWith(".json"));
    const relevant = files.filter(f => {
        const matchday = parseInt(f.match(/(\d{2})\.json$/)?.[1] || "0", 10);
        return matchday >= start && matchday < end;
    });

    const playerPoints: Record<string, number> = {};
    for (const file of relevant) {
        const data = JSON.parse(fs.readFileSync(path.join(COMBINED_DIR, file), "utf-8"));
        for (const player of data) {
            playerPoints[player.playerId] = (playerPoints[player.playerId] ?? 0) + (player.points ?? 0);
        }
    }
    return playerPoints;
}

function loadCurrentSquad(): string[] {
    return JSON.parse(fs.readFileSync(CURRENT_SQUAD_PATH, "utf-8"));
}

function topN(ids: string[], points: Record<string, number>, n: number): string[] {
    return [...ids]
        .sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0))
        .slice(0, n);
}

function findBestTop11TransferCombo() {
    const players = loadPlayers();
    const pointsBefore = loadMatchdayPoints(1, FIRST_HALF_END);
    const pointsAfter = loadMatchdayPoints(SECOND_HALF_START, 35);
    const originalSquad = loadCurrentSquad();
    const squadSet = new Set(originalSquad);

    const originalCost = originalSquad.reduce((sum, id) => sum + (players[id] ? parseInt(players[id].Marktwert) : 0), 0);
    const basePointsBefore = topN(originalSquad, pointsBefore, 11).reduce((sum, id) => sum + (pointsBefore[id] ?? 0), 0);
    const basePointsAfter = topN(originalSquad, pointsAfter, 11).reduce((sum, id) => sum + (pointsAfter[id] ?? 0), 0);
    const baseDiff = basePointsAfter - basePointsBefore;

    const options: {
        outId: string;
        inId: string;
        pointGain: number;
        costDiff: number;
        position: Position;
    }[] = [];

    for (const outId of originalSquad) {
        const outPlayer = players[outId];
        if (!outPlayer) continue;
        const outCost = parseInt(outPlayer.Marktwert);

        for (const [inId, inPlayer] of Object.entries(players)) {
            if (squadSet.has(inId)) continue;
            if (inPlayer.Position !== outPlayer.Position) continue;

            const inCost = parseInt(inPlayer.Marktwert);
            if (originalCost - outCost + inCost > MAX_BUDGET) continue;

            const simulatedSquad = originalSquad.filter(id => id !== outId).concat(inId);
            const diffBefore = topN(simulatedSquad, pointsBefore, 11).reduce((sum, id) => sum + (pointsBefore[id] ?? 0), 0);
            const diffAfter = topN(simulatedSquad, pointsAfter, 11).reduce((sum, id) => sum + (pointsAfter[id] ?? 0), 0);
            const gain = diffAfter - diffBefore;

            if (gain > baseDiff) {
                options.push({
                    outId,
                    inId,
                    pointGain: gain - baseDiff,
                    costDiff: inCost - outCost,
                    position: inPlayer.Position
                });
            }
        }
    }

    // Sortiere und wähle beste Kombination ohne doppelte Spieler
    const usedOut = new Set<string>();
    const usedIn = new Set<string>();
    const selected: typeof options = [];
    let currentCost = originalCost;

    for (const o of options.sort((a, b) => b.pointGain - a.pointGain)) {
        if (usedOut.has(o.outId) || usedIn.has(o.inId)) continue;
        const newCost = currentCost - parseInt(players[o.outId].Marktwert) + parseInt(players[o.inId].Marktwert);
        if (newCost > MAX_BUDGET) continue;

        selected.push(o);
        usedOut.add(o.outId);
        usedIn.add(o.inId);
        currentCost = newCost;

        if (selected.length >= MAX_TRANSFERS) break;
    }

    if (selected.length === 0) {
        console.log("❌ Kein gültiger Transfer gefunden.");
        return;
    }

    console.log(`✅ Beste ${selected.length} Transfers (Top-11 Differenzoptimierung):\n`);
    for (const t of selected) {
        const outP = players[t.outId];
        const inP = players[t.inId];
        console.log(`⬅️  ${outP["Angezeigter Name"]} (${t.outId})`);
        console.log(`➡️  ${inP["Angezeigter Name"]} (${t.inId})`);
        console.log(`🔄 Pos: ${t.position}, 📈 Punktdifferenz: +${t.pointGain}, 🪙 Budgetdiff: ${t.costDiff}\n`);
    }
}

findBestTop11TransferCombo();
