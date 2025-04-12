/**
 * WhatsApp Chat Parser Module
 * Handles parsing of chat texts and timestamp formats
 */

/**
 * Parse chat text into structured format
 * @param {string} chatText - Raw chat text
 * @returns {Array} - Array of parsed message objects
 */
export function parseChatText(chatText) {
    const lines = chatText.split(/\r?\n/);

    // Detect the timestamp format
    const timestampFormat = detectTimestampFormat(chatText);
    console.log('Detected timestamp format:', timestampFormat);

    // Define regex patterns based on format
    let messageRegex;
    switch (timestampFormat) {
        case 'MM/DD/YY':
            messageRegex = /\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s+([^:]+):\s*(.*)/i;
            break;
        case 'DD/MM/YYYY':
            messageRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+):\s*(.*)/i;
            break;
        case 'YYYY-MM-DD':
            messageRegex = /\[(\d{4}-\d{1,2}-\d{1,2},\s*\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s*(.*)/i;
            break;
        default:
            // Generic fallback pattern
            messageRegex = /(?:\[|)(\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4},?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)(?:\]|\s-)\s*([^:]+):\s*(.*)/i;
    }

    // System message patterns
    const systemMessagePattern = /(?:\[|)(\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4},?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)(?:\]|\s-)\s*(.+)/i;

    // Process each line
    let currentMessage = null;
    const parsedLines = [];
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Check if it's a new message
        const match = trimmedLine.match(messageRegex);
        if (match) {
            // It's a new message
            const [_, timestamp, sender, message] = match;
            currentMessage = {
                type: 'message',
                timestamp: timestamp,
                sender: sender.trim(),
                message: message
            };
            parsedLines.push(currentMessage);
        } else if (currentMessage) {
            // Check if it might be a system message
            const systemMatch = trimmedLine.match(systemMessagePattern);
            if (systemMatch && !parsedLines.some(l => l.message === systemMatch[2])) {
                // System message (no sender)
                parsedLines.push({
                    type: 'system',
                    timestamp: systemMatch[1],
                    message: systemMatch[2]
                });
            } else {
                // It's a continuation of the previous message
                currentMessage.message += '\n' + trimmedLine;
            }
        }
    }
    return parsedLines;
}

/**
 * Detect timestamp format from sample chat text
 * @param {string} chatText - Raw chat text
 * @returns {string} - Detected timestamp format
 */
export function detectTimestampFormat(chatText) {
    // Sample the first few lines to detect format
    const lines = chatText.split(/\r?\n/).slice(0, 10).join('\n');

    // Check for [MM/DD/YY, HH:MM:SS AM/PM] format
    if (lines.match(/\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\]/i)) {
        return 'MM/DD/YY';
    }

    // Check for DD/MM/YYYY, HH:MM - format
    if (lines.match(/\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*-/i)) {
        return 'DD/MM/YYYY';
    }

    // Check for [YYYY-MM-DD, HH:MM:SS] format
    if (lines.match(/\[\d{4}-\d{1,2}-\d{1,2},\s*\d{1,2}:\d{2}(?::\d{2})?\]/i)) {
        return 'YYYY-MM-DD';
    }

    // Default format
    return 'unknown';
}

/**
 * Merge chat with transcriptions
 * @param {Array} chatLines - Parsed chat lines
 * @param {Object} transcriptions - Transcription object with filename keys
 * @returns {Object} - Object with rawText and structuredData
 */
export function mergeChatWithTranscriptions(chatLines, transcriptions) {
    console.log('\n==== STARTING MERGE PROCESS ====');
    console.log('Number of chat lines:', chatLines.length);
    console.log('Number of transcriptions:', Object.keys(transcriptions).length);

    let rawText = '';
    let structuredData = {
        title: 'WhatsApp Chat',
        participants: new Set(),
        messages: []
    };

    let audioMessagesFound = 0;
    let audioMessagesMatched = 0;

    // Process each chat line
    for (const line of chatLines) {
        if (line.type === 'message') {
            // Add participant to set
            if (line.sender) {
                structuredData.participants.add(line.sender);
            }

            // Check if this is an audio message
            const isAudioMsg = line.message && (
                line.message.includes('<attached: ') && 
                (line.message.includes('.opus>') || 
                 line.message.includes('.mp3>') || 
                 line.message.includes('PTT-') || 
                 line.message.includes('audio'))
            );

            if (isAudioMsg) {
                audioMessagesFound++;

                // Extract the file name
                const fileNameMatch = line.message.match(/<attached:\s*([^>]+)>/);
                let fileName = fileNameMatch ? fileNameMatch[1].trim() : null;

                if (fileName) {
                    // Look for a transcription of this audio file
                    let transcription = "[Audio content]";
                    let transcriptionFound = false;

                    // Try to match with a transcription
                    for (const transFileName in transcriptions) {
                        // Direct match
                        if (transFileName.includes(fileName) || fileName.includes(transFileName)) {
                            transcription = transcriptions[transFileName];
                            transcriptionFound = true;
                            audioMessagesMatched++;
                            break;
                        }

                        // Try pattern matching (date/time based)
                        const fileDate = extractDateFromFileName(fileName);
                        const transDate = extractDateFromFileName(transFileName);

                        if (fileDate && transDate && Math.abs(fileDate - transDate) < 5000) { // Within 5 seconds
                            transcription = transcriptions[transFileName];
                            transcriptionFound = true;
                            audioMessagesMatched++;
                            break;
                        }
                    }

                    // Add to structured data for WhatsApp view
                    structuredData.messages.push({
                        type: 'audio',
                        sender: line.sender,
                        timestamp: line.timestamp,
                        content: transcription,
                        fileName: fileName
                    });

                    // Add to raw text
                    rawText += `${formatChatLine(line.timestamp, line.sender)}: 🔊 AUDIO: ${transcription}\n`;
                }
            } else {
                // Regular text message
                structuredData.messages.push({
                    type: 'text',
                    sender: line.sender,
                    timestamp: line.timestamp,
                    content: line.message
                });

                // Add to raw text
                rawText += `${formatChatLine(line.timestamp, line.sender)}: ${line.message}\n`;
            }
        } else if (line.type === 'system') {
            // System message like "Messages to this group are now secured with end-to-end encryption"
            rawText += `--- ${line.message} ---\n`;

            // Add to structured data with special type
            structuredData.messages.push({
                type: 'system',
                timestamp: new Date(),
                content: line.message
            });
        }
    }

    // Look for unmatched media files in the transcript that might be photos, videos, etc.
    for (const line of chatLines) {
        if (line.type === 'message' && line.message) {
            // Check for other media types
            const mediaPatterns = [
                { regex: /<attached:\s*(.*\.jpg|.*\.jpeg|.*\.png)>/, type: 'photo' },
                { regex: /<attached:\s*(.*\.mp4|.*\.mov|.*\.avi)>/, type: 'video' },
                { regex: /<attached:\s*(.*\.webp|.*STICKER.*)>/, type: 'sticker' },
                { regex: /<attached:\s*(.*\.pdf|.*\.doc|.*\.xls)>/, type: 'document' }
            ];

            for (const pattern of mediaPatterns) {
                const match = line.message.match(pattern.regex);
                if (match) {
                    const fileName = match[1].trim();

                    // Add to structured data
                    structuredData.messages.push({
                        type: pattern.type,
                        sender: line.sender,
                        timestamp: line.timestamp,
                        fileName: fileName
                    });

                    // Add to raw text
                    const icon = pattern.type === 'photo' ? '📷' : 
                                pattern.type === 'video' ? '🎥' : 
                                pattern.type === 'sticker' ? '🏷️' : '📄';

                    rawText += `${formatChatLine(line.timestamp, line.sender)}: ${icon} [${pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1)}: ${fileName}]\n`;
                    break;
                }
            }
        }
    }

    console.log(`\n==== MERGE COMPLETE ====`); 
    console.log(`Total audio messages found: ${audioMessagesFound}`);
    console.log(`Audio messages with matched transcriptions: ${audioMessagesMatched}`);

    // Convert participants set to array
    structuredData.participants = Array.from(structuredData.participants);

    // Sort messages by timestamp
    structuredData.messages.sort((a, b) => {
        const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
        const timestampB = b.timestamp instanceof Date ? a.timestamp : new Date(b.timestamp);
        return timestampA - timestampB;
    });

    return { rawText, structuredData };
}

/**
 * Helper function to format chat timestamp and sender
 * @param {string|Date} timestamp - Message timestamp
 * @param {string} sender - Message sender name
 * @returns {string} - Formatted line prefix
 */
function formatChatLine(timestamp, sender) {
    return `[${formatTimestamp(timestamp)}] - ${sender}`;
}

/**
 * Format timestamp consistently
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} - Formatted timestamp string
 */
function formatTimestamp(timestamp) {
    if (timestamp instanceof Date) {
        return timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
    return timestamp.toString();
}

/**
 * Extract date from filename (common in WhatsApp audio files)
 * @param {string} fileName - Filename to parse
 * @returns {number|null} - Timestamp in milliseconds or null
 */
function extractDateFromFileName(fileName) {
    const dateMatch = fileName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    if (dateMatch) {
        const [_, year, month, day] = dateMatch;

        const timeMatch = fileName.match(/(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
        if (timeMatch && timeMatch.index > dateMatch.index) {
            const [__, hour, minute, second] = timeMatch;
            return new Date(year, month - 1, day, hour, minute, second).getTime();
        }
        return new Date(year, month - 1, day).getTime();
    }
    return null;
}
