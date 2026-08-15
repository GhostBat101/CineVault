import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'accent':
        return { background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--accent)' };
      case 'success':
        return { background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success)', border: '1px solid var(--status-success)' };
      case 'warning':
        return { background: 'rgba(245, 158, 11, 0.15)', color: 'var(--status-warning)', border: '1px solid var(--status-warning)' };
      case 'danger':
        return { background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-danger)', border: '1px solid var(--status-danger)' };
      case 'outline':
        return { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-medium)' };
      default:
        return { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' };
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'sm' ? '2px 6px' : '3px 8px',
        fontSize: size === 'sm' ? '10px' : '11px',
        fontWeight: 500,
        borderRadius: 'var(--radius-full)',
        fontFamily: 'var(--font-sans)',
        ...getStyles(),
      }}
    >
      {children}
    </span>
  );
};
