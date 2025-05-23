/**
 * Sidebar Module
 * Handles chat sidebar functionality
 */

/**
 * Add chat to sidebar
 * @param {Object} data - Chat data
 */
export function addChatToSidebar(data) {
    const sidebarChats = document.querySelector('.wa-sidebar-chats');
    if (!sidebarChats) return;
    
    // Clear "no chats" placeholder if it exists
    const noChatsPlaceholder = document.querySelector('.no-chats-placeholder');
    if (noChatsPlaceholder) {
        noChatsPlaceholder.remove();
    }
    
    // Check if this chat is already in the sidebar
    const existingChat = document.querySelector(`.chat-item[data-chat-id="${data.chatId || 'default'}"]`);
    if (existingChat) {
        // Just activate this chat
        activateSidebarChat(existingChat);
        return;
    }
    
    // Create new chat entry
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.setAttribute('data-chat-id', data.chatId || 'default');
    chatItem.setAttribute('data-chat-type', data.chatType || 'unknown');
    
    // Create avatar based on chat type and title
    const chatTitle = data.title || 'WhatsApp Chat';
    const isGroup = data.chatType === 'group';
    
    // For individual chats: use first letter of contact name
    // For group chats: use first letter of group name
    const avatarInitial = chatTitle.charAt(0).toUpperCase(); 
    
    // Format the last message timestamp
    const lastMessageTimestamp = data.messages && data.messages.length > 0 
        ? new Date(data.messages[data.messages.length - 1].timestamp) 
        : new Date();
    
    const timeString = formatChatTime(lastMessageTimestamp);
    
    // Get preview of last message
    let lastMessagePreview = '';
    let lastMessageSender = '';
    
    if (data.messages && data.messages.length > 0) {
        const lastMsg = data.messages[data.messages.length - 1];
        
        if (lastMsg.type === 'text') {
            lastMessagePreview = lastMsg.content.substring(0, 40) + (lastMsg.content.length > 40 ? '...' : '');
        } else if (lastMsg.type === 'audio') {
            lastMessagePreview = '🎤 Voice message';
        } else if (lastMsg.type === 'photo') {
            lastMessagePreview = '📷 Photo';
        } else if (lastMsg.type === 'video') {
            lastMessagePreview = '🎥 Video';
        } else if (lastMsg.type === 'document') {
            lastMessagePreview = '📄 Document';
        } else if (lastMsg.type === 'sticker') {
            lastMessagePreview = '🏷️ Sticker';
        } else {
            lastMessagePreview = 'Message';
        }
        
        // For message previews, show the sender name only if it's not the user
        if (lastMsg.sender && lastMsg.sender !== data.userPhoneNumber) {
            lastMessageSender = lastMsg.sender.split(' ')[0];
        }
    }
    
    // Customize avatar based on chat type
    const avatarClass = isGroup ? 'group-avatar' : 'individual-avatar';
    const avatarBgColor = isGroup ? '#00a884' : '#128c7e'; // WhatsApp colors
    
    // Generate HTML with appropriate styling
    chatItem.innerHTML = `
        <div class="chat-avatar ${avatarClass}" style="background-color: ${avatarBgColor};">
            ${isGroup ? '<i class="fas fa-users" style="font-size: 14px;"></i>' : '<span>' + avatarInitial + '</span>'}
        </div>
        <div class="chat-info">
            <div class="chat-header">
                <div class="chat-title">${chatTitle}</div>
                <div class="chat-time">${timeString}</div>
            </div>
            <div class="chat-last-message">
                ${isGroup && lastMessageSender ? `<span class="sender-name">${lastMessageSender}:</span> ` : ''}
                ${lastMessagePreview}
            </div>
        </div>
    `;
    
    // Add click handler to switch to this chat
    chatItem.addEventListener('click', function() {
        activateSidebarChat(this);
        
        // Render this chat's data
        if (window.renderWhatsAppView) {
            window.renderWhatsAppView(data);
        }
        
        // Switch to WhatsApp view if we're in raw text view
        const whatsappViewSection = document.getElementById('whatsappViewSection');
        const rawTextSection = document.getElementById('rawTextSection');
        if (whatsappViewSection && rawTextSection) {
            whatsappViewSection.style.display = 'block';
            rawTextSection.style.display = 'none';
            
            // Update view buttons if they exist
            const whatsappViewBtn = document.getElementById('whatsappViewBtn');
            const rawTextBtn = document.getElementById('rawTextBtn');
            if (whatsappViewBtn && rawTextBtn) {
                whatsappViewBtn.classList.add('active');
                rawTextBtn.classList.remove('active');
            }
        }
        
        // On mobile, close the menu after selecting a chat
        if (window.innerWidth < 768) {
            const mobileSlideMenu = document.getElementById('mobileSlideMenu');
            if (mobileSlideMenu) {
                mobileSlideMenu.classList.remove('open');
            }
        }
    });
    
    // Add the new chat item to the sidebar
    sidebarChats.insertBefore(chatItem, sidebarChats.firstChild);
    
    // Activate this chat
    activateSidebarChat(chatItem);
}

/**
 * Activate a sidebar chat
 * @param {HTMLElement} chatItem - Chat item element
 */
export function activateSidebarChat(chatItem) {
    // Remove active class from all chat items
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to this chat item
    chatItem.classList.add('active');
}

/**
 * Format chat time for sidebar
 * @param {Date} date - Date to format
 * @returns {string} - Formatted time string
 */
export function formatChatTime(date) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    // If it's today, show time only
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // If it's yesterday, show "Yesterday"
    else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }
    // If it's this week, show day name
    else if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    // Otherwise show date
    else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}
