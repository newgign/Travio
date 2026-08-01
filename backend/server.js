const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());
console.log("НОВАЯ ВЕРСИЯ SERVER.JS");

app.get("/", (req, res) => {
    res.send("Привет! Наш сервер поиска туров работает!");
});

app.get("/countries", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM countries ORDER BY id");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
app.get("/cities", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM cities");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
app.get("/hotels", async (req, res) => {
    try {
        const city = req.query.city;

        let result;

        if (city) {
            result = await pool.query(
                "SELECT * FROM hotels WHERE city_id = $1 ORDER BY id",
                [city]
            );
        } else {
            result = await pool.query(
                "SELECT * FROM hotels ORDER BY id"
            );
        }

        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
app.listen(3000, () => {
    console.log("Сервер запущен: http://localhost:3000");
});