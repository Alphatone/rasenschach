// import your combined matchday JSON and players.json before using
import * as fs from "fs";
import * as path from "path";
const solver = require("javascript-lp-solver");

interface Player {
    id: string;
    name: string;
    points: number;
    cost: number;
    position: string;
}

const PLAYER_DATA_PATH = "./data/players/players-se.json";
const COMBINED_DIR = "./data/combined";
const CURRENT_SQUAD_PATH = "./data/squad/winter-kader.json";
const SQUAD_SIZE = 22;
const MAX_BUDGET = 42000000;
const MAX_TRANSFERS = 4;
const SECOND_HALF_START = 16;

function loadPlayers(): Record<string, any> {
    return JSON.parse(fs.readFileSync(PLAYER_DATA_PATH, "utf-8"));
}

function loadMatchdays(): Record<string, number> {
    const files = fs.readdirSync(COMBINED_DIR).filter(f => f.endsWith(".json"));
    const secondHalf = files.filter(f => {
        const matchday = parseInt(f.match(/(\d{2})\.json$/)?.[1] || "0", 10);
        return matchday >= SECOND_HALF_START;
    });

    const playerPoints: Record<string, number> = {};

    secondHalf.forEach(file => {
        const data = JSON.parse(fs.readFileSync(path.join(COMBINED_DIR, file), "utf-8"));
        for (const p of data) {
            if (!playerPoints[p.playerId]) {
                playerPoints[p.playerId] = 0;
            }
            playerPoints[p.playerId] += p.points ?? 0;
        }
    });

    return playerPoints;
}

function loadCurrentSquad(): string[] {
    return JSON.parse(fs.readFileSync(CURRENT_SQUAD_PATH, "utf-8"));
}

function calculateSquadPoints(squad: string[], points: Record<string, number>): number {
    return squad.reduce((sum, id) => sum + (points[id] ?? 0), 0);
}

function buildOptimizationModel(players: Record<string, any>, points: Record<string, number>, currentSquad: string[]) {
    const model: any = {
        optimize: "points",
        opType: "max",
        constraints: {
            cost: { max: MAX_BUDGET },
            count: { equal: SQUAD_SIZE },
            transfers: { max: MAX_TRANSFERS },
        },
        variables: {},
        ints: {}
    };

    for (const p of Object.values(players)) {
        const id = p["ID"];
        const cost = parseInt(p["Marktwert"]);
        const pts = points[id] ?? 0;
        const isNew = currentSquad.includes(id) ? 0 : 1;

        model.variables[id] = {
            cost,
            points: pts,
            count: 1,
            transfers: isNew,
            position: 1
        };

        model.ints[id] = 1;
    }

    return model;
}

function findOptimalWinterTransfers() {
    const playerData = loadPlayers();
    const playerPoints = loadMatchdays();
    const currentSquad = loadCurrentSquad();

    const model = buildOptimizationModel(playerData, playerPoints, currentSquad);
    const result = solver.Solve(model);

    const selectedPlayers = Object.entries(result)
        .filter(([k, v]) => playerData[k] && v === 1)
        .map(([id]) => {
            const p = playerData[id];
            return {
                id,
                name: p["Angezeigter Name"],
                club: p["Verein"],
                cost: parseInt(p["Marktwert"]),
                points: playerPoints[id] ?? 0
            };
        });

    const currentPoints = calculateSquadPoints(currentSquad, playerPoints);

    console.log('players:', selectedPlayers);
    console.table(selectedPlayers);
    console.log("Dein Rückrunden-Kader hätte gemacht:", currentPoints, "Punkte");
    console.log("Optimaler Rückrunden-Kader macht:", result.result, "Punkte");
    console.log("Differenz:", result.result - currentPoints);

    const selectedIds = selectedPlayers.map(p => p.id);
    const transferredOut = currentSquad.filter(id => !selectedIds.includes(id));
    const transferredIn = selectedIds.filter(id => !currentSquad.includes(id));

    console.log("\n🔁 Transfers:");
    console.log("⬅️  Raus:");
    transferredOut.forEach(id => {
        const p = playerData[id];
        console.log(`- ${p["Angezeigter Name"]} (${p["Verein"]})`);
    });

    console.log("➡️  Rein:");
    transferredIn.forEach(id => {
        const p = playerData[id];
        console.log(`+ ${p["Angezeigter Name"]} (${p["Verein"]})`);
    });
}

findOptimalWinterTransfers();
