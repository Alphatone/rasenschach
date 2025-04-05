import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse';
import { promises as fsPromises } from "fs";


const PLAYER_CSV_URL = "https://www.kicker-libero.de/api/sportsdata/v1/players-details/se-k00012024.csv";
const MATCHDAY_BASE_URL = "https://www.kicker-libero.de/api/gameloop/v1/state/round/";
const SEASON_PREFIX = "rn-k0001202400";
const MAX_MATCHDAY = 34;
const LOCAL_MATCHDAY_PATH = './data/matchdays'
const LOCAL_PLAYERS_PATH = './data/players/players-se-k00012024.csv'

export interface OriginalPlayerEntry {
    id: string
    points: number
    status: string
    pointsBreakDown: {
        grade: number | null
        goals: number | null
        assists: number | null
        pointsGrade: number | null
        pointsGoals: number | null
        pointsCards: number | null
        pointsAssists: number | null
        pointsStarter: number | null
        pointsMvp: number | null
        pointsJoker: number | null
        pointsCleanSheet: number | null
    },
    missedInfo: string | null
}

export type PlayerEntryKey = "ID" |
    "Vorname" |
    "Nachname" |
    "Angezeigter Name (kurz)" |
    "Angezeigter Name" |
    "Verein" |
    "Position" |
    "Marktwert" |
    "Punkte" |
    "Notendurchschnitt"

export interface PlayerEntry {
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
    };
}

async function fetchCSVPlayerData(): Promise<Record<string, Record<"ID" | "Vorname" | "Nachname" | "Angezeigter Name (kurz)" | "Angezeigter Name" | "Verein" | "Position" | "Marktwert" | "Punkte" | "Notendurchschnitt", string>>> {
    const response = await axios.get(PLAYER_CSV_URL);

    const records: any[] = await new Promise<any[]>((resolve, reject) => {
        parse(response.data, {
            delimiter: ";",
            columns: true,
            skip_empty_lines: true,
        }, (err, output) => {
            if(err) {
                reject(err);
            } else {
                resolve(output);
            }
        });
    });

    const playerMap: Record<string, Record<PlayerEntryKey, string>> = {};

    for(const record of records) {
        const id = record["ID"];
        const name = record["Angezeigter Name"];
        if(id && name) {
            playerMap[id] = name;
        }
    }
    fs.mkdirSync("./data/players", {recursive: true});
    fs.writeFileSync("./data/players/players-se.json", JSON.stringify(records, null, 2), "utf-8");
    return playerMap as Record<string, Record<PlayerEntryKey, string>>;
}

async function fetchMatchdayData(id: string): Promise<any | null> {
    const url = MATCHDAY_BASE_URL + id + ".json";
    try {
        const response = await axios.get(url);
        return response.data;
    } catch(err: any) {
        if(err.response?.status === 404) {
            return null;
        }
        throw err;
    }
}

async function getPlayersData() {
    try {
        const data = await fsPromises.readFile(LOCAL_PLAYERS_PATH, "utf-8");

        const records: any[] = await new Promise<any[]>((resolve, reject) => {
            parse(data, {
                delimiter: ";",
                columns: true,
                skip_empty_lines: true,
            }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });

        const playerMap: Record<string, Record<PlayerEntryKey, string>> = {};
        for (const record of records) {
            const id = record["ID"];
            const name = record["Angezeigter Name"];
            if (id && name) {
                playerMap[id] = record;
            }
        }

        return playerMap;
    } catch (err) {
        console.info("ℹ️ no local CSV found, load remote");
        return await fetchCSVPlayerData();
    }
}

async function saveMatchday(matchdayId: string) {
    const matchdayData = await fetchMatchdayData(matchdayId);
    const matchDayFilename = 'original-' + matchdayId + '.json'
    const matchDayOutputPath = path.join(LOCAL_MATCHDAY_PATH, matchDayFilename);
    fs.mkdirSync(LOCAL_MATCHDAY_PATH, {recursive: true});
    fs.writeFileSync(matchDayOutputPath, JSON.stringify(matchdayData, null, 2), "utf-8");
    if(!matchdayData) {
        console.log("⛔️ No data for " + matchdayId);
        return;
    }

    console.log("✅ Saved " + matchDayFilename);
}

async function mergeAndSaveMatchday(playerMap: Record<string, Record<"ID" | "Vorname" | "Nachname" | "Angezeigter Name (kurz)" | "Angezeigter Name" | "Verein" | "Position" | "Marktwert" | "Punkte" | "Notendurchschnitt", string>>, matchdayId: string, matchdayData: any): Promise<void> {

    const playerStates = matchdayData.matches.flatMap((match: any) => match.players || []);

    const result: PlayerEntry[] = playerStates.map((entry: any) => {
        return {
            playerId: entry.id,
            name: playerMap[entry.id] || entry.name?.display || "Unknown",
            points: entry.points,
            teamId: entry.teamId,
            pointsBreakDown: entry.pointsBreakDown,
        };
    });

    const fileName = matchdayId + ".json";
    const outputPath = path.join("./data/combined", fileName);
    fs.mkdirSync("./data/combined", {recursive: true});
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
    console.log("✅ Saved " + fileName);
}

async function runAllMatchdays(): Promise<void> {
    const playerMap = await getPlayersData()
    console.log(playerMap)
    for(let i = 1; i <= MAX_MATCHDAY; i++) {
        const matchdayId = SEASON_PREFIX + i.toString().padStart(2, "0");
        const matchDayData = await saveMatchday(matchdayId)
        await mergeAndSaveMatchday(playerMap, matchdayId, matchDayData);
        await new Promise((r) => setTimeout(r, 500));
    }
}

// runAllMatchdays().catch(console.error);
console.log( getPlayersData().catch(e => console.error(e)).then(a => console.log(a)))