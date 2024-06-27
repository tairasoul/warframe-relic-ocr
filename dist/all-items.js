import tesseract from "tesseract.js";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
import items from "warframe-items";
import crypto from "crypto";
const __dirname = path.dirname(decodeURIComponent(fileURLToPath(import.meta.url)));
function sha256(filePath) {
    return new Promise((resolve, reject) => {
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
const outDir = path.join(__dirname, "..", "output");
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
}
if (fs.existsSync(path.join(outDir, "all-items.txt")))
    fs.rmSync(path.join(outDir, "all-items.txt"));
const hashPath = path.join(__dirname, "..", "hashes.json");
const hashes = JSON.parse(fs.existsSync(hashPath) ? fs.readFileSync(hashPath, 'utf8') : "{}");
const worker = await tesseract.createWorker("eng");
const image_dir = path.join(__dirname, "..", "imgs");
if (!fs.existsSync(image_dir)) {
    fs.mkdirSync(image_dir);
    await worker.terminate();
    console.error("Made imgs folder. Put images of your relic inventory in there. Only include owned relics in the images.");
    process.exit(0);
}
const images = fs.readdirSync(image_dir).map((file) => path.join(image_dir, file));
const itms = new items({ category: ["Relics"] });
const relics_in_inventory = [];
for (const image of images) {
    const hash = await sha256(image);
    if (hashes[image] && hash === hashes[image].hash) {
        const split = hashes[image].text_data.split("\n").filter((v) => v.includes("Relic"));
        for (const line of split) {
            const relics = line.split("Relic ").filter((v) => !v.startsWith("Requiem")).map((v) => v.replace("IT", "I1")).map((v) => v.endsWith("Relic") ? v.replace("Relic", "") : v).map((v) => v.replace(/\[.*\]/g, "")).map((v) => v.trim()).map((v) => v + " Intact");
            relics.forEach((v) => relics_in_inventory.push(v));
        }
    }
    else {
        const rec = await worker.recognize(image);
        hashes[image] = { text_data: rec.data.text, hash };
        const split = rec.data.text.split("\n").filter((v) => v.includes("Relic"));
        for (const line of split) {
            const relics = line.split("Relic ").filter((v) => !v.startsWith("Requiem")).map((v) => v.replace("IT", "I1")).map((v) => v.endsWith("Relic") ? v.replace("Relic", "") : v).map((v) => v.replace(/\[.*\]/g, "")).map((v) => v.trim()).map((v) => v + " Intact");
            relics.forEach((v) => relics_in_inventory.push(v));
        }
    }
}
fs.writeFileSync(hashPath, JSON.stringify(hashes, undefined, 4));
const cache = {};
async function get_buy_orders(item_name) {
    if (cache[item_name]) {
        console.log(`found cached data for ${item_name}, returning cache`);
        return cache[item_name];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`getting data for ${item_name}`);
    const url = `https://api.warframe.market/v1/items/${item_name}/orders`;
    const data = await fetch(url);
    const json = await data.json();
    cache[item_name] = json;
    return json;
}
function getHighestOrder(orders) {
    let highest_plat = { plat: 0 };
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
function getMedian(arr) {
    arr.sort((a, b) => a.platinum - b.platinum);
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 !== 0) {
        return arr[mid].platinum;
    }
    else {
        try {
            return (arr[mid - 1].platinum + arr[mid].platinum) / 2;
        }
        catch {
            return 0;
        }
    }
}
const rewards = [];
async function processRelic(relic) {
    const rlic = itms.find((v) => v.name == relic);
    if (rlic) {
        console.log(`processing ${relic}`);
        for (const reward of rlic.rewards) {
            await processRewards(relic, reward);
        }
    }
}
async function processRewards(relic, reward) {
    const name = reward.item.name;
    if (reward.item.warframeMarket == undefined)
        return;
    for (const rward of rewards) {
        if (rward.id == reward.item.warframeMarket.urlName) {
            console.log(`found item in rewards by same name (${reward.item.warframeMarket.urlName})`);
            rward.relics[relic.replace(" Intact", "")] = reward.chance;
            return;
        }
    }
    const orders = await get_buy_orders(reward.item.warframeMarket.urlName);
    const highest = getHighestOrder(orders.payload.orders);
    const median = getMedian(orders.payload.orders.filter((v) => v.order_type == "buy"));
    rewards.push({
        item_name: name,
        id: reward.item.warframeMarket.urlName,
        median_price: median,
        highest_order: highest,
        relics: { [relic.replace(" Intact", "")]: reward.chance }
    });
}
for (const relic of relics_in_inventory) {
    await processRelic(relic);
}
function parseInfo(iteminfo) {
    let str = "";
    str += iteminfo.item_name;
    str += ":\n";
    if (iteminfo.highest_order) {
        str += "    Highest order ingame: ";
        str += `${iteminfo.highest_order?.platinum} plat by user ${iteminfo.highest_order?.user.ingame_name} (${iteminfo.highest_order?.user.reputation} rep)`;
        str += "\n";
    }
    str += "    ";
    if (iteminfo.median_price != 0)
        str += `Median price: ${iteminfo.median_price}`;
    else
        str += `Could not calculate median price.`;
    str += "\n";
    str += "    ";
    str += "Relics containing this item:";
    str += "\n";
    str += "        ";
    str += parseRelicInfo(iteminfo.relics).join("\n        ");
    str.trim();
    return str;
}
function parseRelicInfo(info) {
    const keys = Object.keys(info);
    const out = [];
    for (const relic of keys) {
        out.push(`${relic} at ${info[relic]}% chance`);
    }
    return out;
}
let output = "";
for (const reward of rewards.sort((a, b) => b.median_price - a.median_price)) {
    output += parseInfo(reward);
    output += "\n\n";
}
fs.writeFileSync(path.join(outDir, "all-items.txt"), output);
await worker.terminate();
