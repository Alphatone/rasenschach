// Required dependencies:
// npm install axios csv-parse fs path

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

const PLAYER_CSV_URL =
    "https://www.kicker-libero.de/api/sportsdata/v1/players-details/se-k00012024.csv";
const MATCHDAY_BASE_URL =
    "https://www.kicker-libero.de/api/gameloop/v1/state/round/";

// Example matchday ID for matchday 27
const matchdayId = "rn-k000120240027";
const matchdayFileName = `${matchdayId}.json`;

async function fetchCSVPlayerData(): Promise<Record<string, string>> {
    const response = await axios.get(PLAYER_CSV_URL);
    const records = parse(response.data, {
        columns: true,
        skip_empty_lines: true,
    });

    const playerMap: Record<string, string> = {};
    for (const record of records) {
        playerMap[record.id] = record.displayName;
    }
    return playerMap;
}

async function fetchMatchdayData(id: string) {
    const url = `${MATCHDAY_BASE_URL}${id}.json`;
    const response = await axios.get(url);
    return response.data;
}

async function mergeDataAndSave() {
    const [playerMap, matchdayData] = await Promise.all([
        fetchCSVPlayerData(),
        fetchMatchdayData(matchdayId),
    ]);

    const playerStates = matchdayData.playerStates || [];

    const result = playerStates.map((entry: any) => ({
        playerId: entry.playerId,
        name: playerMap[entry.playerId] || "Unknown",
        points: entry.score,
        kickerGrade: entry.kickerGrade,
        teamId: entry.teamId,
    }));

    const outputPath = path.join("./data", matchdayFileName);
    fs.mkdirSync("./data", { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

    console.log(`✅ Saved matchday data to ./data/${matchdayFileName}`);
}

mergeDataAndSave().catch(console.error);
