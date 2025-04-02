import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse';

const PLAYER_CSV_URL =
    "https://www.kicker-libero.de/api/sportsdata/v1/players-details/se-k00012024.csv";
const MATCHDAY_BASE_URL =
    "https://www.kicker-libero.de/api/gameloop/v1/state/round/";
const SEASON_PREFIX = "rn-k0001202400";
const MAX_MATCHDAY = 34;

async function fetchCSVPlayerData(): Promise<Record<string, string>> {
    const response = await axios.get(PLAYER_CSV_URL);

    const records: any[] = await new Promise<any[]>((resolve, reject) => {
        parse(response.data, {
            columns: true,
            skip_empty_lines: true,
        }, (err, output) => {
            if (err) {
                reject(err)
            }
            else {
                resolve(output)
            };
        });
    });

    const playerMap: Record<string, string> = {};
    for (const record of records) {
        playerMap[record.id] = record.displayName;
    }
    return playerMap;
}

async function fetchMatchdayData(id: string): Promise<any | null> {
    const url = MATCHDAY_BASE_URL + id + ".json";
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (err: any) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

interface PlayerEntry {
    playerId: string;
    name: string;
    points: number;
    kickerGrade: number;
    teamId: string;
    pointsBreakDown: {
        grade: null,
        goals: null,
        assists: null,
        pointsGrade: null,
        pointsGoals: null,
        pointsCards: null,
        pointsAssists: null,
        pointsStarter: null,
        pointsMvp: null,
        pointsJoker: null,
        pointsCleanSheet: null

    }
}

async function mergeAndSaveMatchday(playerMap: Record<string, string>, matchdayId: string): Promise<void> {
    const matchdayData = await fetchMatchdayData(matchdayId);
    if (!matchdayData) {
        console.log("⛔️ No data for " + matchdayId);
        return;
    }

    const playerStates = matchdayData.matches.flatMap((match: any) => match.players || []);

    const result: PlayerEntry[] = playerStates.map((entry: any) => {
        return {
            playerId: entry.id,
            name: playerMap[entry.playerId] || "Unknown",
            points: entry.score,
            kickerGrade: entry.kickerGrade,
            teamId: entry.teamId,
            pointsBreakDown: entry.pointsBreakDown
        }
    });

    const fileName = matchdayId + ".json";
    const outputPath = path.join("./data", fileName);
    fs.mkdirSync("./data", { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
    console.log("✅ Saved " + fileName);
}

async function runAllMatchdays(): Promise<void> {
    const playerMap = await fetchCSVPlayerData();
    console.log("CSV enthält IDs wie:", Object.keys(playerMap).slice(0, 10));

    const matchdayId = SEASON_PREFIX + '1'.padStart(2, "0");
    await mergeAndSaveMatchday(playerMap, matchdayId);
    await new Promise((r) => setTimeout(r, 500)); // small delay between requests

    // for (let i = 1; i <= MAX_MATCHDAY; i++) {
    //     const matchdayId = SEASON_PREFIX + i.toString().padStart(2, "0");
    //     await mergeAndSaveMatchday(playerMap, matchdayId);
    //     await new Promise((r) => setTimeout(r, 500)); // small delay between requests
    // }
}

runAllMatchdays().catch(console.error);

