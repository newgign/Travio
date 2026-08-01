const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.send("Привет! Наш сервер поиска туров работает!");
});

app.listen(3000, () => {
    console.log("Сервер запущен: http://localhost:3000");
});