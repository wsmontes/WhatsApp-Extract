/**
 * Export Module
 * Handles exporting chat data in various formats
 */

/**
 * Download processed text as a text file
 * @param {string} processedText - Processed chat text
 */
export function downloadAsText(processedText) {
    if (!processedText) {
        alert('No processed text available. Please process a chat file first.');
        return;
    }
    
    const blob = new Blob([processedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whatsapp_chat_export.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download chat as PDF
 * @param {HTMLElement} whatsappContainer - WhatsApp container element
 * @param {Function} updateProgress - Progress update function
 */
export function downloadAsPdf(whatsappContainer, updateProgress) {
    if (!whatsappContainer) {
        alert('No WhatsApp view available. Please process a chat file first.');
        return;
    }
    
    // Show loading status
    updateProgress(50, 'Generating PDF...');
    
    // Clone the container to avoid modifying the visible one
    const clone = whatsappContainer.cloneNode(true);
    
    // Set specific styling for PDF output
    clone.style.height = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    
    // Ensure background styles are explicitly preserved for PDF
    const computedStyle = window.getComputedStyle(whatsappContainer);
    clone.style.backgroundColor = computedStyle.backgroundColor;
    clone.style.backgroundImage = computedStyle.backgroundImage;
    clone.style.backgroundRepeat = 'repeat';
    
    // Add a wrapper with white background to prevent transparency issues
    const wrapper = document.createElement('div');
    wrapper.style.backgroundColor = 'white';
    wrapper.style.padding = '20px';
    wrapper.appendChild(clone);
    
    // Generate PDF with configuration options
    const options = {
        margin: [10, 10, 10, 10],
        filename: 'whatsapp_chat_export.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().from(wrapper).set(options).save()
        .then(() => {
            // Hide loading after successful generation
            updateProgress(100, 'PDF generated successfully!');
            setTimeout(() => updateProgress(0, ''), 1000);
        })
        .catch(error => {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF. Please try again or use the text export option.');
            updateProgress(0, 'Error generating PDF');
        });
}
