const dashboardButton =
    document.getElementById("dashboardButton");

dashboardButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});