/**
 * Theme Management Module
 * Handles theme selection, switching, and persistence
 */

/**
 * Initialize theme based on saved preference or default
 */
export function initTheme() {
    const lightTheme = document.getElementById('lightTheme');
    const darkTheme = document.getElementById('darkTheme');
    const systemTheme = document.getElementById('systemTheme');
    const savedTheme = localStorage.getItem('whatsapp_extract_theme') || 'light';
    
    if (savedTheme === 'dark') {
        if (darkTheme) darkTheme.checked = true;
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (savedTheme === 'system') {
        if (systemTheme) systemTheme.checked = true;
        
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (systemTheme && systemTheme.checked) {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    } else {
        if (lightTheme) lightTheme.checked = true;
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

/**
 * Setup theme switcher event handlers
 */
export function setupThemeSwitchers() {
    const lightTheme = document.getElementById('lightTheme');
    const darkTheme = document.getElementById('darkTheme');
    const systemTheme = document.getElementById('systemTheme');
    
    if (lightTheme) {
        lightTheme.addEventListener('change', () => {
            if (lightTheme.checked) {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('whatsapp_extract_theme', 'light');
            }
        });
    }
    
    if (darkTheme) {
        darkTheme.addEventListener('change', () => {
            if (darkTheme.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('whatsapp_extract_theme', 'dark');
            }
        });
    }
    
    if (systemTheme) {
        systemTheme.addEventListener('change', () => {
            if (systemTheme.checked) {
                localStorage.setItem('whatsapp_extract_theme', 'system');
                
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.setAttribute('data-theme', 'light');
                }
            }
        });
    }
}
