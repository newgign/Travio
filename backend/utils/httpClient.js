const axios = require("axios");

const client = axios.create({

    timeout: 10000,

    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

});

// Лог запроса
client.interceptors.request.use(

    (config) => {

        console.log(
            `➡ ${config.method.toUpperCase()} ${config.url}`
        );

        return config;

    },

    (error) => Promise.reject(error)

);

// Лог ответа
client.interceptors.response.use(

    (response) => {

        console.log(
            `✅ ${response.status} ${response.config.url}`
        );

        return response;

    },

    (error) => {

        if (error.response) {

            console.error(
                `❌ ${error.response.status} ${error.config?.url}`
            );

        } else {

            console.error(
                `❌ ${error.message}`
            );

        }

        return Promise.reject(error);

    }

);

module.exports = client;