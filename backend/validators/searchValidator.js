function validateSearch(req, res, next) {

    const {

        page,

        limit,

        rating,

        stars

    } = req.query;

    if (page && Number(page) < 1) {

        return res.status(400).json({

            success: false,

            message: "page должен быть больше 0"

        });

    }

    if (limit && Number(limit) > 100) {

        return res.status(400).json({

            success: false,

            message: "Максимальный limit = 100"

        });

    }

    if (rating && (Number(rating) < 0 || Number(rating) > 5)) {

        return res.status(400).json({

            success: false,

            message: "rating должен быть от 0 до 5"

        });

    }

    if (stars && (Number(stars) < 1 || Number(stars) > 5)) {

        return res.status(400).json({

            success: false,

            message: "stars должен быть от 1 до 5"

        });

    }

    next();

}

module.exports = validateSearch;