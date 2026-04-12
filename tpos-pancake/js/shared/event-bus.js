// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared Event Bus for TPOS-Pancake
 * Cross-column event communication replacing ad-hoc window.dispatchEvent patterns
 *
 * Events:
 *   tpos:commentSelected   - User selected a comment in TPOS column
 *   tpos:orderCreated      - New order created from comment
 *   tpos:orderUpdated      - Existing order updated
 *   tpos:newComment         - New comment received via realtime
 *   pancake:conversationSelected - User selected a conversation in Pancake
 *   pancake:messageSent     - Message sent in Pancake chat
 *   pancake:newMessage      - New message received via realtime
 *   pancake:savedListUpdated - Saved TPOS list updated
 *   debt:updated            - Debt data loaded/updated for phones
 *   layout:columnSwapped    - Column order changed
 *   layout:settingsChanged  - Settings updated
 */

class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event (fires once then auto-unsubscribes)
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        const wrapper = (data) => {
            this.off(event, wrapper);
            callback(data);
        };
        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) {
                this._listeners.delete(event);
            }
        }
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] Error in handler for "${event}":`, error);
                }
            }
        }
    }

    /**
     * Remove all listeners for an event, or all listeners if no event specified
     * @param {string} [event]
     */
    removeAll(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}

// Export singleton
if (typeof window !== 'undefined') {
    window.EventBus = EventBus;
    window.eventBus = new EventBus();
}
