import { getOpportunities } from "../storage/storage.js";

async function loadDashboard() {
    const opportunities = await getOpportunities();

    const placements = opportunities.filter(
        opportunity => opportunity.type === "PLACEMENT"
    );

    const internships = opportunities.filter(
        opportunity => opportunity.type === "INTERNSHIP"
    );

    document.getElementById("placement-list").textContent =
        `${placements.length} opportunities`;

    document.getElementById("internship-list").textContent =
        `${internships.length} opportunities`;
}

loadDashboard();