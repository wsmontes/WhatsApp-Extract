/**
 * UI Management Module
 * Handles UI interactions, view switching, and UI components
 */

/**
 * Toggle between WhatsApp view and raw text view
 * @param {boolean} showWhatsAppView - Whether to show WhatsApp view
 */
export function toggleView(showWhatsAppView) {
    const whatsappViewSection = document.getElementById('whatsappViewSection');
    const rawTextSection = document.getElementById('rawTextSection');
    const whatsappViewBtn = document.getElementById('whatsappViewBtn');
    const rawTextBtn = document.getElementById('rawTextBtn');
    
    if (showWhatsAppView) {
        // Update active class
        if (whatsappViewBtn) whatsappViewBtn.classList.add('active');
        if (rawTextBtn) rawTextBtn.classList.remove('active');
        
        // Show/hide sections - FIX: was incorrectly hiding rawTextSection
        if (whatsappViewSection) whatsappViewSection.style.display = 'block';
        if (rawTextSection) rawTextSection.style.display = 'none';
    } else {
        // Update active class
        if (rawTextBtn) rawTextBtn.classList.add('active');
        if (whatsappViewBtn) whatsappViewBtn.classList.remove('active');
        
        // Show/hide sections
        if (whatsappViewSection) whatsappViewSection.style.display = 'none';
        if (rawTextSection) rawTextSection.style.display = 'block';
    }
}

/**
 * Format date for dividers in chat view
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string
 */
export function formatDateForDivider(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'TODAY';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'YESTERDAY';
    } else {
        const options = {
            day: 'numeric',
            month: 'long',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        };
        return date.toLocaleDateString(undefined, options).toUpperCase();
    }
}

/**
 * Show processing overlay
 * @param {boolean} show - Whether to show or hide the overlay
 */
export function showProcessingOverlay(show = true) {
    const processingOverlay = document.getElementById('processingOverlay');
    if (processingOverlay) {
        if (show) {
            processingOverlay.classList.add('visible');
        } else {
            processingOverlay.classList.remove('visible');
        }
    }
}

/**
 * Create a lightbox for media viewing
 * @returns {HTMLElement} - Lightbox element
 */
export function createLightbox() {
    // Check if lightbox already exists
    if (document.getElementById('whatsapp-lightbox')) {
        return;
    }
    
    const lightbox = document.createElement('div');
    lightbox.id = 'whatsapp-lightbox';
    lightbox.className = 'whatsapp-lightbox';
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <span class="lightbox-close">&times;</span>
            <img class="lightbox-image" src="">
            <video class="lightbox-video" controls style="display:none;"></video>
            <div class="lightbox-caption"></div>
            <div class="lightbox-footer">
                <button id="lightboxDownload" class="btn btn-primary">Download</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(lightbox);
    
    // Close lightbox when clicking the close button or outside the image
    const closeBtn = document.querySelector('.lightbox-close');
    closeBtn.addEventListener('click', () => {
        lightbox.style.display = 'none';
        
        // Pause video if playing
        const video = document.querySelector('.lightbox-video');
        if (video) {
            video.pause();
        }
    });
    
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.style.display = 'none';
            
            // Pause video if playing
            const video = document.querySelector('.lightbox-video');
            if (video) {
                video.pause();
            }
        }
    });
    
    return lightbox;
}

/**
 * Show media in lightbox
 * @param {string} mediaUrl - URL to media file
 * @param {string} caption - Caption for media
 * @param {boolean} isVideo - Whether media is video
 */
export function showMediaInLightbox(mediaUrl, caption, isVideo = false) {
    const lightbox = document.getElementById('whatsapp-lightbox');
    const lightboxImage = document.querySelector('.lightbox-image');
    const lightboxVideo = document.querySelector('.lightbox-video');
    const lightboxCaption = document.querySelector('.lightbox-caption');
    const lightboxTitle = document.querySelector('.lightbox-title');
    
    if (isVideo) {
        lightboxVideo.src = mediaUrl;
        lightboxVideo.style.display = 'block';
        lightboxImage.style.display = 'none';
        lightboxTitle.textContent = 'Video';
    } else {
        lightboxImage.src = mediaUrl;
        lightboxImage.style.display = 'block';
        lightboxVideo.style.display = 'none';
        lightboxTitle.textContent = 'Image';
    }
    
    // Store current media for download
    window.currentMediaFile = {
        url: mediaUrl,
        name: caption || (isVideo ? 'video.mp4' : 'image.jpg')
    };
    
    lightboxCaption.textContent = caption || '';
    lightbox.style.display = 'flex';
}

/**
 * Show toast notification
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {string} type - Toast type (info, success, warning, error)
 * @param {number} duration - Duration in milliseconds
 */
export function showToast(title, message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}-toast`;
    toast.innerHTML = `
        <div class="toast-header">
            <strong>${title}</strong>
            <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">
            ${message}
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Use Bootstrap toast
    const bsToast = new bootstrap.Toast(toast, {
        delay: duration
    });
    bsToast.show();
    
    // Auto-remove after it's hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

/**
 * Update progress bar and status text
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Status message
 */
export function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');
    
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    if (statusText) {
        statusText.textContent = message;
    }
    
    // Show the processing overlay when progress is happening
    if (percent > 0 && percent < 100) {
        showProcessingOverlay(true);
    } else if (percent >= 100) {
        // Hide when complete
        setTimeout(() => {
            showProcessingOverlay(false);
        }, 1000); // slight delay for UX
    }
}

/**
 * Switch to empty state or chat view based on content
 * @param {boolean} hasContent - Whether there is content to display
 */
export function toggleViewState(hasContent) {
    const chatBody = document.getElementById('chatBody');
    const emptyState = document.getElementById('emptyState');
    
    if (chatBody) {
        chatBody.style.display = hasContent ? 'flex' : 'none';
    }
    
    if (emptyState) {
        emptyState.style.display = hasContent ? 'none' : 'flex';
    }
    
    // If we have content, ensure date dividers are properly displayed
    // and text wrapping is fixed
    if (hasContent) {
        refreshDateDividers();
        fixMessageTextWrapping();
    }
}

/**
 * Fix message text wrapping issues
 */
export function fixMessageTextWrapping() {
    // Fix message content text wrapping
    const messageContents = document.querySelectorAll('.message-content');
    messageContents.forEach(content => {
        // Add proper text wrapping styles
        content.style.wordBreak = 'break-word';
        content.style.overflowWrap = 'break-word';
        content.style.whiteSpace = 'pre-wrap';
        content.style.maxWidth = '100%';
        
        // Fix links inside messages
        const links = content.querySelectorAll('a');
        links.forEach(link => {
            link.style.wordBreak = 'break-all';
            link.style.maxWidth = '100%';
            link.style.display = 'inline-block';
        });
    });
    
    // Ensure messages don't overflow their container
    const messages = document.querySelectorAll('.message');
    messages.forEach(message => {
        message.style.maxWidth = '75%';
        message.style.boxSizing = 'border-box';
        message.style.wordBreak = 'break-word';
    });
    
    // Fix the width of date dividers
    const dateDividers = document.querySelectorAll('.date-divider');
    dateDividers.forEach(divider => {
        divider.style.width = '100%';
        divider.style.maxWidth = '100%';
        divider.style.boxSizing = 'border-box';
        divider.style.textAlign = 'center';
    });
    
    // Add a resize handler to update sizes when window changes
    if (!window.whatsAppResizeHandlerAdded) {
        window.addEventListener('resize', debounce(() => {
            fixMessageTextWrapping();
        }, 250));
        window.whatsAppResizeHandlerAdded = true;
    }
}

/**
 * Debounce function to limit rapid function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

/**
 * Refresh date dividers in the chat
 * Ensures all date dividers show the correctly formatted date
 */
export function refreshDateDividers() {
    const dateDividers = document.querySelectorAll('.date-divider');
    
    dateDividers.forEach(divider => {
        const dateTimestamp = divider.getAttribute('data-timestamp');
        if (dateTimestamp) {
            const date = new Date(parseInt(dateTimestamp));
            const formattedDate = formatDateForDivider(date);
            
            // Update the date text
            let dateElement = divider.querySelector('.date-text');
            if (!dateElement) {
                // Create the date element if it doesn't exist
                dateElement = document.createElement('span');
                dateElement.className = 'date-text';
                divider.appendChild(dateElement);
            }
            
            dateElement.textContent = formattedDate;
            divider.style.display = 'flex'; // Ensure the divider is visible
        }
    });
}
