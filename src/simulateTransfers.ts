import * as fs from "fs";
import * as path from "path";
import { PlayerEntry } from "./matchday-fetcher";

type Position = "FORWARD" | "MIDFIELDER" | "DEFENDER" | "GOALKEEPER";

interface PlayerMeta {
    ID: string;
    "Angezeigter Name": string;
    Verein: string;
    Marktwert: string;
    Position: Position;
}

const PLAYER_DATA_PATH = "./data/players/players-se.json";
const CURRENT_SQUAD_PATH = "./data/squad/winter-kader.json";
const COMBINED_DIR = "./data/combined";
const MAX_TRANSFERS = 4;
const MAX_BUDGET = 42000000;
const HINRUNDE_END = 15;
const RUECKRUNDE_START = 16;

function loadPlayers(): Record<string, PlayerMeta> {
    const data: PlayerMeta[] = JSON.parse(fs.readFileSync(PLAYER_DATA_PATH, "utf-8"));
    const map: Record<string, PlayerMeta> = {};
    for (const p of data) {
        map[p.ID] = p;
    }
    return map;
}

function loadCurrentSquad(): string[] {
    return JSON.parse(fs.readFileSync(CURRENT_SQUAD_PATH, "utf-8"));
}

function loadMatchdayScores(start: number, end: number): Record<string, number> {
    const files = fs.readdirSync(COMBINED_DIR).filter(f => f.endsWith(".json"));
    const matchdays = files.filter(f => {
        const num = parseInt(f.match(/(\d{2})\.json$/)?.[1] || "0", 10);
        return num >= start && num <= end;
    });
    const scoreMap: Record<string, number> = {};
    for (const file of matchdays) {
        const entries: PlayerEntry[] = JSON.parse(fs.readFileSync(path.join(COMBINED_DIR, file), "utf-8"));
        for (const p of entries) {
            scoreMap[p.playerId] = (scoreMap[p.playerId] ?? 0) + (p.points ?? 0);
        }
    }
    return scoreMap;
}

function getTop11Points(playerIds: string[], pointsMap: Record<string, number>): number {
    return playerIds
        .map(id => ({ id, pts: pointsMap[id] ?? 0 }))
        .sort((a, b) => b.pts - a.pts)
        .slice(0, 11)
        .reduce((sum, p) => sum + p.pts, 0);
}

function findBestTransfersTop11Based() {
    const players = loadPlayers();
    const squad = loadCurrentSquad();
    const hinrundeScores = loadMatchdayScores(1, HINRUNDE_END);
    const rueckrundeScores = loadMatchdayScores(RUECKRUNDE_START, 34);

    const squadSet = new Set(squad);
    const originalBudget = squad.reduce((sum, id) => sum + parseInt(players[id]?.Marktwert || "0"), 0);
    const originalTop11Points = getTop11Points(squad, hinrundeScores);

    const options: {
        outId: string;
        inId: string;
        pointGain: number;
        budgetDiff: number;
    }[] = [];

    for (const outId of squad) {
        const outPoints = hinrundeScores[outId] ?? 0;
        const outCost = parseInt(players[outId]?.Marktwert || "0");

        for (const [inId, inP] of Object.entries(players)) {
            if (squadSet.has(inId)) continue;
            if (inP.Position !== players[outId].Position) continue;

            const inPoints = rueckrundeScores[inId] ?? 0;
            const inCost = parseInt(inP.Marktwert);

            const gain = inPoints - outPoints;
            const costDelta = inCost - outCost;

            if (gain > 0 && originalBudget - outCost + inCost <= MAX_BUDGET) {
                options.push({ outId, inId, pointGain: gain, budgetDiff: costDelta });
            }
        }
    }

    options.sort((a, b) => b.pointGain - a.pointGain);

    const selected: typeof options = [];
    const usedOut = new Set<string>();
    const usedIn = new Set<string>();
    let currentBudget = originalBudget;

    for (const opt of options) {
        if (usedOut.has(opt.outId) || usedIn.has(opt.inId)) continue;
        const outCost = parseInt(players[opt.outId].Marktwert);
        const inCost = parseInt(players[opt.inId].Marktwert);
        const newBudget = currentBudget - outCost + inCost;
        if (newBudget > MAX_BUDGET) continue;

        selected.push(opt);
        usedOut.add(opt.outId);
        usedIn.add(opt.inId);
        currentBudget = newBudget;

        if (selected.length >= MAX_TRANSFERS) break;
    }

    const newSquad = squad.filter(id => !usedOut.has(id)).concat(selected.map(t => t.inId));
    const newTop11Points = getTop11Points(newSquad, rueckrundeScores);
    const diff = newTop11Points - originalTop11Points;
    const budgetDiff = currentBudget - originalBudget;

    console.log(`\n✅ Beste ${selected.length} Transfers (Top-11 Differenzoptimierung):\n`);
    for (const t of selected) {
        console.log(`⬅️  ${players[t.outId]["Angezeigter Name"]} (${t.outId})`);
        console.log(`➡️  ${players[t.inId]["Angezeigter Name"]} (${t.inId})`);
        console.log(`🔄 Pos: ${players[t.outId].Position}, 📈 Punktdifferenz: +${t.pointGain}, 🪙 Budgetdiff: ${t.budgetDiff}\n`);
    }

    console.log(`📊 Top-11 Punkte Hinrunde: ${originalTop11Points}`);
    console.log(`📊 Top-11 Punkte Rückrunde (nach Transfers): ${newTop11Points}`);
    console.log(`📈 Differenz: +${diff}`);
    console.log(`💰 Budget vorher: ${originalBudget}`);
    console.log(`💰 Budget nachher: ${currentBudget}`);
    console.log(`💸 Transferbilanz: ${budgetDiff >= 0 ? "+" : ""}${budgetDiff}`);
}

findBestTransfersTop11Based();
