const axios = require("axios");
const logger = require('./logger');

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

        logger.info('Outbound request', { method: config.method });

        return config;

    },

    (error) => Promise.reject(error)

);

// Лог ответа
client.interceptors.response.use(

    (response) => {

        logger.info('Outbound response', { statusCode: response.status });

        return response;

    },

    (error) => {

        if (error.response) {

            logger.warn('Outbound request failed', { statusCode: error.response.status });

        } else {

            logger.warn('Outbound request failed', { error });

        }

        return Promise.reject(error);

    }

);

module.exports = client;
