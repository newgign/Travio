class ApiResponse {

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