class ApiResponse {

    static publicMessage(error, fallback) {
        const internal = !error.status || Number(error.status) >= 500;
        return process.env.NODE_ENV === 'production' && internal ? fallback : error.message || fallback;
    }

    static publicCode(error) {
        if (process.env.NODE_ENV === 'production' && (!error.status || Number(error.status) === 500)) return 'INTERNAL_ERROR';
        return error.code || undefined;
    }

    static success(data = null, meta = {}) {

        return {
            success: true,
            data,
            meta
        };

    }

    static error(message, errors = [], code = null) {

        return {
            success: false,
            message,
            code,
            errors
        };

    }

}

module.exports = ApiResponse;
