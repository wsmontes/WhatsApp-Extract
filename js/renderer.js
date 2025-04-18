/**
 * Renderer Module
 * Handles rendering chat data in WhatsApp-style and raw text views
 */
import { formatDateForDivider } from './ui.js';

/**
 * Render chat in WhatsApp-style view
 * @param {Object} data - Structured chat data
 */
export function renderWhatsAppView(data) {
    // Store the data for sidebar access
    window.lastProcessedChatData = data;
    
    // Generate a unique ID for this chat if it doesn't have one
    if (!data.chatId) {
        data.chatId = 'chat_' + Date.now();
    }
    
    // Set chat title and participants
    document.getElementById('chatTitle').textContent = data.title || 'WhatsApp Chat';
    
    // Update participant info display based on chat type
    const isGroup = data.chatType === 'group';
    const participantsInfo = document.getElementById('participantsInfo');
    
    if (participantsInfo) {
        if (isGroup) {
            participantsInfo.textContent = `${data.participants.length} participants`;
        } else {
            participantsInfo.textContent = 'Online';
        }
    }
    
    // Update chat header avatar based on chat type
    updateChatAvatar(data);
    
    // Update profile dropdown with participants
    populateProfileDropdown(data);

    // Get container for messages and ensure proper background
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    
    // Clear any inline styles that may be causing the black background
    messagesContainer.removeAttribute('style');
    messagesContainer.style.backgroundColor = 'transparent';
    
    // Properly set up the WhatsApp container background
    const whatsappContainer = document.getElementById('whatsappContainer');
    if (whatsappContainer) {
        // Remove any problematic inline styles
        whatsappContainer.removeAttribute('style');
        
        // Apply our theme-aware background class
        whatsappContainer.classList.add('themed-chat-background');
        
        // Explicitly set important background properties
        whatsappContainer.style.backgroundColor = 'var(--wa-chat-bg)';
        whatsappContainer.style.backgroundImage = 'url(\'data:image/png;base64,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\')';
        whatsappContainer.style.backgroundRepeat = 'repeat';
    }

    // Also make sure messaging container is properly styled
    if (messagesContainer) {
        messagesContainer.classList.add('messages-container');
        // Remove any inline styles that might interfere with theme
        messagesContainer.style.cssText = '';
    }

    // Analyze audio sources to identify different speakers/sources
    const analyzedMessages = analyzeAudioSources(data.messages);

    // Determine if we're in a dialogue (exactly 2 participants)
    const isDialogue = data.participants.length === 2;

    // Process each message
    let currentDay = null;

    analyzedMessages.forEach(msg => {
        // Check if it's a new day
        const messageDate = new Date(msg.timestamp);
        const day = messageDate.toDateString();

        if (day !== currentDay) {
            currentDay = day;
            const messageDate = new Date(msg.timestamp);
            
            // Create the formatted date string
            const formattedDate = formatDateForDivider(messageDate);
            
            // Add date divider
            const dateDivider = document.createElement('div');
            dateDivider.className = 'date-divider';
            dateDivider.innerHTML = `
                <div class="date-badge">${formattedDate}</div>
            `;
            messagesContainer.appendChild(dateDivider);
        }

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message message-tail';

        // Determine if message is sent or received
        // Change this logic to use the identified user from chat parser
        const isFromMe = msg.sender === data.userPhoneNumber;
        messageEl.classList.add(isFromMe ? 'sent' : 'received');

        // Add special class for audio transcripts
        if (msg.type === 'audio') {
            messageEl.classList.add('audio-transcript');
        }

        // Format time
        const time = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Structure content based on message type
        let contentHtml = '';
        let senderHtml = '';
        let linkPreviewEls = [];

        // Add sender name only for received messages (not your own messages)
        if (!isFromMe) {
            senderHtml = `<div class="message-sender">${msg.sender}</div>`;
        }

        // Format content based on message type
        switch (msg.type) {
            case 'text':
                // Process links in the text
                const { content: processedContent, linkPreviews } = processMessageLinks(msg.content);
                contentHtml = `<div class="message-content">${formatMessageText(processedContent)}</div>`;
                
                // Create link previews
                linkPreviews.forEach(url => {
                    linkPreviewEls.push(createLinkPreview(url));
                });
                break;

            case 'audio':
                // If we have a voice group, show it
                let voiceLabel = '';
                if (msg.voiceGroup && msg.voiceGroup !== msg.sender) {
                    const voiceClass = msg.voiceClass || '';
                    voiceLabel = `<div class="audio-source-label ${voiceClass}">${msg.voiceGroup}</div>`;
                }

                contentHtml = `
                    <div class="message-content">
                        ${voiceLabel}
                        <div class="audio-message-container">
                            <div class="audio-player-wrapper"></div>
                            <div class="audio-transcript-text">${formatAudioTranscription(msg.content)}</div>
                        </div>
                    </div>
                `;
                
                // Store filename as data attribute for update purposes
                if (msg.fileName) {
                    messageEl.setAttribute('data-filename', msg.fileName);
                }
                
                // Add special class if this is a placeholder for in-progress transcription
                if (msg.content && msg.content.includes('transcription in progress')) {
                    messageEl.classList.add('processing-transcript');
                }
                break;

            case 'photo':
                // Check if we have the actual image file
                const imageSrc = data.mediaFiles && data.mediaFiles[msg.fileName];
                if (imageSrc) {
                    contentHtml = `
                        <div class="message-content">
                            <div class="image-container">
                                <img src="${imageSrc}" alt="Image" class="chat-image" data-filename="${msg.fileName}">
                            </div>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="message-content">
                            <span class="media-indicator">📷</span> 
                            Photo: ${msg.fileName || ''}
                        </div>
                    `;
                }
                break;

            case 'video':
                // Check if we have the actual video file
                const videoSrc = data.mediaFiles && data.mediaFiles[msg.fileName];
                if (videoSrc) {
                    contentHtml = `
                        <div class="message-content">
                            <div class="video-container">
                                <video class="chat-video" data-filename="${msg.fileName}">
                                    <source src="${videoSrc}" type="video/mp4">
                                    Your browser does not support video playback.
                                </video>
                                <div class="video-play-overlay">
                                    <div class="video-play-button">▶</div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="message-content">
                            <span class="media-indicator">🎥</span> 
                            Video: ${msg.fileName || ''}
                        </div>
                    `;
                }
                break;

            case 'sticker':
                contentHtml = `
                    <div class="message-content">
                        <span class="media-indicator">🏷️</span> 
                        Sticker
                    </div>
                `;
                break;

            case 'document':
                contentHtml = `
                    <div class="message-content">
                        <span class="media-indicator">📄</span> 
                        Document: ${msg.fileName || ''}
                    </div>
                `;
                break;

            default:
                contentHtml = `<div class="message-content">${msg.content || ''}</div>`;
        }

        // Build the message HTML
        messageEl.innerHTML = `
            ${senderHtml}
            ${contentHtml}
            <div class="message-meta">
                <span class="message-time">${time}</span>
            </div>
        `;

        // Add to containers
        messagesContainer.appendChild(messageEl);
        
        // Add link previews after the message if needed
        linkPreviewEls.forEach(previewEl => {
            const linkPreviewContainer = document.createElement('div');
            linkPreviewContainer.className = `message-link-preview ${isFromMe ? 'sent' : 'received'}`;
            linkPreviewContainer.appendChild(previewEl);
            messagesContainer.appendChild(linkPreviewContainer);
        });
        
        // Set up media interactions for this message
        if (msg.type === 'photo' && data.mediaFiles && data.mediaFiles[msg.fileName]) {
            const img = messageEl.querySelector('.chat-image');
            if (img) {
                img.addEventListener('click', () => {
                    showMediaInLightbox(data.mediaFiles[msg.fileName], msg.fileName);
                });
            }
        }
        
        if (msg.type === 'video' && data.mediaFiles && data.mediaFiles[msg.fileName]) {
            const videoContainer = messageEl.querySelector('.video-container');
            if (videoContainer) {
                videoContainer.addEventListener('click', () => {
                    showMediaInLightbox(data.mediaFiles[msg.fileName], msg.fileName, true);
                });
            }
        }
        
        // Add audio player for audio messages
        if (msg.type === 'audio' && msg.fileName && data.mediaFiles && data.mediaFiles[msg.fileName]) {
            const audioPlayerWrapper = messageEl.querySelector('.audio-player-wrapper');
            if (audioPlayerWrapper) {
                const audioPlayer = createAudioPlayer(data.mediaFiles[msg.fileName]);
                audioPlayerWrapper.appendChild(audioPlayer);
            }
        }
    });

    // Scroll to the bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Populate profile dropdown with participants
 * @param {Object} data - Chat data
 */
function populateProfileDropdown(data) {
    const dropdown = document.getElementById('profileDropdownItems');
    if (!dropdown) return;
    
    // Clear existing items
    dropdown.innerHTML = '';
    
    // Add all participants as options
    data.participants.forEach(participant => {
        const item = document.createElement('div');
        item.className = `profile-dropdown-item ${participant === data.userPhoneNumber ? 'active' : ''}`;
        item.dataset.participant = participant;
        
        item.innerHTML = `
            <span class="check-icon"><i class="fas fa-check"></i></span>
            <span class="participant-name">${participant}</span>
        `;
        
        // Add click handler
        item.addEventListener('click', () => {
            // Update active state in dropdown
            document.querySelectorAll('.profile-dropdown-item').forEach(el => {
                el.classList.remove('active');
            });
            item.classList.add('active');
            
            // Update the chat data
            if (window.lastProcessedChatData) {
                window.lastProcessedChatData.userPhoneNumber = participant;
                
                // Re-render the chat with the new owner
                renderWhatsAppView(window.lastProcessedChatData);
                
                // Close the dropdown
                document.getElementById('profileDropdown').classList.remove('show');
            }
        });
        
        dropdown.appendChild(item);
    });
    
    // Set up dropdown toggle
    setupProfileDropdownToggle();
}

/**
 * Set up profile dropdown toggle functionality
 */
function setupProfileDropdownToggle() {
    const trigger = document.getElementById('profileDropdownTrigger');
    const dropdownEl = document.getElementById('profileDropdown');
    
    if (trigger && dropdownEl) {
        // Remove existing listeners to avoid duplicates
        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        
        // Add click handler to toggle dropdown
        newTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Profile dropdown trigger clicked');
            dropdownEl.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#profileDropdownTrigger') && 
                !e.target.closest('#profileDropdown')) {
                dropdownEl.classList.remove('show');
            }
        });
    }
}

/**
 * Update chat avatar with relevant icon and image
 * @param {Object} data - Chat data
 */
function updateChatAvatar(data) {
    const chatAvatar = document.querySelector('.wa-chat-avatar');
    if (!chatAvatar) return;
    
    // Clear existing content
    chatAvatar.innerHTML = '';
    
    // Set appropriate avatar based on chat type
    const isGroup = data.chatType === 'group';
    if (isGroup) {
        // Group chat avatar
        chatAvatar.style.backgroundColor = '#00a884';
        const groupIcon = document.createElement('i');
        groupIcon.className = 'fas fa-users';
        chatAvatar.appendChild(groupIcon);
    } else {
        // Individual chat avatar
        chatAvatar.style.backgroundColor = '#128c7e';
        const initialSpan = document.createElement('span');
        initialSpan.textContent = (data.title || 'User').charAt(0).toUpperCase();
        chatAvatar.appendChild(initialSpan);
    }
}

/**
 * Analyze audio sources and classify them by speaker
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Messages with additional voice classification
 */
function analyzeAudioSources(messages) {
    // Extract just audio transcripts
    const audioMessages = messages.filter(msg => msg.type === 'audio');

    if (audioMessages.length < 2) return messages;

    // Group by sender first
    const senderGroups = {};
    audioMessages.forEach(msg => {
        if (!senderGroups[msg.sender]) {
            senderGroups[msg.sender] = [];
        }
        senderGroups[msg.sender].push(msg);
    });

    // For each sender, analyze if there might be multiple voices
    Object.keys(senderGroups).forEach(sender => {
        const messages = senderGroups[sender];
        // Simple heuristic: if message lengths vary significantly, might be different speakers
        if (messages.length >= 3) {
            const avgLength = messages.reduce((sum, msg) => sum + msg.content.length, 0) / messages.length;
            const stdDev = Math.sqrt(messages.reduce((sum, msg) => {
                return sum + Math.pow(msg.content.length - avgLength, 2);
            }, 0) / messages.length);

            // If high variance, might be different speakers
            if (stdDev > avgLength * 0.5) {
                // Group by message length patterns (rough approximation of voice patterns)
                const shortMessages = messages.filter(msg => msg.content.length < avgLength * 0.7);
                const mediumMessages = messages.filter(msg => 
                    msg.content.length >= avgLength * 0.7 && msg.content.length <= avgLength * 1.3);
                const longMessages = messages.filter(msg => msg.content.length > avgLength * 1.3);

                shortMessages.forEach(msg => {
                    msg.voiceGroup = `${sender} (Brief)`;
                    msg.voiceClass = 'voice-brief';
                });

                mediumMessages.forEach(msg => {
                    msg.voiceGroup = `${sender}`;
                    msg.voiceClass = 'voice-normal';
                });

                longMessages.forEach(msg => {
                    msg.voiceGroup = `${sender} (Detailed)`;
                    msg.voiceClass = 'voice-detailed';
                });
            }
        }

        // Look for name references in the content
        messages.forEach(msg => {
            // Look for patterns like "Tell X", "Ask Y", "Say to Z"
            const nameRefPattern = /\b(?:tell|ask|say to|from|for)\s+([A-Z][a-z]+)\b/i;
            const match = msg.content.match(nameRefPattern);
            if (match && match[1]) {
                const potentialName = match[1];
                // Check if this name exists in our participants list
                if (potentialName.length > 2 && potentialName !== sender) {
                    msg.mentionedPerson = potentialName;
                    if (!msg.voiceGroup) {
                        msg.voiceGroup = `${sender} → ${potentialName}`;
                        msg.voiceClass = 'voice-mention';
                    }
                }
            }
        });
    });

    return messages;
}

/**
 * Process URLs in message content to create link previews
 * @param {string} content - Message content
 * @returns {Object} - Processed content and link previews
 */
function processMessageLinks(content) {
    // Regular expression to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex);
    
    if (!urls || urls.length === 0) {
        return { content, linkPreviews: [] };
    }
    
    // Keep track of link previews to add after the message
    const linkPreviews = [];
    
    // Convert URLs to clickable links
    let processedContent = content.replace(urlRegex, (url) => {
        // Add to link previews
        linkPreviews.push(url);
        
        // Return clickable link
        return `<a href="${url}" target="_blank" class="message-link">${url}</a>`;
    });
    
    return { content: processedContent, linkPreviews };
}

/**
 * Create link preview element
 * @param {string} url - URL to preview
 * @returns {HTMLElement} - Link preview element
 */
function createLinkPreview(url) {
    const previewEl = document.createElement('div');
    previewEl.className = 'link-preview';
    
    // Extract domain for display
    let domain = "";
    try {
        domain = new URL(url).hostname;
    } catch (e) {
        domain = url;
    }
    
    previewEl.innerHTML = `
        <div class="link-preview-content">
            <div class="link-preview-domain">${domain}</div>
            <div class="link-preview-title">${url}</div>
        </div>
    `;
    
    // Make the entire preview clickable
    previewEl.addEventListener('click', () => {
        window.open(url, '_blank');
    });
    
    return previewEl;
}

/**
 * Format regular text messages with line breaks and links
 * @param {string} text - Message text
 * @returns {string} - Formatted HTML
 */
function formatMessageText(text) {
    if (!text) return '';

    // Sanitize text to prevent XSS
    text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // First fix any malformed links that might exist in the data
    text = text.replace(/<a href="<a href="([^"]+)"[^>]*>([^<]+)<\/a>"[^>]*>/g, '$2');
    
    // Only then convert URLs to clickable links with correct structure
    text = text.replace(/(https?:\/\/[^\s]+)/g, function(url) {
        // Truncate display URL if too long
        const displayUrl = url.length > 60 ? url.substring(0, 57) + '...' : url;
        return `<a href="${url}" target="_blank" class="message-link">${displayUrl}</a>`;
    });

    // Convert line breaks to <br>
    return text.replace(/\n/g, '<br>');
}

/**
 * Format audio transcription into natural sentences
 * @param {string} text - Transcription text
 * @returns {string} - Formatted HTML
 */
function formatAudioTranscription(text) {
    if (!text) return '';

    // Handle processing placeholder with special styling
    if (text.includes('[Audio transcription in progress...]')) {
        return '<div class="transcript-placeholder"><i class="fas fa-spinner fa-spin me-2"></i>Transcribing audio...</div>';
    }

    // Remove any "[Audio content]" or similar prefixes
    text = text.replace(/\[Audio .*?\]:\s*/g, '');

    // Split long transcriptions into more natural chunks based on punctuation
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];

    return sentences.join('<br>');
}

/**
 * Create a reusable audio player component
 * @param {string} audioUrl - URL to audio file
 * @param {number} durationSecs - Duration in seconds
 * @returns {HTMLElement} - Audio player element
 */
function createAudioPlayer(audioUrl, durationSecs = 0) {
    const audioPlayer = document.createElement('div');
    audioPlayer.className = 'whatsapp-audio-player';
    
    // Format duration
    const minutes = Math.floor(durationSecs / 60);
    const seconds = Math.floor(durationSecs % 60);
    const formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    
    audioPlayer.innerHTML = `
        <div class="audio-player-container">
            <button class="audio-play-button">
                <span class="play-icon">▶</span>
                <span class="pause-icon" style="display:none;">⏸</span>
            </button>
            <div class="audio-waveform">
                <div class="audio-progress"></div>
            </div>
            <div class="audio-duration">${durationSecs > 0 ? formattedDuration : '0:00'}</div>
            <div class="audio-speed-control">
                <button class="speed-btn active" data-speed="1">1x</button>
                <button class="speed-btn" data-speed="1.5">1.5x</button>
                <button class="speed-btn" data-speed="2">2x</button>
            </div>
        </div>
        <audio preload="metadata">
            <source src="${audioUrl}" type="audio/mpeg">
            Your browser does not support the audio element.
        </audio>
    `;
    
    // Set up audio player functionality after it's added to the DOM
    setTimeout(() => {
        const audio = audioPlayer.querySelector('audio');
        const playButton = audioPlayer.querySelector('.audio-play-button');
        const playIcon = audioPlayer.querySelector('.play-icon');
        const pauseIcon = audioPlayer.querySelector('.pause-icon');
        const progress = audioPlayer.querySelector('.audio-progress');
        const waveform = audioPlayer.querySelector('.audio-waveform');
        const durationDisplay = audioPlayer.querySelector('.audio-duration');
        const speedButtons = audioPlayer.querySelectorAll('.speed-btn');
        
        // Update audio duration once metadata is loaded
        audio.addEventListener('loadedmetadata', () => {
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            durationDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        });
        
        // Play/pause functionality
        playButton.addEventListener('click', () => {
            if (audio.paused) {
                // Pause all other audio elements first
                document.querySelectorAll('.whatsapp-audio-player audio').forEach(el => {
                    if (el !== audio && !el.paused) {
                        el.pause();
                        const playerContainer = el.closest('.whatsapp-audio-player');
                        playerContainer.querySelector('.play-icon').style.display = 'inline-block';
                        playerContainer.querySelector('.pause-icon').style.display = 'none';
                    }
                });
                
                audio.play();
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'inline-block';
            } else {
                audio.pause();
                playIcon.style.display = 'inline-block';
                pauseIcon.style.display = 'none';
            }
        });
        
        // Speed control functionality
        speedButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove active class from all buttons
                speedButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                btn.classList.add('active');
                
                // Set playback rate
                const speed = parseFloat(btn.getAttribute('data-speed'));
                audio.playbackRate = speed;
                
                // Update timing calculations for the progress display
                updateTimeDisplay();
            });
        });
        
        // Function to update time display based on current playback rate
        function updateTimeDisplay() {
            const currentMin = Math.floor(audio.currentTime / 60);
            const currentSec = Math.floor(audio.currentTime % 60);
            durationDisplay.textContent = `${currentMin}:${currentSec < 10 ? '0' : ''}${currentSec}`;
        }
        
        // Update progress bar
        audio.addEventListener('timeupdate', () => {
            const percent = (audio.currentTime / audio.duration) * 100;
            progress.style.width = `${percent}%`;
            
            // Update time display
            updateTimeDisplay();
        });
        
        // Reset when ended
        audio.addEventListener('ended', () => {
            audio.currentTime = 0;
            progress.style.width = '0%';
            playIcon.style.display = 'inline-block';
            pauseIcon.style.display = 'none';
            
            // Reset time display to total duration
            const minutes = Math.floor(audio.duration / 60);
            const seconds = Math.floor(audio.duration % 60);
            durationDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        });
        
        // Allow clicking on waveform to seek
        waveform.addEventListener('click', (e) => {
            const rect = waveform.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pos * audio.duration;
        });
    }, 0);
    
    return audioPlayer;
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
