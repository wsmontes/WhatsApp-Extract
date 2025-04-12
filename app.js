document.addEventListener('DOMContentLoaded', () => {
    // Remove the "Let's get started" window completely from the DOM
    const emptyStateEl = document.getElementById('emptyState');
    if (emptyStateEl && emptyStateEl.parentNode) {
        emptyStateEl.parentNode.removeChild(emptyStateEl);
    }

    // Import modules
    Promise.all([
        import('./js/theme.js'),
        import('./js/ui.js'),
        import('./js/renderer.js'),
        import('./js/chat-parser.js'),
        import('./js/audio-processor.js'),
        import('./js/media-handler.js'),
        import('./js/export.js'),
        import('./js/sidebar.js')
    ]).then(([
        themeModule,
        uiModule,
        rendererModule,
        chatParserModule,
        audioProcessorModule,
        mediaHandlerModule,
        exportModule,
        sidebarModule
    ]) => {
        // Initialize theme
        const { initTheme, setupThemeSwitchers } = themeModule;
        initTheme();
        setupThemeSwitchers();
        
        // Destructure UI module functions
        const { 
            toggleView, 
            showToast, 
            showProcessingOverlay, 
            updateProgress, 
            toggleViewState,
            createLightbox
        } = uiModule;
        
        // Destructure renderer module functions
        const { renderWhatsAppView, showMediaInLightbox } = rendererModule;
        
        // Destructure chat parser module functions
        const { parseChatText, mergeChatWithTranscriptions } = chatParserModule;
        
        // Destructure audio processor module functions
        const { isAudioFile, transcribeAudio, analyzeAudio } = audioProcessorModule;
        
        // Destructure media handler module functions
        const { createAudioPlayer, processMessageLinks, createLinkPreview } = mediaHandlerModule;
        
        // Destructure export module functions
        const { downloadAsText, downloadAsPdf } = exportModule;
        
        // Destructure sidebar module functions
        const { addChatToSidebar } = sidebarModule;
        
        // Make required functions globally available for callbacks
        window.updateProgress = updateProgress;
        window.renderWhatsAppView = renderWhatsAppView;
        window.showMediaInLightbox = showMediaInLightbox;
        
        // Create lightbox for media viewing
        createLightbox();
        
        // Global state variables
        let processedText = '';
        let chatLines = [];
        let audioFiles = [];
        let transcriptions = {};
        let mediaFiles = {}; // Store references to extracted media files
        let currentMediaFile = null; // For lightbox download functionality
        
        // Get UI Elements
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadModal = document.getElementById('uploadModal');
        const fabMain = document.getElementById('fabMain');
        const fabUpload = document.getElementById('fabUpload');
        const fabApiKey = document.getElementById('fabApiKey');
        const fabInfo = document.getElementById('fabInfo');
        const settingsPanel = document.getElementById('settingsPanel');
        const infoPanel = document.getElementById('infoPanel');
        const btnShowSettings = document.getElementById('btnShowSettings');
        const btnShowInfo = document.getElementById('btnShowInfo');
        const closeSettingsPanel = document.getElementById('closeSettingsPanel');
        const closeInfoPanel = document.getElementById('closeInfoPanel');
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const mobileSlideMenu = document.getElementById('mobileSlideMenu');
        const closeSlideMenu = document.getElementById('closeSlideMenu');
        const mobileUploadBtn = document.getElementById('mobileUploadBtn');
        const mobileApiKeyBtn = document.getElementById('mobileApiKeyBtn');
        const mobileInfoBtn = document.getElementById('mobileInfoBtn');
        const mobileWhatsappViewBtn = document.getElementById('mobileWhatsappViewBtn');
        const mobileRawTextBtn = document.getElementById('mobileRawTextBtn');
        const mobileDownloadTextBtn = document.getElementById('mobileDownloadTextBtn');
        const mobileDownloadPdfBtn = document.getElementById('mobileDownloadPdfBtn');
        const apiKeyWarning = document.getElementById('apiKeyWarning');
        const setApiKeyFromModal = document.getElementById('setApiKeyFromModal');
        const lightboxDownload = document.getElementById('lightboxDownload');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
        const zipFileInput = document.getElementById('zipFileInput');
        const processButton = document.getElementById('processButton');
        const currentFile = document.getElementById('currentFile');
        const whatsappViewSection = document.getElementById('whatsappViewSection');
        const rawTextSection = document.getElementById('rawTextSection');
        const resultContainer = document.getElementById('resultContainer');
        const downloadTextButton = document.getElementById('downloadTextButton');
        const downloadPdfButton = document.getElementById('downloadPdfButton');
        const whatsappViewBtn = document.getElementById('whatsappViewBtn');
        const rawTextBtn = document.getElementById('rawTextBtn');
        const whatsappContainer = document.getElementById('whatsappContainer');
        
        // Initialize view state
        toggleViewState(false);
        
        // Event listeners for view buttons
        if (whatsappViewBtn) {
            whatsappViewBtn.addEventListener('click', () => toggleView(true));
        }
        
        if (rawTextBtn) {
            rawTextBtn.addEventListener('click', () => toggleView(false));
        }
        
        // Toggle functionality for floating action button
        if (fabMain) {
            fabMain.addEventListener('click', (e) => {
                if (e.target.closest('.fab-option-btn')) return;
                fabMain.classList.toggle('open');
            });
            
            // Close FAB when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.floating-action-btn') && fabMain.classList.contains('open')) {
                    fabMain.classList.remove('open');
                }
            });
        }
        
        // Open upload modal function
        function openUploadModal() {
            if (uploadModal) {
                const modal = new bootstrap.Modal(uploadModal);
                modal.show();
                
                // Check if API key is set
                const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
                if (!apiKey && apiKeyWarning) {
                    apiKeyWarning.style.display = 'block';
                } else if (apiKeyWarning) {
                    apiKeyWarning.style.display = 'none';
                }
            }
            
            // Close FAB if open
            if (fabMain && fabMain.classList.contains('open')) {
                fabMain.classList.remove('open');
            }
        }
        
        // Handle upload button clicks - using the direct approach that works for fab buttons
        if (uploadBtn) {
            // First remove any existing listeners to avoid duplicates
            uploadBtn.replaceWith(uploadBtn.cloneNode(true));
            
            // Get fresh reference after cloning
            const refreshedUploadBtn = document.getElementById('uploadBtn');
            if (refreshedUploadBtn) {
                // Directly use the same function as the + button
                refreshedUploadBtn.onclick = function(e) {
                    console.log('Upload button clicked');
                    // Use the working openUploadModal function
                    if (uploadModal) {
                        try {
                            // Try to get existing modal instance first
                            let modalInstance = bootstrap.Modal.getInstance(uploadModal);
                            // If no existing instance, create a new one
                            if (!modalInstance) {
                                modalInstance = new bootstrap.Modal(uploadModal);
                            }
                            // Show the modal
                            modalInstance.show();
                            
                            // Check if API key is set
                            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
                            if (!apiKey && apiKeyWarning) {
                                apiKeyWarning.style.display = 'block';
                            } else if (apiKeyWarning) {
                                apiKeyWarning.style.display = 'none';
                            }
                        } catch (error) {
                            console.error('Error showing modal:', error);
                        }
                    }
                    
                    return false; // Prevent default
                };
            } else {
                console.error('Upload button not found after cloning');
            }
        }
        
        // Handle upload button clicks
        if (fabUpload) fabUpload.addEventListener('click', openUploadModal);
        if (mobileUploadBtn) {
            mobileUploadBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                openUploadModal();
            });
        }
        
        // Set API key from modal warning
        if (setApiKeyFromModal) {
            setApiKeyFromModal.addEventListener('click', () => {
                // Close upload modal
                const uploadModalInstance = bootstrap.Modal.getInstance(uploadModal);
                if (uploadModalInstance) uploadModalInstance.hide();
                
                // Open settings panel
                openSettingsPanel();
            });
        }
        
        // Open settings panel function
        function openSettingsPanel() {
            if (settingsPanel) {
                settingsPanel.classList.add('open');
                
                // Focus on API key input
                if (apiKeyInput) {
                    setTimeout(() => apiKeyInput.focus(), 300);
                }
            }
            
            // Close FAB if open
            if (fabMain && fabMain.classList.contains('open')) {
                fabMain.classList.remove('open');
            }
            
            // Close mobile menu if open
            if (mobileSlideMenu && mobileSlideMenu.classList.contains('open')) {
                mobileSlideMenu.classList.remove('open');
            }
        }
        
        // Setup settings panel buttons
        if (btnShowSettings) btnShowSettings.addEventListener('click', openSettingsPanel);
        if (closeSettingsPanel) {
            closeSettingsPanel.addEventListener('click', () => {
                if (settingsPanel) settingsPanel.classList.remove('open');
            });
        }
        if (fabApiKey) fabApiKey.addEventListener('click', openSettingsPanel);
        if (mobileApiKeyBtn) {
            mobileApiKeyBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                openSettingsPanel();
            });
        }
        
        // Open info panel function
        function openInfoPanel() {
            if (infoPanel) {
                infoPanel.classList.add('open');
            }
            
            // Close FAB if open
            if (fabMain && fabMain.classList.contains('open')) {
                fabMain.classList.remove('open');
            }
            
            // Close mobile menu if open
            if (mobileSlideMenu && mobileSlideMenu.classList.contains('open')) {
                mobileSlideMenu.classList.remove('open');
            }
        }
        
        // Setup info panel buttons
        if (btnShowInfo) btnShowInfo.addEventListener('click', openInfoPanel);
        if (closeInfoPanel) {
            closeInfoPanel.addEventListener('click', () => {
                if (infoPanel) infoPanel.classList.remove('open');
            });
        }
        if (fabInfo) fabInfo.addEventListener('click', openInfoPanel);
        if (mobileInfoBtn) {
            mobileInfoBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                openInfoPanel();
            });
        }
        
        // Mobile menu handling
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.add('open');
            });
        }
        
        if (closeSlideMenu) {
            closeSlideMenu.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
            });
        }
        
        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (mobileSlideMenu && mobileSlideMenu.classList.contains('open') &&
                !e.target.closest('.mobile-slide-menu') && !e.target.closest('#mobileMenuBtn')) {
                mobileSlideMenu.classList.remove('open');
            }
        });
        
        // Mobile view buttons
        if (mobileWhatsappViewBtn) {
            mobileWhatsappViewBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                toggleView(true);
            });
        }
        
        if (mobileRawTextBtn) {
            mobileRawTextBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                toggleView(false);
            });
        }
        
        // Mobile download buttons
        if (mobileDownloadTextBtn) {
            mobileDownloadTextBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                downloadAsText(processedText);
            });
        }
        
        if (mobileDownloadPdfBtn) {
            mobileDownloadPdfBtn.addEventListener('click', () => {
                if (mobileSlideMenu) mobileSlideMenu.classList.remove('open');
                downloadAsPdf(whatsappContainer, updateProgress);
            });
        }
        
        // Lightbox download button
        if (lightboxDownload) {
            lightboxDownload.addEventListener('click', () => {
                if (currentMediaFile) {
                    const a = document.createElement('a');
                    a.href = currentMediaFile.url;
                    a.download = currentMediaFile.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            });
        }
        
        // Load saved API key if exists
        function loadSavedApiKey() {
            const savedApiKey = localStorage.getItem('whatsapp_extract_api_key');
            if (savedApiKey && apiKeyInput) {
                apiKeyInput.value = savedApiKey;
            }
        }
        
        // Save API key to localStorage
        function saveApiKey(apiKey) {
            if (apiKey) {
                localStorage.setItem('whatsapp_extract_api_key', apiKey);
                showToast('Success', 'API key saved successfully!', 'success');
            } else {
                showToast('Error', 'Please enter an API key to save.', 'error');
            }
        }
        
        // Initialize saved API key
        loadSavedApiKey();
        
        // Add event listener for save button
        if (saveApiKeyBtn) {
            saveApiKeyBtn.addEventListener('click', () => {
                const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
                saveApiKey(apiKey);
                
                // Close the settings panel after saving
                if (settingsPanel) {
                    settingsPanel.classList.remove('open');
                }
            });
        }
        
        // Add event listeners for download buttons
        if (downloadTextButton) {
            downloadTextButton.addEventListener('click', () => {
                downloadAsText(processedText);
            });
        }
        
        if (downloadPdfButton) {
            downloadPdfButton.addEventListener('click', () => {
                downloadAsPdf(whatsappContainer, updateProgress);
            });
        }
        
        // Process button click handler
        if (processButton) {
            processButton.addEventListener('click', async () => {
                if (!zipFileInput || !zipFileInput.files[0]) {
                    showToast('Error', 'Please select a ZIP file first.', 'error');
                    return;
                }
                
                const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
                if (!apiKey) {
                    showToast('Warning', 'API key not set. Audio files will not be transcribed.', 'warning');
                    // Continue anyway - user might just want to extract chat without transcription
                }
                
                // Auto-save API key when processing starts
                if (apiKey) {
                    saveApiKey(apiKey);
                }
                
                // Close the upload modal
                const uploadModalInstance = bootstrap.Modal.getInstance(uploadModal);
                if (uploadModalInstance) uploadModalInstance.hide();
                
                try {
                    console.log('Starting processing of ZIP file:', zipFileInput.files[0].name);
                    
                    // Show processing overlay
                    showProcessingOverlay(true);
                    updateProgress(0, 'Reading ZIP file...');
                    
                    // Read the ZIP file
                    const zipFile = zipFileInput.files[0];
                    const zip = await JSZip.loadAsync(zipFile);
                    console.log('ZIP file loaded, contents:', Object.keys(zip.files));
                    
                    // Extract chat text file
                    updateProgress(10, 'Extracting chat text...');
                    let chatFile = null;
                    
                    // Look for common WhatsApp chat file names
                    const possibleChatFiles = ['_chat.txt', 'chat.txt', 'WhatsApp Chat.txt'];
                    for (const fileName of possibleChatFiles) {
                        if (zip.files[fileName]) {
                            chatFile = zip.files[fileName];
                            console.log('Found chat file:', fileName);
                            break;
                        }
                    }
                    
                    // If chat file not found, try to find it using regex
                    if (!chatFile) {
                        console.log('No standard chat file found, searching with regex...');
                        for (const fileName in zip.files) {
                            if (fileName.match(/chat.*\.txt$/i) && !zip.files[fileName].dir) {
                                chatFile = zip.files[fileName];
                                console.log('Found chat file with regex:', fileName);
                                break;
                            }
                        }
                    }
                    
                    if (!chatFile) {
                        console.error('No chat file found in the ZIP');
                        throw new Error('Chat text file not found in the ZIP. Please ensure this is a valid WhatsApp chat export.');
                    }
                    
                    // Parse chat text
                    const chatText = await chatFile.async('text');
                    console.log('Chat text extracted, first 200 chars:', chatText.substring(0, 200));
                    console.log('Total chat text length:', chatText.length);
                    
                    chatLines = parseChatText(chatText);
                    console.log(`Parsed ${chatLines.length} chat lines`);
                    updateProgress(20, 'Identifying audio files...');
                    
                    // Find audio files in the ZIP
                    audioFiles = [];
                    mediaFiles = {}; // Reset media files object
                    let mediaStats = {
                        audio: 0,
                        photo: 0,
                        video: 0,
                        sticker: 0,
                        document: 0,
                        other: 0,
                    };
                    
                    console.log('Scanning for media files...');
                    for (const fileName in zip.files) {
                        if (!zip.files[fileName].dir) {
                            if (isAudioFile(fileName)) {
                                console.log('Found audio file:', fileName);
                                audioFiles.push({
                                    name: fileName,
                                    file: zip.files[fileName]
                                });
                                
                                // Also store in mediaFiles for playback
                                const audioData = await zip.files[fileName].async('arraybuffer');
                                const audioBlob = new Blob([audioData], { 
                                    type: fileName.endsWith('.opus') ? 'audio/ogg' : 
                                          fileName.endsWith('.mp3') ? 'audio/mpeg' :
                                          fileName.endsWith('.m4a') ? 'audio/m4a' :
                                          fileName.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'
                                });
                                mediaFiles[fileName] = URL.createObjectURL(audioBlob);
                                
                                mediaStats.audio++;
                            } else if (fileName.match(/\.(jpg|jpeg|png|gif)$/i) || fileName.includes('PHOTO')) {
                                // Extract image files
                                try {
                                    const imageData = await zip.files[fileName].async('arraybuffer');
                                    const imageBlob = new Blob([imageData], { 
                                        type: fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
                                              fileName.endsWith('.png') ? 'image/png' :
                                              fileName.endsWith('.gif') ? 'image/gif' : 'image/jpeg'
                                    });
                                    mediaFiles[fileName] = URL.createObjectURL(imageBlob);
                                } catch (error) {
                                    console.error(`Failed to extract image ${fileName}:`, error);
                                }
                                mediaStats.photo++;
                            } else if (fileName.match(/\.(mp4|mov|avi)$/i) || fileName.includes('VIDEO')) {
                                // Extract video files (for thumbnail and playback)
                                try {
                                    const videoData = await zip.files[fileName].async('arraybuffer');
                                    const videoBlob = new Blob([videoData], { 
                                        type: fileName.endsWith('.mp4') ? 'video/mp4' :
                                              fileName.endsWith('.mov') ? 'video/quicktime' :
                                              fileName.endsWith('.avi') ? 'video/x-msvideo' : 'video/mp4'
                                    });
                                    mediaFiles[fileName] = URL.createObjectURL(videoBlob);
                                } catch (error) {
                                    console.error(`Failed to extract video ${fileName}:`, error);
                                }
                                mediaStats.video++;
                            } else if (fileName.match(/\.(webp)$/i) || fileName.includes('STICKER')) {
                                mediaStats.sticker++;
                            } else if (fileName.match(/\.(pdf|doc|docx|xls)$/i) || fileName.includes('DOCUMENT')) {
                                mediaStats.document++;
                            } else if (!fileName.endsWith('.txt')) {
                                mediaStats.other++;
                            }
                        }
                    }
                    
                    console.log('Media stats:', mediaStats);
                    updateProgress(30, `Found ${audioFiles.length} audio files.`);
                    
                    // Process audio files
                    if (audioFiles.length > 0 && apiKey) {
                        console.log('Beginning audio processing...');
                        // Create audio context for analysis
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        const audioContext = new AudioContext();
                        
                        let count = 0;
                        for (const audioFile of audioFiles) {
                            count++;
                            console.log(`\n==== PROCESSING AUDIO FILE ${count}/${audioFiles.length} ====`);
                            console.log(`File name: ${audioFile.name}`);
                            
                            updateProgress(
                                30 + (50 * count / audioFiles.length),
                                `Analyzing audio files (${count}/${audioFiles.length})...`
                            );
                            if (currentFile) {
                                currentFile.textContent = `Processing: ${audioFile.name}`;
                            }
                            
                            try {
                                // Get audio data as ArrayBuffer
                                const audioData = await audioFile.file.async('arraybuffer');
                                console.log(`Audio file ${audioFile.name} loaded, size: ${audioData.byteLength} bytes`);
                                
                                // Transcribe the audio using OpenAI's Whisper API
                                const transcript = await transcribeAudio(audioData, audioContext, apiKey, audioFile.name);
                                console.log(`Transcription result for ${audioFile.name}:`, transcript);
                                
                                console.log(`ADDING TRANSCRIPT MAPPING: ${audioFile.name} -> ${transcript}`);
                                transcriptions[audioFile.name] = transcript;
                            } catch (error) {
                                console.error(`Failed to transcribe ${audioFile.name}:`, error);
                                transcriptions[audioFile.name] = `[Audio transcription failed: ${error.message}]`;
                            }
                        }
                        
                        console.log("\n==== ALL TRANSCRIPTIONS GENERATED ====");
                        for (const fileName in transcriptions) {
                            console.log(`${fileName}: ${transcriptions[fileName]}`);
                        }
                    }
                    
                    // Update to display both raw text and WhatsApp-style view
                    updateProgress(90, 'Merging transcriptions with chat...');
                    console.log('Beginning merge of chat and transcriptions');
                    console.log('Number of transcriptions:', Object.keys(transcriptions).length);
                    
                    // Get both raw text and structured data for the UI
                    const { rawText, structuredData } = mergeChatWithTranscriptions(chatLines, transcriptions);
                    processedText = rawText;
                    console.log('Processing complete!');
                    
                    // Add media files to structured data
                    structuredData.mediaFiles = mediaFiles;
                    
                    // Display the results
                    if (resultContainer) {
                        resultContainer.textContent = processedText;
                    }
                    
                    // Render the WhatsApp view and add to sidebar
                    renderWhatsAppView(structuredData);
                    addChatToSidebar(structuredData);
                    
                    // Show the WhatsApp view by default
                    toggleView(true);
                    
                    updateProgress(100, 'Processing complete!');
                    console.log('Processing complete!');
                    
                    // Switch to chat view
                    toggleViewState(true);
                    showProcessingOverlay(false);
                    showToast('Success', 'Processing complete!', 'success');
                } catch (error) {
                    console.error('Error processing ZIP file:', error);
                    updateProgress(0, `Error: ${error.message}`);
                    showProcessingOverlay(false);
                    showToast('Error', error.message, 'error');
                }
            });
        }
        
        // Info section accordion behavior
        const infoSections = document.querySelectorAll('.wa-section-title[data-bs-toggle="collapse"]');
        infoSections.forEach(section => {
            section.addEventListener('click', () => {
                const icon = section.querySelector('.fa-chevron-down');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down');
                    icon.classList.toggle('fa-chevron-up');
                }
            });
        });
    }).catch(err => {
        console.error('Error loading modules:', err);
        document.getElementById('processingOverlay').textContent = 
            'Error loading application. Please refresh the page or check console for details.';
    });
    
    // Override toggleViewState to always show chat content (empty state now removed)
    function toggleViewState(hasContent) {
        const chatBody = document.getElementById('chatBody');
        if (chatBody) {
            chatBody.style.display = 'flex';
        }
        // No longer need to display or remove "emptyState"
    }
});
