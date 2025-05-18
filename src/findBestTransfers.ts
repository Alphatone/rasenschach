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

interface PlayerEntry {
    playerId: string;
    points: number;
}

const PLAYER_DATA_PATH = "./data/players/players-se.json";
const COMBINED_DIR = "./data/combined";
const CURRENT_SQUAD_PATH = "./data/squad/winter-kader.json";
const HINRUNDE_END = 15;
const RUECKRUNDE_START = 16;
const MAX_TRANSFERS = 4;
const MAX_BUDGET = 42000000;

// ---------- Laden ----------
function loadPlayers(): Record<string, PlayerMeta> {
    const data: PlayerMeta[] = JSON.parse(fs.readFileSync(PLAYER_DATA_PATH, "utf-8"));
    return Object.fromEntries(data.map(p => [p.ID, p]));
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

    const scores: Record<string, number> = {};
    for (const file of matchdays) {
        const entries: PlayerEntry[] = JSON.parse(fs.readFileSync(path.join(COMBINED_DIR, file), "utf-8"));
        for (const p of entries) {
            scores[p.playerId] = (scores[p.playerId] ?? 0) + (p.points ?? 0);
        }
    }
    return scores;
}

// ---------- Top Transfers ----------
function findBestTransfers() {
    const players = loadPlayers();
    const squad = loadCurrentSquad();
    const hinrunde = loadMatchdayScores(1, HINRUNDE_END);
    const rueckrunde = loadMatchdayScores(RUECKRUNDE_START, 34);

    const squadSet = new Set(squad);
    const squadCost = squad.reduce((sum, id) => sum + parseInt(players[id]?.Marktwert || "0"), 0);

    // Top 50 Spieler der Rückrunde
    const top50 = Object.entries(rueckrunde)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 50)
        .map(([id]) => id);
    const top50Set = new Set(top50);

    type Transfer = {
        outId: string;
        inId: string;
        gain: number;
        costDelta: number;
        position: Position;
    };

    const options: Transfer[] = [];
    for (const outId of squad) {
        const outPlayer = players[outId];
        if (!outPlayer) continue;
        const outScore = hinrunde[outId] ?? 0;
        const outCost = parseInt(outPlayer.Marktwert);

        for (const [inId, inP] of Object.entries(players)) {
            if (!top50Set.has(inId)) continue;
            if (squadSet.has(inId)) continue;
            if (inP.Position !== outPlayer.Position) continue;

            const inScore = rueckrunde[inId] ?? 0;
            const inCost = parseInt(inP.Marktwert);
            const gain = inScore - outScore;
            const delta = inCost - outCost;

            if (gain > 0) {
                options.push({
                    outId,
                    inId,
                    gain,
                    costDelta: delta,
                    position: inP.Position
                });
            }
        }
    }

    // Suche bestes Transferquartett mit Gesamtbilanz >= 0
    let bestCombo: Transfer[] = [];
    let bestGain = -Infinity;

    for (let i = 0; i < options.length; i++) {
        for (let j = i + 1; j < options.length; j++) {
            for (let k = j + 1; k < options.length; k++) {
                for (let l = k + 1; l < options.length; l++) {
                    const t = [options[i], options[j], options[k], options[l]];

                    const outIds = new Set(t.map(x => x.outId));
                    const inIds = new Set(t.map(x => x.inId));
                    if (outIds.size < 4 || inIds.size < 4) continue;

                    const sumGain = t.reduce((s, x) => s + x.gain, 0);
                    const sumCost = squadCost + t.reduce((s, x) => x.costDelta + s, 0);

                    if (sumCost <= MAX_BUDGET && sumGain > bestGain) {
                        bestCombo = t;
                        bestGain = sumGain;
                    }
                }
            }
        }
    }

    if (bestCombo.length === 0) {
        console.log("❌ Kein gültiger 4er-Transfer gefunden.");
        return;
    }

    console.log(`✅ Beste 4 Transfers (Top11-Differenzoptimierung):\n`);
    for (const t of bestCombo) {
        const out = players[t.outId];
        const _in = players[t.inId];
        console.log(`⬅️  ${out["Angezeigter Name"]} (${t.outId})`);
        console.log(`➡️  ${_in["Angezeigter Name"]} (${t.inId})`);
        console.log(`🔄 Pos: ${t.position}, 📈 Punktdifferenz: +${t.gain}, 🪙 Budgetdiff: ${t.costDelta}\n`);
    }
    console.log(`📊 Transferbilanz: +${bestGain} Punkte`);
}

findBestTransfers();
