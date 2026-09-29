const PREFIX = "[KGP Fill The Form]";

function log(...args) {
    console.log(PREFIX, ...args);
}

let noticeTableFound = false;

function findNoticeTable() {
    if (noticeTableFound) {
        return;
    }

    const bodyText = document.body?.innerText || "";

    if (!bodyText.includes("CDC Notice")) {
        return;
    }

    log("🎯 CDC Notice detected!");

    const tables = document.querySelectorAll("table");

    for (const table of tables) {
        const text = table.innerText || "";

        if (
            text.includes("Type") &&
            text.includes("Company") &&
            text.includes("Notice")
        ) {
            noticeTableFound = true;

            log("🎯🎯 CDC Notice table found!");
            log("Rows:", table.rows.length);
            log(table);

            return;
        }
    }
}

log("Content script loaded.");
log("Current frame:", window.location.href);

findNoticeTable();

const observer = new MutationObserver(() => {
    findNoticeTable();
});

observer.observe(document.documentElement, {
    childList: true,
    subtree: true
});