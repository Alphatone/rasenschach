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

export type PointsBreakDown = {
    grade: number,
    goals: number,
    assists: number,
    pointsCleanSheet: number,
    pointsGrade: number,
    pointsGoals: number,
    pointsCards: number,
    pointsAssists: number,
    pointsStarter: number,
    pointsMvp: number,
    pointsJoker: number
}

export type MatchDayPlayerScore = { id: string, points: number, status: string, pointsBreakDown: PointsBreakDown }
export type Match = { id: string, homeScore: number, guestScore: number, state: string, players: MatchDayPlayerScore[] }
export type MatchDay = { id: string, phase: string, matches: Match[] }
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
    pointsBreakDown?: PointsBreakDown
    club: string
    cost: string,
    position: string
}

async function fetchCSVPlayerData(): Promise<Record<string, Record<"ID" | "Vorname" | "Nachname" | "Angezeigter Name (kurz)" | "Angezeigter Name" | "Verein" | "Position" | "Marktwert" | "Punkte" | "Notendurchschnitt", string>>> {
    const response = await axios.get(PLAYER_CSV_URL);

    fs.mkdirSync("./data/players", {recursive: true});
    fs.writeFileSync("./data/players/players-se-k00012024.csv", response.data, "utf-8");

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


    // marmoush is not in the current list of players bcs he left the league
    // to be able to map his player id we add it here
    records.push({
        "ID": "pl-k00103878",
        "Vorname": "Omar",
        "Nachname": "Marmoush",
        "Angezeigter Name (kurz)": "Marmoush",
        "Angezeigter Name": "Omar Marmoush",
        "Verein": "Eintracht Frankfurt",
        "Position": "FORWARD",
        "Marktwert": "3500000",
        "Punkte": "236",
        "Notendurchschnitt": "2.38"
    })

    fs.mkdirSync("./data/players", {recursive: true});
    fs.writeFileSync("./data/players/players-se.json", JSON.stringify(records, null, 2), "utf-8");
    return records as unknown as Record<string, Record<"ID" | "Vorname" | "Nachname" | "Angezeigter Name (kurz)" | "Angezeigter Name" | "Verein" | "Position" | "Marktwert" | "Punkte" | "Notendurchschnitt", string>>;
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
                playerMap[id] = record;
            }
        }

        return playerMap;
    } catch(err) {
        console.info("ℹ️ no local CSV found, load remote");
        return await fetchCSVPlayerData();
    }
}


async function loadMatchday(matchdayId: string) {
    const matchDayFilename = 'original-' + matchdayId + '.json'
    const matchDayOutputPath = path.join(LOCAL_MATCHDAY_PATH, matchDayFilename);
    let matchdayData: MatchDay = {id: '', phase: '', matches: []};

    try {
        const data = await fsPromises.readFile(matchDayOutputPath, "utf-8");
        matchdayData = JSON.parse(data)
    } catch(e) {
        matchdayData = await fetchMatchdayData(matchdayId);
        fs.mkdirSync(LOCAL_MATCHDAY_PATH, {recursive: true});
        fs.writeFileSync(matchDayOutputPath, JSON.stringify(matchdayData, null, 2), "utf-8");
        if(!matchdayData) {
            console.log("⛔️ No data for " + matchdayId);
            return matchdayData;
        }
        console.log("✅ Saved " + matchDayOutputPath);
    }


    return matchdayData
}

async function mergeAndSaveMatchday(playerMap: Record<string, Record<"ID" | "Vorname" | "Nachname" | "Angezeigter Name (kurz)" | "Angezeigter Name" | "Verein" | "Position" | "Marktwert" | "Punkte" | "Notendurchschnitt", string>>, matchdayId: string, matchdayData: MatchDay): Promise<void> {

    const matchdayScoreSheets = matchdayData.matches.flatMap((match: Match) => match.players || []);

    const result: (PlayerEntry | null)[] = matchdayScoreSheets.map((playerScoreSheet: MatchDayPlayerScore) => {
        const player = playerMap[playerScoreSheet.id]
        if(player === undefined) {
            // this could be the case for players that left the league or have been unregistered or something like that. maybe the contract ran out etc
/*            if(playerScoreSheet.points > 0) {
                {
                    console.info(`player with id: ${playerScoreSheet.id} and unknown name, scored ${playerScoreSheet.points} points.`)
                }
            }*/
            return null
        }
        const res: PlayerEntry = {
            playerId: playerScoreSheet.id,
            name: player['Angezeigter Name'],
            club: player['Verein'],
            points: playerScoreSheet.points,
            pointsBreakDown: playerScoreSheet.pointsBreakDown,
            kickerGrade: playerScoreSheet.pointsBreakDown.grade,
            cost: player['Marktwert'],
            position: player['Position']
        }
        return res;
    }).filter(p => p!== null);

    const fileName = matchdayId + ".json";
    const outputDir = "./data/combined"
    const outputPath = path.join(outputDir, fileName);

    fs.mkdirSync("./data/combined", {recursive: true});
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
    console.log("✅ Saved " + outputPath);
}

async function runAllMatchdays(): Promise<void> {
    const playerMap = await getPlayersData()
    for(let i = 1; i <= MAX_MATCHDAY; i++) {
        const matchdayId = SEASON_PREFIX + i.toString().padStart(2, "0");
        const matchDayData: MatchDay = await loadMatchday(matchdayId)
        await mergeAndSaveMatchday(playerMap, matchdayId, matchDayData);
        await new Promise((r) => setTimeout(r, 500));
    }
}

const clearJSONFromLastRun = (outputPath: string, outputDir:string) => {
    if(fs.existsSync(outputPath)) {
        let filesFromLastRun: string[]= []
        fs.readdir(outputDir, {encoding: 'utf-8'}, (err: (NodeJS.ErrnoException | null), files: string[]) => {
            if(err) {
                throw err
            } else {
                filesFromLastRun = files
            }
        })
        for(const file of filesFromLastRun) {
            fs.unlink(path.join(outputPath, file), err => {
                throw err
            })
        }
    }

}

runAllMatchdays().catch(console.error);
//console.log(getPlayersData().catch(e => console.error(e)).then(a => console.log(a)))