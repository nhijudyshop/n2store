// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// IN-MEMORY EVENT STORE — fixed-size ring buffer of recent Pancake WS events.
// Side-effect-free on require: createEventStore() builds an isolated store; the
// entry owns the single instance.
// =====================================================

function createEventStore(maxEvents) {
    const events = [];
    let eventIdCounter = 0;

    function storeEvent(type, payload, accountName) {
        const event = {
            id: ++eventIdCounter,
            type,
            account: accountName,
            timestamp: new Date().toISOString(),
            payload,
        };

        events.push(event);

        while (events.length > maxEvents) {
            events.shift();
        }

        return event;
    }

    return {
        storeEvent,
        // Read-only access to the underlying array (routes filter/slice it).
        get events() {
            return events;
        },
        get size() {
            return events.length;
        },
    };
}

module.exports = { createEventStore };
