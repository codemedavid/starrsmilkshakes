/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        starrs: {
          teal: {
            light: '#B8E6D3',
            DEFAULT: '#4ECDC4',
            dark: '#2A9D8F',
            darker: '#1A7A6E'
          },
          mint: {
            light: '#E0F7F4',
            DEFAULT: '#A8E6CF',
            dark: '#7FD3B0'
          },
          cream: {
            light: '#FFF8E7',
            DEFAULT: '#FFF3E0',
            dark: '#F7E7CE'
          },
          green: {
            light: '#C8E6C9',
            DEFAULT: '#66BB6A',
            dark: '#4CAF50'
          },
          accent: {
            teal: '#2DD4BF',
            green: '#10B981',
            dark: '#0F766E'
          },
          sage: {
            DEFAULT: '#8FB8A8',
            light: '#A8CFC0',
          },
          deep: '#2A5A4A',
          linen: '#F6F1EB',
          'cream-brand': '#FFF8E7',
          'mint-soft': '#F0F7F4',
          muted: '#6B8F80',
        }
      },
      fontFamily: {
        'pretendard': ['Pretendard', 'system-ui', 'sans-serif'],
        'noto-kr': ['Noto Serif KR', 'serif'],
        'headline': ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        'body': ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
        'label': ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'bounce-gentle': 'bounceGentle 0.6s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        bounceGentle: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-4px)' },
          '60%': { transform: 'translateY(-2px)' }
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
      }
    },
  },
  plugins: [],
};
