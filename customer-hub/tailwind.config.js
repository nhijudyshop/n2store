// tailwind.config.js
module.exports = {
    darkMode: "class",
    content: [
        "./*.html",
        "./js/**/*.js",
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#007bff",
                "primary-hover": "#0062cc",
                "background-light": "#f9fafb",
                "background-dark": "#1c212b",
                "surface-light": "#ffffff",
                "surface-dark": "#252b36",
                "border-light": "#e5e7eb",
                "border-dark": "#374151",
                "success": "#28a745",
                "danger": "#dc3545",
                "warning": "#ffc107",
                "info": "#17a2b8",
            },
            fontFamily: {
                "display": ["Inter", "sans-serif"],
                "mono": ["JetBrains Mono", "monospace"],
            },
            boxShadow: {
                'soft': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                'glow': '0 0 15px rgba(0, 123, 255, 0.15)',
            }
        },
    },
    plugins: [],
};
