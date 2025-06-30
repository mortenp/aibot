class ThemeService {
    constructor() {
        this.DARK_THEME = 'dark';
        this.LIGHT_THEME = 'light';
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.handleSystemThemeChange = this.handleSystemThemeChange.bind(this);
        this.initTheme();
    }

    initTheme() {
        // Add system theme change listener
        this.mediaQuery.addEventListener('change', this.handleSystemThemeChange);

        // Get stored theme or use system preference
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) {
            this.applyTheme(storedTheme);
        } else {
            this.applyTheme(this.mediaQuery.matches ? this.DARK_THEME : this.LIGHT_THEME);
        }
    }

    handleSystemThemeChange(e) {
        // Only update theme if user hasn't set a preference
        if (!localStorage.getItem('theme')) {
            this.applyTheme(e.matches ? this.DARK_THEME : this.LIGHT_THEME);
        }
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === this.LIGHT_THEME ? this.DARK_THEME : this.LIGHT_THEME;
        this.applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        return newTheme;
    }

    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        
        // Update button icons
        const lightIcon = document.querySelector('.theme-icon-light');
        const darkIcon = document.querySelector('.theme-icon-dark');
        
        if (lightIcon && darkIcon) {
            if (theme === this.DARK_THEME) {
                lightIcon.style.display = 'none';
                darkIcon.style.display = 'inline-block';
            } else {
                lightIcon.style.display = 'inline-block';
                darkIcon.style.display = 'none';
            }
        }

        // Dispatch theme change event
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { theme }
        }));
    }
}

// Export the class for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThemeService };
}

// Initialize theme service
window.themeService = new ThemeService(); 