/* =====================================================
   INBOX DATA - Mock data & Firebase data management
   ===================================================== */

// Default group labels for categorizing conversations
const DEFAULT_GROUPS = [
    { id: 'new', name: 'Inbox Mới', color: '#3b82f6', count: 0, note: 'Các tin nhắn mới từ khách hàng chưa được xử lý, cần phản hồi sớm.' },
    { id: 'processing', name: 'Đang Xử Lý', color: '#f59e0b', count: 0, note: 'Các cuộc hội thoại đang được nhân viên xử lý, chưa hoàn tất.' },
    { id: 'waiting', name: 'Chờ Phản Hồi', color: '#f97316', count: 0, note: 'Đã trả lời khách, đang chờ khách phản hồi lại.' },
    { id: 'ordered', name: 'Đã Đặt Hàng', color: '#10b981', count: 0, note: 'Khách đã chốt đơn và đặt hàng thành công.' },
    { id: 'urgent', name: 'Cần Gấp', color: '#ef4444', count: 0, note: 'Các trường hợp cần xử lý gấp: khiếu nại, đổi trả, lỗi đơn hàng.' },
    { id: 'done', name: 'Hoàn Tất', color: '#6b7280', count: 0, note: 'Cuộc hội thoại đã xử lý xong, không cần theo dõi thêm.' },
];

// Sample conversations for demo
const SAMPLE_CONVERSATIONS = [
    {
        id: 'conv1',
        name: 'Nguyễn Thị Mai',
        avatar: null,
        lastMessage: 'Chị ơi, em muốn hỏi mẫu áo sơ mi trắng còn size M không ạ?',
        time: new Date(Date.now() - 1000 * 60 * 2),
        unread: 2,
        label: 'new',
        online: true,
        phone: '0901234567',
        messages: [
            { id: 'm1', text: 'Chào shop ạ!', time: new Date(Date.now() - 1000 * 60 * 30), sender: 'customer' },
            { id: 'm2', text: 'Dạ chào chị, shop có thể giúp gì cho chị ạ?', time: new Date(Date.now() - 1000 * 60 * 28), sender: 'shop' },
            { id: 'm3', text: 'Em muốn hỏi mẫu áo sơ mi trắng ở post hôm qua', time: new Date(Date.now() - 1000 * 60 * 25), sender: 'customer' },
            { id: 'm4', text: 'Còn size M không ạ?', time: new Date(Date.now() - 1000 * 60 * 24), sender: 'customer' },
            { id: 'm5', text: 'Chị ơi, em muốn hỏi mẫu áo sơ mi trắng còn size M không ạ?', time: new Date(Date.now() - 1000 * 60 * 2), sender: 'customer' },
        ]
    },
    {
        id: 'conv2',
        name: 'Trần Văn Hùng',
        avatar: null,
        lastMessage: 'OK, anh chuyển khoản ngay nhé!',
        time: new Date(Date.now() - 1000 * 60 * 15),
        unread: 0,
        label: 'ordered',
        online: false,
        phone: '0912345678',
        messages: [
            { id: 'm1', text: 'Shop ơi, cho anh đặt 2 cái quần jean size 32 nha', time: new Date(Date.now() - 1000 * 60 * 60), sender: 'customer' },
            { id: 'm2', text: 'Dạ anh ơi, quần jean size 32 hiện còn 3 cái. Giá 350k/cái ạ', time: new Date(Date.now() - 1000 * 60 * 55), sender: 'shop' },
            { id: 'm3', text: 'Anh lấy 2 cái, ship về Q7 bao nhiêu?', time: new Date(Date.now() - 1000 * 60 * 50), sender: 'customer' },
            { id: 'm4', text: 'Dạ ship Q7 là 25k ạ. Tổng 2 quần + ship = 725k ạ', time: new Date(Date.now() - 1000 * 60 * 45), sender: 'shop' },
            { id: 'm5', text: 'OK, anh chuyển khoản ngay nhé!', time: new Date(Date.now() - 1000 * 60 * 15), sender: 'customer' },
        ]
    },
    {
        id: 'conv3',
        name: 'Lê Thị Hương',
        avatar: null,
        lastMessage: 'Hàng bao giờ về shop?',
        time: new Date(Date.now() - 1000 * 60 * 45),
        unread: 1,
        label: 'waiting',
        online: true,
        phone: '0923456789',
        messages: [
            { id: 'm1', text: 'Cho em hỏi mẫu váy hoa nhí có size S không ạ?', time: new Date(Date.now() - 1000 * 60 * 120), sender: 'customer' },
            { id: 'm2', text: 'Dạ chị ơi, mẫu đó hiện tại hết size S rồi ạ. Shop đang đặt thêm', time: new Date(Date.now() - 1000 * 60 * 100), sender: 'shop' },
            { id: 'm3', text: 'Hàng bao giờ về shop?', time: new Date(Date.now() - 1000 * 60 * 45), sender: 'customer' },
        ]
    },
    {
        id: 'conv4',
        name: 'Phạm Minh Tuấn',
        avatar: null,
        lastMessage: 'Giao nhanh giúp em nhé, em cần gấp',
        time: new Date(Date.now() - 1000 * 60 * 60),
        unread: 3,
        label: 'urgent',
        online: false,
        phone: '0934567890',
        messages: [
            { id: 'm1', text: 'Shop ơi em cần gấp 1 bộ vest nam size L', time: new Date(Date.now() - 1000 * 60 * 90), sender: 'customer' },
            { id: 'm2', text: 'Dạ anh ơi, shop có vest slim fit size L giá 1.2tr ạ', time: new Date(Date.now() - 1000 * 60 * 85), sender: 'shop' },
            { id: 'm3', text: 'OK lấy luôn, gửi về Bình Thạnh', time: new Date(Date.now() - 1000 * 60 * 80), sender: 'customer' },
            { id: 'm4', text: 'Anh cho em SĐT và địa chỉ cụ thể nhé', time: new Date(Date.now() - 1000 * 60 * 75), sender: 'shop' },
            { id: 'm5', text: 'Phạm Minh Tuấn - 0934567890 - 123 Điện Biên Phủ, P.15, Q.Bình Thạnh', time: new Date(Date.now() - 1000 * 60 * 70), sender: 'customer' },
            { id: 'm6', text: 'Giao nhanh giúp em nhé, em cần gấp', time: new Date(Date.now() - 1000 * 60 * 60), sender: 'customer' },
        ]
    },
    {
        id: 'conv5',
        name: 'Đỗ Thị Lan',
        avatar: null,
        lastMessage: 'Dạ shop gửi hàng rồi ạ, chị kiểm tra giúp shop nhé',
        time: new Date(Date.now() - 1000 * 60 * 120),
        unread: 0,
        label: 'done',
        online: false,
        phone: '0945678901',
        messages: [
            { id: 'm1', text: 'Shop ơi cho chị đổi size áo từ M sang L được không?', time: new Date(Date.now() - 1000 * 60 * 200), sender: 'customer' },
            { id: 'm2', text: 'Dạ được ạ, chị gửi lại hàng cho shop nhé', time: new Date(Date.now() - 1000 * 60 * 190), sender: 'shop' },
            { id: 'm3', text: 'OK chị gửi rồi nè', time: new Date(Date.now() - 1000 * 60 * 150), sender: 'customer' },
            { id: 'm4', text: 'Dạ shop nhận được rồi ạ, shop gửi lại size L cho chị ngay', time: new Date(Date.now() - 1000 * 60 * 140), sender: 'shop' },
            { id: 'm5', text: 'Dạ shop gửi hàng rồi ạ, chị kiểm tra giúp shop nhé', time: new Date(Date.now() - 1000 * 60 * 120), sender: 'shop' },
        ]
    },
    {
        id: 'conv6',
        name: 'Vũ Hoàng Nam',
        avatar: null,
        lastMessage: 'Em gửi hình sản phẩm qua inbox được không?',
        time: new Date(Date.now() - 1000 * 60 * 180),
        unread: 1,
        label: 'processing',
        online: true,
        phone: '0956789012',
        messages: [
            { id: 'm1', text: 'Chào shop!', time: new Date(Date.now() - 1000 * 60 * 200), sender: 'customer' },
            { id: 'm2', text: 'Dạ chào anh, shop có thể giúp gì ạ?', time: new Date(Date.now() - 1000 * 60 * 195), sender: 'shop' },
            { id: 'm3', text: 'Em gửi hình sản phẩm qua inbox được không?', time: new Date(Date.now() - 1000 * 60 * 180), sender: 'customer' },
        ]
    },
    {
        id: 'conv7',
        name: 'Bùi Thị Thanh',
        avatar: null,
        lastMessage: 'Cho em xin bảng giá sỉ áo thun trơn',
        time: new Date(Date.now() - 1000 * 60 * 300),
        unread: 1,
        label: 'new',
        online: false,
        phone: '0967890123',
        messages: [
            { id: 'm1', text: 'Cho em xin bảng giá sỉ áo thun trơn', time: new Date(Date.now() - 1000 * 60 * 300), sender: 'customer' },
        ]
    },
    {
        id: 'conv8',
        name: 'Hoàng Đức Thịnh',
        avatar: null,
        lastMessage: 'Anh muốn đổi trả hàng, hàng bị lỗi chỉ',
        time: new Date(Date.now() - 1000 * 60 * 400),
        unread: 2,
        label: 'urgent',
        online: false,
        phone: '0978901234',
        messages: [
            { id: 'm1', text: 'Shop ơi, anh muốn đổi trả hàng', time: new Date(Date.now() - 1000 * 60 * 450), sender: 'customer' },
            { id: 'm2', text: 'Dạ anh ơi, vấn đề gì ạ?', time: new Date(Date.now() - 1000 * 60 * 440), sender: 'shop' },
            { id: 'm3', text: 'Anh muốn đổi trả hàng, hàng bị lỗi chỉ', time: new Date(Date.now() - 1000 * 60 * 400), sender: 'customer' },
        ]
    },
];

/**
 * InboxDataManager - Manages conversation & group data
 */
class InboxDataManager {
    constructor() {
        this.conversations = [];
        this.groups = [];
    }

    init() {
        this.loadGroups();
        this.loadConversations();
        this.recalculateGroupCounts();
    }

    loadGroups() {
        try {
            const saved = localStorage.getItem('inbox_groups');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Ensure note field exists for all groups
                this.groups = parsed.map(g => ({ note: '', ...g }));
            } else {
                this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
            }
        } catch {
            this.groups = DEFAULT_GROUPS.map(g => ({ ...g }));
        }
    }

    loadConversations() {
        try {
            const saved = localStorage.getItem('inbox_conversations');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.conversations = parsed.map(c => ({
                    ...c,
                    time: new Date(c.time),
                    messages: c.messages.map(m => ({ ...m, time: new Date(m.time) }))
                }));
            } else {
                this.conversations = [...SAMPLE_CONVERSATIONS];
            }
        } catch {
            this.conversations = [...SAMPLE_CONVERSATIONS];
        }
    }

    save() {
        try {
            localStorage.setItem('inbox_conversations', JSON.stringify(this.conversations));
            localStorage.setItem('inbox_groups', JSON.stringify(this.groups));
        } catch (e) {
            console.error('[InboxData] Save error:', e);
        }
    }

    recalculateGroupCounts() {
        this.groups.forEach(g => { g.count = 0; });
        this.conversations.forEach(conv => {
            const group = this.groups.find(g => g.id === conv.label);
            if (group) group.count++;
        });
    }

    getConversations({ search = '', filter = 'all', groupFilter = null } = {}) {
        let result = [...this.conversations];

        if (filter === 'unread') {
            result = result.filter(c => c.unread > 0);
        } else if (filter === 'starred') {
            result = result.filter(c => c.starred);
        }

        if (groupFilter) {
            result = result.filter(c => c.label === groupFilter);
        }

        if (search) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.lastMessage.toLowerCase().includes(q) ||
                (c.phone && c.phone.includes(q))
            );
        }

        result.sort((a, b) => b.time - a.time);
        return result;
    }

    getConversation(id) {
        return this.conversations.find(c => c.id === id);
    }

    setConversationLabel(convId, labelId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.label = labelId;
            this.recalculateGroupCounts();
            this.save();
        }
    }

    markAsRead(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.unread = 0;
            this.save();
        }
    }

    toggleStar(convId) {
        const conv = this.getConversation(convId);
        if (conv) {
            conv.starred = !conv.starred;
            this.save();
            return conv.starred;
        }
        return false;
    }

    addMessage(convId, text, sender = 'shop') {
        const conv = this.getConversation(convId);
        if (!conv) return null;

        const message = {
            id: 'm' + Date.now(),
            text,
            time: new Date(),
            sender,
        };

        conv.messages.push(message);
        conv.lastMessage = text;
        conv.time = message.time;
        this.save();
        return message;
    }

    addGroup(name, color, note) {
        const id = 'group_' + Date.now();
        const group = { id, name, color, count: 0, note: note || '' };
        this.groups.push(group);
        this.save();
        return group;
    }

    updateGroup(id, updates) {
        const group = this.groups.find(g => g.id === id);
        if (group) {
            if (updates.name !== undefined) group.name = updates.name;
            if (updates.color !== undefined) group.color = updates.color;
            if (updates.note !== undefined) group.note = updates.note;
            this.save();
        }
    }

    deleteGroup(id) {
        const idx = this.groups.findIndex(g => g.id === id);
        if (idx !== -1) {
            // Move conversations from this group to 'new'
            this.conversations.forEach(c => {
                if (c.label === id) c.label = 'new';
            });
            this.groups.splice(idx, 1);
            this.recalculateGroupCounts();
            this.save();
        }
    }

    getStats() {
        const total = this.conversations.length;
        const processing = this.conversations.filter(c => c.label === 'processing').length;
        const waiting = this.conversations.filter(c => c.label === 'waiting').length;
        const urgent = this.conversations.filter(c => c.label === 'urgent').length;
        return { total, processing, waiting, urgent };
    }
}

// Export globally
window.InboxDataManager = InboxDataManager;
window.DEFAULT_GROUPS = DEFAULT_GROUPS;
