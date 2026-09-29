import { logger } from "../utils/logger.js";

logger.info("Background service worker started.");

chrome.runtime.onInstalled.addListener(() => {
    logger.info("Extension installed.");
});