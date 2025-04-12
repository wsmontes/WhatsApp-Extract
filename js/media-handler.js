/**
 * Media Handler Module
 * Handles various media file types and media players
 */

/**
 * Create a reusable audio player component
 * @param {string} audioUrl - URL to audio file
 * @param {number} durationSecs - Duration in seconds
 * @returns {HTMLElement} - Audio player element
 */
export function createAudioPlayer(audioUrl, durationSecs = 0) {
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
        setupAudioPlayerEvents(audioPlayer);
    }, 0);
    
    return audioPlayer;
}

/**
 * Set up event listeners for audio player
 * @param {HTMLElement} audioPlayer - Audio player element
 */
function setupAudioPlayerEvents(audioPlayer) {
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
}

/**
 * Process URLs in message content to create link previews
 * @param {string} content - Message content
 * @returns {Object} - Processed content and link previews
 */
export function processMessageLinks(content) {
    if (!content) return { content, linkPreviews: [] };
    
    // Sanitize content first to remove any malformed links
    content = content.replace(/<a href="<a href="([^"]+)"[^>]*>([^<]+)<\/a>"[^>]*>/g, '$2');
    
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
        // Clean up the URL if needed
        const cleanUrl = url.trim().replace(/["'><]/g, '');
        
        // Add to link previews
        linkPreviews.push(cleanUrl);
        
        // Return properly formed clickable link with max width
        const displayUrl = cleanUrl.length > 60 ? cleanUrl.substring(0, 57) + '...' : cleanUrl;
        return `<a href="${cleanUrl}" target="_blank" class="message-link">${displayUrl}</a>`;
    });
    
    return { content: processedContent, linkPreviews };
}

/**
 * Create link preview element
 * @param {string} url - URL to preview
 * @returns {HTMLElement} - Link preview element
 */
export function createLinkPreview(url) {
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
export function formatMessageText(text) {
    if (!text) return '';

    // Convert URLs to clickable links (already done in processMessageLinks)
    // This is a backup in case processMessageLinks wasn't used
    text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');

    // Convert line breaks to <br>
    return text.replace(/\n/g, '<br>');
}

/**
 * Format audio transcription into natural sentences
 * @param {string} text - Transcription text
 * @returns {string} - Formatted HTML
 */
export function formatAudioTranscription(text) {
    if (!text) return '';

    // Remove any "[Audio content]" or similar prefixes
    text = text.replace(/\[Audio .*?\]:\s*/g, '');

    // Split long transcriptions into more natural chunks based on punctuation
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];

    return sentences.join('<br>');
}
