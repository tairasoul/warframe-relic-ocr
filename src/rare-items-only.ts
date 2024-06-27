import tesseract from "tesseract.js";
import fs from "fs"
import path from 'path';
import { fileURLToPath } from 'url';
import items from "warframe-items";
import crypto from "crypto";
const __dirname = path.dirname(decodeURIComponent(fileURLToPath(import.meta.url)));

function sha256(filePath: string) {
    return new Promise<string>((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (chunk) => {
            hash.update(chunk);
        });

        stream.on('end', () => {
            const result = hash.digest('hex');
            resolve(result);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}

type hashes = {
    [image: string]: {
        text_data: string;
        hash: string;
    };
}

const outDir = path.join(__dirname, "..", "output");

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}

if (fs.existsSync(path.join(outDir, "rare-items-only.txt")))
    fs.rmSync(path.join(outDir, "rare-items-only.txt"));

const hashPath = path.join(__dirname, "..", "hashes.json")

const hashes: hashes = JSON.parse(fs.existsSync(hashPath) ? fs.readFileSync(hashPath, 'utf8') : "{}");

const worker = await tesseract.createWorker("eng");

const image_dir = path.join(__dirname, "..", "imgs");

if (!fs.existsSync(image_dir)) {
    fs.mkdirSync(image_dir);
    await worker.terminate();
    console.error("Made imgs folder. Put images of your relic inventory in there. Only include owned relics in the images.");
    process.exit(0);
}

const images = fs.readdirSync(image_dir).map((file) => path.join(image_dir, file));

const itms = new items({category: ["Relics"]});

const relics_in_inventory: string[] = [];

for (const image of images) {
    const hash = await sha256(image);
    if (hashes[image] && hash === hashes[image].hash) {
        const split = hashes[image].text_data.split("\n").filter((v) => v.includes("Relic"));
        for (const line of split) {
            const relics = line.split("Relic ").filter((v) => !v.startsWith("Requiem")).map((v) => v.replace("IT", "I1").replace("|", "I")).map((v) => v.endsWith("Relic") ? v.replace("Relic", "") : v).map((v) => v.replace(/\[.*\]/g, "")).map((v) => v.trim()).map((v) => v + " Intact");
            relics.forEach((v) => relics_in_inventory.push(v));
        }
    }
    else {
        const rec = await worker.recognize(image);
        hashes[image] = { text_data: rec.data.text, hash };
        const split = rec.data.text.split("\n").filter((v) => v.includes("Relic"));
        for (const line of split) {
            const relics = line.split("Relic ").filter((v) => !v.startsWith("Requiem")).map((v) => v.replace("IT", "I1").replace("|", "I")).map((v) => v.endsWith("Relic") ? v.replace("Relic", "") : v).map((v) => v.replace(/\[.*\]/g, "")).map((v) => v.trim()).map((v) => v + " Intact");
            relics.forEach((v) => relics_in_inventory.push(v));
        }
    }
}

fs.writeFileSync(hashPath, JSON.stringify(hashes, undefined, 4));

type itm = {
    rewards: reward[];
}

type reward = {
    rarity: "Rare" | "Uncommon";
    chance: number;
    item: {
        name: string;
        uniqueName: string;
        warframeMarket?: {
            id: string;
            urlName: string;
        }
    }
}

type order = {
    id: string;
    platinum: number;
    quantity: number;
    order_type: "sell" | "buy";
    creation_date: string;
    last_update: string;
    subtype: string;
    visible: boolean;
    user: {
        ingame_name: string;
        status: string;
        reputation: number;
        last_seen: string;
    }
}

type api_response = {
    payload: {
        orders: order[]; 
    }
}

const cache: { [item_name: string]: api_response} = {};

async function get_buy_orders(item_name: string) {
    if (cache[item_name]) {
        console.log(`found cached data for ${item_name}, returning cache`);
        return cache[item_name];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`getting data for ${item_name}`);
    const url = `https://api.warframe.market/v1/items/${item_name}/orders`;
    const data = await fetch(url);
    const json = await data.json() as api_response;
    cache[item_name] = json;
    return json;
}

type info = {info_string: string, average: number}

const info_strings: info[] = [];

function getHighestOrder(orders: order[]) {
    let highest_plat: {order?: order, plat: number} = {plat: 0}
    for (const order of orders) {
        if (order.order_type != "buy")
            continue;
        if (order.user.status != "ingame")
            continue;
        if (highest_plat.order) {
            if (order.platinum > highest_plat.order.platinum) {
                highest_plat.order = order;
            }
        }
        else {
            highest_plat.order = order;
        }
    }
    return highest_plat.order;
}

function getMedian(arr: order[]) {
    arr.sort((a, b) => a.platinum - b.platinum);

    const mid = Math.floor(arr.length / 2);

    if (arr.length % 2 !== 0) {
        return arr[mid].platinum;
    } else {
        try {
            return (arr[mid - 1].platinum + arr[mid].platinum) / 2;
        }
        catch {
            return 0
        }
    }
}

function getLowestOrder(orders: order[]) {
    let highest_plat: {order?: order, plat: number} = {plat: 0}
    for (const order of orders) {
        if (order.order_type != "buy")
            continue;
        if (order.user.status != "ingame")
            continue;
        if (highest_plat.order) {
            if (order.platinum < highest_plat.order.platinum) {
                highest_plat.order = order;
            }
        }
        else {
            highest_plat.order = order;
        }
    }
    return highest_plat.order;
}

for (const relic of relics_in_inventory) {
    for (const item of itms) {
        if (item.name === relic) {
            console.log(`starting work on relic ${relic}`);
            const p_item = item as itm;
            let info_string = item.name;
            let average = 0;
            info_string += "\n";
            for (const reward of p_item.rewards) {
                if (reward.rarity != "Rare")
                    continue;
                if (!reward.item.warframeMarket)
                    continue;    
                info_string += reward.item.name;
                info_string += "\n";
                info_string += "warframe-market data\n";
                const buy_orders = await get_buy_orders(reward.item.warframeMarket.urlName);
                const highest = getHighestOrder(buy_orders.payload.orders);
                const lowest = getLowestOrder(buy_orders.payload.orders);
                if (!highest || !lowest) {
                    info_string += "No ingame players with WTB orders for this item.\n";
                }
                else {
                    info_string += "Highest price: (ingame)\n";
                    info_string += `${highest?.platinum} by ${highest?.user.ingame_name} with rep ${highest?.user.reputation}\n`;
                    info_string += "Lowest price: (ingame):\n";
                    info_string +=`${lowest?.platinum} by ${lowest?.user.ingame_name} with rep ${lowest?.user.reputation}\n`;
                    average = getMedian(buy_orders.payload.orders.filter((v) => v .order_type == "buy"));
                }
            }
            info_strings.push({info_string, average});
        }
    }
}

const filtered = info_strings.sort((a, b) => b.average - a.average);

fs.writeFileSync(path.join(outDir, "rare-items-only.txt"), filtered.map((v) => v.info_string + (v.average != 0 ? `Median: ${v.average}\n` : "")).join("\n"));

await worker.terminate();

process.exit(0);