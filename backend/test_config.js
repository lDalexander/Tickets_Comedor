
const API_URL = 'http://localhost:5001/api/config';
const SECRET = 'admin123';

async function test() {
    try {
        console.log("1. GET Config...");
        const res1 = await fetch(API_URL);
        const data1 = await res1.json();
        console.log("Current Config:", data1);

        console.log("\n2. POST Update (Authorized)...");
        const updatePayload = {
            horario_inicio: '10:00',
            horario_fin: '15:00',
            horario_activo: 'false'
        };
        const resUp = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-secret': SECRET
            },
            body: JSON.stringify(updatePayload)
        });
        console.log("Update Status:", resUp.status);

        console.log("\n3. GET Config (Verify Update)...");
        const res2 = await fetch(API_URL);
        const data2 = await res2.json();
        console.log("New Config:", data2);

        if (data2.horario_inicio === '10:00' && data2.horario_activo === 'false') {
            console.log("\n✅ TEST PASSED");
        } else {
            console.error("\n❌ TEST FAILED: Values mismatch");
        }

        // Restore defaults
        console.log("\n4. Restoring Defaults...");
        await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-secret': SECRET
            },
            body: JSON.stringify({
                horario_inicio: '11:45',
                horario_fin: '14:00',
                horario_activo: 'true'
            })
        });
        console.log("Defaults Restored.");

    } catch (error) {
        console.error("Test Error:", error);
    }
}

test();
