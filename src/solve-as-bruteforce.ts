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
const SECOND_HALF_START = 16;
const MAX_TRANSFERS = 4;
const MAX_BUDGET = 42000000;

function loadPlayers(): Record<string, PlayerMeta> {
    const data: PlayerMeta[] = JSON.parse(fs.readFileSync(PLAYER_DATA_PATH, "utf-8"));
    const map: Record<string, PlayerMeta> = {};
    for (const p of data) {
        map[p.ID] = p;
    }
    return map;
}

function loadMatchdayPoints(): Record<string, number> {
    const files = fs.readdirSync(COMBINED_DIR).filter(f => f.endsWith(".json"));
    const relevant = files.filter(f => {
        const matchday = parseInt(f.match(/(\d{2})\.json$/)?.[1] || "0", 10);
        return matchday >= SECOND_HALF_START;
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

function findBestTransfers() {
    const players = loadPlayers();
    const points = loadMatchdayPoints();
    const currentSquad = loadCurrentSquad();
    const squadSet = new Set(currentSquad);

    const currentSquadCost = currentSquad.reduce((sum, id) => {
        const p = players[id];
        return sum + (p ? parseInt(p.Marktwert) : 0);
    }, 0);

    type TransferOption = {
        outId: string;
        inId: string;
        position: Position;
        costDiff: number;
        pointDiff: number;
    };

    const options: TransferOption[] = [];

    for (const outId of currentSquad) {
        const outPlayer = players[outId];
        if (!outPlayer) continue;
        const outPoints = points[outId] ?? 0;
        const outCost = parseInt(outPlayer.Marktwert);

        for (const [inId, inPlayer] of Object.entries(players)) {
            if (squadSet.has(inId)) continue;
            if (inPlayer.Position !== outPlayer.Position) continue;

            const inPoints = points[inId] ?? 0;
            const inCost = parseInt(inPlayer.Marktwert);
            const newSquadCost = currentSquadCost - outCost + inCost;

            if (newSquadCost > MAX_BUDGET) continue;

            const pointDiff = inPoints - outPoints;
            if (pointDiff > 0) {
                options.push({
                    outId,
                    inId,
                    position: inPlayer.Position,
                    costDiff: inCost - outCost,
                    pointDiff
                });
            }
        }
    }

    // Sort by point gain descending
    options.sort((a, b) => b.pointDiff - a.pointDiff);

    const best: TransferOption[] = [];
    const usedOutIds = new Set<string>();
    const usedInIds = new Set<string>();
    let squadCost = currentSquadCost;

    for (const option of options) {
        if (usedOutIds.has(option.outId)) continue;
        if (usedInIds.has(option.inId)) continue;

        const outCost = parseInt(players[option.outId].Marktwert);
        const inCost = parseInt(players[option.inId].Marktwert);
        const projectedCost = squadCost - outCost + inCost;

        if (projectedCost > MAX_BUDGET) continue;

        best.push(option);
        usedOutIds.add(option.outId);
        usedInIds.add(option.inId);
        squadCost = projectedCost;

        if (best.length >= MAX_TRANSFERS) break;
    }

    if (best.length === 0) {
        console.log("❌ Kein gültiger Transfer gefunden.");
        return;
    }

    console.log(`✅ Beste ${best.length} Transfers mit Punktgewinn:\n`);
    for (const t of best) {
        const outPlayer = players[t.outId];
        const inPlayer = players[t.inId];
        console.log(`⬅️  ${outPlayer["Angezeigter Name"]} (${t.outId})`);
        console.log(`➡️  ${inPlayer["Angezeigter Name"]} (${t.inId})`);
        console.log(`🔄 Position: ${t.position}, 🪙 Budgetdiff: ${t.costDiff}, 📊 Punktdiff: +${t.pointDiff}\n`);
    }
}

findBestTransfers();
