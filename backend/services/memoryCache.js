class MemoryCache {

    constructor() {
        this.cache = new Map();
    }

    /**
     * Получить значение из кэша
     */
    get(key) {

        const item = this.cache.get(key);

        if (!item) {
            return null;
        }

        // Проверяем срок жизни
        if (item.expiresAt && item.expiresAt < Date.now()) {

            this.cache.delete(key);

            return null;

        }

        return item.value;

    }

    /**
     * Сохранить значение
     */
    set(key, value, ttl = 300000) {

        this.cache.set(key, {

            value,

            expiresAt: Date.now() + ttl

        });

    }

    /**
     * Есть ли ключ
     */
    has(key) {

        return this.get(key) !== null;

    }

    /**
     * Удалить ключ
     */
    delete(key) {

        this.cache.delete(key);

    }

    /**
     * Очистить весь кэш
     */
    clear() {

        this.cache.clear();

    }

    /**
     * Размер кэша
     */
    size() {

        return this.cache.size;

    }

    /**
     * Получить статистику
     */
    stats() {

        return {

            items: this.cache.size

        };

    }

}

module.exports = new MemoryCache();