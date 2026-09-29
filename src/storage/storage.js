import { STORAGE_KEYS } from "../utils/constants.js";

export async function getOpportunities() {
    const result = await chrome.storage.local.get(
        STORAGE_KEYS.OPPORTUNITIES
    );

    return result[STORAGE_KEYS.OPPORTUNITIES] || [];
}

export async function saveOpportunities(opportunities) {
    await chrome.storage.local.set({
        [STORAGE_KEYS.OPPORTUNITIES]: opportunities
    });
}

export async function getLastSync() {
    const result = await chrome.storage.local.get(
        STORAGE_KEYS.LAST_SYNC
    );

    return result[STORAGE_KEYS.LAST_SYNC] || null;
}

export async function setLastSync(timestamp) {
    await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_SYNC]: timestamp
    });
}