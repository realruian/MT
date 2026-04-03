// design-tokens.ts
// AI 设计自助生产平台 - Design Tokens
// 参考风格：Arc Dia + 即梦AI（Dreamina）

export const tokens = {
  colors: {
    // 背景渐变
    gradient: {
      primary: 'linear-gradient(135deg, #fdf2f8 0%, #f0f9ff 50%, #faf5ff 100%)',
      subtle: 'linear-gradient(180deg, #f8fafc 0%, #f0f9ff 100%)',
      card: 'rgba(255, 255, 255, 0.7)',
      cardHover: 'rgba(255, 255, 255, 0.9)',
    },
    // 主色 - 浅青色系
    primary: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#06b6d4',
      600: '#0891b2',
    },
    // 文字
    text: {
      title: '#111827',      // gray-900
      body: '#4b5563',        // gray-600
      secondary: '#9ca3af',   // gray-400
      link: '#06b6d4',        // cyan-500
    },
    // 表面/卡片
    surface: {
      page: '#fafbfd',
      card: 'rgba(255, 255, 255, 0.7)',
      cardSolid: '#ffffff',
      sidebar: 'rgba(248, 250, 252, 0.8)',
      input: '#ffffff',
    },
    // 边框（极少使用）
    border: {
      subtle: '#f1f5f9',      // slate-100
      light: '#e2e8f0',       // slate-200
      focus: '#a5f3fc',       // cyan-200
    },
    // 状态色
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
    },
  },

  // 圆角
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },

  // 阴影
  shadow: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.04)',
    md: '0 4px 16px rgba(0, 0, 0, 0.06)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.08)',
    input: '0 2px 4px rgba(0, 0, 0, 0.02)',
    inputFocus: '0 0 0 3px rgba(6, 182, 212, 0.15)',
  },

  // 间距 (基于 8px 网格)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },

  // 字体
  typography: {
    fontFamily: '-apple-system, "PingFang SC", "Helvetica Neue", Arial, sans-serif',
    heading: {
      hero: { size: '36px', weight: 700, lineHeight: 1.2 },
      h1: { size: '30px', weight: 600, lineHeight: 1.3 },
      h2: { size: '24px', weight: 600, lineHeight: 1.4 },
      h3: { size: '18px', weight: 600, lineHeight: 1.5 },
    },
    body: {
      lg: { size: '16px', weight: 400, lineHeight: 1.6 },
      md: { size: '14px', weight: 400, lineHeight: 1.6 },
      sm: { size: '12px', weight: 400, lineHeight: 1.5 },
    },
  },

  // 布局
  layout: {
    maxWidth: '1200px',
    sidebarWidth: '48px',       // w-12
    contentPadding: '32px',
    cardGap: '16px',
  },

  // 动效
  animation: {
    fast: '150ms ease-out',
    normal: '200ms ease-out',
    slow: '300ms ease-out',
  },
} as const;

// Tailwind 自定义配置参考（可直接贴到 tailwind.config.ts 的 extend 中）
export const tailwindExtend = {
  colors: {
    brand: {
      50: '#ecfeff',
      100: '#cffafe',
      200: '#a5f3fc',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#06b6d4',
      600: '#0891b2',
    },
    ink: {
      title: tokens.colors.text.title,
      body: tokens.colors.text.body,
      muted: tokens.colors.text.secondary,
    },
    surface: {
      card: tokens.colors.surface.card,
      'card-solid': tokens.colors.surface.cardSolid,
      sidebar: tokens.colors.surface.sidebar,
    },
  },
  width: {
    sidebar: tokens.layout.sidebarWidth,
  },
  maxWidth: {
    content: tokens.layout.maxWidth,
  },
  borderRadius: {
    card: '16px',
    button: '12px',
    input: '12px',
    tag: '8px',
  },
  boxShadow: {
    card: '0 2px 8px rgba(0, 0, 0, 0.04)',
    'card-hover': '0 8px 24px rgba(0, 0, 0, 0.08)',
    'input-focus': '0 0 0 3px rgba(6, 182, 212, 0.15)',
  },
  fontFamily: {
    display: ['"SmileySans"', 'sans-serif'],
    sans: ['MiSans', 'PingFang SC', 'Helvetica Neue', 'Arial', 'sans-serif'],
  },
  backgroundImage: {
    'page-gradient': 'linear-gradient(135deg, #fdf2f8 0%, #f0f9ff 50%, #faf5ff 100%)',
  },
};
